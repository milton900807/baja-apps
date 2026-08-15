function (datapath, server, graph, genegraph_panel_layout) {

    return new Promise(async (x, y) => {
        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.setMessage(" Select a track... ")
        let TrackLayer = await exec('baja/bio/track-layer.js')

        let main = async (selectedTrack, element) => {
            let t = selectedTrack;
            if (t.chr === undefined || t.chr === null) {
                graph.setMessage(t.name + "track does not have chromosome defined in this track. (" + t.chr + ")")
            } else {

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
                let r = await exec(server + '/py/bio/rna-binfing-motif.py', em, epath, 'chr' + t.chr, range.start, range.end, t.strand);
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

                }else {
                    graph.setMessage(" Found  0  for this track")
                }

            }
        }

        let mainExons = async (selectedTrack, element) => {
            let t = selectedTrack;
            if (t.chr === undefined || t.chr === null) {
                graph.setMessage(t.name + "track does not have chromosome defined in this track. (" + t.chr + ")")
            } else {

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

                let r = await exec(server + '/py/bio/rna-binfing-motif.py', em, epath, 'chr' + t.chr, range.start, range.end, t.strand);
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

                }else {
                    graph.setMessage(" Found  0  for this track")
                }

            }
        }

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
                server: server,
                columns: columns,
                user: getUser(),
                root: datapath,
                "ionfunction.fileClick": createIonFunction(async (element) => {

                    for (let t of graph.track) {
                        if (t.isSelected()) {
                            console.log('debubg');
                            if (t.chr === undefined || t.chr === null) {
                                graph.setMessage(t.name + "track does not have chromosome defined in this track. (" + t.chr + ")")
                            } else {
                                if (t.track_type === null)
                                    await loadTrackData(t);
                                else if (t.track_type === 'CDNA') {
                                    await mainExon(t, element)
                                }
                                else {
                                    await main(t, element)
                                }
                            }
                        }
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

    })
}
