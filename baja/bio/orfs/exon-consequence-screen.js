function (graph, genegraph_panel_layout, model) {

    // WHAT EACH EXON IS WORTH TO THE PROTEIN, AS A SCREEN.
    //   exec('baja/bio/orfs/exon-consequence-screen.js', graph, layout,
    //        { track, gene, rows, onGo })
    //
    // The coupling readout on a track is one number for the whole gene: how far the protein
    // follows its mRNA, predicted or measured. It cannot say what losing exon 15 does,
    // because it has no exon in it. This is the same question asked per exon, from the skip
    // isoform: drop that exon, translate what is left, and see what comes out.
    //
    // SORTED BY WHAT IS AT STAKE, not by position. Fifteen headlines are fifteen things to
    // read; "which exon must not be lost" should be answerable from the top of the list.
    // Position order is one click away for reading along the transcript.
    //
    // HOW OFTEN THE SKIP HAPPENS IS A SEPARATE COLUMN from what it would do, and it is
    // empty until PSI has been run. The two are different claims: an exon whose loss
    // destroys the message and which is never skipped is a different thing from one that is
    // skipped in a third of transcripts, and collapsing them into a single score would hide
    // exactly the case worth finding.
    //
    // Every row goes where it is: clicking one frames that exon on the track behind, which
    // is the next thing anyone does with a row that says something alarming.

    const m = model || {};
    const rows = (m.rows || []).filter(Boolean);
    const gene = '' + (m.gene || (m.track && m.track.name) || 'this track');
    const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    try { if (window.__bajaExonConsequence && window.__bajaExonConsequence.destroy) window.__bajaExonConsequence.destroy(); } catch (e) { }

    // The colour IS the reading: worst first, and the same three colours the stability tag
    // uses on the track, so a red row here and a red tag there mean the same kind of thing.
    const TONE = (r) => (!r.ok || r.outcome === 'none') ? '#9fc4d4'
        : (r.severity <= 1) ? '#ff8f8f'
            : (r.severity === 2) ? '#ffd9a0' : '#9ae6b4';
    const pct = (x) => (x == null || !isFinite(+x)) ? '' : (Math.round(+x * 100) + '%');

    const el = document.createElement('div');
    el.id = 'baja-exon-consequence';
    el.setAttribute('role', 'dialog');
    el.style.cssText = 'position:fixed;inset:0;z-index:2147482450;display:flex;flex-direction:column;'
        + 'background:#0a2540;padding:16px 20px 12px 20px;overflow:auto;color:#eaf6f9;'
        + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:13px;';

    const BTN = (id, label, primary) =>
        '<button type="button" data-id="' + id + '" style="background:'
        + (primary ? 'rgba(26,163,189,0.22)' : 'transparent')
        + ';border:1px solid rgba(159,196,212,0.5);color:#eaf6f9;border-radius:7px;'
        + 'padding:6px 13px;cursor:pointer;font:inherit;white-space:nowrap;">' + esc(label) + '</button>';

    const knownPsi = rows.some((r) => r.psi != null);

    const line = (r, i) => {
        const odd = (i % 2) ? 'background:rgba(159,196,212,0.05);' : '';
        const tone = TONE(r);
        const len = (r.ok && r.oldLength) ? (r.oldLength + ' → ' + r.newLength + ' aa') : '';
        // An exon that is never skipped and one whose skip rate was never measured are not
        // the same claim, and a blank for both would say they were.
        const how = (r.psi == null) ? '<span style="color:#9fc4d4;">not measured</span>'
            : (r.skip > 0.005
                ? ('<span style="color:' + (r.skip >= 0.5 ? '#ff8f8f' : (r.skip >= 0.1 ? '#ffd9a0' : '#cfe9f3')) + ';">'
                    + 'skipped in ' + pct(r.skip) + '</span>')
                : '<span style="color:#9fc4d4;">constitutive</span>');
        return '<tr data-row="' + r.index + '" style="' + odd + 'cursor:pointer;">'
            + '<td style="padding:9px 10px;vertical-align:top;white-space:nowrap;">'
            + '<div style="font-weight:700;">exon ' + r.index + '</div>'
            + '<div style="font-size:11px;color:#9fc4d4;">' + (r.exonLen ? (r.exonLen + ' nt') : '') + '</div></td>'
            + '<td style="padding:9px 10px;vertical-align:top;white-space:nowrap;color:' + tone + ';font-weight:700;">'
            + esc(r.ok ? r.verdict : 'not assessed')
            + (len ? ('<div style="font-size:11px;color:#9fc4d4;font-weight:400;">' + len + '</div>') : '')
            + '</td>'
            + '<td style="padding:9px 10px;vertical-align:top;font-size:12px;color:#cfe9f3;">'
            + esc(r.ok ? r.headline : (r.reason || '')) + '</td>'
            + '<td style="padding:9px 10px;vertical-align:top;white-space:nowrap;font-size:12px;">' + how + '</td>'
            + '</tr>';
    };

    const head = '<tr style="color:#9fc4d4;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">'
        + '<th style="text-align:left;padding:0 10px 6px 10px;">exon</th>'
        + '<th style="text-align:left;padding:0 10px 6px 10px;">if it is skipped</th>'
        + '<th style="text-align:left;padding:0 10px 6px 10px;">what happens</th>'
        + '<th style="text-align:left;padding:0 10px 6px 10px;">how often</th></tr>';

    // The count that matters first: how many exons cannot be lost without losing the protein.
    const nBad = rows.filter((r) => r.ok && r.severity <= 1).length;
    const nTrunc = rows.filter((r) => r.ok && r.severity === 2).length;
    const nSafe = rows.filter((r) => r.ok && r.severity >= 3).length;

    let order = 'severity';
    const sorted = () => rows.slice().sort((p, q) => (order === 'position')
        ? (p.index - q.index)
        : ((p.severity - q.severity) || (p.index - q.index)));

    const body = () => '<table style="width:100%;border-collapse:collapse;">' + head
        + sorted().map(line).join('') + '</table>';

    el.innerHTML =
        '<div style="display:flex;align-items:flex-start;gap:12px;padding:2px 4px 12px 4px;">'
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font-weight:700;font-size:16px;">Each exon of ' + esc(gene) + ', and what losing it does</div>'
        + '<div style="font-size:12px;color:#cfe9f3;margin-top:3px;">'
        + rows.length + ' exons. Each one is dropped in turn and what is left is translated from '
        + 'the same start codon, so this is the skip isoform itself rather than an average over the gene. '
        + '<span style="color:#ff8f8f;">' + nBad + ' destroy the message</span>, '
        + '<span style="color:#ffd9a0;">' + nTrunc + ' leave a truncated protein</span>, '
        + '<span style="color:#9ae6b4;">' + nSafe + ' leave the protein readable</span>.'
        + (knownPsi ? '' : ' How often each skip actually happens is not known here: run PSI on the track to fill that column.')
        + '</div></div>'
        + BTN('order', 'In transcript order')
        + BTN('copy', 'Copy as TSV')
        + BTN('close', 'Close')
        + '</div>'
        + '<div data-id="table" style="background:#07202f;border-radius:9px;padding:12px 4px;">' + body() + '</div>'
        + '<div style="font-size:11px;color:#9fc4d4;padding:10px 4px 0 4px;">'
        + 'NMD calls are the 50–55 nt rule with the usual exceptions (start-proximal stops, long exons), '
        + 'not a measurement. Click any row to go to that exon.</div>'
        + '<div data-id="said" style="font-size:12px;color:#ffd9a0;padding:7px 4px 0 4px;min-height:16px;"></div>';

    document.body.appendChild(el);

    const pop = { el: el, destroy: null };
    function close() {
        try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
        try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) { }
        if (window.__bajaExonConsequence === pop) window.__bajaExonConsequence = null;
    }
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
    document.addEventListener('keydown', onKey, true);
    pop.destroy = close;
    window.__bajaExonConsequence = pop;

    const say = (t) => { try { const n = el.querySelector('[data-id="said"]'); if (n) n.textContent = t || ''; } catch (e) { } };

    el.addEventListener('click', async (e) => {
        const b = e.target && e.target.closest ? e.target.closest('button[data-id]') : null;
        if (b) {
            const id = b.getAttribute('data-id');
            if (id === 'close') { close(); return; }
            if (id === 'order') {
                order = (order === 'severity') ? 'position' : 'severity';
                b.textContent = (order === 'severity') ? 'In transcript order' : 'Worst first';
                el.querySelector('[data-id="table"]').innerHTML = body();
                return;
            }
            if (id === 'copy') {
                const tsv = ['exon\tif skipped\twhat happens\tskipped in\tlength']
                    .concat(sorted().map((r) => [r.index, (r.ok ? r.verdict : 'not assessed'),
                        (r.ok ? r.headline : (r.reason || '')),
                        (r.psi == null ? '' : pct(r.skip)), (r.exonLen || '')].join('\t'))).join('\n');
                try { await navigator.clipboard.writeText(tsv); say('Copied ' + rows.length + ' rows.'); }
                catch (e2) { say('Could not reach the clipboard.'); }
                return;
            }
            return;
        }
        // A ROW IS A PLACE. Something alarming in a list is only useful if the next thing
        // is one click away, and the next thing is always looking at the exon.
        const tr = e.target && e.target.closest ? e.target.closest('tr[data-row]') : null;
        if (!tr) return;
        const r = rows.find((x) => x.index === +tr.getAttribute('data-row'));
        if (!r) return;
        close();
        try { if (typeof m.onGo === 'function') await m.onGo(r); } catch (e2) { }
    });

    return pop;
}
