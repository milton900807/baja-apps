function (graph, library, folder) {
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
            label: 'Load bed...',
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

                em.addProgressListener(async(v) => {
                    if (v >= 100) {
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        let hl = await exec('baja/manchester/menu/splicing-tools.js', graph, library.id, folder.id)
                        CurrentLayout.setComponent('buttonMenuPanel', hl);
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

                    let eclip_files = rs.filter((a) => a.includes("_ECLIP.bed"))

                    if (eclip_files.length < 1) {

                        graph.setMessage('No installed eCLIP-seq files on server.');
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel');

                    } else {

                        eclip_files.sort();
                        let ms = {
                            wid: 'multi-select',
                            height: '100px',
                            data: {
                                showButton: true,
                                list: eclip_files, buttonFunction: createIonFunction((items) => {
                                    let e = []
                                    let ke = Object.keys(items);
                                    for (let i of ke) {
                                        let value = items[i];
                                        if (value) {
                                            e.push(i);
                                        }
                                    }
                                    selected_eclip = e;
                                    for (let ec of selected_eclip) {
                                        console.log(ec)
                                        let ec_base = ec.split('.bed')[0]

                                        exec('py/baja/bed/view-bed.py', em, ec, range.start, range.end, t.chr, t.strand).then(res => {

                                            console.log(res)
                                            let rv = JSON.parse(res.values)

                                            let layer = new TrackLayer(ec_base, range.start, 0, range.end, 1)

                                            let t_offset = 0;
                                            for (let tl of t.track_layers) {
                                                if (tl.name.includes('ECLIP')) {
                                                    t_offset += 1;
                                                }
                                            }

                                            for (let v of rv) {
                                                if (v === NaN) {
                                                    v = 0;
                                                }

                                                layer.addInterval(v[0], v[1], 0.03125 + (0.03125 * t_offset), v[2])
                                            }
                                            t.addLayer(layer)

                                        })
                                    }
                                    hideAllModal();
                                })
                            }
                        }
                        showModal(ms)
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
            ywc = y;
            let editor;
            let typeAhead;
            let type_ahead = createIonFunction((ref) => {
                typeAhead = ref;
            })

            let cb3 = createIonFunction((ref) => {
                editor = ref;
            })

            if (selectedTrack)
                graph.showMenu(menuList, x, y)
        })
    })

}
