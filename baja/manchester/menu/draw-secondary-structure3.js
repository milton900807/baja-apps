function (graph, genegraph_panel_layout) {
    let start;
    let end;
    hide_menu = false;
    let selectedTrack = null;
    let md = false;
    graph.clearMouseListeners();
    graph.setMessage(" Click and drag on a sequence run a secondary structure. ")

    graph.addMouseDownListener(async (x, y) => {
        md = true;
        let trackIndex = graph.getTrack(x, y)
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
            if (selectedTrack) {
                x = x - selectedTrack.tgraph.xi * 2;
                start = Math.round(selectedTrack.tgraph.Xwc(x));
                end = Math.round(selectedTrack.tgraph.Xwc(x));
                selectedTrack.highlight(start, end)
                selectedTrack.select();
            } else {
                graph.hideMenu();
                start = -1;
                end = 0;
            }
        }
    })
    graph.addMouseMoveListener((x, y) => {

        if (graph.menuVisible()) {
            return;
        }
        if (!md) {
            graph.hideMenu();
            return;
        }

        if (selectedTrack) {
            x = x - selectedTrack.tgraph.xi * 2;
            end = Math.round(selectedTrack.tgraph.Xwc(x));
            selectedTrack.highlight(start, end);
        }

    })
    graph.addMouseUpListener((x, y) => {
        md = true;
        if (selectedTrack != null) {
            let sequence = selectedTrack.getHighlightedSequence();

            if (sequence && sequence.length > 1) {
                graph.setMessage("Now go to [New] -> [Structure from selected range]")
            }

        }
        md = false;
        start = -1;
        end = -1;
    });

    let panel = null;
    let __nameHook = createIonFunction((name) => {
        panel = name;
    })
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
                                    {
                                        'label': 'New...', 'items': [
                                            {
                                                'label': 'Structure from track', 'ionfunction': createIonFunction(async () => {
                                                    graph.setMessage(" Click on a track. ")
                                                    graph.addMouseDownListener(async (x, y) => {
                                                        md = true;
                                                        let trackIndex = graph.getTrack(x, y)
                                                        if (trackIndex >= 0) {
                                                            let selectedTrack = graph.track[trackIndex]
                                                            if (selectedTrack) {
                                                                let engineMonitor = new EngineMonitor((msg) => {
                                                                })
                                                                let t = await selectedTrack.createSecondaryStructure(selectedTrack.tgraph.xi, selectedTrack.sequence, selectedTrack.name, engineMonitor)
                                                                t.anchorX = selectedTrack.tgraph.xmin;
                                                                t.xindex_start = selectedTrack.tgraph.xmin;
                                                                t.tgraph.yi = selectedTrack.tgraph.yi
                                                                t.anchorY = selectedTrack.tgraph.yi;

                                                                graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                                                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                                CurrentLayout.setComponent('buttonMenuPanel', {
                                                                    wid: 'html',
                                                                    data: ' Generating secondary structure.... '
                                                                });

                                                                setTimeout(async () => {
                                                                    exec('baja/manchester/menu/draw-secondary-structure3.js', graph, genegraph_panel_layout);

                                                                }, 1000)

                                                            }
                                                        }
                                                    });

                                                })
                                            },
                                            {
                                                'label': 'Structure from selected sequence ', 'ionfunction': createIonFunction(async () => {

                                                    if (selectedTrack == null) {
                                                        for (let t of graph.track) {
                                                            if (t.markstart > 0 && t.markend > t.markstart) {
                                                                selectedTrack = t;
                                                                selectedTrack.select();
                                                                break;
                                                            }
                                                        }
                                                    }

                                                    if (selectedTrack != null) {
                                                        let sequence = selectedTrack.getHighlightedSequence();
                                                        if (sequence.length > 7000) {
                                                            graph.setMessage(" Sequence is too long for the prediction tool ")
                                                            return;
                                                        }

                                                        let lb = null;
                                                        let engineMonitor = new EngineMonitor((msg) => {
                                                            lb.setHTML(msg)
                                                        });
                                                        CurrentLayout.setComponent('buttonMenuPanel', {
                                                            wid: 'html',
                                                            refCallback: createIon((p) => {
                                                                lb = p
                                                            }),
                                                            data: '<font color="blue"> Generating secondary structure.... </font>'
                                                        });

                                                        let t = await selectedTrack.createSecondaryStructure(selectedTrack.markstart, selectedTrack.getHighlightedSequence(), selectedTrack.name, engineMonitor)
                                                        t.anchorX = selectedTrack.markstart;
                                                        t.xindex_start = selectedTrack.markstart;
                                                        t.tgraph.yi = selectedTrack.tgraph.yi
                                                        t.anchorY = selectedTrack.tgraph.yi;

                                                        setTimeout(async () => {
                                                        }, 10000)
                                                    } else {

                                                        infoPrompt(" You need to highlight a sequence on a track first.")

                                                    }
                                                })
                                            },
                                        ]
                                    },
                                    {
                                        'label': 'Highlight', 'items': [
                                            {
                                                'label': 'Track & Sequence... ', 'ionfunction': createIonFunction(async () => {
                                                    graph.clearMouseListeners();
                                                    graph.setMessage(" Click and drag a start and stop position on a track to run a secondary structure. ")
                                                    graph.selectOff();
                                                    graph.addMouseDownListener(async (x, y) => {
                                                        md = true;
                                                        let trackIndex = graph.getTrack(x, y)
                                                        if (trackIndex >= 0) {
                                                            selectedTrack = graph.track[trackIndex]
                                                            if (selectedTrack) {
                                                                x = x - selectedTrack.tgraph.xi * 2;
                                                                start = Math.round(selectedTrack.tgraph.Xwc(x));
                                                                end = Math.round(selectedTrack.tgraph.Xwc(x));
                                                                selectedTrack.highlight(start, end)
                                                                selectedTrack.select();
                                                            } else {
                                                                graph.hideMenu();
                                                                start = -1;
                                                                end = 0;
                                                            }
                                                        }
                                                    })
                                                    graph.addMouseMoveListener((x, y) => {

                                                        if (graph.menuVisible()) {
                                                            return;
                                                        }
                                                        if (!md) {
                                                            graph.hideMenu();
                                                            return;
                                                        }

                                                        if (selectedTrack) {
                                                            x = x - selectedTrack.tgraph.xi * 2;
                                                            end = Math.round(selectedTrack.tgraph.Xwc(x));
                                                            selectedTrack.highlight(start, end);
                                                        }

                                                    })
                                                    graph.addMouseUpListener((x, y) => {
                                                        md = true;
                                                        if (selectedTrack != null) {
                                                            let sequence = selectedTrack.getHighlightedSequence();

                                                            if (sequence && sequence.length > 1) {
                                                                graph.setMessage(" To create structure:  New -> Structure from selected range")
                                                            }

                                                        }
                                                        md = false;
                                                        start = -1;
                                                        end = -1;
                                                    });

                                                })
                                            },
                                        ]
                                    },
                                    {
                                        'label': 'Edit', 'items': [
                                            {
                                                'label': 'Move', 'ionfunction': createIonFunction(async () => {
                                                    graph.clearMouseListeners();
                                                    let found = false;
                                                    for (let track of graph.track) {
                                                        if (track.structures != null && track.structures.length > 0) {
                                                            found = true;
                                                        }
                                                    }
                                                    if (!found) {
                                                        infoPrompt(" You first need to create a structure.  ")
                                                        return;
                                                    }

                                                    await exec('baja/manchester/menu/edit-secondary-structure-move.js', graph, genegraph_panel_layout);

                                                })
                                            },
                                            {
                                                'label': 'Resize', 'ionfunction': createIonFunction(async () => {
                                                    graph.clearMouseListeners();
                                                    let found = false;
                                                    for (let track of graph.track) {
                                                        if (track.structures != null && track.structures.length > 0) {
                                                            found = true;
                                                        }
                                                    }
                                                    if (!found) {
                                                        infoPrompt(" You first need to create a structure.  ")
                                                        return;
                                                    }

                                                    await exec('baja/manchester/menu/edit-secondary-structure-resize.js', graph, genegraph_panel_layout);

                                                })
                                            },
                                            {
                                                'label': 'Delete', 'ionfunction': createIonFunction(() => {
                                                    graph.clearMouseListeners();
                                                    let found = false;
                                                    for (let track of graph.track) {
                                                        if (track.structures != null && track.structures.length > 0) {
                                                            found = true;
                                                        }
                                                    }
                                                    if (!found) {
                                                        infoPrompt(" You first need to create a structure.  ")
                                                        return;
                                                    }

                                                    graph.clearMouseListeners();
                                                    graph.setMessage(" click the structure you want to remove ")
                                                    graph.selectOff();

                                                    graph.addMouseDownListener(async (x, y) => {
                                                        for (let track of graph.track) {
                                                            let stru = track.getStructure(x, y)
                                                            if (stru && stru.length > 0) {
                                                                let selectedStructure = stru[0];
                                                                let confirm = await exec('baja/lib/confirm-widget.js', () => {
                                                                    const index = track.structures.indexOf(selectedStructure, 0);
                                                                    if (index > -1) {
                                                                        track.structures.splice(index, 1);
                                                                    }
                                                                })
                                                                showModal(confirm)
                                                            }
                                                        }
                                                    });
                                                    graph.addMouseMoveListener((x, y) => {
                                                    });
                                                    graph.addMouseDownListener(async (x, y) => {
                                                    })
                                                })
                                            },
                                        ]
                                    }
                                ]
                            }
                        }
                    },

                ]
            ]
        }
    }
    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
    CurrentLayout.setComponent('buttonMenuPanel', bpanel);

}
