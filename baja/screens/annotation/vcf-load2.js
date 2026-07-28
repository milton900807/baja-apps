function (graph, phasetarget) {
    graph.setMessage('Select a track to add vcf...')
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    let ed;
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })
    let start = -1;
    let end = -1;
    let highlight = false;
    let selectedTrack = null;

    graph.addMouseMoveListener((x, y) => {
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            let cselectedTrack = graph.track[trackIndex]
            if (cselectedTrack && selectedTrack != cselectedTrack) {
                if (selectedTrack)
                    selectedTrack.showResizeBar = false;
            }
            selectedTrack = cselectedTrack;
            if (selectedTrack)
                selectedTrack.showResizeBar = true;
        } else {
            graph.selectOff();
            selectedTrack = null;
        }
    })

    graph.addMouseDownListener((x, y) => {
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
        }
        ywc = y;
        if (highlight && selectedTrack) {
            if (start < 0) {
                let xsc = graph.X(x);
                selectedTrack.tgraph.rescale();
                console.log(xsc + ' xi : ' + selectedTrack.tgraph.xi);
                let t = selectedTrack.tgraph.xi;
                start = selectedTrack.tgraph.Xwc(x - t * 2);
                selectedTrack.markstart = start;
            }
            else if (start > 0 && end < 0) {
                let t = selectedTrack.tgraph.xi;
                end = selectedTrack.tgraph.Xwc(x - t * 2);
                selectedTrack.markend = end;
            }
            highlight_label = 'Clear highlight'

        } else {
            highlight_label = 'Highlight'
        }

        let menuList = [];

        if (selectedTrack) {
            menuList.push(
                {
                    label: 'Add VCF',
                    click: async () => {

                        function showfolder() {
                            return new Promise(async (resolve, reject) => {
                                let currentPath = null;
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
                                                    let button_canvas = await exec('screen/controls/navigation-panel.js', graph)

                                                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel');
                                                    CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                                                } catch (exception) {
                                                    graph.setMessage(" Failed to load for " + __selectedTrack.name)
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

                                showfolder().then(vcfString => {
                                    hideAllModal();
                                    exec('baja/screens/annotation/vcf-parse.js', selectedTrack, vcfString)
                                        .then(() => {
                                            if (phasetarget) {
                                                exec('baja/screens/annotation/set-targeted-variant.js', selectedTrack)
                                            } else {
                                            }
                                        })
                                        .catch(() => {
                                        });
                                })
                            })
                        }
                    }
                })
        }
    })
    graph.showMenu(menuList, x, y)
}
