function (graph, genegraph_panel_layout, presetTrack) {
    // Filter a track's oligos by off-target count: prompt for a maximum, then
    // automatically remove any oligo whose Levenshtein off-target count exceeds it
    // (no per-oligo confirmation), reporting each as "removed ${id} with OT #".
    // If no track is supplied, the user is prompted to click one.
    return new Promise(async (resolve) => {

        // Off-target count — matches the on-canvas badge: distinct off-target GENES,
        // else offtargetsymbols count, else the raw Levenshtein hit count.
        const otCount = (o) => {
            if (!o) return 0;
            let ot = (o.offtarget != null) ? o.offtarget : o._offtarget;
            if (ot == null) return 0;
            if (Array.isArray(ot)) {
                const genes = new Set(ot.map((h) => h && h.symbol).filter(Boolean)).size;
                if (genes) return genes;
                if (o.offtargetsymbols && o.offtargetsymbols.length) return o.offtargetsymbols.length;
                return ot.length;
            }
            if (typeof ot === 'number') return ot;
            if (typeof ot === 'string') {
                const n = parseInt(ot, 10);
                if (!isNaN(n)) return n;
                return (o.offtargetsymbols && o.offtargetsymbols.length) ? o.offtargetsymbols.length : 0;
            }
            return 0;
        };

        const restoreHover = () => {
            try { graph.clearMouseListeners(); } catch (e) { }
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };

        const applyFilter = async (track) => {
            if (!track) { resolve(); return; }
            const vap = await prompt("Maximum allowable off-targets:", ["Max"], { "Max": 5 }, 520, 300);
            if (!vap) { resolve(); return; }
            const max = parseInt(vap["Max"], 10);
            if (!Number.isInteger(max) || max < 0) {
                infoPrompt("Please enter a non-negative integer.");
                resolve(); return;
            }
            graph.pushOntoHistory();
            const removed = [];
            const kept = [];
            for (const o of (track.oligos || [])) {
                const isAmp = !!(o && (o.type === 'amplicon' || (o.left && o.right)));
                const n = otCount(o);
                // Auto-remove any oligo whose off-target count exceeds the max.
                if (!isAmp && n > max) removed.push({ id: (o.id != null ? o.id : (o.name || '?')), n });
                else kept.push(o);
            }
            track.oligos = kept;
            try { if (graph.wake) graph.wake(); } catch (e) { }
            if (removed.length) {
                const lines = removed.map((r) => 'removed ' + r.id + ' with OT ' + r.n);
                try { lines.forEach((l) => log(l)); } catch (e) { }
                graph.setMessage(' ' + removed.length + ' oligo(s) over ' + max + ' off-targets removed:  ' + lines.join('   |   ') + ' ');
            } else {
                graph.setMessage(' No oligos exceeded ' + max + ' off-targets. ');
            }
            resolve();
        };

        // A track was supplied — filter it directly.
        if (presetTrack && presetTrack.oligos) { await applyFilter(presetTrack); return; }

        // Otherwise, click a track to filter.
        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.setMouseMode('msg: Click on a track to filter its oligos by off-target count.');
        graph.setMessage(' Click on a track to filter its oligos by off-target count. ');
        graph.addMouseDownListener(async (x, y) => {
            const ti = graph.getTrack(x, y);
            if (ti < 0) return;
            const track = graph.track[ti];
            graph.clearMouseListeners();
            graph.setMouseMode('navigate');
            await applyFilter(track);
            restoreHover();
        });
    });
}
