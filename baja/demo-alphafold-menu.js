function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let buttons__ = [

        ]

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
                                            'label': 'Run', 'items': [
                                                {
                                                    'label': 'Alphafold on CPU-only', 'ionfunction': createIonFunction(async () => {

                                                    })
                                                },
                                                {
                                                    'label': 'Alphafold on NVIDIA/GPU', 'ionfunction': createIonFunction(async () => {
                                                        infoPrompt("License required")

                                                    })
                                                },
                                            ]
                                        },
                                        {
                                            'label': 'Select Sequence', 'items': [
                                                {
                                                    'label': 'Click and drag select...', 'ionfunction': createIonFunction(async () => {

                                                    })
                                                },
                                                {
                                                    'label': 'Enter peptide sequence', 'ionfunction': createIonFunction(async () => {
                                                        infoPrompt("License required")
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
        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
        CurrentLayout.setComponent('buttonMenuPanel', bpanel);

    })

}
