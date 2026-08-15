function (graph) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.setMessage(" Select a track... ")
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })

    let host_ = window['env']['apiUrl']
    GETJSON(host_ + '/list-installed-files').then(async rs => {

        let selectedTrack = null;

        let menuList = []

        menuList.push({
            label: 'RNASeq...',
            click: async (xwc, ywc) => {
                for (let as of selectedTrack.annotations) {
                    if (as.type == 'NMD') {
                        selectedTrack.removeAnnotation(as)
                    }
                }
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
                let TrackLayer = await exec('baja/bio/track-layer.js')
                let em = new EngineMonitor((msg) => {
                    log(msg)
                });
                em.addProgressListener(async (v) => {
                    if (v >= 100) {
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')

                    }
                    progressBar(v);
                })
                let t = selectedTrack;

                if (t.chr === undefined || t.chr === null) {
                    graph.setMessage(t.name + "track does not have chromosome defined in this track. (" + t.chr + ")")
                } else {

                    let range = {
                        start: t.xi,
                        end: t.xf,
                    }

                    console.log(" Track name : " + t.name);
                    console.log(" diff " + (range.end - range.start))

                    let rnaseq_files = rs.filter((a) => a.includes("_RNASEQ.bw"))

                    if (rnaseq_files.length < 1) {
                        graph.setMessage('No installed RNA-seq files on server.');
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel');

                    } else {

                        rnaseq_files.sort();
                        let ms = {
                            wid: 'multi-select',
                            height: '100px',
                            data: {
                                showButton: true,
                                list: rnaseq_files, buttonFunction: createIonFunction((items) => {
                                    let e = []
                                    let ke = Object.keys(items);
                                    for (let i of ke) {
                                        let value = items[i];
                                        if (value) {
                                            e.push(i);
                                        }
                                    }
                                    selected_rnaseq = e;

                                    for (let rs of selected_rnaseq) {
                                        console.log(rs)
                                        let rs_base = rs.split('.bw')[0]

                                        exec('py/baja/bigwig/view-bigwig.py', em, rs, range.start, range.end, t.chr).then(res => {

                                            console.log(res)
                                            try {

                                                let rv = JSON.parse(res.values);

                                                let layer = new TrackLayer(rs_base, range.start, 0, range.end, 1)
                                                let index = 0;

                                                let max_exp = rv.reduce((max, tuple) => Math.max(max, tuple[1]), -Infinity);

                                                if (!max_exp) { max_exp = 1.0 }

                                                layer.addPolygonPoint(range.start, 0 / max_exp * -1)

                                                for (let v of rv) {
                                                    if (v === NaN) {
                                                        v = 0;
                                                    }

                                                    layer.addPolygonPoint(v[0], v[1] / max_exp * -1.)
                                                    index++;
                                                }

                                                layer.addPolygonPoint(range.end, 0 / max_exp * -1)

                                                layer.sortPolygonPoints();
                                                t.addLayer(layer)
                                            } catch (exception) {

                                                graph.setMessage ( " Failed on " + t.name )

                                            }
                                        })
                                    }
                                    hideAllModal();
                                })
                            }
                        }
                        await showModal(ms)
                    }
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
    })

}
