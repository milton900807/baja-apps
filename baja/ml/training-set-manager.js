function (ml_manager, graph, genegraph_panel_layout) {
    return new Promise(async (resolve, reject) => {
        const dbhost = window["env"]["db"];
        if (!dbhost) {
            alert(" Database host installed. ")
            return;
        }

        let training_message = ` Training set:  <font color='red'> [ ${ml_manager.trainingset.name} ]</font>`
        if (ml_manager.trainingset && ml_manager.method) {
            training_message = ` Training set:  <font color='red'> [ ${ml_manager.trainingset.name} ] + [${ml_manager.method.name}]</font>`

            let button_canvas = {
                wid: 'button-canvas',
                data: {
                    'title': 'controls',
                    'height': 20,
                    'width': 300,
                    'grid': {
                        xmin: 0,
                        xmax: 3,
                        ymin: -0.01,
                        ymax: 1,
                        xinset: 0,
                        yinset: 0
                    },
                    'buttons': [
                        {
                            x: 0, y: 0, label: 'Run', ionFunction: createIonFunction(async () => {

                            })
                        },
                        {
                            x: 1, y: 0, label: 'Reset', ionFunction: createIonFunction(() => {
                            }),
                        },

                    ]
                }
            }
            const tu = {
                wid: 'card',
                height: '100%',
                weight: '100%',
                data: {
                    cards: [
                        [

                            {
                                'component': {
                                    wid: 'html',
                                    data: training_message
                                },
                                'width': '300px'
                            },

                            {
                                'component': button_canvas,
                                'width': '400px'
                            }
                        ]
                    ]
                }

            };
            resolve(tu)

        } else {

            let button_canvas = {
                wid: 'button-canvas',
                data: {
                    'title': 'controls',
                    'height': 20,
                    'width': 300,
                    'grid': {
                        xmin: 0,
                        xmax: 4,
                        ymin: -0.01,
                        ymax: 1,
                        xinset: 0,
                        yinset: 0
                    },
                    'buttons': [
                        {
                            x: 0, y: 0, label: 'Add all', ionFunction: createIonFunction(async () => {

                                graph.clearMouseListeners();
                                graph.setMouseMode('navigate')
                                for (let track of graph.track) {
                                    track.selectTrackAndSeq();
                                    ml_manager.trainingset.ids.push(track.id + '')

                                }
                                ml_manager.trainingset.ids = Array.from(new Set(ml_manager.trainingset.ids));

                                showModal({
                                    wid: 'json',
                                    data: JSON.stringify(ml_manager.trainingset)
                                })

                                let trr = await POSTJSON(ml_manager.trainingset, `${dbhost}/update_training_set`);

                            })
                        },
                        {
                            x: 1, y: 0, label: 'Select', ionFunction: createIonFunction(() => {

                                graph.addMouseMoveListener((x, y) => {
                                    let p_trackIndex = graph.getTrack(x, y);
                                    if (p_trackIndex >= 0) {
                                        graph.track[p_trackIndex].select();
                                    }
                                })
                                graph.addMouseDownListener(async (x, y) => {
                                    let trackIndex = graph.getTrack(x, y);
                                    if (trackIndex >= 0) {
                                        selectedTrack = graph.track[trackIndex]
                                    }
                                    ywc = y;
                                    let menuList = []
                                    let editor;
                                    let typeAhead;
                                })

                            }),
                        },
                        {
                            x: 2, y: 0, label: 'Add selected', ionFunction: createIonFunction(() => {
                                for (let selectedTrack of graph.track) {
                                    graph.runfun(async () => {
                                        selectedTrack.description = descPanel.code;
                                        console.log(" Saving track :" + selectedTrack.id)
                                        graph.setMessage(" Saving track :" + selectedTrack.id)
                                        let r = await POSTJSON(selectedTrack, `${dbhost}/save_track`);
                                    })

                                }
                            }),
                        },
                        {
                            x: 3, y: 0, label: 'Edit set', ionFunction: createIonFunction(() => {
                                exec('baja/ml/designer.js')
                            }),
                        },
                        {
                            x: 4, y: 0, label: 'Execute', ionFunction: createIonFunction(() => {
                                ml_manager.run();
                            }),
                        }

                    ]
                }
            }
            const tu = {
                wid: 'card',
                height: '100%',
                weight: '100%',
                data: {
                    cards: [
                        [

                            {
                                'component': {
                                    wid: 'html',
                                    data: training_message
                                },
                                'width': '300px'
                            },

                            {
                                'component': button_canvas,
                                'width': '400px'
                            }
                        ]
                    ]
                }

            };
            resolve(tu)

        }
    })
}
