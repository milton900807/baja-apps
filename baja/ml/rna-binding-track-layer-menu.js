function (graph, genegraph_panel_layout) {
    return new Promise(async (resolve, reject) => {
        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 20,
                'grid': {
                    xmin: 0,
                    xmax: 10,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 10,
                    yinset: 0
                },
                'buttons': [
                    {
                        x: 0, y: 0, label: 'Run', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            let layers = {}
                            for (let track of graph.track) {
                                let tl = track.track_layers;
                                for (let tlayer of tl) {
                                    let p = tlayer.polygonpts;
                                    if (p) {
                                        layers[tlayer.name] = p
                                    }
                                }
                                let reference_polygon = track.getAnnotations('Exon');
                                let ref = []
                                for (let r of reference_polygon) {
                                    ref.push({ name: r.name, xi: r.xi, xf: r.xf })
                                }
                                let em = new EngineMonitor((v) => {
                                })

                                const dbhost = window["env"]["db"];
                                if ( !dbhost ){
                                    alert ( " feature not available since we do not have a database installed in this instance.")
                                    return;
                                }
                                let r = await exec('py/tracks/polypredict.py', em, layers, ref, dbhost);

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
                                                    'component': {
                                                        wid: 'json',
                                                        data: JSON.stringify(r)
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
                        })
                    },
                    {
                        x: 2, y: 0, label: 'Run Selected', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            graph.setMouseMode('navigate')

                            let layers = {};

                            for (let track of graph.track) {
                                if (track.markstart >= 0 && track.markend > track.markstart) {
                                    const gxi = track.markstart;
                                    const gxf = track.markend;
                                    let tl = track.track_layers;
                                    for (let tlayer of tl) {
                                        let p = tlayer.polygonpts;
                                        if (p) {
                                            let filtered_points = p.filter(point => point.x >= gxi && point.x <= gxf);
                                            if (filtered_points.length > 0) {
                                                layers[tlayer.name] = filtered_points;
                                            }
                                        }
                                    }
                                    let reference_polygon = track.getAnnotations('Exon');
                                    let ref = [];
                                    for (let r of reference_polygon) {
                                        if (r.xi >= gxi && r.xf <= gxf) {
                                            ref.push({ name: r.name, xi: r.xi, xf: r.xf });
                                        } else if ( r.xi > gxi && r.xf > gxf ){
                                            ref.push({ name: r.name, xi: r.xi, xf: gxf });
                                        } else if ( r.xi < gxi && r.xf < gxf  ){
                                            ref.push({ name: r.name, xi: gxi, xf: r.xf });
                                        } else if ( r.xi < gxi && r.xf > gxf  ){
                                            ref.push({ name: r.name, xi: gxi, xf: gxf });
                                        }
                                    }
                                    let em = new EngineMonitor((v) => {
                                    })

                                const dbhost = window["env"]["db"];
                                if ( !dbhost ){
                                    alert ( " feature not available since we do not have a database installed in this instance.")
                                    return;
                                }
                                let r = await exec('py/tracks/polypredict.py', em, layers, ref, dbhost);

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
                                                        'component': {
                                                            wid: 'json',
                                                            data: JSON.stringify(r)
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
                            }
                        })
                    },
                    {
                        x: 3, y: 0, label: 'Deselect all', ionFunction: createIonFunction(() => {
                            graph.deselectAllTracks();
                        }),
                    },
                ]
            }
        }
        CurrentLayout.clearComponent('labelPanel')
        CurrentLayout.setComponent('labelPanel', button_canvas);

        resolve({})

    })

}
