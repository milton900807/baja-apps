function (ib) {

    let mm = {
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
                                                                                sense: ib.senseSIInput.code,
                                                                                antisense: ib.antisenseSIInput.code,
                                                                                moltype:'siRNA'
                                                                            }
                                                                            console.log ( "------- Saving the siRNA " );

                                                                            await db.saveChem(ds, n.get('Name'));
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
                        'label': 'Manage', 'items': [
                            {
                                'label': 'New...', 'ionfunction': createIonFunction(() => {
                                    clear();
                                    exec('baja/chem/template-builder.js')
                                })
                            },
                            {
                                'label': 'View/Edit templates', 'ionfunction': createIonFunction(async () => {
                                    clear ();
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

    return mm;
}
