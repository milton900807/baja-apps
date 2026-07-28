function (group_preferences) {

    return new Promise(async (resolve, reject) => {

        let WellColorPalette = {
            'Column_Header': 'rgba(255, 10, 10, 0.4)',
            'UTC': 'rgba(32, 178, 170, 1)',
            'STANDARD': 'rgba(173, 216, 230, 1)',
            'BUFFER': 'rgba(173, 196, 100, 0.6)',
            'negative-control': 'rgba(128, 0, 128, 0.3)',
            'positive-control': 'rgba(224, 255, 255, 1)',
            'blank': 'rgba(128, 128, 128, 1)',
            'Mean': 'rgba(128, 0, 0, 0.2)',
            'IDs': 'rgba(128, 200, 0, 0.2)',
            'Sample': 'rgba(128, 200, 0, 0.2)',
            'StdDev': 'rgba(10, 100, 228, 0.4)',
            'dCt': 'rgba(210, 200, 128, 0.4)',
            'ddCt': 'rgba(210, 100, 128, 0.4)',
            'Compound': 'rgba(110, 100, 128, 0.4)',
            'Ribogreen': 'rgba(60, 210, 68, 0.5)',
            'Other...': 'rgba(250, 100, 228, 0.4)'
        }
        let npanel;
        let __nameHook = createIonFunction((_panel) => {
            npanel = _panel;
        })
        let c = 'white'
        let color = 'rgba(250, 100, 228, 0.4)'
        function copyIfKeyNotExists(source, destination) {
            for (const key in source) {
                if (!destination.hasOwnProperty(key)) {
                    destination[key] = source[key];
                }
            }
            return destination;
        }
        group_preferences = copyIfKeyNotExists(WellColorPalette, group_preferences)
        let names = Object.keys(group_preferences)
        names = names.filter(item => item !== 'Other...');

        let t = {
            wid: 'selection-list',
            data: {
                single_selection: true,
                show_button: false,
                singleSelect: true,
                listItems: names,
                color_set: group_preferences,
                button_function: createIonFunction(async (items) => {
                    let name = items[0]
                    color = group_preferences[name]

                    showModal(
                        {
                            wid: 'card',
                            data: {
                                padding: "10px",
                                cards: [
                                    [

                                        {
                                            'title': ' ', 'body': `
                                            `                   ,
                                            'width': '90%',
                                            'component':
                                            {
                                                'wid': 'color-chooser',
                                                'width': '100%',
                                                "data": {
                                                    "selectionListener": createIonFunction((_color) => {
                                                        let c = _color['rgb']
                                                        color = `rgb(${c['r']},${c['g']},${c['b']})`
                                                    })
                                                }
                                            }
                                        },
                                        {
                                            'title': ' ', 'body': `
                                                        `                   ,
                                            'width': '90%',
                                            'component':
                                            {
                                                wid: 'input-param-items',
                                                refCallback: __nameHook,
                                                data: {
                                                    'input_labels': ['Group'
                                                    ],
                                                    default_values: { 'Group': name },
                                                }
                                            }
                                        },
                                        {
                                            'title': null, 'body': `
                                                        `   ,
                                            'width': '100%',
                                            'component':
                                            {
                                                wid: 'button',
                                                data: [
                                                    {
                                                        'label': 'Apply', ionfunction: createIonFunction(async () => {

                                                            group_preferences[name] = color;

                                                            if (name === 'Column_Header') {
                                                                await exec('baja/plate/well-color-palette-preferences.js', group_preferences)
                                                            } else
                                                                await exec('baja/plate/well-color-palette-preferences.js', group_preferences)
                                                            setTimeout(() => {
                                                                hideAllModal();
                                                            }, 1000);

                                                        }), disableAfterClick: false
                                                    },
                                                    {
                                                        'label': 'Close', ionfunction: createIonFunction(async () => {
                                                            CurrentLayout.reset('mainPanel')
                                                            hideAllModal();
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
            }
        }

        let sequence_input = {
            wid: 'card',
            "height": "500px",
            "width": "500px",
            data: {
                "style.padding-top": '1px',
                "style.border": '1px',
                "style.height": "500px",
                "width": "500px",

                cards: [
                    [
                        {
                            'width': '20%',
                            'component': t
                        },

                        {
                            'title': null, 'body': `
                                        `   ,
                            'width': '100%',
                            'component':
                            {
                                wid: 'button',
                                data: [
                                    {
                                        'label': 'Close', ionfunction: createIonFunction(async () => {
                                            CurrentLayout.reset('mainPanel')
                                            hideAllModal();
                                        }), disableAfterClick: false
                                    },
                                ]
                            }
                        }
                    ]
                ]
            }
        }
        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', sequence_input);
    })
}
