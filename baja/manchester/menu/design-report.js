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
            colour: str(o.color),
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
                data_layer_count: layers.data.length
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

        await exec('baja/lib/report-view.js', graph, genegraph_panel_layout, {
            title: 'Design report — ' + (target.name || 'track'),
            subtitle: compounds.length + ' compound' + (compounds.length === 1 ? '' : 's')
                + ' · ' + layers.models.length + ' model layer' + (layers.models.length === 1 ? '' : 's')
                + ' · ' + layers.data.length + ' data layer' + (layers.data.length === 1 ? '' : 's')
                + (screened ? (' · ' + screened + ' screened for off-targets') : ' · no off-target screen'),
            markdown: res.report_md,
            filename: ((target.name || 'design') + '-report.md').replace(/[^\w.-]+/g, '_')
        });
        try { graph.setMessage(' Design report ready. '); } catch (e) { }
        return true;
    })();
}
