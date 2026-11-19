function (graph, genegraph_panel_layout, track) {

    // "Generate Design Report" — Design ▸ Therapeutics.
    //   exec('baja/manchester/menu/design-report.js', graph, genegraph_panel_layout, track)
    //
    // Gathers what is ACTUALLY on the track — the target, the layers, the compounds, their
    // chemistry and their off-targets — and has py/ssaso/design-report.py write it up.
    //
    // THE FACTS ARE GATHERED HERE, NOT BY THE MODEL. The report has to describe the design on
    // screen, so every number in it comes off the track and is passed in; the model writes
    // prose around them and is told not to invent any. Anything absent is sent as absent, so
    // "no off-target screen has been run" is reported rather than read as a clean result.
    return (async () => {
        const t = track || null;
        const oligos = ((t && t.oligos) || []).filter(Boolean);
        if (!oligos.length) {
            graph.setMessage(' No compounds on ' + ((t && t.name) || 'this track') + ' to report on. ');
            return false;
        }

        const num = (v) => (v == null || v === '' || !isFinite(+v)) ? null : +v;
        const str = (v) => (v == null) ? null : ('' + v);

        // ---- target -----------------------------------------------------------------
        const target = {
            name: str(t.name),
            transcript: str(t.transcriptID),
            gene: str(t.geneID),
            species: str(t.species),
            chromosome: str(t.chr),
            strand: num(t.strand),
            length: (t.sequence ? t.sequence.length : null),
            description: str(t.description)
        };
        try {
            const r = t.selectedRange && t.selectedRange();
            if (r && isFinite(+r.start) && isFinite(+r.end)) {
                target.designed_over = { start: Math.round(+r.start), end: Math.round(+r.end),
                    length: Math.round(Math.abs(+r.end - +r.start)) };
            }
        } catch (e) { }

        // ---- layers, split by what they ARE ------------------------------------------
        // Measured data and model output are different kinds of evidence and the report is
        // told to keep them apart, so they are separated here rather than left to the model
        // to guess from a layer name.
        const ML_HINTS = [
            [/^Cis:/i, 'BajaSplice cis-regulatory windows (predicted)'],
            [/splice|donor|acceptor/i, 'BajaSplice splice-site scores (predicted)'],
            [/^PSI|inclusion/i, 'BajaSplice PSI / exon inclusion (predicted)'],
            [/^RBP:|clip/i, 'BajaCLIP RBP binding (predicted)'],
            [/intron.?retention|bajair/i, 'BajaIR intron retention (predicted)']
        ];
        const layers = { models: [], data: [] };
        for (const l of ((t.track_layers) || [])) {
            if (!l) continue;
            const nm = str(l.data_type) || str(l.name) || 'layer';
            const entry = { name: nm, type: str(l.type) };
            if (Array.isArray(l.windows) && l.windows.length) {
                entry.windows = l.windows.length;
                entry.site = num(l.site);
                entry.which = str(l.which);
                let up = 0, down = 0;
                for (const w of l.windows) {
                    if (!w || !isFinite(+w.impact)) continue;
                    if (Math.abs(+w.z) < 2) continue;
                    if (+w.impact > 0) up++; else down++;
                }
                entry.supportive_windows = up;
                entry.suppressive_windows = down;
            }
            if (Array.isArray(l.intervals) && l.intervals.length) entry.intervals = l.intervals.length;
            let isModel = false;
            for (const h of ML_HINTS) { if (h[0].test(nm)) { entry.model = h[1]; isModel = true; break; } }
            (isModel ? layers.models : layers.data).push(entry);
        }

        // ---- compounds, chemistry and off-targets ------------------------------------
        // Off-target fields are read under every name the app has used for them, because a
        // compound screened by an older run carries the older key and a report that missed it
        // would say "not screened" about a compound that was.
        const otOf = (o) => {
            const genes = o.offtargetsymbols || o.offtarget_symbols || o.offtargetSymbols || null;
            const count = num(o.offtarget) != null ? num(o.offtarget)
                : (num(o._offtarget) != null ? num(o._offtarget)
                    : (Array.isArray(genes) ? genes.length : null));
            const byDist = o.offtarget_genes_by_distance || o.offtargetGenesByDistance || null;
            const screened = (count != null) || (Array.isArray(genes) && genes.length > 0) || !!byDist;
            return {
                screened: screened,
                count: count,
                genes: Array.isArray(genes) ? genes.slice(0, 25) : null,
                by_edit_distance: byDist || null,
                cleanliness: num(o.offtarget_cleanliness),
                burden: num(o.offtarget_burden)
            };
        };

        // ---- allele selectivity ------------------------------------------------------
        // Read off what allele-selective-design.js wrote onto the compound, NOT re-derived
        // here. It is the side that knew which strand the variant record was written on and
        // which allele went into the oligo, and getting that backwards is the single easiest
        // mistake to make twice in a row.
        const alleleOf = (o) => {
            const a = o.alleleSelective;
            if (!a) return null;
            const ref = ('' + (a.ref || '')).toUpperCase();
            const alt = ('' + (a.alt || '')).toUpperCase();
            const len = num(o.length) != null ? num(o.length)
                : (Array.isArray(o.chemistryLayout) && o.chemistryLayout.length
                    ? o.chemistryLayout.length
                    : (('' + (o.sequence || o.synthesisSequence || '')).length || null));
            const pos = num(a.position_in_antisense);
            const lw = num(o.leftWingSize), rw = num(o.rightWingSize);

            // HOW FAR IT HAS DIVERGED FROM THE REFERENCE: the bases where the allele it was
            // built on differs from the wild-type allele. A substitution counts the bases it
            // changes; an indel counts the length it adds or removes.
            let divergence = null;
            if (ref || alt) {
                if (ref.length === alt.length) {
                    let d = 0;
                    for (let i = 0; i < ref.length; i++) if (ref[i] !== alt[i]) d++;
                    divergence = Math.max(1, d);
                } else {
                    divergence = Math.max(1, Math.abs(ref.length - alt.length));
                }
            }

            // WHERE THE DIVERGENCE SITS, which is what decides whether it discriminates at
            // all. A gapmer is cleaved opposite its DNA gap and tolerates a mismatch at either
            // terminus, so the same single-base difference discriminates well in the gap and
            // barely at all one base from an end -- whatever the selectivity score says.
            let region = null, fromEnd = null;
            if (pos != null && len) {
                fromEnd = Math.min(pos, len - pos + 1);
                if (lw != null && rw != null && (lw + rw) < len) {
                    region = (pos <= lw) ? "5' wing" : ((pos > (len - rw)) ? "3' wing" : 'DNA gap');
                }
            }
            return {
                variant: str(a.variant),
                ref: ref || null, alt: alt || null,
                discriminates: a.discriminates !== false,
                discrimination: str(a.discrimination),
                selectivity: num(a.selectivity),
                position_in_antisense: pos,
                oligo_length: len,
                bases_from_nearest_end: fromEnd,
                region: region,
                divergence_from_reference: divergence,
                wild_type_site: str(a.wild_type_site)
            };
        };

        const compounds = oligos.map((o) => ({
            name: str(o.name),
            sequence: str(o.sequence || o.antisense || o.synthesisSequence),
            target_site: str(o.targetSequence || o.targetSite),
            start: num(o.xi), end: num(o.xf),
            length: num(o.length) != null ? num(o.length)
                : ((o.sequence) ? o.sequence.length : null),
            score: num(o.score),
            gc_percent: num(o.gc_percent),
            tm_c: num(o.tm_c != null ? o.tm_c : o.tm),
            design_type: str(o.designType),
            color: str(o.color),
            flagged_reason: str(o.flagReason),
            chemistry: {
                full_modification: str(o.fullModification),
                backbone: Array.isArray(o.backbonePattern)
                    ? (o.backbonePattern.length
                        ? (Array.from(new Set(o.backbonePattern)).join('/') + ' × ' + o.backbonePattern.length)
                        : null)
                    : str(o.backbonePattern),
                helm: str(o.helm || o.structure),
                layout_residues: Array.isArray(o.chemistryLayout) ? o.chemistryLayout.length : null
            },
            notes: Array.isArray(o.notes) ? o.notes.slice(0, 8) : null,
            allele_selective: alleleOf(o),
            offtargets: otOf(o)
        }));

        const screened = compounds.filter((c) => c.offtargets && c.offtargets.screened).length;
        const payload = {
            target: target,
            layers: layers,
            compounds: compounds,
            summary: {
                compound_count: compounds.length,
                offtarget_screened_count: screened,
                offtarget_screen_run: screened > 0,
                model_layer_count: layers.models.length,
                data_layer_count: layers.data.length,
                allele_selective_count: compounds.filter((c) => c.allele_selective).length,
                non_discriminating_count: compounds.filter((c) => c.allele_selective
                    && !c.allele_selective.discriminates).length
            }
        };

        // ---- write it ----------------------------------------------------------------
        graph.setMessage(' Writing the design report for ' + compounds.length + ' compound'
            + (compounds.length === 1 ? '' : 's') + '… ');
        let res = null;
        try {
            const em = new EngineMonitor((m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } });
            res = await exec('py/ssaso/design-report.py', em, JSON.stringify(payload));
        } catch (e) {
            let shown = false;
            try { shown = await exec('baja/lib/free-limit-notice.js', graph, e, 'report'); } catch (e2) { }
            if (!shown) graph.setMessage(' Could not write the report: ' + (e && (e.message || e)) + ' ');
            return false;
        }
        if (!res || res.error || !res.report_md) {
            graph.setMessage(' Could not write the report: ' + ((res && res.error) || 'no text returned') + ' ');
            return false;
        }

        // ---- the allele-selectivity section, written here rather than by the model ----
        // ORDERED BY DIVERGENCE FROM THE REFERENCE, which is what the request for this section
        // asked to see. Every number in it is computed from the compound, so it is appended as
        // finished text instead of being handed to the model to paraphrase: the one thing that
        // must not drift here is which oligo diverges from the wild-type sequence and where.
        const allelic = compounds.filter((c) => c.allele_selective);
        let extra = '';
        if (allelic.length) {
            const A = (c) => c.allele_selective;
            const ranked = allelic.slice().sort((x, y) => {
                const a1 = A(x), b1 = A(y);
                return ((b1.divergence_from_reference || 0) - (a1.divergence_from_reference || 0))
                    || ((b1.bases_from_nearest_end || 0) - (a1.bases_from_nearest_end || 0))
                    || ((b1.selectivity || 0) - (a1.selectivity || 0))
                    || ((y.score || 0) - (x.score || 0));
            });
            const nShort = ranked.filter((c) => A(c).region && A(c).region !== 'DNA gap').length;
            const nEdge = ranked.filter((c) => A(c).bases_from_nearest_end != null && A(c).bases_from_nearest_end <= 2).length;
            const nNo = ranked.filter((c) => !A(c).discriminates).length;

            const bits = ['', '## Allele selectivity, ordered by divergence from the reference', ''];
            bits.push('These ' + ranked.length + ' compound' + (ranked.length === 1 ? ' was' : 's were')
                + ' built on a variant allele rather than on the reference. They are listed by how far '
                + 'they diverge from the wild-type sequence: the bases that differ, then how far that '
                + 'difference sits from the nearer end of the oligo, then the selectivity score. '
                + 'Position is counted along the oligo from its 5\u2032 end.');
            bits.push('');
            ranked.forEach((c, i) => {
                const a2 = A(c);
                const where = (a2.position_in_antisense != null && a2.oligo_length)
                    ? ('position ' + a2.position_in_antisense + ' of ' + a2.oligo_length
                        + (a2.region ? (', in the ' + a2.region) : '')
                        + (a2.bases_from_nearest_end != null ? (', ' + a2.bases_from_nearest_end
                            + ' base' + (a2.bases_from_nearest_end === 1 ? '' : 's') + ' from the nearer end') : ''))
                    : 'position not recorded';
                const change = (a2.ref && a2.alt) ? ('`' + a2.ref + '` to `' + a2.alt + '`') : 'change not recorded';
                const parts = [
                    (a2.divergence_from_reference != null
                        ? (a2.divergence_from_reference + ' base' + (a2.divergence_from_reference === 1 ? '' : 's')
                            + ' different from the reference')
                        : 'divergence not recorded'),
                    where
                ];
                if (a2.selectivity != null) parts.push('selectivity ' + a2.selectivity);
                if (!a2.discriminates) parts.push('**does not discriminate the variant**');
                bits.push((i + 1) + '. **' + (c.name || 'compound') + '** \u2014 '
                    + (a2.variant ? (a2.variant + ', ') : '') + change + ' \u00b7 ' + parts.join(' \u00b7 '));
            });
            bits.push('');
            // The caveats that the ordering alone does not show. Said here because they follow
            // from the numbers above and do not depend on the model having noticed them.
            const notes = [];
            const one = (n) => n === 1;
            if (nNo) {
                notes.push('**' + nNo + ' of these ' + ranked.length + (one(nNo) ? ' does' : ' do')
                    + ' not discriminate the variant at all** and will act on the wild-type allele as well. '
                    + (one(nNo) ? 'It is listed for completeness, not as a candidate.'
                        : 'They are listed for completeness, not as candidates.'));
            }
            if (nShort) {
                notes.push('**' + nShort + (one(nShort) ? ' carries' : ' carry')
                    + ' the difference in a wing rather than in the DNA gap.** '
                    + 'RNase H is directed by the gap, and a mismatch in a wing is largely tolerated, so '
                    + (one(nShort) ? 'it discriminates' : 'these discriminate')
                    + ' less well than ' + (one(nShort) ? 'its' : 'their') + ' score suggests.');
            }
            if (nEdge) {
                notes.push('**' + nEdge + (one(nEdge) ? ' carries' : ' carry')
                    + ' the difference within two bases of an end.** A terminal mismatch '
                    + 'is the weakest position for discrimination: most of the oligo still pairs with the '
                    + 'reference allele.');
            }
            notes.push('Divergence is a property of the sequence, not evidence of selectivity in cells. '
                + 'Nothing here is a substitute for measuring both alleles.');
            if (notes.length) {
                bits.push('### What the ordering does not show', '');
                for (const n of notes) bits.push('- ' + n);
                bits.push('');
            }
            extra = bits.join('\n');
        }

        await exec('baja/lib/report-view.js', graph, genegraph_panel_layout, {
            title: 'Design report — ' + (target.name || 'track'),
            subtitle: compounds.length + ' compound' + (compounds.length === 1 ? '' : 's')
                + ' · ' + layers.models.length + ' model layer' + (layers.models.length === 1 ? '' : 's')
                + ' · ' + layers.data.length + ' data layer' + (layers.data.length === 1 ? '' : 's')
                + (screened ? (' · ' + screened + ' screened for off-targets') : ' · no off-target screen')
                + (allelic.length ? (' · ' + allelic.length + ' allele-selective') : ''),
            markdown: res.report_md + extra,
            filename: ((target.name || 'design') + '-report.md').replace(/[^\w.-]+/g, '_')
        });
        try { graph.setMessage(' Design report ready. '); } catch (e) { }
        return true;
    })();
}
