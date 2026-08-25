function (datapath, server, graph, genegraph_panel_layout) {
    graph.setMouseMode('msg: click on track')

    console.log(" we have the rna binding proteins menu " + graph)
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();

    graph.setMessage(" Select a track... ")
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })


    function convertToLocal(x, gxi, gxf, xi, xf) {
        return xi + ((x - gxi) * (xf - xi)) / (gxf - gxi);
    }


    let selectedTrack = null;
    let menuList = []
    menuList.push({
        label: 'Plot IP sequences on track',
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
                        user: getUser(),
                        server: server,
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

                            let r = await exec(server + '/py/bio/ipbedloader.py', em, epath, 'chr' + t.chr, range.start, range.end, t.strand);

                            let values = r['results'];

                            if (values !== null && values.length > 0) {
                                graph.setMessage(" Found : " + values.length + ' hits for this track. ')
                                let layer = new TrackLayer(element.path, range.start, 0, range.end, 1)
                                layer.setLabelFont('10px serif')
                                layer.setDefaultColor("rgba(0,100,155,0.1")
                                let ac = []

                                for (let v of values) {
                                    let start = v['start']
                                    let stop = v['end']

                                    let name = v['ra']

                                    // If ra is in key=value;key=value format, show the applicant
                                    // and the filing date (prefer a full filing date; fall back to
                                    // a plain year, then the col-9 'dt' field).
                                    if (name && name.includes('=')) {
                                        const attr = (k) => { let m = name.match(new RegExp('(?:^|;)' + k + '=([^;]*)')); return m ? m[1].trim() : '' }
                                        let applicant = attr('applicant') || attr('assignee') || attr('owner')
                                        let filing = attr('filing_date') || attr('filing') || attr('date') || attr('year') || ('' + (v['dt'] || '')).trim()
                                        if (applicant || filing) {
                                            name = applicant
                                            if (filing) name += (applicant ? ' ' : '') + '(' + filing + ')'
                                        }
                                    }

                                    if (v['rt']) {
                                        name += '\n' + v['rt']
                                    }
                                    if (v['rl']) {
                                        name += '\n' + v['rl']
                                    }

                                    let yv = layer.getYByOverlapCount(start, stop)
                                    if (!ac.includes(v['ra'])) {
                                        ac.push(v['ra'])
                                        layer.addInterval(start, stop, yv + (yv * t_offset), name)
                                    }
                                }

                                graph.setMouseMode('navigate')
                                t.addLayer(layer)
                                layer.setTimedHighlight(10000)
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
        label: 'Plot IP sequences in exon space',
        click: async (xwc, ywc) => {
            let TrackLayer = await exec('baja/bio/track-layer.js');
            let t = selectedTrack;

            if (t.chr === undefined || t.chr === null) {
                graph.setMessage(t.name + " track does not have chromosome defined. (" + t.chr + ")");
                return;
            }

            let range = {
                start: t.xi,
                end: t.xf,
            };

            if (t.markstart > 0 && t.markend > t.markstart) {
                range.start = t.markstart;
                range.end = t.markend;
            }

            let columns = isMobile() ? 1 : 4;

            let ww = {
                wid: 'simple-file-browser',
                width: '100%',
                height: '100%',
                data: {
                    width: '100%',
                    drive: 'bigdata',
                    user: getUser(),
                    server: server,
                    columns: columns,
                    root: datapath,

                    "ionfunction.fileClick": createIonFunction(async (element) => {
                        let progressBar;

                        CurrentLayout.clearComponent('mainPanel');
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                        let em = new EngineMonitor((msg) => {
                            log(msg);
                        });

                        let epath = '/bd/' + element.path;
                        epath = epath.replace(/\/+/g, '/');

                        let exons = t.getExons();

                        if (!exons || exons.length === 0) {
                            graph.setMessage("No exons found for this track.");
                            return;
                        }

                        const minGxi = exons.reduce((min, exon) => Math.min(min, exon.gxi), Infinity);
                        const maxGxf = exons.reduce((max, exon) => Math.max(max, exon.gxf), -Infinity);



                        let r = await exec(
                            server + '/py/bio/ipbedloader.py',
                            em,
                            epath,
                            'chr' + t.chr,
                            minGxi,
                            maxGxf,
                            t.strand
                        );

                        let values = r.results;

                        if (!values || values.length === 0) {
                            graph.setMessage("No IP hits found for this track.");
                            return;
                        }

                        let layer = new TrackLayer(element.path + ' exon-space IP', 0, 0, t.sequence.length, 1);
                        layer.setLabelFont('10px serif');
                        layer.setDefaultColor("rgba(0,100,155,0.1)");
                        layer.data_type = 'IPExonSpace';

                        let added = new Set();
                        let t_offset = 0.001;

                        debugger;

                        for (let v of values) {
                            let hitStart = v.start;
                            let hitEnd = v.end;

                            for (let exon of exons) {
                                // Only keep hits that overlap this exon in genomic space
                                let overlapStart = Math.max(hitStart, exon.gxi);
                                let overlapEnd = Math.min(hitEnd, exon.gxf);

                                if (overlapEnd <= overlapStart) {
                                    continue;
                                }

                                // Convert genomic overlap into exon-local track coordinates
                                let localStart = convertToLocal(
                                    overlapStart,
                                    exon.gxi,
                                    exon.gxf,
                                    exon.xi,
                                    exon.xf
                                );

                                let localEnd = convertToLocal(
                                    overlapEnd,
                                    exon.gxi,
                                    exon.gxf,
                                    exon.xi,
                                    exon.xf
                                );

                                let x1 = Math.min(localStart, localEnd);
                                let x2 = Math.max(localStart, localEnd);

                                let name = v.ra || '';

                                // Show the applicant + filing date (prefer a full filing date;
                                // fall back to a plain year, then the col-9 'dt' field).
                                if (name && name.includes('=')) {
                                    const attr = (k) => { let m = name.match(new RegExp('(?:^|;)' + k + '=([^;]*)')); return m ? m[1].trim() : ''; };
                                    let applicant = attr('applicant') || attr('assignee') || attr('owner');
                                    let filing = attr('filing_date') || attr('filing') || attr('date') || attr('year') || ('' + (v.dt || '')).trim();
                                    if (applicant || filing) {
                                        name = applicant;
                                        if (filing) name += (applicant ? ' ' : '') + '(' + filing + ')';
                                    }
                                }

                                if (v.rt) {
                                    name += '\n' + v.rt;
                                }

                                if (v.rl) {
                                    name += '\n' + v.rl;
                                }

                                const key = [
                                    v.ra,
                                    exon.name,
                                    Math.round(x1),
                                    Math.round(x2)
                                ].join('|');

                                if (added.has(key)) {
                                    continue;
                                }

                                added.add(key);

                                let yv = layer.getYByOverlapCount(x1, x2);
                                layer.addInterval(
                                    x1,
                                    x2,
                                    yv + (yv * t_offset),
                                    name
                                );
                            }
                        }

                        graph.setMouseMode('navigate');
                        t.addLayer(layer);
                        layer.setTimedHighlight(10000);

                        graph.setMessage("Added exon-space IP hits: " + added.size);
                    }),

                    "ionfunction.openfile": createIonFunction(async (file, text) => { }),

                    "ionfunction.path": createIonFunction(async (path, nodes) => { })
                }
            };

            let ippanel = {
                wid: 'card',
                data: {
                    cards: [[
                        {
                            title: ' ',
                            body: '',
                            width: '100%',
                            component: {
                                wid: 'html',
                                data: '<hr>'
                            }
                        },
                        {
                            title: ' ',
                            body: '',
                            width: '100%',
                            component: {
                                wid: 'mt-button',
                                data: {
                                    buttons: [{
                                        label: 'Cancel',
                                        ionFunction: createIonFunction(async () => {
                                            CurrentLayout.clearComponent('mainPanel');
                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                        })
                                    }]
                                }
                            }
                        },
                        {
                            title: ' ',
                            body: '',
                            width: '100%',
                            component: ww
                        }
                    ]]
                }
            };

            CurrentLayout.clearComponent('mainPanel');
            CurrentLayout.setComponent('mainPanel', ippanel);
        },

        move: () => {
            log('');
        }
    });
    menuList.push({
        label: 'Edit Layer',
        click: async (xwc, ywc) => {
            let track_layers_panel = await exec('baja/manchester/menu/select-track-action-layers-edit-panel.js', selectedTrack, genegraph_panel_layout)
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
            graph.showMenu(menuList, x, y, 400)
    });

}
