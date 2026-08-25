function (graph, genegraph_panel_layout, track, range) {
    // Standard SNP/indel removal menu, reused wherever a "remove snps / indels" item lives:
    //   • Remove all        — everything (on the track / in the selection / across tracks)
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

    graph.showMenu([
        {
            label: 'Remove all ' + scopeLabel + '  (' + countIn() + ')', move: () => { }, click: () => {
                confirmThen('Remove all ' + countIn() + ' SNPs/indels ' + scopeLabel + '? This cannot be undone.', removeAll);
            }
        },
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
}
