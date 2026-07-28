function (selectedTrack, graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let edit_list = [];

        edit_list.push('Free energy/structure')

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
                    if ( items[0] === 'Free energy/structure' ){
                        graph.setMouseMode('navigate')
                        let progressBar;
                        let w = {
                            wid: 'progress',
                            componentRef: 'progressBar',
                            data: {
                                'progress': 10,
                                'progressBar': createIonFunction((progessBar) => {
                                    progressBar = progessBar;
                                })
                            }
                        }
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                        let seq = selectedTrack.getSequenceRange ( selectedTrack.markstart, selectedTrack.markend );
                        let engineMonitor = new EngineMonitor((msg) => {
                        });
                        engineMonitor.addProgressListener(async (v) => {
                            progressBar(v);
                        })

                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', w);

                        let r = await exec('py/baja/secondary-structure/energy-window.py', engineMonitor, seq);

                        showWidget({
                            wid: 'json',
                            data: JSON.stringify(r)
                        })

                    }
                })
            }
        }

        let html = `<hr> <h5> Tile compounds.... ${selectedTrack.markstart} --  ${selectedTrack.markend}  </h5>`
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
