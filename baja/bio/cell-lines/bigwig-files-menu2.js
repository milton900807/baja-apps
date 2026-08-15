function (graph, genegraph_panel_layout) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.setMessage(" Select a track... ")
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })
    let host_ = window['env']['apiUrl']
    let selectedTrack = null;
    let menuList = []
    menuList.push({
        label: '_Load_RNASeq layer',
        click: async (xwc, ywc) => {
            for (let as of selectedTrack.annotations) {
                if (as.type == 'NMD') {
                    selectedTrack.removeAnnotation(as)
                }
            }
            let TrackLayer = await exec('baja/bio/track-layer.js')
            let t = selectedTrack;
            if (t.chr === undefined || t.chr === null) {
                graph.setMessage(t.name + "track does not have chromosome defined in this track. (" + t.chr + ")")
            } else {
                let range = {
                    start: t.xi,
                    end: t.xf,
                }

                let columns = 4;
                if (isMobile()) {
                    columns = 1;
                }
                let ww = {
                    wid: 'simple-file-browser',
                    width: '100%',
                    height: '100%',
                    data: {
                        width: '100%',
                        drive: 'bigdata',
                        user: getUser(),
                        columns: columns,
                        root: '/',
                        "ionfunction.fileClick": createIonFunction(async (element) => {

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
                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                            CurrentLayout.setComponent('buttonMenuPanel', w);
                            let em = new EngineMonitor((msg) => {
                                log(msg)
                            });
                            exec('py/baja/bigwig/view-bigwig.py', em, '/bd/' + element.path, range.start, range.end, t.chr).then(async res => {
                                console.log(res)

                                try {
                                    let rv = JSON.parse(res.values);
                                    let rs_base = element.path.split('.bw')[0]

                                    let layer = new TrackLayer(rs_base, range.start, 0, range.end, 1)
                                    let index = 0;

                                    let max_exp = rv.reduce((max, tuple) => Math.max(max, tuple[1]), -Infinity);

                                    if (!max_exp) { max_exp = 1.0 }

                                    layer.addPolygonPoint(range.start, 0 / max_exp * -1)

                                    for (let v of rv) {
                                        if (v === NaN) {
                                            v = 0;
                                        }

                                        layer.addPolygonPoint(v[0], v[1] / max_exp)
                                        index++;
                                    }

                                    layer.addPolygonPoint(range.end, 0 / max_exp * -1)

                                    layer.sortPolygonPoints();
                                    t.addLayer(layer)
                                    let button_canvas = await exec('manchester/controls/navigation-panel.js', graph)

                                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel');
                                    CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                                } catch (exception) {

                                    graph.setMessage(" Failed for " + t.name);

                                }
                            })
                            hideAllModal();

                        }),
                        "ionfunction.openfile": createIonFunction(async (file, text) => {
                        }
                        ),
                        "ionfunction.path": createIonFunction(async (path, nodes) => {

                        })
                    }
                }

                let bwpanel = {
                    wid: 'card',
                    data: {
                        cards: [
                            [

                                {
                                    'title': ' ', 'body': ``,
                                    'width': '100%',
                                    'component':
                                    {
                                        wid: 'html',
                                        data: '<hr>'
                                    }
                                },

                                {
                                    'title': ' ', 'body': ``,
                                    'width': '100%',
                                    'component':
                                    {
                                        wid: 'mt-button', data: {
                                            buttons: [

                                                {
                                                    label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                        CurrentLayout.clearComponent('mainPanel')
                                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                    })
                                                },
                                            ]
                                        }
                                    }
                                },
                                {
                                    'title': ' ', 'body': ``,
                                    'width': '100%',
                                    'component': ww
                                },
                            ]
                        ]
                    }
                }

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', bwpanel);

            }
        },
        move: () => {
            log('')
        }

    })

    menuList.push({
        label: 'Remove Layer...',
        click: async (xwc, ywc) => {
            for (let as of selectedTrack.annotations) {
                if (as.type == 'NMD') {
                    selectedTrack.removeAnnotation(as)
                }
            }
            let TrackLayer = await exec('baja/bio/track-layer.js')
            let t = selectedTrack;
            if (t.chr === undefined || t.chr === null) {
                graph.setMessage(t.name + "track does not have chromosome defined in this track. (" + t.chr + ")")
            } else {
                let range = {
                    start: t.xi,
                    end: t.xf,
                }

                let columns = 4;
                if (isMobile()) {
                    columns = 1;
                }
                let ww = {
                    wid: 'simple-file-browser',
                    width: '100%',
                    height: '100%',
                    data: {
                        width: '100%',
                        drive: 'bigdata',
                        user: getUser(),
                        columns: columns,
                        root: '/',
                        "ionfunction.fileClick": createIonFunction(async (element) => {

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
                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                            CurrentLayout.setComponent('buttonMenuPanel', w);
                            let em = new EngineMonitor((msg) => {
                                log(msg)
                            });
                            exec('py/baja/bigwig/view-bigwig.py', em, '/bd/' + element.path, range.start, range.end, t.chr).then(async res => {
                                console.log(res)

                                try {
                                    let rv = JSON.parse(res.values);
                                    let rs_base = element.path.split('.bw')[0]

                                    let layer = new TrackLayer(rs_base, range.start, 0, range.end, 1)
                                    let index = 0;

                                    let max_exp = Math.max(...rv.map((tuple) => tuple[1]))
                                    if (!max_exp) { max_exp = 1.0 }

                                    layer.addPolygonPoint(range.start, 0 / max_exp * -1)

                                    for (let v of rv) {
                                        if (v === NaN) {
                                            v = 0;
                                        }

                                        layer.addPolygonPoint(v[0], v[1] / max_exp)
                                        index++;
                                    }

                                    layer.addPolygonPoint(range.end, 0 / max_exp * -1)

                                    layer.sortPolygonPoints();
                                    t.addLayer(layer)
                                    let button_canvas = await exec('manchester/controls/navigation-panel.js', graph)

                                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel');
                                    CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                                } catch (exception) {
                                    graph.setMessage(" Failed for " + t.name);

                                }
                            })
                            hideAllModal();

                        }),
                        "ionfunction.openfile": createIonFunction(async (file, text) => {
                        }
                        ),
                        "ionfunction.path": createIonFunction(async (path, nodes) => {

                        })
                    }
                }

                let bwpanel = {
                    wid: 'card',
                    data: {
                        cards: [
                            [

                                {
                                    'title': ' ', 'body': ``,
                                    'width': '100%',
                                    'component':
                                    {
                                        wid: 'html',
                                        data: '<hr>'
                                    }
                                },

                                {
                                    'title': ' ', 'body': ``,
                                    'width': '100%',
                                    'component':
                                    {
                                        wid: 'mt-button', data: {
                                            buttons: [

                                                {
                                                    label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                        CurrentLayout.clearComponent('mainPanel')
                                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                    })
                                                },
                                            ]
                                        }
                                    }
                                },
                                {
                                    'title': ' ', 'body': ``,
                                    'width': '100%',
                                    'component': ww
                                },
                            ]
                        ]
                    }
                }

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', bwpanel);

            }
        },
        move: () => {
            log('')
        }
    })

    graph.addMouseMoveListener((x, y) => {
        let p_trackIndex = graph.getTrack(x, y);
        if (p_trackIndex >= 0) {
            graph.deselectAllTracks();
            if (graph.track[p_trackIndex])
                graph.track[p_trackIndex].showResizeBar = true;
            return;
        }
    }
    )
    graph.addMouseDownListener(async (x, y) => {
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
        }
        let editor;
        let typeAhead;

        if (selectedTrack)
            graph.showMenu(menuList, x, y)
    });

}
