let screenActions = {
    label: 'Compounds', 'items': [
        {
            label: 'Tile...',
            ionfunction: createIonFunction(async () => {
                graph.setMessage('Select a point on a track')
                exec('baja/manchester/menu/paint-oligos.js', graph)
            })
        },
        {
            label: 'Tile on track variants',
            ionfunction: createIonFunction(async () => {
                if (graph.track.length > 0) {
                    let hasSnpindel = 0;
                    for (let t of graph.track) {
                        if (t.snpindels.length > 0) {
                            hasSnpindel = 1;
                        }
                    }
                    if (hasSnpindel == 1) {
                        graph.setMessage('Choose variant to tile...')
                        await exec('baja/manchester/annotation/paint-oligos-snps.js', graph)
                    } else {
                        graph.setMessage('No variants found')
                    }
                }
            })

        },

        {
            label: 'Draw',
            ionfunction: createIonFunction(async () => {
                if (!graph.props.selected_chemistry) {
                    graph.setMessage('No chemistry selected.')
                    return;
                }
                graph.setMessage('Select location on track')
                exec('baja/manchester/menu/draw-oligos.js', graph)
            })
        },
        {
            label: 'Paste Sequences',
            ionfunction: createIonFunction(async () => {
                showModal({
                    wid: 'card',
                    height: '100%',
                    data: {
                        cards: [
                            [
                                {

                                    'width': '100%',
                                    'component': {
                                        wid: 'menu',
                                        data: {
                                            menus: [
                                                {
                                                    'label': 'Type', 'items': [

                                                        {
                                                            'label': 'Sequences list', 'ionfunction': createIonFunction(async () => {
                                                                let paste_sequences_panel = await exec('baja/chem/paste-sequences-nochem.js', graph)
                                                                await showModal(paste_sequences_panel)

                                                            })
                                                        },
                                                        {
                                                            'label': 'ID | sequences| KD', 'ionfunction': createIonFunction(async () => {
                                                                let paste_sequences_panel = await exec('baja/chem/paste-sequences-nochem.js', graph)
                                                                await showModal(paste_sequences_panel)
                                                            })
                                                        },
                                                    ]
                                                },
                                            ]
                                        }
                                    }

                                }
                            ]]
                    }
                }, 200, 100)

            })
        },
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
                                                            hideAllModal();

                                                            await exec('baja/manchester/apply-synthesis-sequence', graph, seqMode)
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
            label: 'Move oligo (XY)',
            ionfunction: createIonFunction(async () => {
                graph.setMessage('Select a locus on a track')
                exec('baja/manchester/menu/move-oligos.js', graph)
            })
        },
        {
            label: 'Move oligo (Y)',
            ionfunction: createIonFunction(async () => {
                graph.setMessage('Select a locus on a track')
                exec('baja/manchester/menu/move-oligos-vertical.js', graph)
            })
        },
        {
            label: 'View oligo',
            ionfunction: createIonFunction(async () => {
                graph.setMessage('Select a track')
                exec('baja/manchester/menu/find-oligos.js', graph)
            })
        },
        {
            label: 'Select all',
            ionfunction: createIonFunction(async () => {

                let total = []
                for (let t of graph.track) {
                    for (let o of t.oligos) {
                        total.push({ 'o': o, 't': t })
                    }
                }
                graph.setSelectedCompounds(total)
                graph.setMessage('Total selected: ' + total.length);
                graph.currentShape = null;
            })
        },
        {
            label: 'Clear all',
            ionfunction: createIonFunction(async () => {
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
                                        data: '<font color=red> Are you sure you want to remove all compounds? </font>'
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
                                                        for (let t of graph.track) {
                                                            t.oligos = []
                                                        }
                                                        graph.setMessage(" Compounds removed from all tracks.");
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

            })
        },
        {
            label: 'Apply compound filtering rule',
            ionfunction: createIonFunction(async () => {
                await exec('baja/manchester/annotation/dynamic-rule-application.js', graph);
            })
        }
    ]
}
