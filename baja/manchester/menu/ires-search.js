function (graph) {
    let md = false;
    graph.clearMouseListeners();
    graph.selectOff();
    let selected = null;
    let selected_track;
    let working = false;

    graph.addMouseDownListener(async (x, y) => {
        md = true;
        let stru = graph.getTrack(x, y)
        if (stru >= 0) {
            selected_track = graph.track[stru];
            selected_track.select();
        }
        if (!selected_track) {
            graph.setMessage("Click on a track")
        } else {
            let menuList = [
            ]
            if (selected_track) {
                menuList.push(
                    {
                        label: 'IRES similarity search',
                        click: async (xwc, ywc) => {
                            let sl = selected_track;
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
                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                            CurrentLayout.setComponent('buttonMenuPanel', w);
                            let slice = '';

                            let editor_;
                            let annotation_editor = createIonFunction(async (editor) => {
                                editor_ = editor;
                                editor.code = slice;
                            })
                            let seq = sl.sequence;
                            if (!seq) {
                                prompt(" No sequence found on track")
                            } else {
                                let range = {
                                    start: sl.xi,
                                    end: sl.xf,
                                }
                                let TrackLayer = await exec('baja/bio/track-layer.js')
                                let em = new EngineMonitor((msg) => {
                                    log(msg)
                                });
                                em.addProgressListener((v) => {
                                    progressBar(v);
                                })
                                graph.clearMouseListeners();
                                graph.selectOff();
                                working = true;
                                let r = await exec(window['env']['apiUrl'] + '/py/baja/rna-structure.py', em, seq, 'test');
                                let layers = {}
                                for (let v of r) {
                                    let index = +v['index']
                                    let le = +v['le']
                                    let id = v['id']
                                    let sequence = v['sequence']
                                    let layer = layers[id]
                                    if (layer == null) {
                                        layer = new TrackLayer(index + '' + id, range.start, 0, range.end, 10)
                                        layer.color = 'blue'
                                        if ( index % 3 === 0){
                                            layer.color = "magenta"
                                        }
                                        layers[id] = layer;
                                    }
                                    if (layer)
                                        layer.addPolygonPoint(index, le)
                                }
                                let ol = Object.keys(layers)
                                for (let o of ol) {
                                    let layer = layers[o]
                                    if (layer && sl)
                                        sl.addLayer(layer)
                                }

                                working = false;
                                showModal({
                                    wid: 'json',
                                    data: JSON.stringify(r)
                                })
                            }
                        },
                        move: () => {
                        }

                    })
                graph.showMenu(menuList, x, y, 200)

            }
        }
    });
    graph.addMouseMoveListener((x, y) => {
        if (graph.menuVisible()) {
            return;
        }
        graph.selectOff();

        let stru = graph.getTrack(x, y)
        if (stru >= 0) {
            selected_track = graph.track[stru];
            selected_track.select();
        }
        if (!selected) {
            graph.setMessage("Click on a track")
        }

    });
    graph.addMouseUpListener((x, y) => {
        md = false;
        if (graph.menuVisible()) {
            graph.hideMenu();
            return;
        }

    });

}
