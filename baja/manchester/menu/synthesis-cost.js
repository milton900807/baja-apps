function (graph, selectedTrack, genegraph_panel_layout) {

    // Synthesis cost for the compounds on a track, priced the way plates are actually
    // bought: a full 78-well plate of single-stranded ASO at 250 nmol costs $5,000, so the
    // real spend steps up per PLATE, not per oligo.
    //   exec('baja/manchester/menu/synthesis-cost.js', graph, selectedTrack, genegraph_panel_layout)
    //
    // Counting is by SYNTHESIS STRAND, because that is what occupies a well: a single-
    // stranded ASO is one well, an siRNA duplex is two (sense + antisense), and an amplicon
    // is two (forward + reverse primer). The breakdown shows each class so the number is
    // auditable rather than a bare total.

    return (async () => {
        const PLATE_WELLS = 78;
        const PLATE_COST = 5000;        // USD, per plate at 250 nmol
        const SCALE_NMOL = 250;
        const PER_WELL = PLATE_COST / PLATE_WELLS;   // ≈ $64.10

        const esc = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const usd = (n) => '$' + (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const usd0 = (n) => '$' + Math.round(n).toLocaleString();

        const t = selectedTrack;
        if (!t) { try { graph.setMessage(' No track selected. '); } catch (e) { } return graph; }

        // ---- Count synthesis strands by class -------------------------------------------
        const rows = [];
        let aso = 0, duplex = 0, primer = 0, other = 0;
        for (const o of (t.oligos || [])) {
            if (!o) continue;
            const ty = ('' + (o.type || '')).toLowerCase();
            if (o.left && o.right) { primer += 2; continue; }              // amplicon: 2 primers
            if (ty === 'sirna' || (o.sense && o.antisense)) { duplex += 1; continue; }
            if (ty === 'primer') { primer += 1; continue; }
            if (ty === 'aso' || ty === 'gapmer' || o.synthesisSequence) { aso += 1; continue; }
            other += 1;
        }
        const strands = aso + (duplex * 2) + primer + other;

        if (!strands) {
            try { graph.setMessage(' No compounds on ' + (t.name || 'this track') + ' to cost. '); } catch (e) { }
            return graph;
        }

        const plates = Math.ceil(strands / PLATE_WELLS);
        const platedCost = plates * PLATE_COST;
        const proRata = strands * PER_WELL;
        const spareWells = (plates * PLATE_WELLS) - strands;

        if (aso) rows.push(['Single-stranded ASO', aso + ' × 1', aso]);
        if (duplex) rows.push(['siRNA duplex (sense + antisense)', duplex + ' × 2', duplex * 2]);
        if (primer) rows.push(['Primers', primer + ' × 1', primer]);
        if (other) rows.push(['Other oligos', other + ' × 1', other]);

        // ---- Panel ----------------------------------------------------------------------
        try { const old = document.getElementById('baja-synthesis-cost'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const panel = document.createElement('div');
        panel.id = 'baja-synthesis-cost';
        panel.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:2147483400;width:min(560px,94vw);'
            + 'max-height:82vh;display:flex;flex-direction:column;overflow:hidden;background:#0b2545;color:#fff;border-radius:12px;'
            + 'box-shadow:0 12px 40px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.14);font-family:Arial,Helvetica,sans-serif;';

        const head = document.createElement('div');
        head.style.cssText = 'flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.14);';
        head.innerHTML = '<div style="flex:1;min-width:0;">'
            + '<div style="font:700 16px Arial;">Synthesis cost</div>'
            + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(t.name || 'Track') + '</div>'
            + '</div>'
            + '<button id="sc-close" style="cursor:pointer;flex:0 0 auto;border-radius:8px;padding:9px 16px;font:700 13px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Close</button>';

        const body = document.createElement('div');
        body.style.cssText = 'flex:1 1 auto;min-height:0;overflow:auto;padding:16px 18px 18px;';

        const cell = 'padding:6px 0;font:13px Arial;';
        body.innerHTML = ''
            + '<div style="font:700 12px Arial;color:#4fd0e6;margin-bottom:4px;">Wells needed</div>'
            + '<table style="width:100%;border-collapse:collapse;">'
            + rows.map((r) => '<tr style="border-top:1px solid rgba(255,255,255,0.08);">'
                + '<td style="' + cell + 'color:#eaf6f9;">' + esc(r[0]) + '</td>'
                + '<td style="' + cell + 'color:#8fb8c8;text-align:right;white-space:nowrap;">' + esc(r[1]) + '</td>'
                + '<td style="' + cell + 'color:#fff;font-weight:700;text-align:right;width:56px;">' + r[2] + '</td></tr>').join('')
            + '<tr style="border-top:2px solid rgba(255,255,255,0.22);">'
            + '<td style="' + cell + 'font-weight:700;">Total strands</td><td></td>'
            + '<td style="' + cell + 'font-weight:700;text-align:right;">' + strands + '</td></tr>'
            + '</table>'

            + '<div style="margin-top:16px;padding:12px 14px;background:rgba(34,197,94,0.10);border-left:3px solid #22c55e;border-radius:6px;">'
            + '<div style="font:12px Arial;color:#9fb3c8;">' + plates + ' plate' + (plates === 1 ? '' : 's') + ' × ' + usd0(PLATE_COST) + '</div>'
            + '<div style="font:800 26px Arial;color:#eaf6f9;margin-top:2px;">' + usd0(platedCost) + '</div>'
            + '<div style="font:11.5px Arial;color:#8fb8c8;margin-top:4px;">Plates are bought whole — '
            + (spareWells ? (spareWells + ' well' + (spareWells === 1 ? '' : 's') + ' spare on the last plate.') : 'no spare wells.') + '</div>'
            + '</div>'

            + '<div style="margin-top:12px;font:12.5px/1.6 Arial;color:#cfe6ee;">'
            + '<div><span style="color:#8fb8c8;">Per strand</span> &nbsp;' + usd(PER_WELL) + ' &nbsp;<span style="color:#8fb8c8;">(' + usd0(PLATE_COST) + ' ÷ ' + PLATE_WELLS + ')</span></div>'
            + '<div><span style="color:#8fb8c8;">Pro-rata for ' + strands + ' strand' + (strands === 1 ? '' : 's') + '</span> &nbsp;' + usd(proRata) + '</div>'
            + '<div style="color:#8fb8c8;margin-top:6px;">Scale ' + SCALE_NMOL + ' nmol. Pro-rata is what the strands are worth; the figure above is what a plate order actually costs.</div>'
            + '</div>';

        panel.appendChild(head); panel.appendChild(body);
        document.body.appendChild(panel);

        let onKey = null;
        const close = () => {
            try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
        };
        onKey = (e) => { try { if (e.key === 'Escape') close(); } catch (er) { } };
        document.addEventListener('keydown', onKey, true);
        head.querySelector('#sc-close').onclick = close;

        return graph;
    })();
}
