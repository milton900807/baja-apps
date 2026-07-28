function (graph, genegraph_panel_layout) {
    return new Promise(async (resolve, reject) => {

        let edit_list = [];
        if (trackLayer.visible) {
            edit_list.push('Hide')
        } else {
            edit_list.push('Show')
        }
        edit_list.push('Color')
        edit_list.push('Name')
        edit_list.push('Highlight Text')
        edit_list.push('To back')
        edit_list.push('To front')
        edit_list.push('Delete layer')
        if (trackLayer.interactive) {
            edit_list.push("Turn off interaction")
        } else {
            edit_list.push("Turn on interaction")
        }
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

                        let color = 'black'

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
                                                    "selectionListener": createIonFunction((_color) => {

                                                        color = _color['rgb']
                                                    })
                                                }
                                            }
                                        },
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component': {
                                                wid: 'html',
                                                data: `<hr>`
                                            }
                                        },
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                                hideAllModal();
                                                            })
                                                        },
                                                        {
                                                            label: 'Apply', ionFunction: createIonFunction(() => {
                                                                let _cool = 'rgba(' + color['r'] + ',' + color['g'] + ',' + color['b'] + ',' + color['a'] + ')';
                                                                trackLayer.setColor ( _cool )

                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                            })
                                                        }
                                                    ]
                                                }
                                            }
                                        }

                                    ]
                                ]
                            }
                        }
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', color_panel);
                    }
                    else if (items[0] === 'Highlight Text') {
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
                                                                    trackLayer.highlightText(name);
                                                                }
                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                            })
                                                        },
                                                        {
                                                            label: 'Clear all', ionFunction: createIonFunction(async () => {
                                                                trackLayer.highlight_text = [];
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
                    else if (items[0] === 'Name') {
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
                                                'title': 'Name:',
                                                'data': {
                                                    'blocking': false,
                                                    'text': trackLayer.name,
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
                                                                if (name != null && name.length > 0)
                                                                    trackLayer.name = name;

                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

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

                    } else if (items[0] === 'Show') {
                        trackLayer.visible = true;
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                    } else if (items[0] === 'Hide') {
                        trackLayer.visible = false;
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                    } else if (items[0] === 'To back') {
                        moveToLast(track.track_layers, trackLayer)
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                    } else if (items[0] === 'To front') {
                        moveToFirst(track.track_layers, trackLayer)
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                    }
                    else if (items[0] === 'Turn off interaction') {
                        trackLayer.interactive = false;
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    }
                    else if (items[0] === 'Turn on interaction') {
                        trackLayer.interactive = true;
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
                                                                if (track) {
                                                                    track.track_layers = track.track_layers.filter(object => object.name !== trackLayer.name);

                                                                    trackLayer.release();

                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                }

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

        let html = '<hr> <h5> Edit Layer ' + trackLayer.name + ' </h5>'
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
