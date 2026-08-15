function (graph, genegraph_panel_layout, lib_id) {

    return new Promise(async (resolve, reject) => {
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

                                            'label': 'Vendor', 'items': [
                                                {

                                                    'label': 'IDT', 'ionfunction': createIonFunction(async () => {
                                                        let idt = await exec('baja/chem/structure/idt/idt-format.js');
                                                        let explist = []
                                                        for (let t of graph.track) {
                                                            let row = 0;
                                                            let __index = 0;
                                                            for (let o of t.oligos) {
                                                                if (__index > 12) {
                                                                    __index = 0;
                                                                }
                                                                let well = String.fromCharCode(65 + 8 - __index) + '' + row
                                                                if (o && o.structure && o.id)
                                                                    explist.push({
                                                                        'well': well,
                                                                        'id': o.id,
                                                                        'idt': idt.format(o.structure)
                                                                    })
                                                            }
                                                        }
                                                        downloadAsCsv(explist, 'idt.csv')
                                                    })
                                                },

                                                {

                                                    'label': 'Export IDT Plate Manifest', 'ionfunction': createIonFunction(async () => {
                                                        let hlist = []

                                                        let trackName = '';
                                                        for (let t of graph.track) {
                                                            trackName += t.name + '__';
                                                            for (let o of t.oligos) {
                                                                hlist.push(o)
                                                            }
                                                        }
                                                        let idt = await exec('baja/compound-registration/reg-db.js',
                                                            library.id, hlist, graph);
                                                        downloadAsCsv(idt, trackName + '_idt.csv')

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
        CurrentLayout.clearComponent('labelPanel')
        CurrentLayout.setComponent('labelPanel', bpanel);

        resolve();

    })

}
