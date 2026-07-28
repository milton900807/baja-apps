function (graph, genegraph_panel_layout) {

    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    let ed;
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })
    let start = -1;
    let end = -1;
    let ywc = -1;
    let highlight = false;
    let highlight_label = 'Highlight'
    let selectedTrack = null;
    let resizeTrack = false;

    graph.addMouseMoveListener((x, y) => {
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            let selectedTrack = graph.track[trackIndex]
            if (selectedTrack) {
                selectedTrack.select();
            }
        }
    })

    graph.addMouseDownListener((x, y) => {
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
        }
        ywc = y;
        if (highlight && selectedTrack) {
            if (start < 0) {
                let xsc = graph.X(x);
                selectedTrack.tgraph.rescale();
                console.log(xsc + ' xi : ' + selectedTrack.tgraph.xi);
                let t = selectedTrack.tgraph.xi;
                start = selectedTrack.tgraph.Xwc(x - t * 2);
                selectedTrack.markstart = start;
            }
            else if (start > 0 && end < 0) {
                let t = selectedTrack.tgraph.xi;
                end = selectedTrack.tgraph.Xwc(x - t * 2);
                selectedTrack.markend = end;
            }
            highlight_label = 'Clear highlight'

        } else {
            highlight_label = 'Highlight'
        }

        let menuList = [
            {
                label: 'Edit...',
                click: async (xwc, ywc) => {
                    start = -1;
                    end = -1;
                    graph.setMouseMode('navigate')

                    if (selectedTrack) {
                        let track_layers_panel = await exec('baja/screens/menu/select-track-action-layers-edit-panel.js', selectedTrack, genegraph_panel_layout)
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', track_layers_panel);
                    }
                },
                move: () => {
                }
            },

            {
                label: 'Highlight intervals',
                click: async (xwc, ywc) => {
                    start = -1;
                    end = -1;
                    if (selectedTrack) {
                        for (let t of selectedTrack.track_layers) {
                            t.setTimedHighlight(5000)
                        }
                    }
                },
                move: () => {
                }
            },

            {
                label: 'Clear all',
                click: async (xwc, ywc) => {
                    let zoom_to = {
                        wid: 'card',
                        componentRef: 'bottomPanel',
                        data: {
                            height: '800px',
                            cards: [
                                [
                                    {
                                        'title': ' ', 'body': ``
                                        ,
                                        'width': '90%',
                                        'component':
                                        {
                                            wid: 'html',
                                            data: '<font color=red> Are you sure you want to remove all layers from this track? </font>'
                                        }
                                    },
                                    {
                                        'title': '',
                                        'width': '100%',
                                        'component': {
                                            wid: 'mt-button', data: {
                                                buttons: [
                                                    {
                                                        label: 'Yes', ionFunction: createIonFunction(() => {
                                                            let c = 0;
                                                            selectedTrack.track_layers = []
                                                            graph.setMessage(" Layers removed from current tracks.");
                                                            hideAllModal();
                                                        })
                                                    },
                                                    {
                                                        label: 'Cancel', ionFunction: createIonFunction(() => {
                                                            hideAllModal();
                                                        })
                                                    }
                                                ]
                                            }
                                        }
                                    }
                                ]]
                        }
                    }
                    showModal(zoom_to)
                },
                move: () => {
                    log('')
                }
            },

            {
                label: 'Show/Hide Data layers',
                click: (xwc, ywc) => {
                    if (selectedTrack) {
                        let tr = selectedTrack;
                        tr.showLayers = !tr.showLayers;
                    }
                },
                move: () => {
                }
            }

        ]
        graph.showMenu(menuList, x, y, 200)

    })
}
