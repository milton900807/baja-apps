function (pm, template_path) {

    return new Promise(async (resolve, reject) => {
        let spath = '/baja/templates/tables';

        if (template_path) {
            spath = template_path
        }

        const filename = `item-cost.ljt`
        let host_ = window['env']['apiUrl'];
        let r = await POSTJSON({ spath: spath }, host_ + '/ljl-tree');

        function buildRecursiveNode(node, currentPath = spath) {
            if (node.type === 'directory') {
                const dirPath = `${currentPath}/${node.name}`;
                return {
                    label: node.name + '/',
                    children: node.children
                        .map(child => buildRecursiveNode(child, dirPath))
                        .filter(child => child !== null),
                    click: () => { }
                };
            } else if (node.type === 'file' && node.name.endsWith('.ljt')) {
                return {
                    label: node.name.replace('.ljt', ''),
                    click: () => {
                        const parentPath = currentPath;

                        console.log('debubg');
                        exec('baja/draw/draw-table', pm.plateTrack, null, parentPath, node.name)
                    }
                };
            } else {
                return null;
            }
        }

        const list_of_items = r.map(node => buildRecursiveNode(node)).filter(node => node !== null);

        const t = [
            {
                label: 'Draw simple table',
                description: ' Click and drag to draw a simple table with all available features...',
                click: async () => {

                    await exec('baja/draw/draw-table', pm.plateTrack)

                }
            },
            {
                label: 'Formula table',
                description: ' Click and drag to draw a simple table with all available features...',
                click: async () => {
                    await exec('baja/draw/draw-tables-from-formula', pm.plateTrack)

                }
            },
            {
                label: 'Templates',
                description: ' General tables...',
                click: () => {
                },
                children: list_of_items
            },
            {
                label: 'Experiments',
                click: () => {

                },
                children: [
                    {
                        label: 'HTS',
                        desc: ' High throughput screening',
                        children: [
                            {
                                'label': '384 Well Plate', 'click': async () => {

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
                                                        'title': '',
                                                        'width': '100%',
                                                        'component': {
                                                            wid: 'mt-button', data: {
                                                                buttons: [
                                                                    {
                                                                        label: 'Create plate', ionFunction: createIonFunction(async (button) => {
                                                                            let name = new_plate_panel.get('Name')
                                                                            hideAllModal();
                                                                            let plate = pm.plateTrack.newRoot(name, 'layout', 24, 16)
                                                                            setTimeout(() => {
                                                                                pm.plateTrack.zoomintoplate(plate);
                                                                            }, 100)
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
                                    showModal(plateName, 400, 300)

                                }
                            },
                            {
                                'label': '96 well plate', 'click': async () => {
                                    let plateDimensions = 96;
                                    let currentType = 'layout'
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
                                                        'title': '',
                                                        'width': '100%',
                                                        'component': {
                                                            wid: 'mt-button', data: {
                                                                buttons: [
                                                                    {
                                                                        label: 'Create plate', ionFunction: createIonFunction(async (button) => {
                                                                            let name = new_plate_panel.get('Name')

                                                                            hideAllModal();
                                                                            let plate = pm.plateTrack.newRoot(name, currentType, 12, 8)

                                                                            setTimeout(() => {
                                                                                pm.plateTrack.zoomintoplate(plate);
                                                                            }, 100)

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

                                    showModal(plateName, 400, 300)

                                }
                            }

                        ]
                    }
                ]
            },

        ];

        return resolve(t);

    })

}
