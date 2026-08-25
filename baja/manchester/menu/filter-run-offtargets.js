function (graph, genegraph_panel_layout, presetTrack) {
    // Run the off-target search on a track's oligos, then filter/remove in REAL TIME:
    // the user picks a genome + edit distance (via run-off-targets), and as each
    // chunk of results returns, any oligo whose off-target count exceeds the chosen
    // maximum is removed on the spot (no per-oligo confirmation), reported as
    // "removed ${id} with OT #". If no track is supplied, the user clicks one.
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

        const runFor = async (track) => {
            if (!track || !track.oligos) { resolve(); return; }
            const vap = await prompt("Maximum allowable off-targets:", ["Max"], { "Max": 5 }, 520, 300);
            if (!vap) { resolve(); return; }
            const max = parseInt(vap["Max"], 10);
            if (!Number.isInteger(max) || max < 0) { infoPrompt("Please enter a non-negative integer."); resolve(); return; }

            // One undo point for the whole live-filter run.
            graph.pushOntoHistory();
            const removed = new Set();

            // Remove any oligo now over the max. Runs after each chunk of results.
            const liveFilter = () => {
                const toRemove = [];
                for (const o of (track.oligos || [])) {
                    if (removed.has(o)) continue;
                    const isAmp = !!(o && (o.type === 'amplicon' || (o.left && o.right)));
                    if (isAmp) continue;
                    const n = otCount(o);
                    if (n > max) toRemove.push({ o, n });
                }
                if (!toRemove.length) return;
                const rmSet = new Set(toRemove.map((x) => x.o));
                track.oligos = (track.oligos || []).filter((o) => !rmSet.has(o));
                toRemove.forEach((x) => {
                    removed.add(x.o);
                    try { log('removed ' + (x.o.id != null ? x.o.id : (x.o.name || '?')) + ' with OT ' + x.n); } catch (e) { }
                });
                try { if (graph.wake) graph.wake(); } catch (e) { }
                graph.setMessage(' Removed ' + removed.size + ' oligo(s) over ' + max + ' off-targets (live)… ');
            };

            const onDone = () => {
                graph.setMessage(' Off-target filter complete — removed ' + removed.size + ' oligo(s) over ' + max + ' off-targets. ');
            };

            // run-off-targets shows the species -> genome -> edit distance side menu,
            // then runs the Levenshtein search; liveFilter prunes as chunks return.
            await exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout, track.oligos, { liveFilter, onDone });
            resolve();
        };

        // A track was supplied — run on it directly.
        if (presetTrack && presetTrack.oligos) { await runFor(presetTrack); return; }

        // Otherwise, click a track.
        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.setMouseMode('msg: Click on a track to run off-targets and filter live.');
        graph.setMessage(' Click on a track to run off-targets and filter live. ');
        graph.addMouseDownListener(async (x, y) => {
            const ti = graph.getTrack(x, y);
            if (ti < 0) return;
            const track = graph.track[ti];
            graph.clearMouseListeners();
            graph.setMouseMode('navigate');
            await runFor(track);
        });
    });
}
