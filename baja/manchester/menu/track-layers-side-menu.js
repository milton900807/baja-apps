function (track, genegraph_panel_layout, graph, focusLayer) {
    // Edit a track's layers via a cascading SIDE MENU (hide / show / order / rename /
    // interaction / background / delete), instead of opening the full-panel layer editor.
    // Root lists every layer (with a shown/hidden dot) plus bulk "all layers"
    // actions; picking a layer opens its per-layer action submenu.
    //
    // ORDER. track.track_layers is drawn in array order, so the LAST one is on top. The list
    // here, and the rows under the track name (baja/bio/track.js), show the FRONT layer first,
    // as a layers panel does -- so "Bring to front" moves a layer to the top of the list and
    // "Send to back" to the bottom, and what the list says is what the screen shows.
    //
    // focusLayer (optional) opens that layer's submenu straight away, for callers that
    // already know which layer was picked — clicking its row under the track name means
    // the root list would ask again for a choice the user has just made.
    return new Promise(async (resolve) => {

        const refreshDraw = () => { try { if (graph.wake) graph.wake(); } catch (e) { } };

        const layerName = (l) => (l && (l.name || l.data_type || l.attribution_type)) || 'layer';

        const layerList = () => (track.track_layers = track.track_layers || []);
        // Snapshot for Undo before anything that changes the layers.
        const pushHistory = () => { try { if (graph.pushOntoHistory) graph.pushOntoHistory(); } catch (e) { } };
        // Move a layer within the draw order (in place: other code may hold the array).
        // how: 'front' | 'back' | 'forward' (one step toward the front) | 'backward'.
        const moveLayer = (layer, how) => {
            const a = layerList();
            const i = a.indexOf(layer);
            if (i < 0) return false;
            let j = i;
            if (how === 'front') j = a.length - 1;
            else if (how === 'back') j = 0;
            else if (how === 'forward') j = Math.min(a.length - 1, i + 1);
            else if (how === 'backward') j = Math.max(0, i - 1);
            if (j === i) return false;
            pushHistory();
            a.splice(i, 1);
            a.splice(j, 0, layer);
            return true;
        };

        // Close the side menu and hand the mouse back to the hover highlight.
        const restoreHover = () => {
            try { graph.showSideMenu(null); } catch (e) { }
            try { graph.clearMouseListeners(); } catch (e) { }
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        };

        // ---- per-layer action submenu ----
        const showLayer = (layer) => {
            const vis = layer.visible !== false;
            const all = layerList();
            const z = all.indexOf(layer);
            const isFront = z === all.length - 1, isBack = z === 0;
            const reorder = (how) => () => { if (moveLayer(layer, how)) refreshDraw(); showLayer(layer); };
            const items = [
                { label: '← Back', move: () => { }, click: () => showRoot() },
                {
                    label: vis ? 'Hide' : 'Show', move: () => { },
                    click: () => { pushHistory(); layer.visible = !vis; refreshDraw(); showLayer(layer); }
                }
            ];
            // Only the moves that would change something are offered.
            if (all.length > 1) {
                items.push({ label: '— order —', move: () => { }, click: () => { } });
                if (!isFront) items.push({ label: 'Bring to front', move: () => { }, click: reorder('front') });
                if (!isFront) items.push({ label: 'Bring forward', move: () => { }, click: reorder('forward') });
                if (!isBack) items.push({ label: 'Send backward', move: () => { }, click: reorder('backward') });
                if (!isBack) items.push({ label: 'Send to back', move: () => { }, click: reorder('back') });
                items.push({ label: '— layer —', move: () => { }, click: () => { } });
            }
            items.push(
                {
                    label: 'Rename…', move: () => { },
                    click: async () => {
                        let va = null;
                        try { va = await prompt('Rename layer', ['Name'], { 'Name': layerName(layer) }, 380, 200); } catch (e) { va = null; }
                        const nm = va ? ('' + (va['Name'] || '')).trim() : '';
                        if (nm && nm !== layer.name) { pushHistory(); layer.name = nm; refreshDraw(); }
                        showLayer(layer);
                    }
                },
                {
                    label: layer.show_background ? 'Hide background' : 'Show background', move: () => { },
                    click: () => { layer.show_background = !layer.show_background; refreshDraw(); showLayer(layer); }
                },
                {
                    label: layer.interactive === false ? 'Interaction on' : 'Interaction off', move: () => { },
                    click: () => { layer.interactive = layer.interactive === false; refreshDraw(); showLayer(layer); }
                },
                {
                    label: 'Edit…', move: () => { },
                    click: async () => {
                        graph.showSideMenu(null);
                        try {
                            const tl = await exec('baja/manchester/menu/select-track-layer-edit-panel', track, layer, genegraph_panel_layout);
                            CurrentLayout.clearComponent('mainPanel');
                            CurrentLayout.setComponent('mainPanel', tl);
                        } catch (e) { graph.setMessage(' Could not open the layer editor: ' + e); }
                    }
                },
                {
                    // Asks first: a layer can hold a computed curve or a whole paste's worth of
                    // notes. confirm.js snapshots for Undo before it runs the action.
                    label: 'Delete layer…', move: () => { },
                    click: async () => {
                        try {
                            await exec('baja/lib/confirm.js',
                                'Delete the layer "' + layerName(layer) + '" from ' + (track.name || 'this track') + '?',
                                () => {
                                    const a = layerList();
                                    const i = a.indexOf(layer);
                                    if (i >= 0) a.splice(i, 1);
                                    refreshDraw();
                                    if (a.length) showRoot(); else restoreHover();
                                }, 'Delete');
                        } catch (e) { graph.setMessage(' Could not delete the layer: ' + e); }
                    }
                }
            );
            graph.setMessage(' ' + layerName(layer) + (vis ? '  (shown)' : '  (hidden)')
                + (all.length > 1 ? '  ·  ' + (isFront ? 'front' : isBack ? 'back' : 'layer ' + (all.length - z) + ' of ' + all.length + ' from the front') : '') + ' ');
            graph.showSideMenu(items);
        };

        // ---- root: list layers + bulk actions ----
        const showRoot = () => {
            const layers = track.track_layers || [];
            const items = [];
            if (!layers.length) {
                items.push({ label: '(no layers on this track)', move: () => { }, click: () => { } });
            }
            for (const layer of layers.slice().reverse()) {   // front layer first, like the rows under the track name
                const vis = layer.visible !== false;
                items.push({
                    label: (vis ? '● ' : '○ ') + layerName(layer) + ' ▸',
                    move: () => { },
                    click: () => showLayer(layer)
                });
            }
            if (layers.length) {
                items.push({ label: '— all layers —', move: () => { }, click: () => { } });
                items.push({ label: 'Show all', move: () => { }, click: () => { layers.forEach((l) => { l.visible = true; }); refreshDraw(); showRoot(); } });
                items.push({ label: 'Hide all', move: () => { }, click: () => { layers.forEach((l) => { l.visible = false; }); refreshDraw(); showRoot(); } });
                items.push({ label: 'Interaction on (all)', move: () => { }, click: () => { layers.forEach((l) => { l.interactive = true; }); refreshDraw(); showRoot(); } });
                items.push({ label: 'Interaction off (all)', move: () => { }, click: () => { layers.forEach((l) => { l.interactive = false; }); refreshDraw(); showRoot(); } });
                items.push({ label: 'Remove all layers', move: () => { }, click: () => { track.track_layers = []; refreshDraw(); showRoot(); } });
            }
            items.push({ label: 'Close', move: () => { }, click: () => restoreHover() });
            graph.setMessage(' Track layers — ' + (track.name || 'track') + ' ');
            graph.showSideMenu(items);
        };

        if (focusLayer && ((track.track_layers || []).indexOf(focusLayer) >= 0)) showLayer(focusLayer);
        else showRoot();
        resolve();
    });
}
