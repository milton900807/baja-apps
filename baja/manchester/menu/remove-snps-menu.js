function (graph, genegraph_panel_layout, track, range) {
    // Standard SNP/indel removal menu, reused wherever a "remove snps / indels" item lives:
    //   • Remove all        — everything (on the track / in the selection / across tracks)
    //   • Remove by phase ▸ — every SNP/indel of one phase (0, 1, …); shown when SNPs carry a phase
    //   • Remove by filter… — the attribute filter menu, whose "Remove shown / hidden"
    //                         actions delete by attribute (type, clinical significance, …)
    // Removing from a parent cascades to child tracks. Destructive actions are confirmed.
    const scopeLabel = range ? 'in selection' : (track ? 'on this track' : 'on all tracks');

    const confirmThen = async (message, fn) => {
        try { const c = await exec('baja/lib/confirm.js', message, () => { fn(); }); showModal(c); }
        catch (e) { fn(); }
    };

    const inRange = (s) => !range || (s && s.xi >= range.lo && s.xi <= range.hi);

    const countIn = () => {
        if (track) return (track.snpindels || []).filter(inRange).length;
        return (graph.track || []).reduce((n, t) => n + (((t.snpindels && t.snpindels.length)) || 0), 0);
    };

    const removeAll = () => {
        let removed = 0;
        if (track) {
            const arr = track.snpindels || [];
            if (range) {
                const before = arr.length;
                track.snpindels = arr.filter((s) => !inRange(s));
                removed = before - track.snpindels.length;
            } else {
                removed = arr.length;
                track.snpindels = [];
            }
            try { if (track.clearDescendantSnps) removed += track.clearDescendantSnps(graph); } catch (e) { }
        } else {
            for (const t of (graph.track || [])) {
                if (t && Array.isArray(t.snpindels) && t.snpindels.length) { removed += t.snpindels.length; t.snpindels = []; }
            }
        }
        if (graph.wake) graph.wake();
        graph.setMessage(' Removed ' + removed + ' SNP/indel' + (removed === 1 ? '' : 's') + ' ' + scopeLabel + '. ');
    };

    // REMOVE BY PHASE: every SNP/indel whose `phase` equals the chosen value (0, 1, 2, …),
    // within the same scope as "Remove all" (the selection, the track, or every track).
    const targets = () => track ? [track] : (graph.track || []).filter((t) => t && Array.isArray(t.snpindels));
    const phaseOf = (s) => (s && s.phase != null && s.phase !== '') ? ('' + s.phase) : null;
    const phaseTally = () => {
        const m = {};
        for (const t of targets()) for (const s of (t.snpindels || [])) {
            if (!inRange(s)) continue;
            const p = phaseOf(s);
            if (p != null) m[p] = (m[p] || 0) + 1;
        }
        return m;
    };
    const removePhase = (p) => {
        try { graph.pushOntoHistory(); } catch (e) { }
        let removed = 0, childRm = 0;
        for (const t of targets()) {
            const arr = t.snpindels || [];
            const before = arr.length;
            t.snpindels = arr.filter((s) => !(inRange(s) && phaseOf(s) === p));
            const rm = before - t.snpindels.length;
            removed += rm;
            if (rm) { try { if (t.clearDescendantSnps) childRm += t.clearDescendantSnps(graph); } catch (e) { } }
        }
        if (graph.wake) graph.wake();
        graph.setMessage(' Removed ' + removed + ' phase ' + p + ' SNP/indel' + (removed === 1 ? '' : 's') + ' ' + scopeLabel
            + (childRm ? ' (+' + childRm + ' from child tracks)' : '') + '. ');
    };
    const phaseMenu = () => {
        const T = phaseTally();
        const keys = Object.keys(T).sort((a, b) => (isFinite(a) && isFinite(b)) ? (+a - +b) : a.localeCompare(b));
        const items = [{ label: '‹ back', move: () => { }, click: () => mainMenu() }];
        keys.forEach((p) => items.push({
            label: 'Phase ' + p + '  (' + T[p] + ')', move: () => { }, click: () => {
                if (graph.hideMenu) graph.hideMenu();
                confirmThen('Remove all ' + T[p] + ' phase ' + p + ' SNP' + (T[p] === 1 ? '' : 's') + '/indels ' + scopeLabel + '?', () => removePhase(p));
            }
        }));
        graph.showMenu(items);
    };

    // REMOVE THE TOP OR BOTTOM SIDE: the lollipops standing up from the track line (phase 1)
    // or hanging down below it (phase 0, phase 3, or no phase), exactly as getPhaseDirs in
    // track.js draws them. Phase 2 draws no stem and is on neither side. Same rule as the
    // `side` field in variant-search.js.
    const sideOf = (s) => {
        const p = (s && Number.isFinite(+s.phase)) ? +s.phase : 0;
        return p === 1 ? 'top' : (p === 2 ? 'none' : 'bottom');
    };
    const sideCount = (side) => {
        let n = 0;
        for (const t of targets()) for (const s of (t.snpindels || [])) if (inRange(s) && sideOf(s) === side) n++;
        return n;
    };
    const removeSide = (side) => {
        try { graph.pushOntoHistory(); } catch (e) { }
        let removed = 0, childRm = 0;
        for (const t of targets()) {
            const arr = t.snpindels || [];
            const before = arr.length;
            t.snpindels = arr.filter((s) => !(inRange(s) && sideOf(s) === side));
            const rm = before - t.snpindels.length;
            removed += rm;
            if (rm) { try { if (t.clearDescendantSnps) childRm += t.clearDescendantSnps(graph); } catch (e) { } }
        }
        if (graph.wake) graph.wake();
        graph.setMessage(' Removed ' + removed + ' ' + side + '-side SNP/indel' + (removed === 1 ? '' : 's') + ' ' + scopeLabel
            + (childRm ? ' (+' + childRm + ' from child tracks)' : '') + '. ');
    };
    const sideItem = (side, words) => {
        const n = sideCount(side);
        return n ? [{
            label: 'Remove ' + side + ' lollipops (' + words + ')  (' + n + ')', move: () => { }, click: () => {
                if (graph.hideMenu) graph.hideMenu();
                confirmThen('Remove all ' + n + ' ' + side + '-side SNPs/indels ' + scopeLabel + ' (' + words + ')?', () => removeSide(side));
            }
        }] : [];
    };

    const mainMenu = () => {
    const nPhases = Object.keys(phaseTally()).length;
    graph.showMenu([
        {
            label: 'Remove all ' + scopeLabel + '  (' + countIn() + ')', move: () => { }, click: () => {
                confirmThen('Remove all ' + countIn() + ' SNPs/indels ' + scopeLabel + '? This cannot be undone.', removeAll);
            }
        },
        ...sideItem('top', 'stick up from the track'),
        ...sideItem('bottom', 'line down below the track'),
        ...(nPhases ? [{ label: 'Remove by phase ▸  (' + nPhases + ')', move: () => { }, click: () => phaseMenu() }] : []),
        {
            label: 'Remove by filter (attributes)…', move: () => { }, click: () => {
                if (graph.hideMenu) graph.hideMenu();
                let t = track;
                if (!t) { try { t = (graph.track || []).find((x) => x && x.markstart >= 0 && x.markend > x.markstart); } catch (e) { } }
                if (!t) { graph.setMessage(' Select a track to filter its SNPs. '); return; }
                // Attribute filter menu — use its "Remove shown (matching filter)" to delete
                // exactly the SNPs matching an attribute (e.g. clinsig = likely pathogenic).
                exec('baja/manchester/menu/edit-snps-filter-menu.js', graph, genegraph_panel_layout, t, range);
            }
        }
    ]);
    };
    mainMenu();
}
