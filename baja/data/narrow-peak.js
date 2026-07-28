function (datapath, server, graph, genegraph_panel_layout) {
    let loadTrackData = async (selectedTrack) => {
        let TrackLayer = await exec('baja/bio/track-layer.js')
        let range = {
            start: selectedTrack.xi,
            end: selectedTrack.xf,
        }
        if (selectedTrack.markstart > 0 && selectedTrack.markend > selectedTrack.markstart) {
            range.start = selectedTrack.markstart;
            range.end = selectedTrack.markend;
        }
        let columns = 4;
        if (isMobile()) {
            columns = 1;
        }
        log(server)
        let ww = {
            wid: 'simple-file-browser',
            width: '100%',
            height: '100%',
            data: {
                width: '100%',
                drive: 'bigdata',
                server: server,
                columns: columns,
                root: datapath,
                user: getUser(),
                filetype: '.gz',
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
                    let epath = '/bd/' + element.path;
                    epath = epath.replace(/\/+/g, '/');

                    exec(server + '/py/baja/bigwig/view-narrowpeak.py', em, epath, range.start,
                        range.end, selectedTrack.chr).then(async res => {
                            let rv = JSON.parse(res.values);

                            let rs_base = element.path.split('.bw')[0]
                            let layer = new TrackLayer(rs_base, selectedTrack.xi, 0, selectedTrack.xf, 1)
                            let index = 0;
                            function createPolygonPointsFromPeaks(peaks) {
                                let points = [];
                                peaks.forEach(peak => {
                                    let startPoint = { x: peak.start, y: peak.signalValue };
                                    let endPoint = { x: peak.end, y: peak.signalValue };
                                    points.push(startPoint, endPoint);
                                });
                                return points;
                            }
                            let rv1 = createPolygonPointsFromPeaks ( rv );
                            let max_exp = Math.max(...rv1.map((tuple) => tuple[1]))
                            if (!max_exp) { max_exp = 1.0 }
                            layer.addPolygonPoint(range.start, 0 / max_exp * -1)
                            for (let v of rv) {
                                if (v === NaN) {
                                    v = 0;
                                }
                                layer.addPolygonPoint(v.start, peak.signalValue)
                                index++;
                            }
                            layer.sortPolygonPoints();
                            selectedTrack.addLayer(layer)
                            let button_canvas = await exec('screen/controls/navigation-panel.js', graph)
                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel');
                            CurrentLayout.setComponent('buttonMenuPanel', button_canvas);

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

    let tracks = graph.track;
    for (let t of tracks) {
        if (t.markstart > 0 && t.markend > t.markstart) {
            loadTrackData(t).then(r = () => {
                graph.setMessage(" Data loaded ")
            })
            return;
        }
    }

    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.setMessage(" Select a track... ")
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })

    let host_ = window['env']['apiUrl']
    let selectedTrack = null;
    let menuList = []
    menuList.push({
        label: 'RNASeq layer',
        click: async (xwc, ywc) => {
            for (let as of selectedTrack.annotations) {
                if (as.type == 'NMD') {
                    selectedTrack.removeAnnotation(as)
                }
            }
            let t = selectedTrack;
            if (t.chr === undefined || t.chr === null) {
                graph.setMessage(t.name + "track does not have chromosome defined in this track. (" + t.chr + ")")
            } else {

                loadTrackData(t);

            }
        },
        move: () => {
            log('')
        }

    })

    menuList.push({
        label: 'Edit Layer',
        click: async (xwc, ywc) => {
            let track_layers_panel = await exec('baja/screens/menu/select-track-action-layers-edit-panel.js', selectedTrack, genegraph_panel_layout)
            CurrentLayout.clearComponent('mainPanel')
            CurrentLayout.setComponent('mainPanel', track_layers_panel);

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
