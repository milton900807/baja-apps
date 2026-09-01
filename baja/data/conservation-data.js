function (graph, genegraph_panel_layout, tracks, datapath, server) {

    // Conservation — a bigwig browser whose chosen file is laid over the tracks as a
    // coverage layer.
    //   exec('baja/data/conservation-data.js', graph, genegraph_panel_layout, tracks)
    //
    // The parameter order used to be (datapath, server, graph, layout), and the one caller
    // in baja/data/data-library.js passed (graph, L) -- so datapath got the graph, server got
    // the layout, and graph itself was undefined. Nothing here could ever have run. The
    // signature now matches every other data loader, and the two optional trailing arguments
    // fall back to the values that call was never supplying.
    server = server || (window['env'] && window['env']['apiUrl']) || '';
    datapath = datapath || 'Conservation';

    return new Promise(async (resolve, reject) => {
        // mRNA vs pre-mRNA decides the coordinate mapping, the same question the other
        // loaders ask. Falls back to the old track_type check for anything that predates
        // the method.
        const __isSpliced = (t) => {
            try {
                if (t && typeof t.isSplicedTranscript === 'function') return t.isSplicedTranscript();
            } catch (e) { }
            return !!(t && t.track_type === 'CDNA');
        };

        // The tracks this load applies to: the explicit list when one was handed down,
        // otherwise everything on the board.
        const __universe = () => ((Array.isArray(tracks) && tracks.length) ? tracks.filter(Boolean) : (graph.track || []));
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
                user: getUser(),
                columns: columns,
                filetype: '.bw',
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

                    if (!found && loadmode == 'selected_only') {
                        infoPrompt('Click on a track to load Conservation data...')
                        return;
                    }
                    let TrackLayer = await exec('baja/bio/track-layer.js')
                    const __list = __universe();
                    // One history entry for the whole load, so a single undo takes it all back.
                    try { graph.pushOntoHistory(); } catch (e) { }
                    let __done = 0;
                    for (let i = 0; i < __list.length; i++) {
                        const __selectedTrack = __list[i];
                        if (!__selectedTrack) continue;
                        try {
                            window.__workStatus = 'Conservation · ' + (__selectedTrack.name || ('track ' + (i + 1)))
                                + ' · ' + (i + 1) + ' of ' + __list.length + '…';
                            if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                        } catch (e) { }
                        if (loadmode === 'selected_only') {
                            if (__selectedTrack.isSelected() || __selectedTrack.getHighlightedSequence() != null) {
                                // Spliced -> exon-aware (loadExonData); unspliced -> linear
                            // (loadData). Was keyed on track_type === 'CDNA', which only the
                            // buildCdna path sets: a transcript loaded by Ensembl id carries
                            // no track_type at all and took the linear branch even when its
                            // sequence was the spliced mRNA. isSplicedTranscript asks what
                            // the sequence actually is.
                            if (__isSpliced(__selectedTrack)) {
                                    await loadExonData(__selectedTrack, element)
                                } else {
                                    await loadData(__selectedTrack, element)
                                }
                                __done++;
                            }
                        } else {
                            // Spliced -> exon-aware (loadExonData); unspliced -> linear
                            // (loadData). Was keyed on track_type === 'CDNA', which only the
                            // buildCdna path sets: a transcript loaded by Ensembl id carries
                            // no track_type at all and took the linear branch even when its
                            // sequence was the spliced mRNA. isSplicedTranscript asks what
                            // the sequence actually is.
                            if (__isSpliced(__selectedTrack)) {
                                await loadExonData(__selectedTrack, element)
                            } else {
                                await loadData(__selectedTrack, element)
                            }
                            __done++;
                        }
                    }
                    try {
                        window.__workStatus = '';
                        if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                    } catch (e) { }
                    // setResultMessage, not setMessage: the canvas draws only error and result
                    // toasts, so the per-track line inside the loop was never visible.
                    const __msg = ' Conservation applied to ' + __done + ' of ' + __list.length
                        + ' track' + (__list.length === 1 ? '' : 's') + '. ';
                    try { graph.setResultMessage(__msg); } catch (e) { graph.setMessage(__msg); }
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
                                wid: 'title',
                                data: '<h3> Select a .bw file. </h3> <hr>'
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
                                            label: 'Cancel and return to design', ionFunction: createIonFunction(async () => {
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

                                <hr>

                                `
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
        graph.setMouseMode('select-track')
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

        let loadData_dep = async (__selectedTrack, element) => {
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
            let res = await exec(server + '/py/baja/bigwig/view-bigwig.py', em, epath, range.start,
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
                console.log(" faield to load for " + __selectedTrack.name)
            }
        }

        let loadData = async (selectedTrack, element) => {
            for (let as of selectedTrack.annotations) {
                if (as.type == 'NMD') {
                    selectedTrack.removeAnnotation(as)
                }
            }
            let TrackLayer = await exec('baja/bio/track-layer.js')

            let range = {
                start: selectedTrack.xi,
                end: selectedTrack.xf,
            }
            // markend > markstart, not just > 0: the other two checks in this file already
            // read it that way, and an inverted drag would otherwise ask for a backwards range.
            if (selectedTrack.markstart > 0 && selectedTrack.markend > selectedTrack.markstart) {
                range.start = selectedTrack.markstart;
                range.end = selectedTrack.markend;
            }
            let t = selectedTrack;
            if (t.chr === undefined || t.chr === null) {
                graph.setMessage(t.name + "track does not have chromosome defined in this track. (" + t.chr + ")")
            }
            let em = new EngineMonitor((msg) => {
                log(msg)
            });

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

            exec(server + '/py/baja/bigwig/view-bigwig.py', em, '/bd/' + element.path, range.start, range.end, fix(t.chr)).then(async res => {

                try {
                    let rv = JSON.parse(res.values);
                    let rs_base = element.path.split('.bw')[0]
                    let layer = new TrackLayer(rs_base, selectedTrack.xi, 0, selectedTrack.xf, 1)
                    let index = 0;
                    layer.fillstyle = 'rgba(0,0,100,0.4)'

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
                } catch (exception) {
                    graph.setMessage(" Failed to load for " + __selectedTrack.name)
                }

            })
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
                            let rs_base = element.path.split('.bw')[0]
                            let layer = new TrackLayer(exon.name + rs_base, 0, 0, selectedTrack.sequence.length, 1)
                            let index = 0;
                            console.log('debubg');
                            let rv = res.values;
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
                            graph.setMessage(" Failed to load for " + exception)
                        }
                    })
            }
        }
    })
}
