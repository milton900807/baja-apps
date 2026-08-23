function (graph, genegraph_panel_layout) {
    // Track-tools toolbar (menu bar) docked in the button panel — shown when the
    // user chooses "Track" (mirrors the data-loading / layers / design toolbars).
    // Groups every track editing tool, including loading new tracks.
    const server = window['env']['apiUrl'];
    const go = (fn) => createIonFunction(async () => {
        try { await fn(); } catch (e) { try { graph.setMessage(' ' + e); } catch (_e) { } }
    });

    // ---- New: create / load tracks -------------------------------------------
    const newItems = [
        {
            'label': 'New RNA track…', 'ionfunction': go(async () => {
                await exec('baja/data/prompt-load-transcript.js', server, graph, genegraph_panel_layout);
            })
        },
        {
            'label': 'New sequence track', 'ionfunction': go(async () => {
                await exec('baja/manchester/new-track.js', graph, genegraph_panel_layout);
            })
        },
        {
            'label': 'Insert by ENSEMBL ID', 'ionfunction': go(async () => {
                await exec('baja/manchester/menu/insert-track.js', graph);
            })
        },
        {
            'label': 'Paste sequence…', 'ionfunction': go(async () => {
                await exec('manchester/controls/paste-panel.js', graph, genegraph_panel_layout);
            })
        },
        {
            'label': 'Load data…', 'ionfunction': go(async () => {
                await exec('baja/data/data-loading-toolbar.js', graph, genegraph_panel_layout);
            })
        }
    ];

    // ---- Edit: modify the clicked track --------------------------------------
    const editItems = [
        {
            'label': 'Edit track', 'ionfunction': go(async () => {
                graph.setMessage('Click on a track to see available edit options. ');
                await exec('baja/manchester/menu/edit-track.js', graph, genegraph_panel_layout);
            })
        },
        {
            'label': 'Select sequence', 'ionfunction': go(async () => {
                // Enter drag-to-select mode: drag on a track to highlight a region
                // (no chemistry required). Mouse-up offers the design options.
                graph.clearMouseListeners();
                await exec('baja/manchester/menu/sequence.js', graph, genegraph_panel_layout, true);
            })
        },
        {
            'label': 'Edit sequence', 'ionfunction': go(async () => {
                await exec('baja/manchester/menu/edit-track-sequence.js', graph);
            })
        },
        {
            'label': 'Translate', 'ionfunction': go(async () => {
                await exec('baja/manchester/menu/translate-track.js', graph);
            })
        },
        {
            'label': 'Resize height', 'ionfunction': go(async () => {
                await exec('baja/manchester/menu/resize-track-height.js', graph);
            })
        }
    ];

    // ---- View: navigate / measure / inspect ----------------------------------
    const viewItems = [
        {
            'label': 'Navigate to…', 'ionfunction': go(async () => {
                await exec('baja/manchester/menu/navigate-track.js', graph);
            })
        },
        {
            'label': 'Measure bases', 'ionfunction': go(async () => {
                await exec('baja/manchester/menu/measure-track.js', graph, genegraph_panel_layout);
            })
        },
        {
            'label': 'Stats', 'ionfunction': go(async () => {
                graph.setMessage('Click on a track to see its stats. ');
                await exec('baja/manchester/menu/track-stats.js', graph);
            })
        },
        {
            'label': 'Show annotations', 'ionfunction': go(async () => {
                await exec('baja/manchester/menu/annotation/show-annotations-menu.js', graph);
            })
        }
    ];

    // ---- Export --------------------------------------------------------------
    const exportItems = [
        {
            'label': 'Export track', 'ionfunction': go(async () => {
                await exec('baja/manchester/menu/export-track.js', graph);
            })
        },
        {
            'label': 'Export details', 'ionfunction': go(async () => {
                await exec('baja/manchester/menu/export-track-details.js', graph);
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
                                    { 'label': 'New', 'items': newItems },
                                    { 'label': 'Edit', 'items': editItems },
                                    { 'label': 'View', 'items': viewItems },
                                    { 'label': 'Export', 'items': exportItems }
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
