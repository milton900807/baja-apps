function (graph, genegraph_panel_layout) {
    // Predictive-models toolbar (menu bar) docked in the button panel — shown when
    // the user chooses "Predictive models" (mirrors the data-loading / layers
    // toolbars). Two menus: Models (train / manage) and Layers (model-driven
    // track layers).
    const go = (fn) => createIonFunction(async () => {
        try { await fn(); } catch (e) { try { graph.setMessage(' ' + e); } catch (_e) { } }
    });

    // ---- Models: predictive models --------------------------------------------
    const modelItems = [
        {
            'label': 'Splicing', 'ionfunction': go(async () => {
                // Click a track → local bajasplice-lib splicing profile as layers.
                await exec('baja/bio/splicing/splicing-profile.js', graph, genegraph_panel_layout);
            })
        },
        {
            'label': 'RNA Binding Proteins', 'ionfunction': go(async () => {
                // Click a track → local bajaclip-lib RBP binding profile as a layer.
                await exec('baja/bio/rbp/rbp-profile.js', graph, genegraph_panel_layout);
            })
        }
    ];

    // ---- Layers ---------------------------------------------------------------
    const layerItems = [
        {
            'label': 'Remove all layers', 'ionfunction': go(async () => {
                // Clear every layer from every track.
                let n = 0;
                for (const t of (graph.track || [])) {
                    if (t && Array.isArray(t.track_layers)) { n += t.track_layers.length; t.track_layers = []; }
                }
                if (graph.wake) { try { graph.wake(); } catch (e) { } }
                graph.setMessage(' Removed ' + n + ' layer' + (n === 1 ? '' : 's') + ' from all tracks. ');
            })
        },
        {
            'label': 'Edit layers', 'ionfunction': go(async () => {
                // Prompt to click a track, then open its layer editor.
                graph.clearMouseListeners();
                graph.setMouseMode("msg: Click on a track to view its layer editor.");
                graph.addMouseDownListener(async (x, y) => {
                    const ti = graph.getTrack(x, y);
                    if (ti < 0) return;
                    const track = graph.track[ti];
                    graph.clearMouseListeners();
                    graph.setMouseMode('navigate');
                    try {
                        await exec('baja/manchester/menu/select-track-action-layers-edit-panel.js', track, genegraph_panel_layout, graph);
                    } catch (e) { graph.setMessage(' Could not open the layer editor: ' + e); }
                });
            })
        }
    ];

    let bpanel = {
        wid: 'card',
        data: {
            cards: [
                [
                    {
                        width: '100%',
                        'component': {
                            wid: 'menu',
                            data: {
                                title: '  ',
                                style: 'sub-container',
                                menus: [
                                    { 'label': 'Models', 'items': modelItems },
                                    { 'label': 'Layers', 'items': layerItems }
                                ]
                            }
                        }
                    }
                ]
            ]
        }
    };

    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel');
    CurrentLayout.setComponent('buttonMenuPanel', bpanel);
}
