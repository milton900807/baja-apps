function (track, graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let edit_list = [];

        let data_items = window['env']['data']
        for (let d of data_items) {
            edit_list.push(d.label);

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
                    for ( let d of data_items ){
                        if ( d.label === items[0] ){
                            graph.setMouseMode('navigate')
                            await exec(d.script, d.data, d.server, graph, genegraph_panel_layout)
                        }
                    }
                })
            }
        }

        let html = `<hr> <h5> More.... ${track.markstart} --  ${track.markend}  </h5>`
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
