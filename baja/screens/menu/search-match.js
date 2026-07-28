function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let edit_list = [];
        edit_list.push('Find-ASO-Match')
        edit_list.push('Compare')
        let t = {
            wid: 'selection-list',
            data: {
                single_selection: true,
                show_button: false,
                singleSelect: true,
                listItems: edit_list,
                button_function: createIonFunction(async (items) => {
                    function moveToFirst(arr, item) {
                        const index = arr.indexOf(item);
                        if (index !== -1) {
                            arr.splice(index, 1);
                            arr.push(item);
                        }
                        return arr;
                    }
                    function moveToLast(arr, item) {
                        const index = arr.indexOf(item);
                        if (index !== -1) {
                            arr.splice(index, 1);
                            arr.unshift(item);
                        }
                        return arr;
                    }
                    if (items[0] === 'Color') {
                        let color_panel = {
                            wid: 'card',
                            data: {
                                cards: [
                                    [

                                        {
                                            'width': '100%',
                                            "style.padding-top": '4px',
                                            "style.border": '1px',
                                            'component':
                                            {
                                                'wid': 'color-chooser',
                                                "data": {
                                                    "selectionListener": createIonFunction((color) => {
                                                    })
                                                }
                                            }
                                        },
                                    ]
                                ]
                            }
                        }
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', color_panel);
                    }
                    else if (items[0] === 'Find-ASO-Match') {
                        let nameField;
                        let name_panel = {
                            wid: 'card',
                            data: {
                                cards: [
                                    [
                                        {
                                            'width': '100%',
                                            "style.padding-top": '4px',
                                            "style.border": '1px',
                                            'component':
                                            {
                                                'wid': 'input-textfield',
                                                'title': 'Text:',
                                                'data': {
                                                    'blocking': false,
                                                    'text': '',
                                                    'show-button': false,
                                                    'ionHookFunction': createIonFunction((w) => {
                                                    }),
                                                    'ionHookFunction': createIonFunction((input_box) => {
                                                        nameField = input_box;
                                                    })
                                                }
                                            }
                                        }, {
                                            'title': ' ', 'body': ``,
                                            'width': '100%',
                                            'component':
                                            {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Save', ionFunction: createIonFunction(async () => {
                                                                let name = nameField.value;
                                                                if (name != null && name.length > 0) {
                                                                }
                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                            })
                                                        },
                                                        {
                                                            label: 'Clear all', ionFunction: createIonFunction(async () => {
                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                            })
                                                        },
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {

                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                            })
                                                        }
                                                    ]
                                                }
                                            }
                                        },
                                        {
                                            'title': ' ', 'body': ``,
                                            'width': '30%',
                                            'component':
                                            {
                                                wid: 'html',
                                                data: ''
                                            }
                                        },
                                    ]
                                ]
                            }
                        }
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', name_panel);
                    }
                    else if (items[0] === 'Compare') {

                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                        let compare_canvas = await exec('baja/screens/menu/compare-sequences-button-panel.js', graph)
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', compare_canvas);

                        return;

                    } else if (items[0] === 'Show') {
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    } else if (items[0] === 'Hide') {
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    } else if (items[0] === 'To back') {
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    } else if (items[0] === 'To front') {
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    }
                    else if (items[0] === 'Turn off interaction') {
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    }
                    else if (items[0] === 'Turn on interaction') {
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    }
                    else if (items[0] === 'Delete layer') {
                        let name_panel = {
                            wid: 'card',
                            data: {
                                cards: [
                                    [

                                        {
                                            'width': '100%',
                                            "style.padding-top": '4px',
                                            "style.border": '1px',
                                            'component':
                                            {
                                                'wid': 'html',
                                                'data': ` <h2> Are you sure you want to delete this layer? </h2>`
                                            }
                                        }, {
                                            'title': ' ', 'body': ``,
                                            'width': '100%',
                                            'component':
                                            {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Delete', ionFunction: createIonFunction(async () => {
                                                            })
                                                        }, {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                            })
                                                        }
                                                    ]
                                                }
                                            }
                                        },
                                        {
                                            'title': ' ', 'body': ``,
                                            'width': '30%',
                                            'component':
                                            {
                                                wid: 'html',
                                                data: ''
                                            }
                                        },
                                    ]
                                ]
                            }
                        }
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', name_panel);

                    }
                })
            }
        }

        let html = '<hr> <h5> Edit Layer  </h5>'
        let wg = {
            wid: 'card',
            componentRef: 'bt',
            data: {
                height: '1500px',
                cards: [
                    [
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: `${html}`
                            }
                        }, {
                            'title': '',
                            'width': '100%',
                            'component': t
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        }
                                    ]
                                }
                            }
                        }
                    ]]
            }
        }
        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', wg);
    })
}
