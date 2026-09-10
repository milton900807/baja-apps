function (graph, track, action) {
    // THE DIFFERENCE BETWEEN SAMPLES, DRAWN. A VCF with two samples is one person twice --
    // tumour and germline -- or two people, and the question it answers is which of them
    // carries each change. On the track that is invisible: a marker is a marker whoever
    // has it. This puts a strip under the track with one row per sample and one cell per
    // variant, coloured by that sample's genotype, so a column that is filled in one row
    // and empty in the next IS the difference, and a phased call shows which haplotype.
    //
    // Two things live here: the strip (an overlay that stays on until switched off, kept
    // on the graph under a name so it is never installed twice) and a marker colour mode
    // that paints the variant heads themselves by sample or by haplotype, for the times
    // the strip is more than is wanted.
    //
    // Variants know their samples from the fields load-transcripts-with-variants.js sets
    // (samples[], genotypes[]) or, after a save and reload, from the SAMPLES= and GT=
    // annotations the Genome Viewer wrote. Both are read; neither is required of every
    // variant on the track.
    const GT_COLOR = {
        '0/0': '#e2e8f0', '0/1': '#ffa400', '1/1': '#a855f7',
        '0|1': '#ff2d78', '1|0': '#1d9bf0', '1|1': '#a855f7', 'other': '#94a3b8',
    };
    const GT_WORD = {
        '0/0': 'reference', '0/1': 'heterozygous', '1/1': 'homozygous',
        '0|1': 'haplotype 2', '1|0': 'haplotype 1', '1|1': 'homozygous (phased)', 'other': 'other allele',
    };
    const SAMPLE_COLOR = ['#1d9bf0', '#ff2d78', '#ffa400', '#12c95a', '#a855f7', '#f97316', '#14b8a6', '#e11d48'];
    const SHARED_COLOR = '#475569';
    const PHASE_COLOR = { '1|0': '#1d9bf0', '0|1': '#ff2d78', '1/1': '#a855f7', '1|1': '#a855f7', '0/1': '#ffa400' };

    const fieldOf = (s, key) => {
        for (const a of (s && s.annotations) || []) {
            const t = '' + a;
            if (t.indexOf(key + '=') === 0) return t.slice(key.length + 1);
        }
        return '';
    };
    // [names[], genotypes[]] for one variant, or null when it carries no sample data.
    const genotypesOf = (s) => {
        if (!s) return null;
        if (Array.isArray(s.samples) && s.samples.length) return [s.samples, s.genotypes || []];
        const names = fieldOf(s, 'SAMPLES'), gts = fieldOf(s, 'GT');
        if (names) return [names.split(','), gts.split(',')];
        if (s.gt) return [['sample'], ['' + s.gt]];
        return null;
    };
    const carries = (gt) => !!gt && gt !== '0/0' && gt !== '0|0' && gt !== './.' && gt !== '.' && gt !== '';
    // Every sample named on this track, in first-seen order.
    const samplesOn = (tr) => {
        const out = [];
        for (const s of (tr.snpindels || [])) {
            const g = genotypesOf(s);
            if (!g) continue;
            for (const n of g[0]) if (out.indexOf(n) < 0) out.push(n);
        }
        return out;
    };

    // ---- the strip ----------------------------------------------------------------------
    const ROW_PX = 13, TOP_PX = 96, LABEL_PX = 92;
    const drawStrip = (ctx, gg) => {
        const g = gg.graph;                       // the inner graph: screen mapping and canvas
        if (!g || !g.canvas) return;
        const W = g.canvas.width, H = g.canvas.height;
        for (const tr of (gg.track || [])) {
            if (!tr || !tr.__sampleStrip || !tr.grid) continue;
            const names = samplesOn(tr);
            if (!names.length) continue;
            let baseSY;
            try { baseSY = g.Y(tr.grid.Y(0)); } catch (e) { continue; }
            const top = baseSY + TOP_PX;
            const rows = names.length;
            const h = rows * ROW_PX + 22;
            if (top > H + 10 || top + h < -10) continue;
            // The window in track coordinates, so a whole-genome track costs the view.
            let x0w, x1w;
            try { x0w = tr.grid.Xwc(g.Xwc(0)); x1w = tr.grid.Xwc(g.Xwc(W)); } catch (e) { continue; }
            const lo = Math.min(x0w, x1w) - 1, hi = Math.max(x0w, x1w) + 1;
            const vis = (tr.snpindels || []).filter((s) => s && s.xi >= lo && s.xi <= hi && genotypesOf(s));
            ctx.save();
            // Backing, then the rows.
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.fillRect(0, top - 4, W, h);
            ctx.strokeStyle = 'rgba(15,23,42,0.18)';
            ctx.lineWidth = 1;
            ctx.strokeRect(0.5, top - 3.5, W - 1, h - 1);
            ctx.font = '600 10.5px Arial';
            ctx.textBaseline = 'middle';
            for (let r = 0; r < rows; r++) {
                const y = top + r * ROW_PX;
                ctx.fillStyle = r % 2 ? 'rgba(15,23,42,0.035)' : 'rgba(15,23,42,0)';
                ctx.fillRect(0, y, W, ROW_PX);
                ctx.fillStyle = SAMPLE_COLOR[r % SAMPLE_COLOR.length];
                ctx.fillRect(4, y + 2, 4, ROW_PX - 4);
                ctx.fillStyle = '#0f172a';
                ctx.textAlign = 'left';
                ctx.fillText(names[r].length > 13 ? names[r].slice(0, 12) + '…' : names[r], 12, y + ROW_PX / 2);
            }
            // The cells. A column whose rows disagree -- carried here, absent there -- is
            // the thing this strip exists to show, and gets a dark rule down its rows.
            let differing = 0;
            for (const s of vis) {
                const [ns, gts] = genotypesOf(s);
                let sx1, sx2;
                try { sx1 = g.X(tr.grid.X(s.xi)); sx2 = g.X(tr.grid.X(s.xf != null ? s.xf : s.xi + 1)); } catch (e) { continue; }
                let cx = Math.min(sx1, sx2), cw = Math.abs(sx2 - sx1);
                if (cw < 5) { cx = (sx1 + sx2) / 2 - 2.5; cw = 5; }
                if (cx + cw < LABEL_PX || cx > W) continue;
                const has = [], mine = [];
                for (let r = 0; r < rows; r++) {
                    const j = ns.indexOf(names[r]);
                    const gt = j >= 0 ? (gts[j] || '') : '';
                    mine.push(gt); has.push(carries(gt));
                }
                const anyHas = has.some(Boolean), allHas = has.every(Boolean);
                const differs = anyHas && !allHas && rows > 1;
                if (differs) differing++;
                for (let r = 0; r < rows; r++) {
                    const y = top + r * ROW_PX;
                    const gt = mine[r];
                    if (!gt || gt === './.' || gt === '.') {
                        // No call in this sample: a hollow cell, not a reference one.
                        ctx.strokeStyle = 'rgba(15,23,42,0.25)';
                        ctx.setLineDash([2, 2]);
                        ctx.strokeRect(cx + 0.5, y + 2.5, cw - 1, ROW_PX - 5);
                        ctx.setLineDash([]);
                        continue;
                    }
                    ctx.fillStyle = GT_COLOR[gt] || GT_COLOR.other;
                    ctx.fillRect(cx, y + 2, cw, ROW_PX - 4);
                }
                if (differs) {
                    ctx.strokeStyle = 'rgba(15,23,42,0.85)';
                    ctx.lineWidth = 1.2;
                    ctx.strokeRect(cx - 0.5, top + 0.5, cw + 1, rows * ROW_PX - 1);
                }
                if (s.highlight) {
                    ctx.strokeStyle = '#2563EB';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(cx - 1.5, top - 0.5, cw + 3, rows * ROW_PX + 1);
                }
            }
            // The key, on the strip's last line.
            const ky = top + rows * ROW_PX + 9;
            ctx.font = '600 9.5px Arial';
            let kx = 12;
            const keyItems = [['1|0', 'hap 1'], ['0|1', 'hap 2'], ['0/1', 'het'], ['1/1', 'hom'], ['0/0', 'ref']];
            for (const [gt, word] of keyItems) {
                ctx.fillStyle = GT_COLOR[gt];
                ctx.fillRect(kx, ky - 4, 9, 8);
                ctx.fillStyle = '#334155';
                ctx.textAlign = 'left';
                ctx.fillText(word, kx + 12, ky);
                kx += 12 + ctx.measureText(word).width + 12;
            }
            ctx.fillStyle = '#5b6b7a';
            ctx.fillText(vis.length + ' variant' + (vis.length === 1 ? '' : 's') + ' in view'
                + (rows > 1 ? ' · ' + differing + ' differ' + (differing === 1 ? 's' : '') + ' between samples' : '')
                + ' · dark outline = not in every sample', kx + 8, ky);
            ctx.restore();
        }
    };
    const install = () => {
        graph.__overlays = graph.__overlays || {};
        graph.__overlays.sampleStrip = drawStrip;
    };

    // ---- marker colours -----------------------------------------------------------------
    const colourMarkers = (tr, mode) => {
        const names = samplesOn(tr);
        for (const s of (tr.snpindels || [])) {
            if (!s) continue;
            const g = genotypesOf(s);
            if (!g || mode === 'clinvar') { s.sampleColor = null; continue; }
            if (mode === 'sample') {
                const who = g[0].filter((n, j) => carries(g[1][j])).map((n) => names.indexOf(n));
                s.sampleColor = who.length === 1 ? SAMPLE_COLOR[who[0] % SAMPLE_COLOR.length]
                    : who.length > 1 ? SHARED_COLOR : '#cbd5e1';
            } else if (mode === 'phase') {
                const gts = g[1].filter(carries);
                const first = gts[0] || '';
                s.sampleColor = gts.every((x) => x === first) ? (PHASE_COLOR[first] || '#94a3b8') : '#94a3b8';
            }
        }
        tr.__markerColour = mode;
    };

    // ---- the menu -----------------------------------------------------------------------
    const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };
    const wake = () => { try { if (graph.wake) graph.wake(); } catch (e) { } };
    const names = samplesOn(track);
    const toggleStrip = () => {
        install();
        track.__sampleStrip = !track.__sampleStrip;
        wake();
        say(track.__sampleStrip
            ? 'Sample strip on: one row per sample under ' + (track.name || 'the track') + ' — ' + names.join(', ') + '.'
            : 'Sample strip off.');
    };
    if (action === 'toggle') { toggleStrip(); return true; }
    if (action === 'install') { install(); return true; }

    const mark = (m) => (track.__markerColour === m ? '● ' : '○ ');
    const items = [
        { label: '‹ back', move: () => { }, click: () => { graph.showSideMenu(null); try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, graph.genegraph_panel_layout); } catch (e) { } } },
        {
            label: (track.__sampleStrip ? 'Hide' : 'Show') + ' the sample strip (' + names.length + ' sample' + (names.length === 1 ? '' : 's') + ')',
            move: () => { }, click: () => { graph.showSideMenu(null); toggleStrip(); }
        },
        { label: mark('clinvar') + 'Colour markers by ClinVar class', move: () => { }, click: () => { colourMarkers(track, 'clinvar'); wake(); graph.showSideMenu(null); say('Markers coloured by clinical significance.'); } },
        { label: mark('sample') + 'Colour markers by sample', move: () => { }, click: () => { colourMarkers(track, 'sample'); wake(); graph.showSideMenu(null); say('Markers coloured by sample: ' + names.map((n, i) => n + ' ' + SAMPLE_COLOR[i % SAMPLE_COLOR.length]).join(', ') + '; slate = in more than one.'); } },
        { label: mark('phase') + 'Colour markers by haplotype', move: () => { }, click: () => { colourMarkers(track, 'phase'); wake(); graph.showSideMenu(null); say('Markers coloured by haplotype: blue 1|0, pink 0|1, purple homozygous, amber unphased.'); } },
    ];
    // What each sample carries, as a line of the menu: the count is the summary the
    // strip draws in full.
    const total = (track.snpindels || []).filter((s) => genotypesOf(s)).length;
    for (const n of names) {
        const c = (track.snpindels || []).filter((s) => { const g = genotypesOf(s); if (!g) return false; const j = g[0].indexOf(n); return j >= 0 && carries(g[1][j]); }).length;
        items.push({ label: '   ' + n + ': ' + c + ' of ' + total + ' variants', move: () => { }, click: () => { } });
    }
    graph.showSideMenu(items, null, 'Samples ▸');
    return true;
}
