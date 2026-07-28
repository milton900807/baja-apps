function (datapath, server, graph, genegraph_panel_layout) {
    return new Promise(async (resolve, reject) => {
        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
        graph.setMouseMode ('select-track')
        graph.selectOff();
        graph.setMessage(" Select a track... ")
        let selectedTrack = null;
        let menuList = []
        function convertToLocal(x, gxi, gxf, xi, xf) {
            return xi + ((x - gxi) * (xf - xi)) / (gxf - gxi);
        }
        function convertToGlobal(x, gxi, gxf, xi, xf) {

            return gxi + ((x - xi) * (gxf - gxi)) / (xf - xi);
        }
        const colors = [
            '#FF5733',
            '#33FF57',
            '#3357FF',
            '#F33FF5',
            '#33F5FF',
            '#F5FF33',
            '#FF8333',
            '#8333FF',
            '#3FF573',
            '#5733FF'
        ];

        function getColorByNumber(number) {

            if (number > 10)
                number = 1;

            if (number < 1 || number > 10) {
                throw new Error('Number must be between 1 and 10.');
            }

            return colors[number - 1];
        }

        let loadData = async (__selectedTrack, element) => {
            let TrackLayer = await exec('baja/bio/track-layer.js')

            let em = new EngineMonitor((msg) => {
                log(msg)
            });
            let epath = '/bd/' + element.path;
            epath = epath.replace(/\/+/g, '/');

            let range = {
                start: __selectedTrack.xi,
                end: __selectedTrack.xf,
            }
            if (__selectedTrack.markstart > 0 && __selectedTrack.markend > __selectedTrack.markstart) {
                range.start = __selectedTrack.markstart;
                range.end = __selectedTrack.markend;
            }

            let fix = (ochr) => {
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

            let res = await exec(server + '/py/baja/bigwig/view-bigwig.py', em, epath, range.start,
                range.end, fix(__selectedTrack.chr));

            try {

                console.log('debubg');
                let rv = JSON.parse(res.values);
                let rs_base = element.path.split('.bw')[0]
                let layer = new TrackLayer(rs_base, __selectedTrack.xi, 0, __selectedTrack.xf, 1)
                let index = 0;
                layer.data_type = "RNASeq"

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
                __selectedTrack.addLayer(layer)

            } catch (exception) {
                console.log(" faield to load for " + __selectedTrack.name)

            }

        }

        let loadExonData = async (selectedTrack, element) => {
            let TrackLayer = await exec('baja/bio/track-layer.js')

            let range = {
                start: selectedTrack.xi,
                end: selectedTrack.xf,
            }
            if (selectedTrack.markstart > 0 && selectedTrack.markend > selectedTrack.markstart) {
                range.start = selectedTrack.markstart;
                range.end = selectedTrack.markend;
            }
            let em = new EngineMonitor((msg) => {
                log(msg)
            });
            let epath = '/bd/' + element.path;
            epath = epath.replace(/\/+/g, '/');

            let exons = selectedTrack.getExons();
            let index = 1;

            const exonWithLowestGxi = exons.reduce((lowest, exon) => {
                return (lowest === null || exon.gxi < lowest.gxi) ? exon : lowest;
            }, null);

            function findHighestGxf(exons) {
                const exonWithHighestGxf = exons.reduce((highest, exon) => {
                    return (highest === null || exon.gxf > highest.gxf) ? exon : highest;
                }, null);

                return exonWithHighestGxf ? exonWithHighestGxf.gxf : null;
            }

            const highestGxf = findHighestGxf(exons);
            for (let exon of exons) {
                let color = getColorByNumber(index)
                index++;
                if (index > 10) {
                    index = 1;
                }
                exec(server + '/py/baja/bigwig/view-bigwig.py', em, epath, exon.gxi,
                    exon.gxf, selectedTrack.chr).then(async res => {
                        try {
                            let rv = JSON.parse(res.values);
                            let rs_base = element.path.split('.bw')[0]
                            let layer = new TrackLayer(exon.name + rs_base, 0, 0, selectedTrack.sequence.length, 1)
                            let index = 0;
                            layer.data_type = 'RNASeq'
                            layer.fillstyle = color;

                            let max_exp = rv.reduce((max, tuple) => Math.max(max, tuple[1]), -Infinity);
                            if (!max_exp) { max_exp = 1.0 }
                            layer.addPolygonPoint(convertToLocal(exon.gxi, exon.gxi, exon.gxf, exon.xi, exon.xf), 0 / max_exp * -1)
                            for (let v of rv) {
                                if (v === NaN) {
                                    v = 0;
                                }

                                layer.addPolygonPoint(convertToLocal(v[0], exon.gxi, exon.gxf, exon.xi, exon.xf), v[1] / max_exp)
                                index++;
                            }
                            layer.addPolygonPoint(convertToLocal(exon.gxf, exon.gxi, exon.gxf, exon.xi, exon.xf), 0 / max_exp * -1)
                            layer.sortPolygonPoints();
                            selectedTrack.addLayer(layer)
                        } catch (exception) {
                            graph.setMessage(" Failed to load " + selectedTrack.name)
                        }

                    })
            }
        }

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
            label: 'Add RNASeq',
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
                            filetype: '.bw',
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

                                if (selectedTrack.isSelected() || selectedTrack.getHighlightedSequence() != null) {
                                    if (selectedTrack.track_type === 'CDNA') {
                                        await loadExonData(selectedTrack, element)
                                    } else {
                                        await loadData(selectedTrack, element)
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

    })
}
