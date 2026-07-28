function (panelLabel) {

    let sirna = async () => {

        let sirna_monomers = []
        let monomers = await exec('baja/chem/monomers.js');
        for (let m of monomers) {
            if (m.polymerType === 'RNA' && m.monomerType === 'Backbone') {
                sirna_monomers.push({
                    "name": m['name'],
                    "symbol": m['symbol']
                })
            }
        }
        return sirna_monomers;
    }

    let va = async () => {
        let m = {
            wid: 'menu',
            data: {
                menus: [
                    {
                        'label': 'siRNA', 'items': [
                            {
                                'label': 'Load experiment', 'ionfunction': createIonFunction(() => {
                                })
                            },
                            {
                                'label': 'Load MT-EXP441', 'ionfunction': createIonFunction(() => {
                                })

                            }, {
                                'label': 'Save', 'ionfunction': createIonFunction(() => {
                                })
                            }
                        ]
                    },
                    {
                        'label': 'RNAse H gapmer', 'items': [
                            {
                                'label': 'Zoom', 'ionfunction': createIonFunction(() => {
                                })
                            },
                            {
                                'label': 'Select', 'ionfunction': createIonFunction(() => {
                                })

                            },
                            {
                                'label': 'Annotate', 'ionfunction': createIonFunction(() => {
                                })

                            },
                        ],
                    },
                    {
                        'label': 'Splicing oligo', 'items': [
                            {
                                'label': 'Zoom', 'ionfunction': createIonFunction(() => {
                                })
                            },
                            {
                                'label': 'Select', 'ionfunction': createIonFunction(() => {
                                })

                            },
                            {
                                'label': 'Annotate', 'ionfunction': createIonFunction(() => {
                                })

                            },
                        ],
                    },
                    {
                        'label': 'My chemistry', 'items': [
                            {
                                'label': 'Zoom', 'ionfunction': createIonFunction(() => {
                                })
                            },
                            {
                                'label': 'Select', 'ionfunction': createIonFunction(() => {
                                })

                            },
                            {
                                'label': 'Annotate', 'ionfunction': createIonFunction(() => {
                                })

                            },
                        ],
                    },
                ]
            }
        }

        let sirows = await sirna()

        let t = {
            wid: 'card',
            data: {
                cards: [
                    [
                        {
                            'title': '', 'body': `
                            'width': '100%'
                `, 'component': m
                        },
                        {
                            'title': ' siRNA sugar modifications ',
                            'width': '100%',
                            'body': `

                `, 'component':
                            {
                                wid: 'table', data: {
                                    showHeader: false,
                                    rows: sirows
                                }
                            }
                        }
                    ],
                    [
                        {
                            'title': 'Analysis & Reports ', 'body': `
                `, 'component':
                            {
                                wid: 'table', data: {
                                    showHeader: false,
                                    rows: [
                                        { 'name': 'Mouse, KRAS; Dose-response' },
                                        { 'name': 'Mouse, KRAS; Off targets' },
                                        { 'name': 'Mouse, KRAS; primary screen' },
                                        { 'name': 'Human, DMD; Off-targets' }
                                    ]
                                }
                            }
                        },
                        {
                            'title': ' Chemistry ', 'body': ` Chemistry modifications, monomers and backbone templates
                `, 'component': {
                                wid: 'table',
                                showHeader: false,
                                data: {
                                    rows: [
                                        { 'name': 'ASO templates' },
                                        { 'name': 'Conjugates' },
                                        { 'name': 'Monomers' }
                                    ]
                                }
                            }
                        }

                    ]]
            }
        }

        return t;
    }
    return va();
}
