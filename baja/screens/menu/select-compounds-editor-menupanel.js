function (graph, genegraph_panel_layout) {

    let editor_;
    let editor_function = createIonFunction((editor) => {
        editor_ = editor;
    })

    let selected_compounds = {
        wid: 'card',
        data: {
            cards: [
                [
                    {
                        'width': '100%',
                        'component': {
                            wid: 'menu',
                            data: {
                                style: 'sub-container',
                                menus: [
                                    {
                                        'label': 'Single', 'items': [

                                            {
                                                'label': 'Edit properties', 'ionfunction': createIonFunction(async () => {
                                                    exec('baja/screens/menu/select-structure-simple.js', graph, genegraph_panel_layout)
                                                })
                                            },
                                            {
                                                'label': 'Move (vertical)', 'ionfunction': createIonFunction(async () => {
                                                    exec('baja/screens/menu/move-oligos-vertical.js', graph)
                                                })
                                            },
                                            {
                                                'label': 'Delete', 'ionfunction': createIonFunction(async () => {

                                                    graph.clearMouseListeners();
                                                    graph.addMouseDownListener((x, y) => {
                                                        let structures = graph.getStructure(x, y)
                                                        let trackIndex = graph.getTrack(x, y);
                                                        if (trackIndex >= 0) {
                                                            selectedTrack = graph.track[trackIndex]

                                                        }

                                                        for (let row of structures) {
                                                            for (let col of row) {

                                                                if (track != null) {
                                                                    const id = track.oligos.indexOf(col);
                                                                    if (id > -1) {
                                                                        track.oligos.splice(id, 1);
                                                                    }
                                                                } else {
                                                                    console.log(' track not found ')
                                                                }
                                                            }
                                                        }

                                                    })
                                                })
                                            }
                                        ],
                                    }, {
                                        label: 'Group',
                                        items: [
                                            {
                                                label: 'Edit...', ionfunction: createIonFunction(async () => {
                                                    let select_panel = await exec('baja/screens/menu/select-compounds-editor-panel.js', graph, genegraph_panel_layout)
                                                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                    CurrentLayout.setComponent('buttonMenuPanel', select_panel);
                                                })
                                            },
                                        ]
                                    }

                                ]
                            }
                        }
                    },

                ]]
        }
    }

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
                    x: 0, y: 0, label: 'Single', ionFunction: createIonFunction(async () => {
                        graph.setMessage('Click on a compound')
                        exec('baja/screens/menu/select-structure-simple.js', graph, genegraph_panel_layout)

                    })
                },
                {
                    x: 1, y: 0, label: 'Group', ionFunction: createIonFunction(async () => {
                        graph.setMessage('Click and drag a box around the group of compounds you want to edit.')
                        graph.clearMouseListeners();
                        await exec('baja/screens/select-compounds.js', graph, genegraph_panel_layout)

                    })
                },
                {
                    x: 2, y: 0, label: 'All', ionFunction: createIonFunction(async () => {
                        let list = [
                            {
                                label: 'Delete All...', click: () => {
                                    for (let t of graph.track) {
                                        let dl = []
                                        for (let a of t.annotations) {
                                            if (a.isSelected()) {
                                                dl.push(a);
                                            }
                                        }
                                        for (let d of dl) {
                                            t.removeAnnotation(d)
                                        }
                                    }
                                    CurrentLayout.clearComponent('mainPanel')
                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                }
                            },
                            {
                                label: 'Delete by type...', click: () => {
                                    let annotation_types = []
                                    let an = []
                                    for (let t of graph.track) {
                                        for (let a of t.annotations) {
                                            an.push(a);
                                        }
                                    }
                                    annotation_types = Array.from(new Set(an.map(obj => obj.type)));
                                    let input = {
                                        wid: 'card',
                                        componentRef: 'bottomPanel',
                                        data: {
                                            height: '800px',
                                            cards: [
                                                [
                                                    {
                                                        'title': '',
                                                        'width': '100%',
                                                        'component':
                                                        {
                                                            wid: 'html',
                                                            data: `<h1> Remove annotation type </h1> `
                                                        }
                                                    },

                                                    {
                                                        'title': '',
                                                        'width': '100%',
                                                        'component':
                                                        {
                                                            wid: 'multi-select',
                                                            data: {
                                                                'list': annotation_types,
                                                                'showButton': false,
                                                                ionFunction: createIonFunction((action_item, value) => {
                                                                    let type = action_item;
                                                                    if (type != null && type.length) {

                                                                        are_you_sure((v) => {
                                                                            if (v) {
                                                                                for (let t of graph.track) {
                                                                                    t.removeAnnotationByType(type);
                                                                                    graph.setMessage(` Removed ${action_item} from the track ${t.name} `)
                                                                                }
                                                                            }
                                                                            else {
                                                                                graph.setMessage(` No ${action_item} were removed `)

                                                                            }

                                                                            CurrentLayout.clearComponent('mainPanel')
                                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                                        })
                                                                    } else
                                                                        graph.setMessage(" Enter a type to remove from this track ")

                                                                })
                                                            }
                                                        }
                                                    },

                                                    {
                                                        'title': '',
                                                        'width': '100%',
                                                        'component': {
                                                            wid: 'mt-button', data: {
                                                                buttons: [
                                                                    {
                                                                        label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                            CurrentLayout.clearComponent('mainPanel')
                                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                        })
                                                                    }
                                                                ]
                                                            }
                                                        }
                                                    }
                                                ]]
                                        }
                                    }
                                    CurrentLayout.clearComponent('mainPanel')
                                    CurrentLayout.setComponent('mainPanel', input);

                                }
                            },
                            {
                                label: 'Select by type...', click: () => {

                                    CurrentLayout.clearComponent('mainPanel')
                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                }
                            },
                            {
                                label: 'Deselect all', click: () => {
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

                    })

                },
                {
                    x: 3, y: 0, label: 'Add to track', ionFunction: createIonFunction(async () => {
                        graph.setMessage('Select location on track')
                        exec('baja/screens/menu/draw-oligos.js', graph)
                    })

                },
                {
                    x: 4, y: 0, label: 'Filter', ionFunction: createIonFunction(async () => {
                        await exec('baja/screens/annotation/dynamic-rule-application-min.js', graph, genegraph_panel_layout);
                    })

                },

            ]
        }

    }
    return selected_compounds

}
