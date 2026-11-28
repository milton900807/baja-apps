function (graph, track, options) {

    // THE MOTIF IMPACT RESULT SET: one window holding what the variants on a track do to
    // its linear motifs, with the numbers downloadable rather than only drawable.
    //   await exec('baja/bio/protein/motif-impact-view.js', graph, track)
    //   await exec('baja/bio/protein/motif-impact-view.js', graph, track,
    //              { variants: ['A315T', 'M337V'], minScore: 0.4 })
    //   await exec('baja/bio/protein/motif-impact-view.js', graph, track,
    //              { result: <a payload already in hand> })   // skips the scan
    //
    // WHY A WINDOW AND NOT MORE LAYERS. baja/bio/protein/slim-motif-layer.js draws the
    // same answer on the track, which is the right picture for "where on this protein".
    // It is the wrong one for "what did each variant do": a layer per motif would be
    // dozens of rows in the layer list, each needing a click to read, none of them
    // sortable, none of them leaving the screen. A result set is a table you can order,
    // search, read a description out of, and take away.
    //
    // GAINED, LOST AND PRESENT ARE THREE DIFFERENT CLAIMS and this window never lets them
    // blur into one list. Gained is the interesting one: a sequence that does not occur in
    // nature now matches a known pattern. Lost is a claim about something real being taken
    // away. Present is the background the other two are read against.
    //
    // THE GAINED SCORE IS AN UPPER BOUND, and that travels with the row rather than living
    // in a help panel: conservation belongs to the wild-type residue, and a gained motif
    // inherits numbers earned by the residue that was replaced. The CSV carries the flag
    // as its own column, because a download that drops the caveat is the caveat gone.

    return (async () => {
        const o = options || {};
        const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };

        const THREE = {
            ALA: 'A', ARG: 'R', ASN: 'N', ASP: 'D', CYS: 'C', GLN: 'Q', GLU: 'E', GLY: 'G',
            HIS: 'H', ILE: 'I', LEU: 'L', LYS: 'K', MET: 'M', PHE: 'F', PRO: 'P', SER: 'S',
            THR: 'T', TRP: 'W', TYR: 'Y', VAL: 'V'
        };
        const HGVS = /^([A-Z])(\d+)([A-Z])$/;

        // The variants on the track, in protein space, read the two ways they are written
        // in the wild. Same reading as slim-motif-layer.js, so the two windows cannot
        // disagree about which substitutions were scanned.
        const variantsOf = (t) => {
            const out = [];
            const push = (v) => { if (v && out.indexOf(v) < 0) out.push(v); };
            for (const v of (o.variants || [])) push(('' + v).trim().toUpperCase());
            try {
                for (const a of (t.annotations || [])) {
                    const s = '' + ((a && (a.protein || a.hgvsp || a.p || a.aa_change)) || '');
                    if (!s) continue;
                    const three = s.toUpperCase().match(/P\.?\s*([A-Z]{3})(\d+)([A-Z]{3})/);
                    if (three && THREE[three[1]] && THREE[three[3]]) {
                        push(THREE[three[1]] + three[2] + THREE[three[3]]); continue;
                    }
                    const one = s.toUpperCase().replace(/^P\.?/, '').match(HGVS);
                    if (one) push(one[1] + one[2] + one[3]);
                }
            } catch (e) { }
            return out;
        };

        // THE SAME READING, WITH WHAT EACH ONE IS. The picker needs more than the change
        // itself: a list of forty bare substitutions cannot be narrowed to the pathogenic
        // ones, which is the narrowing people actually do.
        const describedVariants = (t) => {
            const out = [], seen = {};
            const note = (a) => {
                const bits = [];
                for (const k of ['significance', 'clinical_significance', 'clinvar', 'type', 'consequence']) {
                    const v = '' + ((a && a[k]) || '');
                    if (v && bits.indexOf(v) < 0) bits.push(v);
                    if (bits.length >= 2) break;
                }
                return bits.join(' \u00b7 ');
            };
            try {
                for (const a of (t.annotations || [])) {
                    const s2 = '' + ((a && (a.protein || a.hgvsp || a.p || a.aa_change)) || '');
                    if (!s2) continue;
                    let v = '';
                    const three = s2.toUpperCase().match(/P\.?\s*([A-Z]{3})(\d+)([A-Z]{3})/);
                    if (three && THREE[three[1]] && THREE[three[3]]) v = THREE[three[1]] + three[2] + THREE[three[3]];
                    else {
                        const one = s2.toUpperCase().replace(/^P\.?/, '').match(HGVS);
                        if (one) v = one[1] + one[2] + one[3];
                    }
                    if (!v || seen[v]) continue;
                    seen[v] = 1;
                    out.push({ v: v, sub: note(a) });
                }
            } catch (e) { }
            return out;
        };

        const label = ('' + ((track && track.name) || 'this track'));
        const minScore = isFinite(+o.minScore) ? +o.minScore : 0.5;

        // ---- THE NUMBERS ---------------------------------------------------------------
        let res = o.result || null;
        let protein = ('' + (o.protein || ''));

        // WHERE THE VARIANTS ACTUALLY ARE. Reading them off the track's annotations finds
        // nothing on a ClinVar load, which does not write a protein field: the same track
        // whose SNPs each report their own motif impact when clicked came back here as
        // having no coding variants at all. They are read off the reading frame instead,
        // by the one module that does it, and the annotations are kept as a fallback for
        // tracks that were annotated by hand.
        let fromFrame = null;
        try { fromFrame = await exec('baja/bio/protein/variants-to-residues.js', track); }
        catch (e) { fromFrame = null; }
        let vars = (fromFrame && fromFrame.ok) ? fromFrame.list.map((x) => x.spec) : [];
        for (const v of variantsOf(track || {})) { if (vars.indexOf(v) < 0) vars.push(v); }
        if (!res) {
            if (!protein) {
                try { protein = await exec('baja/bio/protein/peptide-of.js', track); } catch (e) { protein = ''; }
            }
            // A TRACK WITH NO PROTEIN IS NOT AN EMPTY RESULT. Translating it in some
            // arbitrary frame would answer a question about a sequence nobody has.
            if (!protein) {
                say(label + ' has no ORF, so it has no protein to find motifs in. Give the '
                    + 'track a reading frame and run this again.');
                return { ok: false, why: 'no protein' };
            }
            if (!vars.length) {
                // WHY THERE ARE NONE, not just that there are none. A track carrying forty
                // ClinVar rows that are every one of them in the 3' UTR is a real answer
                // and a different one from a track with no variants at all; without this
                // they read the same, as a broken screen.
                const n = ((track && track.snpindels) || []).length;
                const left = (fromFrame && fromFrame.skipped) || [];
                let why = '';
                if (left.length) {
                    const tally = {};
                    for (const x of left) tally[x.why] = (tally[x.why] || 0) + 1;
                    why = ' ' + Object.keys(tally).map((k) => tally[k] + ' ' + k).join(', ') + '.';
                }
                say(label + ': none of the ' + (n || 0) + ' variants on this track change a '
                    + 'residue, so there is no peptide motif impact to show.' + why
                    + ' For variants outside the coding sequence the question is what they do '
                    + 'to the elements in the message: that is the nucleotide half.');
                return { ok: false, why: 'no coding variants', skipped: left };
            }

            // ---- WHICH OF THEM ---------------------------------------------------------
            // A track carrying forty ClinVar entries is the normal case, and a report over
            // all forty is both a long wait and a wall of rows nobody asked for. So the
            // set is CHOSEN, with what each variant is beside it so the list can be
            // narrowed to the pathogenic ones and taken in one press. Asking is skipped
            // when the caller named the variants itself, and when there is only one.
            if (o.ask !== false && !(o.variants || []).length && vars.length > 1) {
                const described = describedVariants(track || {});
                const byName = {};
                for (const d of described) byName[d.v] = d.sub;
                // What each substitution IS, from whichever source knows: the clinical
                // call when the track carries one, the codon change otherwise. A list of
                // forty bare substitutions cannot be narrowed, which is the whole point of
                // being asked.
                if (fromFrame && fromFrame.ok) {
                    for (const x of fromFrame.list) {
                        const sig = ('' + (((x.snp && (x.snp.significance || x.snp.clinical_significance
                            || x.snp.clinvar)) || '')));
                        const bits = [];
                        if (sig) bits.push(sig);
                        bits.push(x.codon + '>' + x.mutCodon);
                        if (!byName[x.spec]) byName[x.spec] = bits.join(' \u00b7 ');
                    }
                }
                const items = vars.map((v) => ({ label: v, sub: byName[v] || '', ref: v }));
                const picked = await new Promise((resolve) => {
                    let done = false;
                    const once = (x) => { if (!done) { done = true; resolve(x); } };
                    exec('baja/lib/pick-list.js', {
                        title: 'Motif impact report \u00b7 ' + label,
                        subtitle: vars.length + ' coding variants on this track \u00b7 choose the '
                            + 'ones to test',
                        items: items,
                        multi: true,
                        onPick: (list) => once((list || []).map((x) => x.ref)),
                        onClose: () => once(null)
                    }).then((x) => { if (x === null) once(null); });
                });
                if (picked === null) { say('No motif impact report was made.'); return { ok: false, why: 'dismissed' }; }
                if (!picked.length) {
                    say('No variants were chosen, so there is nothing to report on. '
                        + 'Pick at least one and run it again.');
                    return { ok: false, why: 'none chosen' };
                }
                vars = picked;
            }
            say('Scanning ' + protein.length.toLocaleString() + ' residues of ' + label
                + ' for what ' + vars.length + ' variant' + (vars.length === 1 ? '' : 's')
                + ' do to its linear motifs...');
            try {
                res = await exec('py/bio/protein/slim-scan.py',
                    protein, vars.join(','), '' + minScore, '' + (o.accession || ''));
                if (typeof res === 'string') { try { res = JSON.parse(res); } catch (e) { } }
            } catch (e) {
                say('The motif scan did not answer for ' + label + ': '
                    + ((e && e.message) ? e.message : e));
                return { ok: false, why: 'scan failed' };
            }
        }
        if (!res || typeof res !== 'object') {
            say('The motif scan did not answer for ' + label + '.');
            return { ok: false, why: 'scan failed' };
        }
        if (res.error) {
            // A host without the ELM tables is a deployment problem, not a quiet nothing.
            say('The motif scan could not run on this host: ' + res.error);
            return { ok: false, why: '' + res.error };
        }
        const J = (k, d) => {
            const v = res[k];
            if (v == null) return d;
            if (typeof v !== 'string') return v;
            try { return JSON.parse(v); } catch (e) { return d; }
        };
        const motifs = J('motifs', []), gained = J('gained', []), lost = J('lost', []);
        const meta = J('meta', {}) || {};
        if (meta.variants && meta.variants.length) vars = meta.variants;
        const plen = +meta.length || protein.length || 0;

        // THE SAME WINDOW SERVES BOTH ALPHABETS. The protein question (what do these
        // substitutions do to the ELM motifs of the translation) and the nucleotide one
        // (what do they do to the elements of the message) have the same shape: gained,
        // lost, already there, over a sequence, per variant. Two windows for that would be
        // two sets of downloads and two places for the caveats to go stale, so the units
        // are a parameter and nothing else differs.
        const UNIT = (('' + (o.units || meta.units || 'aa')).toLowerCase() === 'nt') ? 'nt' : 'aa';
        const NT = (UNIT === 'nt');
        const ORIGIN = isFinite(+meta.origin) ? +meta.origin : 1;   // the coordinate of position 1
        const SEQCOL = NT ? 'Sequence' : 'Peptide';

        // One row per record, with which claim it is. The effect is carried on the row and
        // not worked out again later: a row that loses track of whether it is a gain or a
        // loss is a row that says the opposite of what the scan found.
        const rows = [];
        const add = (list, effect) => {
            for (const h of (list || [])) {
                if (!h) continue;
                rows.push({
                    effect: effect,
                    variant: ('' + (h.variant || '')),
                    elm: ('' + (h.elm || '')),
                    site: ('' + (h.site || '')),
                    start: +h.start || 0,
                    end: +h.end || 0,
                    peptide: ('' + (h.peptide || '')),
                    score: (typeof h.score === 'number' && isFinite(h.score)) ? h.score : null,
                    rank: (typeof h.rank === 'number') ? h.rank : null,
                    upper: !!h.score_is_upper_bound,
                    below: !!h.below_cutoff,
                    blurb: ('' + (h.blurb || '')),
                    raw: h
                });
            }
        };
        add(gained, 'gained');
        add(lost, 'lost');
        add(motifs, 'present');

        if (!rows.length) {
            say(label + ': the scan ran and found nothing to report. '
                + (vars.length ? ('None of ' + vars.join(', ') + ' creates or destroys a motif '
                    + 'in the ELM catalogue, and no wild-type motif cleared the cutoff.')
                    : '')
                + ' That is a result, not a failure.');
            return { ok: true, rows: [], meta: meta };
        }

        // ---- THE FILES ------------------------------------------------------------------
        // The download is the RESULT SET, not the picture: every row the window can show,
        // the caveats that qualify them, and the settings the scan ran under, so a file
        // opened next week still says what it is.
        const COLS = ['effect', 'variant', 'elm', 'site', 'start', 'end', 'peptide',
            'score', 'score_is_upper_bound', 'below_display_cutoff', 'rank', 'description'];
        const cell = (r, c) => {
            switch (c) {
                case 'effect': return r.effect;
                case 'variant': return r.variant;
                case 'elm': return r.elm;
                case 'site': return r.site;
                case 'start': return r.start;
                case 'end': return r.end;
                case 'peptide': return r.peptide;
                case 'score': return (r.score == null) ? '' : r.score.toFixed(4);
                case 'score_is_upper_bound': return r.upper ? 'yes' : 'no';
                case 'below_display_cutoff': return r.below ? 'yes' : 'no';
                case 'rank': return (r.rank == null) ? '' : r.rank;
                case 'description': return r.blurb;
            }
            return '';
        };
        const csvOf = () => {
            const q = (v) => {
                const s = '' + (v == null ? '' : v);
                return /[",\n]/.test(s) ? ('"' + s.replace(/"/g, '""') + '"') : s;
            };
            const out = [];
            out.push('# motif impact · ' + label + (meta.accession ? (' · ' + meta.accession) : ''));
            out.push('# ' + (NT ? 'sequence ' : 'protein ') + plen + ' ' + UNIT + ' · variants ' + (vars.join(' ') || 'none')
                + ' · min score ' + (meta.min_score == null ? minScore : meta.min_score)
                + ' · scoring ' + (meta.scoring || 'unknown')
                + ' · conservation ' + (meta.conservation ? 'yes' : 'no'));
            for (const c of (meta.caveats || [])) out.push('# ' + ('' + c).replace(/\s+/g, ' '));
            out.push(COLS.join(','));
            for (const r of rows) out.push(COLS.map((c) => q(cell(r, c))).join(','));
            return out.join('\n') + '\n';
        };
        const jsonOf = () => JSON.stringify({
            track: label, units: UNIT, length: plen, origin: ORIGIN, variants: vars,
            min_score: (meta.min_score == null ? minScore : meta.min_score),
            scoring: meta.scoring || null, conservation: !!meta.conservation,
            accession: meta.accession || null,
            caveats: meta.caveats || [],
            rows: rows.map((r) => {
                const out = {};
                for (const c of COLS) out[c] = cell(r, c);
                return out;
            })
        }, null, 2);
        const stamp = label.replace(/[^A-Za-z0-9_.-]+/g, '_');
        const save = (text, name, mime) => {
            try {
                const blob = new Blob([text], { type: mime });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = name;
                document.body.appendChild(a); a.click();
                setTimeout(() => { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) { } }, 0);
                return true;
            } catch (e) { return false; }
        };

        // ---- THE WINDOW -----------------------------------------------------------------
        const OV = await exec('baja/lib/canvas-overlay-panel.js');
        const C = OV.colors;
        const COLOR = { gained: '#4fd0e6', lost: '#ffb4a2', present: 'rgba(143,184,200,0.75)' };
        const esc = (t) => ('' + (t == null ? '' : t))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        const body = document.createElement('div');
        body.style.cssText = 'padding:14px 16px 40px;color:' + C.text + ';font:13px ' + C.font + ';';

        const nOf = (e) => rows.filter((r) => r.effect === e).length;
        const head = document.createElement('div');
        head.style.cssText = 'margin-bottom:10px;line-height:1.6;';
        head.innerHTML =
            '<div style="color:' + C.dim + '">' + esc(label) + ' · ' + plen.toLocaleString()
            + ' ' + UNIT + ' · ' + (vars.length ? esc(vars.join(', ')) : 'no variants')
            + ' · scored by ' + esc(meta.scoring || 'unknown')
            + ' · cutoff ' + esc(meta.cutoff_rule || ('min ' + minScore))
            + ' · conservation ' + (meta.conservation ? 'cached' : 'none') + '</div>'
            + '<div style="margin-top:6px">'
            + '<b style="color:' + COLOR.gained + '">' + nOf('gained') + ' gained</b> · '
            + '<b style="color:' + COLOR.lost + '">' + nOf('lost') + ' lost</b> · '
            + '<span style="color:' + C.dim + '">' + nOf('present') + ' already present</span>'
            + '</div>';
        body.appendChild(head);

        // THE CAVEATS ARE PART OF THE RESULT, so they are in the window and in both files,
        // not behind a help button that a reader in a hurry never opens.
        if ((meta.caveats || []).length) {
            const cav = document.createElement('div');
            cav.style.cssText = 'margin:8px 0 14px;padding:8px 10px;border:1px solid ' + C.line
                + ';border-radius:8px;color:' + C.dim + ';font-size:12px;line-height:1.5;';
            cav.innerHTML = (meta.caveats || []).map((c) => '· ' + esc(c)).join('<br>');
            body.appendChild(cav);
        }

        // ---- THE MAP: WHERE ON THE PROTEIN ----------------------------------------------
        // A table says what happened; it does not say that three of the four gains land in
        // the same twenty residues. The map is the same rows laid on the protein, one lane
        // per claim, so the clustering is visible before anything is read.
        const map = document.createElement('div');
        map.style.cssText = 'margin:4px 0 16px;';
        const lane = (title, effect) => {
            const got = rows.filter((r) => r.effect === effect);
            const wrap = document.createElement('div');
            wrap.style.cssText = 'margin:6px 0;';
            const strip = document.createElement('div');
            strip.style.cssText = 'position:relative;height:16px;background:rgba(255,255,255,0.05);'
                + 'border:1px solid ' + C.line + ';border-radius:4px;overflow:hidden;';
            for (const r of got) {
                const b = document.createElement('div');
                const x = plen ? (100 * (r.start - ORIGIN) / plen) : 0;
                const w = plen ? Math.max(0.35, 100 * (r.end - r.start + 1) / plen) : 0;
                b.style.cssText = 'position:absolute;top:2px;bottom:2px;left:' + x + '%;width:' + w
                    + '%;background:' + COLOR[effect] + ';border-radius:2px;cursor:pointer;';
                b.title = (r.variant ? (r.variant + ' · ') : '') + r.elm + ' · '
                    + r.start + '–' + r.end + (r.peptide ? (' · ' + r.peptide) : '');
                b.setAttribute('data-elm', r.elm);
                b.onclick = () => describe(r);
                strip.appendChild(b);
            }
            const cap = document.createElement('div');
            cap.style.cssText = 'font-size:11px;color:' + C.dim + ';margin-bottom:2px;';
            cap.textContent = title + '  (' + got.length + ')';
            wrap.appendChild(cap); wrap.appendChild(strip);
            return wrap;
        };
        map.appendChild(lane('Gained', 'gained'));
        map.appendChild(lane('Lost', 'lost'));
        map.appendChild(lane('Already present', 'present'));
        const ruler = document.createElement('div');
        ruler.style.cssText = 'display:flex;justify-content:space-between;font-size:11px;color:'
            + C.dim + ';margin-top:2px;';
        ruler.innerHTML = '<span>' + ORIGIN + '</span><span>'
            + Math.round(ORIGIN + plen / 2) + '</span><span>' + (ORIGIN + plen - 1) + '</span>';
        map.appendChild(ruler);
        body.appendChild(map);

        // ---- THE CONTROLS ---------------------------------------------------------------
        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0 10px;';
        const mkBtn = (text, on) => {
            const b = document.createElement('button');
            b.textContent = text;
            b.style.cssText = 'background:transparent;color:' + C.accent + ';border:1px solid '
                + C.outline + ';border-radius:6px;padding:4px 10px;cursor:pointer;font:12px ' + C.font + ';';
            b.onclick = on;
            return b;
        };
        let filter = 'all';
        const fbtns = {};
        for (const f of ['all', 'gained', 'lost', 'present']) {
            const b = mkBtn(f === 'all' ? 'All' : (f[0].toUpperCase() + f.slice(1)), () => {
                filter = f; paint();
            });
            fbtns[f] = b; bar.appendChild(b);
        }
        const find = document.createElement('input');
        find.placeholder = 'find a class, a site, a peptide';
        find.style.cssText = 'flex:1 1 180px;min-width:140px;background:rgba(255,255,255,0.06);color:'
            + C.text + ';border:1px solid ' + C.line + ';border-radius:6px;padding:4px 8px;font:12px ' + C.font + ';';
        find.oninput = () => paint();
        bar.appendChild(find);
        const csvBtn = mkBtn('Download CSV', () => {
            csvBtn.textContent = save(csvOf(), stamp + '_motif_impact.csv', 'text/csv')
                ? 'Saved' : 'Could not save';
            setTimeout(() => { csvBtn.textContent = 'Download CSV'; }, 1600);
        });
        const jsonBtn = mkBtn('Download JSON', () => {
            jsonBtn.textContent = save(jsonOf(), stamp + '_motif_impact.json', 'application/json')
                ? 'Saved' : 'Could not save';
            setTimeout(() => { jsonBtn.textContent = 'Download JSON'; }, 1600);
        });
        const copyBtn = mkBtn('Copy', async () => {
            try { await navigator.clipboard.writeText(csvOf()); copyBtn.textContent = 'Copied'; }
            catch (e) { copyBtn.textContent = 'Copy failed'; }
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1600);
        });
        bar.appendChild(csvBtn); bar.appendChild(jsonBtn); bar.appendChild(copyBtn);
        body.appendChild(bar);

        // ---- THE TABLE ------------------------------------------------------------------
        const table = document.createElement('div');
        table.style.cssText = 'border-top:1px solid ' + C.rule + ';';
        body.appendChild(table);

        let sortBy = 'start', sortDesc = false;
        const HEADS = [['effect', 'Effect'], ['variant', 'Change'],
            ['elm', NT ? 'Element' : 'ELM class'], ['site', 'Site'],
            ['start', NT ? 'Position' : 'Residues'], ['peptide', SEQCOL], ['score', 'Score']];

        const describe = async (r) => {
            // The description of one motif, in the window the rest of the editor uses for
            // exactly this, so a motif read here and a motif read off the track layer are
            // the same card rather than two that have to be kept in step.
            try { await exec('baja/bio/protein/slim-motif-panel.js', r.raw); } catch (e) { }
        };

        const shown = () => {
            const q = ('' + find.value).trim().toLowerCase();
            return rows.filter((r) => {
                if (filter !== 'all' && r.effect !== filter) return false;
                if (!q) return true;
                return (r.elm + ' ' + r.site + ' ' + r.peptide + ' ' + r.variant)
                    .toLowerCase().indexOf(q) >= 0;
            }).sort((a, b) => {
                const va = (sortBy === 'start') ? a.start : ('' + (a[sortBy] == null ? '' : a[sortBy]));
                const vb = (sortBy === 'start') ? b.start : ('' + (b[sortBy] == null ? '' : b[sortBy]));
                if (sortBy === 'score') {
                    const d = (b.score == null ? -1 : b.score) - (a.score == null ? -1 : a.score);
                    return sortDesc ? -d : d;
                }
                const d = (va < vb) ? -1 : (va > vb ? 1 : (a.start - b.start));
                return sortDesc ? -d : d;
            });
        };

        const paint = () => {
            for (const f of Object.keys(fbtns)) {
                fbtns[f].style.background = (filter === f) ? 'rgba(79,208,230,0.18)' : 'transparent';
            }
            const list = shown();
            const rowsHtml = [];
            rowsHtml.push('<div style="display:grid;grid-template-columns:70px 72px 1fr 1fr 92px 1fr 64px;'
                + 'gap:8px;padding:6px 4px;font-size:11px;color:' + C.dim + ';border-bottom:1px solid '
                + C.rule + ';">'
                + HEADS.map(([k, t]) => '<span data-sort="' + k + '" style="cursor:pointer">' + t
                    + (sortBy === k ? (sortDesc ? ' ▼' : ' ▲') : '') + '</span>').join('')
                + '</div>');
            for (let i = 0; i < list.length; i++) {
                const r = list[i];
                rowsHtml.push('<div data-row="' + i + '" style="display:grid;'
                    + 'grid-template-columns:70px 72px 1fr 1fr 92px 1fr 64px;gap:8px;padding:6px 4px;'
                    + 'border-bottom:1px solid ' + C.rule + ';cursor:pointer;align-items:baseline;">'
                    + '<span style="color:' + COLOR[r.effect] + '">' + r.effect + '</span>'
                    + '<span>' + esc(r.variant || '—') + '</span>'
                    + '<span style="color:' + C.accent + '">' + esc(r.elm) + '</span>'
                    + '<span style="color:' + C.dim + '">' + esc(r.site || '—') + '</span>'
                    + '<span>' + r.start + '–' + r.end + '</span>'
                    + '<span style="font-family:monospace">' + esc(r.peptide) + '</span>'
                    + '<span>' + (r.score == null ? (NT ? 'not scored' : '—') : r.score.toFixed(3))
                    + (r.upper ? '<sup title="upper bound: conservation belongs to the residue '
                        + 'that was replaced" style="color:' + C.warm + '">↑</sup>' : '')
                    + (r.below ? '<sup title="below the display cutoff; shown because a variant '
                        + 'destroys it" style="color:' + C.dim + '">↓</sup>' : '')
                    + '</span></div>');
            }
            if (!list.length) {
                rowsHtml.push('<div style="padding:14px 4px;color:' + C.dim + '">Nothing matches '
                    + 'that. The scan found ' + rows.length + ' row' + (rows.length === 1 ? '' : 's')
                    + ' in all.</div>');
            }
            table.innerHTML = rowsHtml.join('');
            for (const h of table.querySelectorAll('[data-sort]')) {
                h.onclick = () => {
                    const k = h.getAttribute('data-sort');
                    if (sortBy === k) sortDesc = !sortDesc; else { sortBy = k; sortDesc = (k === 'score'); }
                    paint();
                };
            }
            for (const el of table.querySelectorAll('[data-row]')) {
                el.onclick = () => describe(list[+el.getAttribute('data-row')]);
            }
        };
        paint();

        const panel = OV.open({
            id: NT ? 'nucleotide-motif-view' : 'motif-impact-view',
            title: (o.title || ((NT ? 'Sequence element impact · ' : 'Motif impact · ') + label)),
            body: body,
            maximized: true
        });
        return { ok: true, rows: rows, meta: meta, csv: csvOf, json: jsonOf, panel: panel,
            paint: paint, body: body };
    })();
}
