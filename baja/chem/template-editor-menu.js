function (structureGraph, library) {
    return new Promise(async (resolve, reject) => {
        let ChemTemplateDB = await exec('baja/chem/chem-template-db.js', library.id);
        let m = {
            wid: 'menu',
            data: {
                menus: [
                    {
                        'label': 'Save', 'items': [
                            {
                                'label': 'Template', 'ionfunction': createIonFunction(() => {

                                    let n = '';
                                    let nameHook = (name) => {
                                        n = name;
                                    }

                                    showModal(
                                        {
                                            wid: 'card',
                                            data: {
                                                padding: "10px",
                                                cards: [
                                                    [
                                                        {
                                                            'title': ' ', 'body': ``,
                                                            'width': '90%',
                                                            'component':
                                                            {
                                                                wid: 'input-param-items',
                                                                refCallback: createIonFunction(nameHook),
                                                                data: {
                                                                    'input_labels': ['Name'

                                                                    ],
                                                                    input_function: {
                                                                        'Name': createIonFunction((value) => {

                                                                            alert ( ' name ' + value )

                                                                        })
                                                                    }
                                                                }
                                                            }
                                                        },
                                                        {
                                                            'title': null, 'body': `
                                            `                   ,
                                                            'width': '100%',
                                                            'component':
                                                            {
                                                                wid: 'button',
                                                                data: [
                                                                    {
                                                                        'label': 'Save', ionfunction: createIonFunction(async () => {
                                                                            let ds = {
                                                                                template: {
                                                                                    sense: structureGraph.getSense(),
                                                                                    antisense: structureGraph.getAntisense(),
                                                                                    sense_start: structureGraph.getSenseStart(),
                                                                                    antisense_start: structureGraph.getAntisenseStart()
                                                                                },
                                                                                type: 'siRNA'
                                                                            }
                                                                            console.log('debubg');
                                                                            let chemDB = new ChemTemplateDB();
                                                                            chemDB.save ( ds, n.get('Name'));
                                                                            hideAllModal()
                                                                        }), disableAfterClick: false
                                                                    },
                                                                ]
                                                            }
                                                        }
                                                    ]]
                                            }
                                        }

                                    )

                                })
                            },
                        ]
                    },
                    {
                        'label': 'Load', 'items': [
                            {
                                'label': 'My monomers', 'ionfunction': createIonFunction(() => {

                                })
                            },
                            {
                                'label': 'Edit', 'ionfunction': createIonFunction(() => {
                                })
                            },
                            {
                                'label': 'Monomer Database', 'ionfunction': createIonFunction(async () => {
                                    let monomers = await exec('baja/chem/monomers.js');
                                    clear();
                                    exec('baja/chem/my-monomers.js')
                                })

                            },
                        ],
                    },
                    {
                        'label': 'Editor Mode', 'items': [
                            {
                                'label': 'Align Sequences', 'ionfunction': createIonFunction(() => {
                                    structureGraph.setMode('align')
                                })
                            },
                            {
                                'label': 'Edit Chain', 'ionfunction': createIonFunction(async () => {
                                    structureGraph.setMode('chain_select')

                                })

                            },
                        ],
                    }, {
                        'label': 'Manage', 'items': [
                            {
                                'label': 'New...', 'ionfunction': createIonFunction(() => {
                                    clear();
                                    exec('baja/chem/template-builder.js')
                                })
                            },
                            {
                                'label': 'View/Edit templates', 'ionfunction': createIonFunction(async () => {
                                    clear();
                                    exec('baja/chem/my-chemistry.js');

                                })

                            },
                            {
                                'label': 'Template Database', 'ionfunction': createIonFunction(() => {
                                    clear();
                                    exec('baja/chem/template-builder.js')

                                })

                            },
                        ],
                    },
                ]
            }

        }
        resolve(m);
    });
}
