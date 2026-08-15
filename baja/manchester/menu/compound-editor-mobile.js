function (graph, genegraph_panel_layout) {

    let editor_;
    let editor_function = createIonFunction((editor) => {
        editor_ = editor;
    })
    let showMainScreen = async () => {
        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

    }
    if (!graph.props.selected_chemistry) {
        graph.setMessage("Select chemistry first... ")
        exec('manchester/choose-chemistry.js', graph, genegraph_panel_layout)
        return;
    } else {

        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 30,
                'width': 600,
                'grid': {
                    xmin: 0,
                    xmax: 6,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': [
                    {
                        x: 0, y: 0, label: 'Draw', ionFunction: createIonFunction(async () => {
                            graph.setMouseMode('navigate')

                            graph.setMessage('Select location on track')
                            await exec('baja/manchester/menu/draw-oligos.js', graph)
                        })
                    },
                    {
                        x: 1, y: 0, label: 'Tile', ionFunction: createIonFunction(async () => {
                            graph.setMouseMode('navigate')

                            graph.setMessage('Select a point on a track')
                            exec('baja/manchester/menu/paint-oligos.js', graph)
                        })
                    },
                    {
                        x: 2, y: 0, label: 'Paste', ionFunction: createIonFunction(async () => {
                            graph.setMouseMode('navigate')

                            let list = [
                                {
                                    label: 'Sequences onto all tracks', click: async () => {
                                        graph.setMessage('...')
                                        let paste_sequences_panel = await exec('baja/chem/paste-sequences-nochem.js', graph, genegraph_panel_layout)
                                        CurrentLayout.clearComponent('mainPanel')
                                        CurrentLayout.setComponent('mainPanel', paste_sequences_panel);

                                    }
                                },
                                {
                                    label: 'Compounds onto a track', click: () => {
                                        graph.setMessage("Click on the track you want to paste onto and type CTR+v")
                                        graph.setMouseMode('navigate')
                                        graph.addMouseDownListener((x, y) => {
                                            let trackIndex = graph.getTrack(x, y);
                                            if (trackIndex >= 0) {
                                                let cselectedTrack = graph.track[trackIndex]
                                                if (cselectedTrack) {
                                                    cselectedTrack.highlight()
                                                    graph.setPasteFunction((e) => {
                                                        var imgs = e.clipboardData.items;
                                                        for (var i = 0; i < imgs.length; i++) {
                                                            if (imgs[i].type.indexOf("text/plain") >= 0) {
                                                                imgs[i].getAsString(async (s) => {
                                                                    s = s.trim();
                                                                    console.log('debubg');

                                                                })
                                                            }else {
                                                                console.log ( imgs[i].type)
                                                            }
                                                        }
                                                    })
                                                }
                                            }
                                            setTimeout ( () => {
                                                graph.setPasteFunction ( null )
                                            }, 5000)
                                        })
                                        CurrentLayout.clearComponent('mainPanel')
                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                    }
                                },
                                {
                                    label: '% inhibition table onto all tracks', click: () => {
                                        graph.setMessage(" Currently not implemented ")
                                        CurrentLayout.clearComponent('mainPanel')
                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                    }
                                },
                            ]
                            let names = list.map(obj => obj.label);
                            let t = {
                                wid: 'selection-list',
                                data: {
                                    single_selection: true,
                                    show_button: false,
                                    singleSelect: true,
                                    listItems: names,
                                    button_function: createIonFunction(async (items) => {

                                        let name = items[0]
                                        for (let l of list) {
                                            if (l.label === name) {
                                                l.click()
                                            }
                                        }

                                    })
                                }
                            }

                            let design_params_panel_layout = {
                                wid: 'card',
                                data: {
                                    cards: [
                                        [
                                            {
                                                'width': '100%',
                                                'component': t
                                            },
                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Close', ionFunction: createIonFunction(() => {
                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            }

                                        ]
                                    ]
                                }
                            }
                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', design_params_panel_layout);

                        }), onMouseOver: createIonFunction(() => {
                            graph.setMessage(' Paste in sequences. ')
                        })

                    },

                    {
                        x: 3, y: 0, label: 'Edit', ionFunction: createIonFunction(async () => {

                            graph.setMouseMode('navigate')
                            graph.setMessage("Loading edit panel")
                            let ediPanel = await exec('baja/manchester/menu/compound-editor-panel.js', graph, genegraph_panel_layout);
                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                            CurrentLayout.setComponent('buttonMenuPanel', ediPanel);

                        })
                    },

                ]
            }

        }
        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
        CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
    }
}
