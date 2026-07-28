function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {

        let editor_;
        let editor_function = createIonFunction((editor) => {
            editor_ = editor;
        })

        let list_buttons = [

            {
                x: 0, y: 0, label: 'New', ionFunction: createIonFunction(async () => {
                    await exec('baja/screens/menu/draw-secondary-structure3.js', graph, genegraph_panel_layout);
                })

            },
            {
                x: 1, y: 0, label: 'Move', ionFunction: createIonFunction(async () => {
                    await exec('baja/screens/menu/edit-secondary-structure-move.js', graph, genegraph_panel_layout);
                })
            },
            {
                x: 2, y: 0, label: 'Resize', ionFunction: createIonFunction(async () => {
                    let dp = {
                        wid: 'card',
                        componentRef: 'bottomPanel',
                        data: {
                            height: '800px',
                            cards: [
                                [
                                    {
                                        'title': '',
                                        'width': '100%',
                                        'component': {
                                            wid: 'html',
                                            data: `Enter pixel size`
                                        }
                                    },
                                    {
                                        'width': '100%',
                                        "style.padding-top": '4px',
                                        "style.border": '1px',
                                        'component':
                                        {
                                            'wid': 'input-textfield',
                                            'title': 'Enter Edit Distance Below (optional)',
                                            'data': {
                                                'blocking': false,
                                                'show-button': false,
                                                'ionHookFunction': createIonFunction((w) => {

                                                }),
                                                'ionfunction': createIonFunction((title) => {

                                                })
                                            }
                                        }
                                    }, {
                                        'title': '',
                                        'width': '100%',
                                        'component': {
                                            wid: 'mt-button', data: {
                                                buttons: [
                                                    {
                                                        label: 'Save', ionFunction: createIonFunction(() => {
                                                            hideAllModal();
                                                            showModal({
                                                                wid: 'json',
                                                                data: JSON.stringify(editor_.code)
                                                            })

                                                        })
                                                    },
                                                    {
                                                        label: 'Cancel', ionFunction: createIonFunction(() => {
                                                            hideAllModal();
                                                        })
                                                    }
                                                ]
                                            }
                                        }
                                    }
                                ]]
                        }
                    }
                    showModal(dp)

                })

            },
            {
                x: 3, y: 0, label: 'Map', ionFunction: createIonFunction(async () => {
                    await exec('baja/screens/menu/mouse-over-highlight-all.js', graph);

                })
            },
            {
                x: 4, y: 0, label: 'Edit...', ionFunction: createIonFunction(async () => {

                })
            },

        ]

        let host_ = window['env']['apiUrl']
        let foundIres_db = false;
        let rs = await GETJSON( host_ + '/list-installed-files');
        if (rs) {
            for (let i of rs) {

                if (i.toLowerCase().indexOf('human_ires_info') >= 0) {
                    foundIres_db = true;
                }
            }
            if (foundIres_db) {
                list_buttons.push({
                    x: 5, y: 0, label: 'IRES', ionFunction: createIonFunction(async () => {
                        await exec('baja/screens/menu/ires-search.js', graph);

                    })
                })
            }
        }
        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 30,
                'width': 600,
                'grid': {
                    xmin: 0,
                    xmax: 7,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': list_buttons
            }
        }

        return resolve(button_canvas)
    })

}
