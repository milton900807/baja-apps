function (graph, genegraph_panel_layout) {

    let tools_menu = []
    tools_menu = [
        {
            'label': 'Assay design:  Design primers etc.', click: (async () => {
                CurrentLayout.clearComponent('buttonMenuPanel,labelPanel')
                setTimeout(async () => { await exec('baja/manchester/menu/assay-tools.js', graph, genegraph_panel_layout) }, 1000)

            })
        },
        {
            'label': 'Splicing models', click: (async () => {
                CurrentLayout.clearComponent('buttonMenuPanel,labelPanel')
                setTimeout(async () => {
                    let hl = await exec('baja/manchester/menu/splicing/splicing-tools2.js', graph, genegraph_panel_layout)
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    CurrentLayout.setComponent('buttonMenuPanel', hl);
                }, 1000)

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        }
        ,
        {
            'label': 'Create/Edit Secondary Structure', click: (async () => {
                setTimeout(async () => {
                    exec('baja/manchester/menu/draw-secondary-structure3.js', graph, genegraph_panel_layout);
                }, 1000)
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },
        {
            'label': 'Edit Annotations', click: (async () => {
                setTimeout(async () => {
                    let select_panel = await exec('baja/manchester/menu/annotation/annotation-tools2.js', graph, genegraph_panel_layout)
                }, 2000)
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
            })
        },
        {
            'label': 'Edit Layers', click: (async () => {
                setTimeout(async () => {
                    let select_panel = await exec('baja/manchester/menu/annotation/annotation-tools2.js', graph, genegraph_panel_layout)
                }, 2000)
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
            })
        },
        {
            'label': 'Edit sequence', click: (async () => {
                setTimeout(async () => {

                    graph.setMessage(" Select a sequence on a track.")
                    await exec('baja/manchester/menu/sequence.js', graph, genegraph_panel_layout, true)

                    graph.setMouseMode('none')
                    for (let selectedTrack of graph.track) {
                        if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) {
                            exec('baja/manchester/menu/edit-track-sequence-panel.js', selectedTrack, graph, genegraph_panel_layout)

                        }
                    }

                }, 2000)
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },

        {
            'label': 'Compare sequences, tracks annotations etc...', click: (async () => {

                let hl = await exec('baja/manchester/menu/comparative-tools.js', graph, genegraph_panel_layout)
                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                CurrentLayout.setComponent('buttonMenuPanel', hl);
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },
        {
            'label': 'Select track sequence', click: (async () => {

                graph.hideMenu();
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                graph.runfun(async (graph) => {

                    infoPrompt(" Click on the track to highlight the entire sequence ");
                    graph.clearMouseListeners();
                    graph.deselectAllTracks()

                    graph.addMouseDownListener(async (x, y) => {
                        let trackIndex = graph.getTrack(x, y)
                        if (trackIndex >= 0) {
                            let ttrack = graph.track[trackIndex]
                            if (ttrack) {
                                let track = ttrack;
                                track.select();
                                track.markstart = track.tgraph.xmin;
                                track.markend = track.tgraph.xmax;
                            }
                        }
                    });
                })
            })
        },

        {
            'label': 'Variants', click: (async () => {
                await exec('baja/manchester/menu/variant-tools1.js', graph, genegraph_panel_layout)
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },

        {
            'label': 'Assay design', click: (async () => {
                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                await exec('baja/manchester/menu/assay-tools.js', graph, genegraph_panel_layout)
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },
        {
            'label': 'Filter', click: (async () => {
                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                await exec('baja/manchester/menu/filter-sub-menu.js', graph, genegraph_panel_layout)
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },
        {
            'label': 'Protein:  Visualize ORFs etc.', click: (async () => {
                await exec('baja/manchester/menu/protein-annotation-tools.js', graph, genegraph_panel_layout)
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },
        {
            'label': 'Draw', click: (async () => {
                await exec('baja/manchester/menu/draw-tools-simple.js', graph, genegraph_panel_layout)
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },

        {
            'label': 'Points-of-interest', click: (async () => {
                await exec('baja/manchester/menu/points-of-interest.js', graph, genegraph_panel_layout);
            })
        },

        {
            'label': 'Compounds', click: (async () => {
                await exec('baja/manchester/menu/compound-editor.js', graph, genegraph_panel_layout)

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
            })
        },

        {
            'label': 'Track Layers', click: (async () => {
                graph.setMessage(" Select a track to edit layers.")
                let hl = await exec('baja/manchester/menu/select-track-action-layers.js', graph, genegraph_panel_layout);
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },
        {
            'label': 'Plots', click: (async () => {
                let hl = await exec('baja/manchester/menu/plot-editor.js', graph, genegraph_panel_layout)
                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                CurrentLayout.setComponent('buttonMenuPanel', hl);
            })
        },

        {
            'label': 'Chemistry', click: (async () => {
                await exec('manchester/choose-chemistry.js', graph, genegraph_panel_layout)
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })

        },

        {
            'label': 'Synthesis', click: (async () => {

                await exec('baja/manchester/menu/synthesis-tools.js', graph, genegraph_panel_layout, lib_id)
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })

        }
    ]
    graph.showWindowMenu(tools_menu, 10, 1, 200)
}
