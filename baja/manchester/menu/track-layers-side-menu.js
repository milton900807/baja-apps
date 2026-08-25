function (track, genegraph_panel_layout, graph) {
    // Edit a track's layers via a cascading SIDE MENU (hide / show / remove /
    // interaction / background), instead of opening the full-panel layer editor.
    // Root lists every layer (with a shown/hidden dot) plus bulk "all layers"
    // actions; picking a layer opens its per-layer action submenu.
    return new Promise(async (resolve) => {

        const refreshDraw = () => { try { if (graph.wake) graph.wake(); } catch (e) { } };

        const layerName = (l) => (l && (l.name || l.data_type || l.attribution_type)) || 'layer';

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
            const items = [
                { label: '← Back', move: () => { }, click: () => showRoot() },
                {
                    label: vis ? 'Hide' : 'Show', move: () => { },
                    click: () => { layer.visible = !vis; refreshDraw(); showLayer(layer); }
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
                    label: 'Remove', move: () => { },
                    click: () => {
                        track.track_layers = (track.track_layers || []).filter((l) => l !== layer);
                        refreshDraw(); showRoot();
                    }
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
                }
            ];
            graph.setMessage(' ' + layerName(layer) + (vis ? '  (shown)' : '  (hidden)') + ' ');
            graph.showSideMenu(items);
        };

        // ---- root: list layers + bulk actions ----
        const showRoot = () => {
            const layers = track.track_layers || [];
            const items = [];
            if (!layers.length) {
                items.push({ label: '(no layers on this track)', move: () => { }, click: () => { } });
            }
            for (const layer of layers) {
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

        showRoot();
        resolve();
    });
}
