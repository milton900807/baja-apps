function (graph, genegraph_panel_layout, info) {

    // What a design run leaves behind, shown once the compounds are on the track.
    //   exec('baja/manchester/menu/design-summary.js', graph, layout, {
    //       modality, algorithm, chemistry, track, oligos, result })
    //
    // Every modality used to finish with a one-line toast that scrolled away: how many
    // compounds, best score, and nothing about HOW they were chosen. The parameters that
    // decided the answer -- lengths and gaps scanned, how many candidates that made, how the
    // ranking was resolved, whether the transcriptome was screened and against what -- were
    // all in the result object and none of them were ever shown. A design you cannot describe
    // afterwards is a design you cannot defend, and the run is exactly when the description
    // is free.
    //
    // Maximized, like the libraries (baja/lib/shelf.js): this is a report, and reports are
    // read, not glanced at.

    return (async () => {
        const o = info || {};
        const track = o.track;
        const oligos = (o.oligos || []).filter(Boolean);
        const res = o.result || {};
        const modality = o.modality || 'Design';
        const esc = (v) => ('' + (v == null ? '' : v))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const num = (v, d) => (isFinite(+v) ? (+v).toFixed(d == null ? 2 : d) : '—');

        const restoreHover = () => {
            try { graph.clearMouseListeners(); } catch (e) { }
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };

        // ---- the rows, used by the table, the xlsx and (mapped) the bed ------------------
        const scoreOf = (x) => {
            const v = (x && x.normalized_score != null) ? x.normalized_score : (x && x.score);
            return isFinite(+v) ? +v : null;
        };
        // Compound coordinates are track-world; the genomic position is the track's to give.
        // A track with no genomic mapping (a pasted sequence) has none, and the export says
        // so by naming the track as the reference rather than inventing a chromosome.
        //
        // xf is EXCLUSIVE here (length is xf - xi), so the last base is xf - 1 and asking for
        // the genomic coordinate of xf would name the base after the compound -- a 16mer that
        // reports as 17 bases wide in every export. Mapping both ENDS and taking min/max also
        // means a minus-strand track, where genomic coordinates run the other way, needs no
        // special case: the span is the same either way round.
        const genomic = (x) => {
            try {
                if (!track || typeof track.genomicAt !== 'function' || track.xi == null) return null;
                const first = Math.floor(x.xi) - Math.floor(track.xi);
                const last = Math.floor(x.xf) - 1 - Math.floor(track.xi);
                const g0 = track.genomicAt(first);
                const g1 = track.genomicAt(Math.max(first, last));
                if (!isFinite(+g0) || !isFinite(+g1)) return null;
                return { start: Math.min(+g0, +g1), end: Math.max(+g0, +g1) };
            } catch (e) { return null; }
        };

        // An amplicon is a COMPOSITE -- two primers and sometimes a probe -- not an oligo with
        // a sequence of its own, and its own xf is not the end of the product (see track.js,
        // which reads the right primer's xf instead). So its span comes from its primers, and
        // everything a reader wants from it (the two sequences, their Tms, the product size)
        // lives one level down.
        const isAmp = (x) => !!(x && x.left && x.right) || (x && x.type === 'amplicon');
        const seqOf = (o) => (o && (o.sequence || o.synthesisSequence)) || '';
        const tmOf = (o) => (o && isFinite(+o.tm)) ? +o.tm : null;

        const rows = oligos.map((x, i) => {
            const amp = isAmp(x);
            const xa = amp ? Math.floor(x.left.xi) : Math.floor(x.xi);
            const xb = amp ? Math.floor(x.right.xf) : Math.floor(x.xf);
            const g = genomic(amp ? { xi: xa, xf: xb } : x);
            return {
                isAmplicon: amp,
                fwd: amp ? seqOf(x.left) : '',
                rev: amp ? seqOf(x.right) : '',
                probe: amp ? (seqOf(x.mid) || x.probeSequence || '') : '',
                fwdTm: amp ? tmOf(x.left) : null,
                revTm: amp ? tmOf(x.right) : null,
                probeTm: amp ? tmOf(x.mid) : null,
                product: amp ? (isFinite(+x.size) ? +x.size : (xb - xa)) : null,
                info: (x.info || ''),
                rank: (x.rank != null ? x.rank : i + 1),
                name: x.name || (modality + '-' + (i + 1)),
                start: xa,
                end: xb,
                length: Math.abs(xb - xa),
                gStart: g ? g.start : null,
                gEnd: g ? g.end : null,
                score: scoreOf(x),
                gc: (x.gc_percent != null ? +x.gc_percent : null),
                tm: (x.tm_c != null ? +x.tm_c : null),
                // The SYNTHESIS sequence: for an ASO the oligo itself, for an siRNA the guide,
                // which is what synthesisSequence already means on both classes.
                sequence: x.synthesisSequence || x.antisense_display || x.sequence || '',
                // A duplex has a second strand, and a report that shows only the guide is
                // describing half the compound. Empty for a single-stranded ASO, and the
                // column is dropped entirely when nothing in the run has one.
                passenger: x.sense || x.senseCoreRna || '',
                guideDuplex: x.synthesisSequenceDuplex || x.antisenseDuplex || '',
                senseDuplex: x.senseDuplex || '',
                target: x.target_site_input_alphabet || x.target_site || x.targetSiteRna || '',
                structure: x.structure || '',
                offtarget: (x.offtarget_genes_by_distance
                    ? Object.keys(x.offtarget_genes_by_distance)
                        .sort().map((k) => k + ':' + x.offtarget_genes_by_distance[k]).join(' ')
                    : '')
            };
        });

        // Is this run a duplex modality? Asked of the compounds rather than of the modality
        // name, so it stays right for anything else two-stranded that gets designed later.
        const anyDuplex = rows.some((r) => !!r.passenger);
        const anyAmplicon = rows.some((r) => r.isAmplicon);

        // ONE column definition, read by both the table and the sheet. They were drifting
        // apart the moment a modality needed different columns, and a report whose export
        // does not match what it shows on screen is worse than either alone.
        const COLUMNS = anyAmplicon
            ? [
                ['#', 'Rank', (r) => r.rank, 'dim'],
                ['Name', 'Name', (r) => r.name],
                ['Span', 'Track start', (r) => r.start, 'dim'],
                [null, 'Track end', (r) => r.end],
                ['Product', 'Product (bp)', (r) => r.product, 'dim'],
                [null, 'Genomic start', (r) => r.gStart],
                [null, 'Genomic end', (r) => r.gEnd],
                ['Forward', 'Forward primer', (r) => r.fwd, 'seq'],
                ['Fwd Tm', 'Forward Tm (C)', (r) => r.fwdTm, 'dim'],
                ['Reverse', 'Reverse primer', (r) => r.rev, 'seq'],
                ['Rev Tm', 'Reverse Tm (C)', (r) => r.revTm, 'dim'],
                ['Probe', 'Probe', (r) => r.probe, 'seq2'],
                [null, 'Probe Tm (C)', (r) => r.probeTm],
                ['Notes', 'Notes', (r) => r.info, 'dim']
            ]
            : [
                ['#', 'Rank', (r) => r.rank, 'dim'],
                ['Name', 'Name', (r) => r.name],
                ['Site', 'Track start', (r) => r.start, 'dim'],
                [null, 'Track end', (r) => r.end],
                ['Len', 'Length', (r) => r.length, 'dim'],
                [null, 'Genomic start', (r) => r.gStart],
                [null, 'Genomic end', (r) => r.gEnd],
                ['Score', 'Score', (r) => r.score],
                ['GC%', 'GC%', (r) => r.gc, 'dim'],
                ['Tm', 'Tm (C)', (r) => r.tm, 'dim'],
                [(anyDuplex ? 'Guide (antisense)' : 'Sequence'),
                    (anyDuplex ? 'Guide (antisense)' : 'Synthesis sequence'), (r) => r.sequence, 'seq']
            ].concat(anyDuplex ? [
                ['Passenger (sense)', 'Passenger (sense)', (r) => r.passenger, 'seq2'],
                [null, 'Guide as synthesised', (r) => r.guideDuplex],
                [null, 'Passenger as synthesised', (r) => r.senseDuplex]
            ] : []).concat([
                [null, 'Target site', (r) => r.target],
                [null, 'HELM', (r) => r.structure],
                [null, 'Off-target genes by ED', (r) => r.offtarget]
            ]);

        // A column with a null screen header is export-only: too wide or too incidental for
        // the table, and wanted in the spreadsheet.
        const SCREEN = COLUMNS.filter((c) => c[0] != null);

        // ---- what the algorithm actually did --------------------------------------------
        const facts = [];
        const add = (k, v) => { if (v !== null && v !== undefined && v !== '') facts.push([k, v]); };
        add('Modality', modality);
        add('Algorithm', o.algorithm || res.design_type || '—');
        add('Chemistry', o.chemistry);
        add('Track', track && track.name);
        add('Compounds placed', oligos.length);
        if (res.lengths_scanned) add('Lengths scanned', (res.lengths_scanned || []).join(', ') + ' nt');
        if (res.gap_sizes_scanned) add('Gap sizes scanned', (res.gap_sizes_scanned || []).join(', ') + ' nt');
        if (res.wing_modification) add('Wings', res.wing_modification);
        if (res.full_modification) add('Modification', res.full_modification);
        if (res.default_backbone) add('Backbone', res.default_backbone);
        // djPrimer / primer3 report their own shape: how many candidates primer3 produced and
        // the decision threshold the assay-success model ranked against.
        if (res.junction_count != null) {
            add('Exon junctions', res.junction_count);
            add('Junction filter', String(res.junction_filter || '')
                .replace(/_/g, ' ')
                // The script's own words for the two fallbacks, which are the answer to
                // "why does this design not span a junction" and were previously only
                // visible in a raw JSON dump.
                .replace('amplicon spans exon junction', 'every amplicon spans an exon-exon junction')
                .replace('no hits spanning junction fallback to unfiltered',
                    'none spanned a junction — fell back to unfiltered top-N')
                .replace('no exon junctions fallback to unfiltered',
                    'this track has no exon junctions — fell back to unfiltered top-N'));
        }
        if (res.n_candidates != null) add('Candidates designed', Number(res.n_candidates).toLocaleString());
        if (res.n_returned != null) add('Candidates returned', res.n_returned);
        if (res.decision_threshold_star != null) add('Decision threshold', num(res.decision_threshold_star, 3));
        if (res.ct_threshold_used != null) add('Ct threshold used', num(res.ct_threshold_used, 2));
        if (anyAmplicon) {
            const ps = rows.map((r) => r.product).filter((v) => isFinite(v));
            if (ps.length) add('Product size', Math.min.apply(null, ps) + '–' + Math.max.apply(null, ps) + ' bp');
            const tms = rows.map((r) => r.fwdTm).concat(rows.map((r) => r.revTm)).filter((v) => v != null);
            if (tms.length) add('Primer Tm range', num(Math.min.apply(null, tms), 1) + '–' + num(Math.max.apply(null, tms), 1) + ' C');
            add('Probes', rows.filter((r) => r.probe).length + ' of ' + rows.length + ' amplicons carry one');
        }
        if (res.output_alphabet) add('Output alphabet', res.output_alphabet);
        if (res.overhangs && (res.overhangs.sense || res.overhangs.antisense)) {
            add("3' overhangs", "sense " + (res.overhangs.sense || '—')
                + ", antisense " + (res.overhangs.antisense || '—'));
        }

        // Coverage. The ASO scripts report their own; py/sirna/design.py reports only
        // total_candidates, so the rest is derived from the compounds that were actually
        // placed -- which gives every modality the same three lines rather than a report
        // that is fuller for one of them because its script happens to say more.
        const cov = res.coverage || {};
        const scored = (cov.candidates_scored != null) ? cov.candidates_scored : res.total_candidates;
        if (scored != null) add('Candidates scored', Number(scored).toLocaleString());
        const starts = rows.map((r) => r.start).filter((v) => isFinite(v));
        const sites = (cov.sites_returned != null) ? cov.sites_returned : new Set(starts).size;
        const lo = (cov.first_site != null) ? cov.first_site : (starts.length ? Math.min.apply(null, starts) : null);
        const hi = (cov.last_site != null) ? cov.last_site : (starts.length ? Math.max.apply(null, starts) : null);
        if (sites) add('Distinct sites returned', sites + (lo != null ? ('  (' + lo + '–' + hi + ')') : ''));
        let ntCov = cov.nt_covered, frac = cov.fraction_of_transcript_covered;
        if (ntCov == null && rows.length) {
            const seen = new Set();
            for (const r of rows) for (let i = r.start; i <= r.end; i++) seen.add(i);
            ntCov = seen.size;
            const total = res.input_length || (track && track.sequence && track.sequence.length) || 0;
            frac = total ? (ntCov / total) : null;
        }
        if (ntCov != null) {
            add('Transcript covered', (frac != null ? (num(100 * frac, 1) + '%  ') : '')
                + '(' + Number(ntCov).toLocaleString() + ' nt)');
        }
        if (res.selection_mode) {
            add('Selection', res.selection_mode === 'rank_order_across_sequence_space'
                ? 'Rank order across the whole sequence space, one design per site'
                : String(res.selection_mode).replace(/_/g, ' '));
        }
        const ot = res.offtarget_screen || null;
        if (ot) {
            add('Off-target screen', ot.ran
                ? (ot.index + ', edit distance ≤ ' + ot.edit_distance + ', ' + ot.screened + ' sites screened')
                : (ot.requested ? ('not applied — ' + (ot.reason || 'unavailable'))
                    : 'not requested — scored on sequence terms only'));
        }
        const scores = rows.map((r) => r.score).filter((v) => v != null);
        if (scores.length) add('Score range', num(Math.max.apply(null, scores)) + ' … ' + num(Math.min.apply(null, scores)));

        // py/sirna/design.py describes its own ranking in scoring_model -- the GC rule and the
        // strand-selection rules that decide which strand loads. That IS the algorithm for
        // this modality, in the script's own words, so it is shown rather than paraphrased.
        const sm = res.scoring_model || {};
        const rules = [];
        if (sm.gc_rule) rules.push(sm.gc_rule);
        for (const r of (sm.strand_selection_rules || [])) rules.push(r);
        for (const r of (sm.penalties || [])) rules.push(r);
        if (sm.windowing) add('Windowing', sm.windowing);

        // ---- exports ---------------------------------------------------------------------
        const stamp = () => {
            const d = new Date();
            const p = (n) => (n < 10 ? '0' : '') + n;
            return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
        };
        const baseName = ((track && track.name) || 'design').replace(/[^A-Za-z0-9._-]+/g, '_')
            + '_' + modality.replace(/[^A-Za-z0-9]+/g, '') + '_' + stamp();

        const sheetRows = () => [COLUMNS.map((c) => c[1])]
            .concat(rows.map((r) => COLUMNS.map((c) => {
                const v = c[2](r);
                return (v === undefined) ? null : v;
            })));

        // BED is 0-based half-open, and the score column is 0-1000 integer -- a 0-1 design
        // score written straight in would be read as "essentially zero" by every viewer that
        // opens it. Scaled, not truncated.
        const bedText = () => {
            // Whitespace in the first column breaks a BED for a good number of tools, and a
            // track named from a pasted sequence very often has some.
            const clean = (v) => ('' + v).trim().replace(/\s+/g, '_');
            const chrom = (track && track.chr) ? clean(('' + track.chr).indexOf('chr') === 0 ? track.chr : ('chr' + track.chr))
                : clean((track && track.name) || 'track');
            const strand = (track && (track.strand === -1 || track.strand === '-1' || track.strand === '-')) ? '-' : '+';
            const usable = rows.filter((r) => r.gStart != null);
            const useGenomic = usable.length === rows.length && rows.length > 0;
            const lines = [
                'track name="' + baseName + '" description="' + modality
                + (o.chemistry ? (' ' + o.chemistry) : '') + ', ' + rows.length + ' compounds'
                + (useGenomic ? '' : ' (track-relative coordinates: this track carries no genomic mapping)')
                + '" useScore=1'
            ];
            for (const r of rows) {
                // BED is 0-based half-open over the INCLUSIVE span. gStart/gEnd are the first
                // and last bases; r.start/r.end are 1-based with an exclusive end, so its last
                // base is r.end - 1. Both reduce to [first - 1, last], which is exactly length
                // wide -- the off-by-one that shows up as every compound being a base too long
                // in a genome browser.
                const first = useGenomic ? r.gStart : r.start;
                const last = useGenomic ? r.gEnd : (r.end - 1);
                const sc = (r.score == null) ? 0
                    : Math.max(0, Math.min(1000, Math.round((r.score <= 1 ? r.score * 1000 : r.score * 10))));
                lines.push([chrom, Math.max(0, Math.floor(first) - 1), Math.floor(last),
                    clean(r.name), sc, strand].join('\t'));
            }
            return lines.join('\n') + '\n';
        };

        // ---- the panel -------------------------------------------------------------------
        try {
            const ID = 'baja-design-summary';
            const old = document.getElementById(ID);
            if (old && old.parentNode) old.parentNode.removeChild(old);

            const overlay = document.createElement('div');
            overlay.id = ID;
            overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483340;background:#071a30;color:#fff;'
                + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';

            const head = document.createElement('div');
            head.style.cssText = 'flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:16px 22px 14px;'
                + 'background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);'
                + 'box-shadow:0 6px 20px rgba(0,0,0,0.35);';
            head.innerHTML = '<div style="min-width:0;">'
                + '<div style="font:700 20px Arial;">' + esc(modality) + ' design complete</div>'
                + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">'
                + oligos.length + ' compound' + (oligos.length === 1 ? '' : 's') + ' placed'
                + (track && track.name ? (' on ' + esc(track.name)) : '')
                + (o.chemistry ? ('  ·  ' + esc(o.chemistry)) : '') + '</div></div>';

            const btns = document.createElement('div');
            btns.style.cssText = 'margin-left:auto;display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;';
            const mk = (label, primary) => {
                const b = document.createElement('button');
                b.textContent = label;
                b.style.cssText = 'cursor:pointer;border-radius:8px;padding:9px 15px;font:700 12.5px Arial;'
                    + (primary
                        ? 'border:1px solid #12c2e0;background:#12c2e0;color:#04212b;'
                        : 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;');
                btns.appendChild(b);
                return b;
            };
            const bXlsx = mk('⭳ Excel (.xlsx)');
            const bBed = mk('⭳ BED');
            const bOff = mk('Run off-targets', true);
            const bClose = mk('Done');
            head.appendChild(btns);

            const body = document.createElement('div');
            body.style.cssText = 'flex:1 1 auto;overflow:auto;padding:18px 22px 28px;'
                + 'display:grid;grid-template-columns:minmax(280px,360px) 1fr;gap:22px;align-items:start;';

            // left: what was run
            const left = document.createElement('div');
            left.style.cssText = 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.12);'
                + 'border-radius:10px;padding:14px 16px;';
            left.innerHTML = '<div style="font:700 11px Arial;letter-spacing:1.6px;text-transform:uppercase;'
                + 'color:#7f9bb8;margin-bottom:10px;">The algorithm that ran</div>'
                + facts.map(([k, v]) => '<div style="display:flex;gap:10px;padding:5px 0;'
                    + 'border-bottom:1px solid rgba(255,255,255,0.06);">'
                    + '<div style="font:12.5px Arial;color:#9fb3c8;flex:0 0 46%;">' + esc(k) + '</div>'
                    + '<div style="font:12.5px Arial;color:#e8f0fb;flex:1 1 auto;">' + esc(v) + '</div></div>').join('')
                + (rules.length
                    ? ('<div style="font:700 11px Arial;letter-spacing:1.6px;text-transform:uppercase;'
                        + 'color:#7f9bb8;margin:16px 0 8px;">Ranking rules</div>'
                        + '<ul style="margin:0;padding-left:18px;font:12.5px/1.6 Arial;color:#c3d2e2;">'
                        + rules.map((r) => '<li>' + esc(r) + '</li>').join('') + '</ul>')
                    : '');

            // right: the compounds
            const right = document.createElement('div');
            right.style.cssText = 'min-width:0;';
            const SHOW = 60;
            const cell = 'padding:6px 9px;border-bottom:1px solid rgba(255,255,255,0.07);font:12.5px Arial;white-space:nowrap;';
            const tint = { dim: 'color:#c3d2e2;', seq: 'font-family:monospace;color:#9fe8c8;',
                seq2: 'font-family:monospace;color:#c9b6ff;' };
            const show = (v) => {
                if (v === null || v === undefined || v === '') return '—';
                return (typeof v === 'number') ? num(v, (Math.abs(v) >= 100 || v % 1 === 0) ? 0 : 2) : ('' + v);
            };
            right.innerHTML = '<div style="font:700 11px Arial;letter-spacing:1.6px;text-transform:uppercase;'
                + 'color:#7f9bb8;margin-bottom:10px;">The compounds'
                + (rows.length > SHOW ? (' — first ' + SHOW + ' of ' + rows.length + ', all of them are in the exports') : '')
                + '</div>'
                + '<div style="overflow-x:auto;border:1px solid rgba(255,255,255,0.12);border-radius:10px;">'
                + '<table style="border-collapse:collapse;width:100%;">'
                + '<thead><tr>' + SCREEN.map((c) => '<th style="' + cell + 'text-align:left;color:#9fb3c8;'
                    + 'font-weight:700;position:sticky;top:0;background:#0b2545;">' + esc(c[0]) + '</th>').join('')
                + '</tr></thead><tbody>'
                + rows.slice(0, SHOW).map((r) => '<tr>' + SCREEN.map((c) => '<td style="' + cell
                    + (tint[c[3]] || '') + '">' + esc(show(c[2](r))) + '</td>').join('') + '</tr>').join('')
                + '</tbody></table></div>';

            body.appendChild(left); body.appendChild(right);
            overlay.appendChild(head); overlay.appendChild(body);
            document.body.appendChild(overlay);

            let onKey = null;
            const close = () => {
                try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
                try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { }
            };
            onKey = (e) => { try { if (e.key === 'Escape') { close(); restoreHover(); } } catch (er) { } };
            document.addEventListener('keydown', onKey, true);
            bClose.onclick = () => { close(); restoreHover(); };

            const say = (m) => { try { graph.setResultMessage(' ' + m + ' '); } catch (e) { } };

            bXlsx.onclick = async () => {
                try {
                    const X = await exec('baja/io/xlsx-writer.js');
                    X.download(sheetRows(), baseName + '.xlsx', modality);
                    say(rows.length + ' compounds exported to ' + baseName + '.xlsx');
                } catch (e) {
                    say('Excel export failed: ' + (e && e.message ? e.message : e));
                }
            };
            bBed.onclick = async () => {
                try {
                    const X = await exec('baja/io/xlsx-writer.js');
                    X.downloadText(bedText(), baseName + '.bed', 'text/plain');
                    say(rows.length + ' compounds exported to ' + baseName + '.bed');
                } catch (e) {
                    say('BED export failed: ' + (e && e.message ? e.message : e));
                }
            };
            // The report steps aside for the search rather than sitting over it: off-targets
            // draw a gunsight on each compound as they go, and that is on the canvas.
            bOff.onclick = () => {
                close();
                try { exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout, oligos.slice()); }
                catch (e) {
                    say('Could not start the off-target run: ' + (e && e.message ? e.message : e));
                    restoreHover();
                }
            };
        } catch (e) {
            // The report is the last step of a design that has already succeeded. If it cannot
            // be drawn, the compounds are still on the track and the toast still says so.
            try { graph.setResultMessage(' ' + modality + ': ' + oligos.length + ' compounds placed. '); } catch (e2) { }
        }
        return true;
    })();
}
