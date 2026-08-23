function (graph, genegraph_panel_layout) {
    // Data toolbar (menu bar) docked in the button panel — shown from the Layers
    // center menu's "Data" item. Menus: RNASeq | IP | Edit Layer.
    const server = window['env']['apiUrl'];
    const go = (fn) => createIonFunction(async () => {
        try { await fn(); } catch (e) { try { graph.setMessage(' ' + e); } catch (_e) { } }
    });

    // ---- RNASeq --------------------------------------------------------------
    const rnaseqItems = [
        {
            'label': 'Load RNASeq', 'ionfunction': go(async () => {
                graph.clearMouseListeners();
                graph.setMouseMode('navigate');
                // Arm the RNASeq (GEO / expression) public-data resource directly.
                await exec('baja/data/public-data.js', graph, genegraph_panel_layout, 'RNASeq (GEO / expression)');
            })
        }
    ];

    // ---- IP (immunoprecipitation sequence hits) ------------------------------
    const ipItems = [
        {
            'label': 'Load IP', 'ionfunction': go(async () => {
                graph.clearMouseListeners();
                graph.setMouseMode('navigate');
                // Click a track → IP hits from the BIG_DATA BED as an interval layer.
                await exec('baja/data/ip.js', graph, genegraph_panel_layout);
            })
        }
    ];

    // ---- Edit Layer ----------------------------------------------------------
    const editItems = [
        {
            'label': 'Edit layers', 'ionfunction': go(async () => {
                // Prompt to click a track, then open its layer editor.
                graph.clearMouseListeners();
                graph.setMouseMode('msg: Click on a track to edit its layers.');
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
                                    { 'label': 'RNASeq', 'items': rnaseqItems },
                                    { 'label': 'IP', 'items': ipItems },
                                    { 'label': 'Edit Layer', 'items': editItems }
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
