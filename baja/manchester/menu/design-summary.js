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

        const rows = oligos.map((x, i) => {
            const g = genomic(x);
            return {
                rank: (x.rank != null ? x.rank : i + 1),
                name: x.name || (modality + '-' + (i + 1)),
                start: Math.floor(x.xi),
                end: Math.floor(x.xf),
                length: Math.abs(Math.floor(x.xf) - Math.floor(x.xi)),
                gStart: g ? g.start : null,
                gEnd: g ? g.end : null,
                score: scoreOf(x),
                gc: (x.gc_percent != null ? +x.gc_percent : null),
                tm: (x.tm_c != null ? +x.tm_c : null),
                sequence: x.synthesisSequence || x.antisense_display || x.sequence || '',
                target: x.target_site_input_alphabet || x.target_site || '',
                structure: x.structure || '',
                offtarget: (x.offtarget_genes_by_distance
                    ? Object.keys(x.offtarget_genes_by_distance)
                        .sort().map((k) => k + ':' + x.offtarget_genes_by_distance[k]).join(' ')
                    : '')
            };
        });

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
        const cov = res.coverage || {};
        if (cov.candidates_scored != null) add('Candidates scored', cov.candidates_scored.toLocaleString());
        if (cov.sites_returned != null) {
            add('Distinct sites returned', cov.sites_returned
                + (cov.first_site != null ? ('  (' + cov.first_site + '–' + cov.last_site + ')') : ''));
        }
        if (cov.fraction_of_transcript_covered != null) {
            add('Transcript covered', num(100 * cov.fraction_of_transcript_covered, 1) + '%'
                + (cov.nt_covered != null ? ('  (' + cov.nt_covered.toLocaleString() + ' nt)') : ''));
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

        // ---- exports ---------------------------------------------------------------------
        const stamp = () => {
            const d = new Date();
            const p = (n) => (n < 10 ? '0' : '') + n;
            return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
        };
        const baseName = ((track && track.name) || 'design').replace(/[^A-Za-z0-9._-]+/g, '_')
            + '_' + modality.replace(/[^A-Za-z0-9]+/g, '') + '_' + stamp();

        const sheetRows = () => {
            const head = ['Rank', 'Name', 'Track start', 'Track end', 'Length',
                'Genomic start', 'Genomic end', 'Score', 'GC%', 'Tm (C)',
                'Synthesis sequence', 'Target site', 'HELM', 'Off-target genes by ED'];
            return [head].concat(rows.map((r) => [
                r.rank, r.name, r.start, r.end, r.length,
                r.gStart, r.gEnd, r.score, r.gc, r.tm,
                r.sequence, r.target, r.structure, r.offtarget
            ]));
        };

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
                    + '<div style="font:12.5px Arial;color:#e8f0fb;flex:1 1 auto;">' + esc(v) + '</div></div>').join('');

            // right: the compounds
            const right = document.createElement('div');
            right.style.cssText = 'min-width:0;';
            const SHOW = 60;
            const cell = 'padding:6px 9px;border-bottom:1px solid rgba(255,255,255,0.07);font:12.5px Arial;white-space:nowrap;';
            right.innerHTML = '<div style="font:700 11px Arial;letter-spacing:1.6px;text-transform:uppercase;'
                + 'color:#7f9bb8;margin-bottom:10px;">The compounds'
                + (rows.length > SHOW ? (' — first ' + SHOW + ' of ' + rows.length + ', all of them are in the exports') : '')
                + '</div>'
                + '<div style="overflow-x:auto;border:1px solid rgba(255,255,255,0.12);border-radius:10px;">'
                + '<table style="border-collapse:collapse;width:100%;">'
                + '<thead><tr>' + ['#', 'Name', 'Site', 'Len', 'Score', 'GC%', 'Tm', 'Sequence']
                    .map((h) => '<th style="' + cell + 'text-align:left;color:#9fb3c8;font-weight:700;'
                        + 'position:sticky;top:0;background:#0b2545;">' + h + '</th>').join('') + '</tr></thead>'
                + '<tbody>' + rows.slice(0, SHOW).map((r) => '<tr>'
                    + '<td style="' + cell + 'color:#7f9bb8;">' + r.rank + '</td>'
                    + '<td style="' + cell + '">' + esc(r.name) + '</td>'
                    + '<td style="' + cell + 'color:#c3d2e2;">' + r.start + '–' + r.end + '</td>'
                    + '<td style="' + cell + 'color:#c3d2e2;">' + r.length + '</td>'
                    + '<td style="' + cell + '">' + (r.score == null ? '—' : num(r.score)) + '</td>'
                    + '<td style="' + cell + 'color:#c3d2e2;">' + (r.gc == null ? '—' : num(r.gc, 1)) + '</td>'
                    + '<td style="' + cell + 'color:#c3d2e2;">' + (r.tm == null ? '—' : num(r.tm, 1)) + '</td>'
                    + '<td style="' + cell + 'font-family:monospace;color:#9fe8c8;">' + esc(r.sequence) + '</td>'
                    + '</tr>').join('') + '</tbody></table></div>';

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
