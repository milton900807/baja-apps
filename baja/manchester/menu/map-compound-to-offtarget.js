function (graph, oligo, hit, editDistance) {

    // From the "View off-targets" summary: load an off-target transcript as a NEW track, map the
    // compound onto it at its binding site (allowing the SAME edit distance the off-target run used,
    // Hamming mismatches), then view-all and — after 1s — zoom into the new compound.

    return (async () => {
        const say = (m) => { try { graph.setMessage('' + m); } catch (e) { } };
        const Oligo = await exec('flexigraph/oligo.js');
        const SIRNA = await exec('flexigraph/sirna.js');
        const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
        const ed = Number.isFinite(+editDistance) ? Math.max(0, +editDistance) : 0;
        const toDNA = (s) => ('' + (s || '')).toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');
        const revComp = (s) => s.split('').reverse().map((b) => ({ A: 'T', T: 'A', G: 'C', C: 'G' }[b] || 'N')).join('');

        // 1) Load the off-target transcript / gene as a new track.
        let id = ('' + ((hit && (hit.chr || hit.transcript || hit.symbol || hit.gene)) || '')).trim();
        if (!id) { say(' No transcript id for this off-target. '); return graph; }
        // A gene SYMBOL (not a transcript id) must first be resolved to a real Ensembl transcript id
        // — graph.add would otherwise treat "BCL2" as a transcript id and fail.
        const TX_RE = /^(ENS[A-Z]*T\d|N[MR]_|X[MR]_)/i;
        if (!TX_RE.test(id)) {
            say(' Resolving ' + id + ' → Ensembl transcript…');
            try {
                const em = (typeof EngineMonitor !== 'undefined') ? new EngineMonitor((m) => { try { graph.setMessage('' + m); } catch (e) { } }) : null;
                const res = em ? await exec('/py/sequence/prompt-to-transcript.py', em, id, 'human') : await exec('/py/sequence/prompt-to-transcript.py', id, 'human');
                let list = [];
                try { list = JSON.parse(res && res.transcripts); } catch (e) { list = (res && Array.isArray(res.transcripts)) ? res.transcripts : []; }
                if (Array.isArray(list) && list.length && list[0]) id = (list[0].id || list[0].transcript || list[0]) + '';
            } catch (e) { }
        }
        const before = new Set((graph.track || []).map((t) => t));
        say(' Loading ' + id + ' …');
        let track = null;
        try { track = await graph.add(id, 10, 10); } catch (e) { }
        // graph.add may resolve a track, the graph, or nothing — locate the newly-added track.
        if (!track || !track.sequence) {
            const added = (graph.track || []).filter((t) => t && !before.has(t));
            track = added.length ? added[added.length - 1] : (graph.track || [])[(graph.track || []).length - 1];
        }
        if (!track || !track.sequence) { say(' Could not load ' + id + '. '); return graph; }

        // 2) Find the compound's binding site on the track, allowing `ed` mismatches (Hamming). The
        //    ASO binds the reverse-complement (target site) of its synthesis sequence.
        const tseq = toDNA(track.sequence);
        const aso = toDNA(oligo.synthesisSequence || oligo.sequence);
        const L = aso.length;
        let best = -1, bestMm = ed + 1;
        if (L >= 6 && tseq.length >= L) {
            for (const pat of [revComp(aso), aso]) {
                if (!pat || pat.length !== L) continue;
                for (let i = 0; i + L <= tseq.length; i++) {
                    let mm = 0;
                    for (let k = 0; k < L; k++) { if (tseq[i + k] !== pat[k]) { mm++; if (mm > ed) break; } }
                    if (mm <= ed && mm < bestMm) { best = i; bestMm = mm; if (mm === 0) break; }
                }
                if (best >= 0 && bestMm === 0) break;
            }
        }
        if (best < 0 && hit && Number.isFinite(+hit.start)) best = +hit.start;   // fall back to the reported locus
        if (best < 0) best = 0;

        // 3) Place a copy of the compound at the binding site.
        const xi = track.xi + best;
        const xf = xi + (L || 1);
        const yLane = (track.tgraph && track.tgraph.ymax != null) ? (track.tgraph.ymax - 0.2) : ((track.y || 0) + 0.5);
        let clone = null;
        try {
            if (oligo.type === 'siRNA' || (oligo.sense && oligo.antisense)) {
                clone = new SIRNA('siRNA', oligo.synthesisSequence, oligo.sense, oligo.antisense, xi, xf, yLane, track.strand || 1, oligo.structure);
                clone.sense = oligo.sense; clone.antisense = oligo.antisense;
                clone.synthesisSequence = oligo.synthesisSequence; clone.structure = oligo.structure;
            } else {
                clone = new Oligo(oligo.type || 'aso', oligo.sequence || aso, oligo.structure, xi, xf, yLane);
                clone.synthesisSequence = oligo.synthesisSequence || oligo.sequence || aso;
                clone.strand = track.strand || 1; clone.structure = oligo.structure;
            }
            clone.name = oligo.name || 'compound';
            if (oligo.color) clone.color = oligo.color;
            track.addOligo(clone);
            clone.__track = track;
        } catch (e) { say(' Could not place the compound: ' + (e && e.message ? e.message : e)); }

        // 4) Animate-zoom to view the new track; wait ~2s after mapping/adding; then animate-zoom
        //    into the only compound on the track.
        // zoomRect() CANCELS and returns when graph.animating is set, so a fixed delay after
        // viewAllTracks() silently skipped the zoom whenever that animation was still running.
        // Wait for idle instead. Then zoom INTO the compound — never zoomToTrack, which frames
        // the whole transcript and leaves the compound sub-pixel with no readable sequence.
        const settle = async (budget) => {
            const t0 = Date.now();
            while (graph.animating && (Date.now() - t0) < budget) await sleep(60);
            await sleep(90);
        };
        try { if (graph.wake) graph.wake(); } catch (e) { }
        await sleep(400);
        await settle(4000);
        try { if (graph.viewAllTracks) await graph.viewAllTracks(); } catch (e) { }
        await settle(4000);
        try {
            const g = track.tgraph;
            if (g && typeof g.X === 'function') {
                const L = Math.max(1, Math.abs(xf - xi));
                const mid = (xi + xf) / 2;
                // chem-draw.js gates per-residue chemistry on screen px per residue: sugar rings
                // at SUGAR_PER = 34, phosphate/backbone at CHEM_PER = 30, base letters at 11.
                // Aim well above the sugar threshold so the chemistry actually renders.
                let cw = 1200;
                try { cw = (graph.canvas && graph.canvas.width) || (graph.graph && graph.graph.canvas && graph.graph.canvas.width) || 1200; } catch (e) { }
                // Preferred framing: the whole compound plus ~3 residues of context either side.
                // HARD CAP: never show more residues than fit at SUGAR_MIN_PX, so the sugar
                // rings always render. Seeing the chemistry is the point of this zoom, so on a
                // long compound (14 of 132 here run 30-36 nt) a couple of residues off the edge
                // is the right trade against losing the chemistry on all of them.
                const CHEM_TARGET_PX = 48;   // comfortable target, well clear of SUGAR_PER (34)
                const SUGAR_MIN_PX = 35;     // hard floor — just above SUGAR_PER
                const chemCap = Math.max(6, Math.floor(cw / CHEM_TARGET_PX));
                const hardCap = Math.max(8, Math.floor(cw / SUGAR_MIN_PX));
                let visible = L + 6;
                if (chemCap > L) visible = Math.min(visible, chemCap);
                visible = Math.min(visible, hardCap);
                const half = visible / 2;
                const gx0 = g.X(mid - half), gx1 = g.X(mid + half);

                // Contract the view VERTICALLY until the track stands about TARGET_TRACK_PX
                // tall on screen, so the compound and the sequence under it are both readable.
                // Screen px per graph-world unit is canvasHeight / ySpan, so to land the track's
                // own world height on TARGET_TRACK_PX:  ySpan = trackWorldH * canvasH / TARGET.
                // NOTE animateTo() DISCARDS a Y span < 1 and keeps the current view, which is why
                // the old +/-0.5 band (span exactly 1) never actually contracted anything.
                const TARGET_TRACK_PX = 100;
                let ch = 800;
                try { ch = (graph.canvas && graph.canvas.height) || (graph.graph && graph.graph.canvas && graph.graph.canvas.height) || 800; } catch (e) { }
                let gyTop, gyBot;
                try {
                    gyTop = g.Y(typeof g.getymax === 'function' ? g.getymax() : (g.yi + (g.height || 0)));
                    gyBot = g.Y(typeof g.getymin === 'function' ? g.getymin() : g.yi);
                } catch (e) { gyTop = undefined; gyBot = undefined; }
                let ymin, ymax;
                if (isFinite(gyTop) && isFinite(gyBot) && Math.abs(gyTop - gyBot) > 0) {
                    const trackWorldH = Math.abs(gyTop - gyBot);
                    const cyC = (gyTop + gyBot) / 2;
                    let ySpan = trackWorldH * (ch / TARGET_TRACK_PX);
                    if (!(ySpan > 1.0001)) ySpan = 1.0001;   // below 1 animateTo ignores it
                    ymin = cyC - ySpan / 2;
                    ymax = cyC + ySpan / 2;
                } else {
                    const yBand = g.yi + (g.height || 0);
                    ymin = yBand - 0.51; ymax = yBand + 0.51;
                }
                if (isFinite(gx0) && isFinite(gx1) && graph.zoomRect) {
                    await graph.zoomRect(Math.min(gx0, gx1), Math.max(gx0, gx1), ymin, ymax, 340);
                }
            }
        } catch (e) { }
        // Magenta landing burst once the view settles on the mapped compound (visible zoomed out).
        try { if (clone && clone.landingBurst) clone.landingBurst('magenta'); if (graph.wake) graph.wake(); } catch (e) { }
        try { graph.setMouseMode('navigate'); } catch (e) { }
        say(' Mapped ' + (oligo.name || 'compound') + ' onto ' + (track.name || id) + ' (' + bestMm + (bestMm === 1 ? ' mismatch' : ' mismatches') + '). ');
        return graph;
    })();
}
