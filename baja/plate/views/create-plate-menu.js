function (pt, x, y) {

    return new Promise(async (resolve, reject) => {
        let Menu = await exec('flexigraph/menu.js');
        let menuList = []
        let editor;
        let currentType = 'Synthesis'

        let selectP;
        let selectPanel = createIonFunction(async (_panel) => {
            selectP = _panel;
        });

        r = createIonFunction((p) => {
            editor = p;
        })
        menuList.push({
            label: `New 96w`,
            click: (scx, scy) => {

                let plateDimensions = 96;
                let new_plate_panel;
                let __nameHook = createIonFunction((ed) => {
                    new_plate_panel = ed;
                });

                let plateName = {
                    wid: 'card',
                    data: {
                        'style.padding-left': '5px',
                        'style.padding-top': '1px',
                        cards: [
                            [
                                {
                                    'width': '85%',
                                    'body': ``,
                                    'component':
                                    {
                                        wid: 'input-param-items',
                                        refCallback: __nameHook,
                                        data: {
                                            'input_labels': ['Name'],
                                        }
                                    },

                                }
                            ],
                            [

                                {
                                    'width': '100%',
                                    'component': {
                                        wid: 'radio-buttons',
                                        data: [
                                            {
                                                label: 'Synthesis plate',
                                                ionfunction: createIonFunction(
                                                    () => {
                                                        currentType = 'Synthesis'
                                                    }
                                                )
                                            },
                                            {
                                                label: 'QC',
                                                ionfunction: createIonFunction(
                                                    () => {
                                                        currentType = 'QC'
                                                    }
                                                )
                                            },
                                            {
                                                label: 'RNA',
                                                ionfunction: createIonFunction(() => {
                                                    currentType = 'RNA'
                                                }
                                                )
                                            },
                                            {
                                                label: 'Treatment',
                                                ionfunction: createIonFunction(() => {
                                                    currentType = 'Treatment'
                                                }
                                                )
                                            },
                                            {
                                                label: 'Excel',
                                                ionfunction: createIonFunction(() => {
                                                    currentType = 'excel'
                                                }
                                                )
                                            },
                                            {
                                                label: 'Other',
                                                ionfunction: createIonFunction(() => {
                                                    currentType = '---'
                                                }
                                                )
                                            },

                                        ]
                                    }

                                },

                            ],

                            [

                                {
                                    'title': '',
                                    'width': '100%',
                                    'component': {
                                        wid: 'mt-button', data: {
                                            buttons: [
                                                {
                                                    label: 'Create plate', ionFunction: createIonFunction(async (button) => {
                                                        let name = new_plate_panel.get('Name')
                                                        pt.newRoot(name, currentType, x, y)
                                                        hideAllModal();
                                                    })
                                                }
                                            ]
                                        }
                                    }
                                },

                            ]
                        ]
                    }
                }

                showModal(plateName)

            },
            move: () => {
            }
        });

        menuList.push({
            label: `New 384`,
            click: (scx, scy) => {

                let plateDimensions = 384;
                let currentType = 'Synthesis'
                let new_plate_panel;
                let __nameHook = createIonFunction((ed) => {
                    new_plate_panel = ed;
                });

                let plateName = {
                    wid: 'card',
                    data: {
                        'style.padding-left': '5px',
                        'style.padding-top': '1px',
                        cards: [
                            [
                                {
                                    'width': '85%',
                                    'body': ``,
                                    'component':
                                    {
                                        wid: 'input-param-items',
                                        refCallback: __nameHook,
                                        data: {
                                            'input_labels': ['Name'],
                                        }
                                    },

                                }
                            ],
                            [

                                {
                                    'width': '100%',
                                    'component': {
                                        wid: 'radio-buttons',
                                        data: [
                                            {
                                                label: 'Synthesis plate',
                                                ionfunction: createIonFunction(
                                                    () => {
                                                        currentType = 'Synthesis'
                                                    }
                                                )
                                            },
                                            {
                                                label: 'QC',
                                                ionfunction: createIonFunction(
                                                    () => {
                                                        currentType = 'QC'
                                                    }
                                                )
                                            },
                                            {
                                                label: 'RNA',
                                                ionfunction: createIonFunction(() => {
                                                    currentType = 'RNA'
                                                }
                                                )
                                            },
                                            {
                                                label: 'Treatment',
                                                ionfunction: createIonFunction(() => {
                                                    currentType = 'Treatment'
                                                }
                                                )
                                            },
                                            {
                                                label: 'Excel',
                                                ionfunction: createIonFunction(() => {
                                                    currentType = 'excel'
                                                }
                                                )
                                            },
                                            {
                                                label: 'Other',
                                                ionfunction: createIonFunction(() => {
                                                    currentType = '---'
                                                }
                                                )
                                            },

                                        ]
                                    }

                                },

                            ],

                            [

                                {
                                    'title': '',
                                    'width': '100%',
                                    'component': {
                                        wid: 'mt-button', data: {
                                            buttons: [
                                                {
                                                    label: 'Create plate', ionFunction: createIonFunction(async (button) => {
                                                        let name = new_plate_panel.get('Name')
                                                        pt.newRoot(name, currentType, x, y)
                                                        hideAllModal();
                                                    })
                                                }
                                            ]
                                        }
                                    }
                                },

                            ]
                        ]
                    }
                }

                showModal(plateName)

            },
            move: () => {
            }
        });

        let menu = new Menu(menuList, 0, 100)
        resolve(menu)
    })

}
