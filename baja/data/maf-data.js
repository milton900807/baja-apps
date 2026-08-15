function (datapath, server, graph, genegraph_panel_layout) {
    return new Promise(async (resolve, reject) => {
        let columns = 4;
        if (isMobile()) {
            columns = 1;
        }

        let loadmode = 'all'

        let ww = {
            wid: 'simple-file-browser',
            width: '100%',
            height: '100%',
            data: {
                width: '100%',
                drive: 'bigdata',
                server: server,
                columns: columns,
                filetype: '.maf',
                user: getUser(),
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

                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    CurrentLayout.setComponent('buttonMenuPanel', w);

                    let found = false;
                    let selected_sequence = false;
                    for (let track of graph.track) {
                        if (track.isSelected()) {
                            found = true;
                        }

                        let hseq = track.getHighlightedSequence();
                        if (hseq != null && hseq.length > 0) {
                            found = true;
                            selected_sequence = true;
                        }
                    }

                    if (!found && loadmode === 'selected_only') {
                        infoPrompt('Click on a track to load MAF data...')
                        return;
                    }
                    for (let __selectedTrack of graph.track) {
                        if (loadmode === 'selected_only') {
                            if (__selectedTrack.isSelected() || __selectedTrack.getHighlightedSequence() != null) {
                                if (__selectedTrack.track_type === 'CDNA') {
                                    await loadExonData(__selectedTrack, element)
                                } else {
                                    await loadData(__selectedTrack, element)
                                }
                            }

                        } else {

                            if (__selectedTrack.track_type === 'CDNA') {
                                await loadExonData(__selectedTrack, element)
                            } else {
                                await loadData(__selectedTrack, element)

                            }

                        }

                        graph.setMessage("RNASeq data added to  " + __selectedTrack.name);

                    }
                    let button_canvas = await exec('manchester/controls/navigation-panel.js', graph)
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel');
                    CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
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

                        {
                            'title': ' ', 'body': ``,
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: `

                                Select a .bw file above.

                                <hr>  `
                            }
                        },

                        {
                            'width': '100%',
                            "style.padding-top": '1px',
                            'title': '',
                            'component': {
                                'wid': 'radio-buttons',
                                'data': [
                                    {
                                        label: 'Apply to all tracks',
                                        ionfunction: createIonFunction(() => {
                                            loadmode = 'all'
                                        })
                                    },
                                    {
                                        label: 'Apply data to selected tracks+sequence only',
                                        ionfunction: createIonFunction(() => {
                                            loadmode = 'selected_only'
                                        })
                                    },
                                ]
                            }
                        },

                    ]
                ]
            }
        }
        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', bwpanel);

        graph.clearMouseListeners();
        graph.addMouseMoveListener((x, y) => {

            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                let selectedTrack = graph.track[trackIndex]
                if (selectedTrack)
                    selectedTrack.select();
            }

        })
        graph.addMouseDownListener((x, y) => {
            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                let selectedTrack = graph.track[trackIndex]
                if (selectedTrack) {
                    selectedTrack.select();
                    loadTrackData(selectedTrack)
                }
                graph.clearMouseListeners();
                graph.setMouseMode('navigate')

            }

        })

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
            let res = await exec(server + '/py/baja/maf/maf-to-polygon.py', em, epath, range.start,
                range.end, __selectedTrack.chr);

            try {

                let rv = JSON.parse(res.values);
                let rs_base = element.path.split('.bw')[0]
                let layer = new TrackLayer(rs_base, __selectedTrack.xi, 0, __selectedTrack.xf, 1)
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
                __selectedTrack.addLayer(layer)

            } catch (exception) {
                graph.setMessage(" faield to load for " + __selectedTrack.name)

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
    })
}
