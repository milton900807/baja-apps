function (graph, genegraph_panel_layout) {
    hide_menu = false;
    return new Promise(async (resolve, reject) => {
        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
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

                                            'label': 'Edit', 'items': [
                                                {

                                                    'label': 'Select', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/select-compounds.js', graph, genegraph_panel_layout)
                                                    })
                                                },
                                                {
                                                    'label': 'Remove duplicates', 'ionfunction': createIonFunction(() => {

                                                        graph.setMouseMode('navigate')
                                                        graph.setMessage(' Removing duplicates on each track ')

                                                        for (let track of graph.track) {
                                                            track.oligos = track.oligos.filter((oligo, index, array) => {
                                                                return array.findIndex(t => t.sequence === oligo.sequence) === index;
                                                            });
                                                        }
                                                    })
                                                },
                                                {
                                                    'label': 'Remove by...', 'ionfunction': createIonFunction(async () => {

                                                        await exec('baja/manchester/menu/annotation/filter-compounds-panel.js', graph, genegraph_panel_layout)

                                                    })
                                                },

                                                {
                                                    'label': 'Remove All', 'ionfunction': createIonFunction(async () => {

                                                        let confirm = await exec('baja/lib/confirm-widget.js', async () => {
                                                            graph.setMessage("Removing all compounds on the graph. ")

                                                            for (let t of graph.track) {
                                                                t.oligos = []
                                                            }
                                                        })
                                                        showModal(confirm)

                                                    })
                                                }

                                            ],
                                        }, {

                                            'label': '[Advanced]', 'items': [
                                                {

                                                    'label': 'Define synthesis sequence', 'ionfunction': createIonFunction(async () => {
                                                        if (graph.selectedCompounds && graph.selectedCompounds.length > 0) {
                                                            let seqMode = '';
                                                            let modify_sequence = {
                                                                wid: 'card',
                                                                data: {
                                                                    "style.padding-top": '10px',
                                                                    cards: [
                                                                        [
                                                                            {
                                                                                'width': '100%',
                                                                                'component': {
                                                                                    wid: 'mt-button', data: {
                                                                                        buttons: [
                                                                                            {
                                                                                                label: 'Cancel and return to Design', ionFunction: createIonFunction(() => {
                                                                                                    hideAllModal();

                                                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                                                                })
                                                                                            },
                                                                                        ]
                                                                                    }
                                                                                }
                                                                            },
                                                                            {
                                                                                'title': ' ', 'body': ` `,
                                                                                'width': '100%',
                                                                                'component':
                                                                                {
                                                                                    wid: 'html',
                                                                                    data: `
                                                                         <font color="red"> NOTE: any modifications to synthesis sequence will require the re-registration </font>
                                                                        <hr>
                                                                        <h4>Select a sequence orientation for synthesis:</h4>
                                                                        `
                                                                                }
                                                                            },
                                                                            {

                                                                                'title': ' ', 'body': ` `,
                                                                                'width': '100%',
                                                                                'component':
                                                                                {
                                                                                    wid: 'radio-buttons',
                                                                                    data: {
                                                                                        'selected': "0",
                                                                                        'buttons': [
                                                                                            {
                                                                                                'label': 'Target sequence', ionfunction: createIon(() => {
                                                                                                    seqMode = "Target sequence";
                                                                                                }
                                                                                                )
                                                                                            }, {
                                                                                                'label': 'Complement of target sequence', ionfunction: createIon(() => {
                                                                                                    seqMode = "Complement of target sequence";
                                                                                                }
                                                                                                ),
                                                                                            },
                                                                                            {
                                                                                                'label': 'Reverse complement of target sequence', ionfunction: createIon(() => {
                                                                                                    seqMode = "Reverse complement of target sequence";
                                                                                                }
                                                                                                )
                                                                                            }
                                                                                        ],
                                                                                    }
                                                                                }
                                                                            },

                                                                            {
                                                                                'width': '100%',
                                                                                'component': {
                                                                                    wid: 'mt-button', data: {
                                                                                        buttons: [
                                                                                            {
                                                                                                label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                                                    console.log('debubg');
                                                                                                    await exec('baja/manchester/apply-synthesis-sequence-to-all', graph, seqMode)
                                                                                                    graph.setMessage("All modifications to chemistry and/or seqeunce will require structure registration.")

                                                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                                                })
                                                                                            },
                                                                                        ]
                                                                                    }
                                                                                }
                                                                            },

                                                                        ]]
                                                                }

                                                            }
                                                            CurrentLayout.clearComponent('mainPanel')
                                                            CurrentLayout.setComponent('mainPanel', modify_sequence);

                                                        } else {
                                                            graph.setMessage(' No oligos are selected. ')
                                                        }
                                                    })
                                                },
                                                {

                                                    'label': 'Set targets sequence', 'ionfunction': createIonFunction(async () => {
                                                        if (graph.selectedCompounds && graph.selectedCompounds.length > 0) {
                                                            await exec('baja/manchester/apply-target-sequence-to-all', graph)
                                                            CurrentLayout.clearComponent('mainPanel')
                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                        }
                                                    })
                                                }
                                            ]
                                        },

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
