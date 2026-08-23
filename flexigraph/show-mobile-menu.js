function (x, y, list, graph, genegraph_panel_layout, reset) {

    let names = []
    for (let l of list) {
        names.push(l.label)
    }
    let t = {
        wid: 'selection-list',
        data: {
            single_selection: true,
            show_button: false,
            singleSelect: true,
            listItems: names,
            button_function: createIonFunction(async (items) => {

                let name = items[0]
                for (let l of list) {
                    if (l.label === name) {
                        l.click(x, y)
                        if (reset) {
                            CurrentLayout.reset('mainPanel')
                        }

                    }
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
                        'component': {
                            wid: 'html',
                            data: '<hr> '
                        }
                    },
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
}
