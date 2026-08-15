function (graph, genegraph_panel_layout, selectedTrack) {

    return new Promise(async (resolve, reject) => {
        let panel = null;
        let descHook = createIonFunction((_panel) => {
            panel = _panel;
        })
        let list = [
        ]
        for (let a of selectedTrack.annotations) {
            if (!list.includes(a.type))
                list.push(a.type)
        }
        let t = {
            wid: 'selection-list',
            data: {
                single_selection: true,
                show_button: false,
                singleSelect: true,
                listItems: list,
                button_function: createIonFunction(async (items) => {

                    let name = items[0]
                    if (name === 'UserAnnotation') {
                        exec ( 'baja/manchester/menu/tile-on-user-annotation.js', graph, genegraph_panel_layout, selectedTrack)
                    }

                })
            }
        }

        let design_params_panel_layout = {
            wid: 'card',
            data: {
                cards: [
                    [
                        {
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

                    ]
                ]
            }
        }
        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', design_params_panel_layout);
        resolve();
    });
}
