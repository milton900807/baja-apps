function (datapath, server, graph, genegraph_panel_layout) {

    console.log(" we have the rna binding proteins menu " + graph)
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.setMouseMode('select-track')

    graph.setMessage(" Select a track... ")
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })
    let selectedTrack = null;
    let menuList = []

    let fix = (ochr) => {
        console.log(ochr)
        const regex = /^chrx$/i;
        const regey = /^chry$/i;
        if (regex.test(ochr)) {
            return 'X';
        }
        else if (regey.test(ochr)) {
            return 'Y'
        }
        else {

            return ochr;
        }
    }

    menuList.push({
        label: 'RNA binding data',
        click: async (xwc, ywc) => {

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
                log(server)
                let ww = {
                    wid: 'simple-file-browser',
                    width: '100%',
                    height: '100%',
                    data: {
                        width: '100%',
                        drive: 'bigdata',
                        server: server,
                        user: getUser(),
                        columns: columns,
                        root: datapath,
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
                            let t_offset = 0.001;
                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                            CurrentLayout.setComponent('buttonMenuPanel', w);
                            let em = new EngineMonitor((msg) => {
                                log(msg)
                            });
                            let epath = '/bd/' + element.path;
                            epath = epath.replace(/\/+/g, '/');

                            let r = await exec(server + '/py/bio/rna-binfing-motif.py', em, epath, 'chr' + fix(t.chr), range.start, range.end, t.strand);
                            let values = r['results']
                            if (values !== null && values.length > 0) {
                                graph.setMessage(" Found : " + values.length + ' binding proteins for this track. ')
                                let layer = new TrackLayer(element.path, range.start, 0, range.end, 1)
                                for (let v of values) {
                                    let start = v['start']
                                    let stop = v['end']
                                    let name = v['name']
                                    let strand = v['strand']
                                    let yv = Math.random() * 0.95;
                                    layer.addInterval(start, stop, yv + (yv * t_offset), name + `(${strand})`)
                                }
                                t.addLayer(layer)

                            } else {
                                graph.setMessage(" Found  0  for this track")
                            }

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
