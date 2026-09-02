function (graph, genegraph_panel_layout) {
    // Predictive-models toolbar (menu bar) docked in the button panel — shown when
    // the user chooses "Predictive models" (mirrors the data-loading / layers
    // toolbars). Two menus: Models and Layers (model-driven track layers).
    //
    // Models opens the ML MODELS LIBRARY rather than listing models itself. It used to name
    // three of them -- Splicing, RNA Binding Proteins, Intron retention -- and run each
    // directly, which made it a second, shorter way in to the same runners: the library has
    // six models, the splicing entry here could not say which of the two splicing models it
    // meant, and neither list knew when the other gained an entry. Same fix, and the same
    // reason, as the RNASeq item in baja/data/data-loading-toolbar.js.
    //
    // Nothing is passed for `tracks`, so the runners keep asking for a click exactly as they
    // did from this toolbar; the library's own subtitle says so.
    const go = (fn) => createIonFunction(async () => {
        try { await fn(); } catch (e) { try { graph.setMessage(' ' + e); } catch (_e) { } }
    });

    // ---- Models: the library ---------------------------------------------------
    const modelItems = [
        {
            'label': 'ML Models Library…', 'ionfunction': go(async () => {
                graph.clearMouseListeners();
                graph.setMouseMode('navigate');
                // Every model, grouped, each with its reference view -- what it predicts, how
                // it was built and what it cannot tell you -- before it runs.
                await exec('baja/ml/models-library.js', graph, genegraph_panel_layout);
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
