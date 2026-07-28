function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {

        let editor_;
        let selectPanel = createIonFunction((editor) => {
            editor_ = editor;
        })
        let showMainScreen = async () => {
            CurrentLayout.clearComponent('mainPanel')
            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

        }

        let tname = ['Delete compounds by (plot) value', 'Delete compounds by  name', 'Delete compounds by  type']

        let t = {
            wid: 'card',
            data: {
                cards: [
                    [
                        {
                            'title': ' Delete compounds... ',
                            width: '100%',

                            'body': `  `, 'component':
                            {
                                wid: 'selection-list',
                                width: '100%',
                                refCallback: selectPanel,
                                data: {
                                    single_selection: true,
                                    show_button: false,
                                    singleSelect: true, listItems: tname,
                                    button_function: createIonFunction(async (items) => {

                                        let name = items[0]
                                        if (name === 'Delete compounds by (plot) value') {
                                            await exec('baja/screens/menu/annotation/filter-compounds-plotpanel.js', graph, genegraph_panel_layout);
                                        } else {
                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                        }
                                    })
                                }
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
                                            label: 'Apply', ionFunction: createIonFunction(async () => {
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                            })
                                        },
                                        {
                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                            })
                                        },
                                    ]
                                }
                            }
                        }
                    ]
                ]
            }
        }
        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', t);
        resolve();

    })

}
