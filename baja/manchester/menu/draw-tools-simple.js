function (graph, genegraph_panel_layout) {
    return new Promise(async (resolve, reject) => {
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
                                            'label': 'Draw', 'items': [
                                                {
                                                    'label': 'Rectangle', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/draw-rect-action.js', graph)
                                                    })
                                                },
                                                {
                                                    'label': 'Oval', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/draw-oval-action.js', graph)

                                                    })
                                                },
                                                {
                                                    'label': 'Folder', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/draw-folder.js', graph)

                                                    })
                                                },
                                                {
                                                    'label': 'Text', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/text-box-action.js', graph)
                                                    })
                                                },
                                                {
                                                    'label': 'Arrow', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/draw-line-action.js', graph)
                                                    })
                                                },
                                                {
                                                    'label': 'Highlight region', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/draw-highlight-action.js', graph)
                                                    })
                                                },
                                                {
                                                    'label': 'Text label', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/draw-label-action.js', graph)
                                                    })
                                                },
                                                {
                                                    'label': 'Citation', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/draw-citation-action.js', graph)
                                                    })
                                                },
                                                {
                                                    'label': 'Note', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/draw-note-action.js', graph)
                                                    })
                                                },
                                                {
                                                    'label': 'Points-of-interest', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/points-of-interest.js', graph, genegraph_panel_layout)
                                                    })
                                                },
                                                {
                                                    'label': 'Protein Domains', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/protein-domains.js', graph, genegraph_panel_layout)
                                                    })
                                                }
                                            ]
                                        },

                                        {
                                            'label': 'Edit', 'items': [
                                                {
                                                    'label': 'Object', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/edit-drawing.js', graph, genegraph_panel_layout);
                                                    })
                                                },
                                                {
                                                    'label': 'Clear all', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/clear-drawings.js', graph)
                                                    })

                                                }
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

        resolve();
    })

}
