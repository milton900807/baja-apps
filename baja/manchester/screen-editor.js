function (ensembl, track_init) {

    let c1;
    let graph;
    let io;
    let folder;
    let file;
    let files;
    let tracks;
    let add = (str) => {
        if ( !graph ){
            return;
        }

        if (str.startsWith('>')) {
            graph.fasta(str.trim());
        }
        else {
            graph.add(str)
        }
    }
    let zoom = (xi, xf) => {
        graph.zoom(xi, xf)
    }
    let experimentid = 'kras'
    exec('baja/lib/db.js').then(async (db) => {
        let track_items = []
        let working = await showWidget({
            wid: 'working'
        })

        try {
            let expdata = await db.load(experimentid);
            working.status = 'complete'
            if (expdata) {
                let values = expdata['values']
                let index = 0;
                for (let v of values) {

                    if (index > 0 && v[0] != null && v[0].length > 0) {
                        let t = {
                            'label': '' + v[0], 'ionfunction': createIonFunction(() => {

                                let jo = JSON.parse(v[1]);
                                graph.setTrack(jo);
                                graph.zoom(jo.xi, jo.xf)
                            })
                        }
                        track_items.push(t);
                    }
                    index++;
                }
                if (track_init) {
                    index = 0;
                    for (let v of values) {
                        if (index > 0 && v[0] != null && v[0].length > 0) {
                            let jo = JSON.parse(v[1]);

                            if (v[0] === track_init) {
                                graph.setTrack(jo);
                                graph.zoom(jo.xi, jo.xf)
                            }
                        }
                    }
                }
            }

        } catch (exception) {

        }

        let screen_algo = [];
        screen_algo.push({
            label: 'Microwalk', ionfunction: createIonFunction(async () => {

                let microwalk = await exec('baja/manchester/algorithms/microwalk.js', 'bottomPanel')

                CurrentLayout.clearComponent('bottomPanel2')

                CurrentLayout.setComponent('bottomPanel', {
                    wid: 'html',
                    data: ''
                })
                for (let item of microwalk) {
                    CurrentLayout.addComponent('bottomPanel', item);
                }

            })
        })

        let exptracks = {
            'label': 'Tracks', 'items': track_items
        }
        let screenActions = {
            label: 'Screening algorithms', 'items': screen_algo
        }

        showWidget({
            wid: 'menu',
            data: {
                menus: [
                    {
                        'label': 'Data', 'items': [
                            {
                                'label': 'Load experiment', 'ionfunction': createIonFunction(() => {
                                    exec('flexigraph/db.js').then(db => {
                                        clear();
                                        showWidget({
                                            wid: 'input-param-items',
                                            data: {
                                                input_labels: ['Experiment'],
                                                buttons: [{
                                                    'label': 'Open', 'function': createIonFunction((button_label, input_params) => {
                                                        clear();
                                                        exec('flexigraph/test2.js', input_params['Experiment'])
                                                    })
                                                }]
                                            }

                                        })
                                    })
                                })
                            },
                            {
                                'label': 'Load...', 'ionfunction': createIonFunction(() => {
                                    exec('flexigraph/db.js').then(db => {
                                        db.load('MT-EXP441').then(js => {
                                            if (js != null) {
                                                let val = js['values']
                                                if (val != null) {
                                                    for (let v of val) {
                                                        let j = v[1]
                                                        if (j != null) {
                                                            if (j.startsWith('{')) {
                                                                let jo = JSON.parse(j);
                                                                graph.addTrack(jo);

                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        })
                                    })
                                })

                            }, {
                                'label': 'Save', 'ionfunction': createIonFunction(() => {
                                    exec('flexigraph/db.js').then(db => {

                                        let tlist = []
                                        for (let t of tracks) {

                                            tlist.push(JSON.stringify(t))
                                        }
                                        let js = {
                                            'Tracks': tlist,
                                        }
                                        db.saveSet(js, 'MT-EXP441')
                                    })
                                })
                            }
                        ]
                    },
                    {
                        'label': 'Gene browser', 'items': [
                            {
                                'label': 'Zoom', 'ionfunction': createIonFunction(() => {

                                    let start = 0;
                                    graph.select();
                                    graph.addMouseDownListener((x, y) => {
                                        start = x;
                                    })
                                    graph.addMouseUpListener( async (x, y) => {
                                        if (start < x)
                                            await graph.zoomToSelection();
                                    })
                                })
                            },
                            {
                                'label': 'Select', 'ionfunction': createIonFunction(() => {
                                    io.appendCode(`graph.select ()`)
                                    io.execCode(`graph.select ()`)
                                })

                            },
                            {
                                'label': 'Annotate', 'ionfunction': createIonFunction(() => {
                                })

                            },
                        ],
                    },
                    exptracks,
                    screenActions
                ]
            }
        })

        exec('flexigraph/gene.js').then(async (geneGraph) => {
            graph = geneGraph;

            graph.addMouseListener((x, y) => {
                io.print(x + ',' + y)
            });

            graph.addListener((_tracks) => {
                tracks = _tracks;

                let index = 0;
                let s = 0;
                let f = 10000;
                for (let t of tracks) {
                    if (index === 0) {
                        s = t.xi;
                        f = t.xf;
                    }
                    if (s > t.xi) {
                        s = t.xi;
                    }
                    if (f < t.xf) {
                        f = t.xf
                    }
                }
                graph.zoom(s, f)
            })

            let button_canvas = await showWidget({
                wid: 'button-canvas',
                data: {
                    'title': 'controls',
                    'height': 50,
                    'grid': {
                        xmin: 0,
                        xmax: 40,
                        ymin: -0.01,
                        ymax: 1,
                        xinset: 0,
                        yinset: 0
                    },
                    'buttons': [
                        {
                            x: 0, y: 0, label: 'zoom out', ionFunction: createIonFunction(() => {

                                let l = (graph.getxmax() - graph.getxmin()) / 4;
                                graph.zoom(graph.getxmin() - l, graph.getxmax() - l);
                            }), icon: '/assets/img/icons/png/arrow-left-2x.png'
                        },
                        {
                            x: 1, y: 0, label: 'zoom out', ionFunction: createIonFunction(() => {
                                let l = (graph.getxmax() - graph.getxmin()) / 4;
                                graph.zoom(graph.getxmin() + l, graph.getxmax() + l);
                            }), icon: '/assets/img/icons/png/arrow-right-2x.png'
                        },
                        {
                            x: 2, y: 0, label: 'zoom out', ionFunction: createIonFunction(() => {
                                let l = (graph.getxmax() - graph.getxmin()) / 4;
                                graph.zoom(graph.getxmin() - l, graph.getxmax() + l);
                            }), icon: '/assets/img/icons/png/zoom-out-2x.png'
                        },
                        {
                            x: 3, y: 0, label: 'zoom in', ionFunction: createIonFunction(() => {

                                let l = (graph.getxmax() - graph.getxmin()) / 4;
                                graph.zoom(graph.getxmin() + l, graph.getxmax() - l);

                            }), icon: '/assets/img/icons/png/zoom-in-2x.png'
                        }
                    ]
                }
            })

            let html = '';

            let updateStatsPanel = () => {
                if (graph) {

                    let ht = '<hr>'
                    let index = 0;
                    let sum = 0;
                    for (let t of graph.track) {
                        ht += `Track${index}  ${t.oligos.length} <br>`
                        index++;
                        sum += t.oligos.length;
                    }
                    ht += ''

                    ht += '<hr>'

                    let plates = Math.ceil(sum / 78)
                    ht += `Plates: ${plates}`
                    graph.updateMessagePanel(ht)
                }
            }

            setInterval(() => {
                updateStatsPanel();
            }, 3000)

            let Biopolymer = await exec('baja/chem/biopolymer.js');

            let CreateCompound = (chem_template, track, tstart, y) => {

                if (!y) {
                    y = track.y;
                }

                tstart = Math.floor(tstart)
                let sequence_index = tstart - track.xi;

                let base_count = Biopolymer.countBases(chem_template);
                let sequence = track.getSequence();
                let subseq = sequence.substring(sequence_index, (sequence_index + base_count));
                let oligo = Biopolymer.create('aso', chem_template, subseq)
                let reverse_complament = oligo.chain_sequences[0]
                track.addOligo('' + reverse_complament, oligo.chains[0], tstart, base_count, y);

            }

            let innerComponentCallback = createIonFunction((editor) => {
                io = editor;
                if (ensembl)
                    editor.setContent(`add ('${ensembl}')`);
                editor.exec(
                    { "name": "graph", "object": graph },
                    { "name": "io", "object": io },
                    { 'name': 'file', 'object': file },
                    { 'name': 'files', 'object': files },
                    { 'name': 'track', 'object': tracks },
                    { 'name': 'add', 'object': add },
                    { 'name': 'zoom', 'object': zoom })
            })

            c1 = await showWidget({
                wid: 'card',

                data: {
                    cards: [
                        [
                            {
                                'title': ' ', 'body': `
                                            `,
                                'width': '100%',
                                'component':
                                {
                                    wid: 'text-editor',
                                    refCallback: innerComponentCallback,
                                    height: '100%',
                                    componentRef: 'bottomPanel',
                                    data: {
                                        mode: 'complex',
                                        editorOptions: { language: 'javascript', automaticLayout: true },
                                        libs: [
                                            { 'name': 'core', 'path': 'genome/lib/core.js' },
                                            { 'name': 'sample', 'path': 'genome/sample-gff.js' }
                                        ],
                                        keybinding: {
                                            'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {
                                                let wrapper = [
                                                    { "name": "graph", "object": graph },
                                                    { "name": "io", "object": io },
                                                    { 'name': 'file', 'object': file },
                                                    { 'name': 'files', 'object': files },
                                                    { 'name': 'track', 'object': tracks },
                                                    { 'name': 'add', 'object': add },
                                                    { 'name': 'zoom', 'object': zoom },
                                                    {
                                                        'name': 'logs', 'object': (str) => {
                                                            console.log(' str ' + str);
                                                            io.log(str);
                                                            io.setActive(3)
                                                        }
                                                    },
                                                    { 'name': 'Biopolymer', 'object': Biopolymer },
                                                    {
                                                        'name': 'CreateCompound',
                                                        'object': CreateCompound
                                                    }];

                                                if (selectionLines != null && selectionLines.length > 0) {
                                                    io.execCode(selectionLines, ...wrapper);
                                                } else {
                                                    let line = content.trim();
                                                    if (content.indexOf('\n') > 0) {
                                                        let sp = content.split('\n')
                                                        line = sp[lineNumber - 1]
                                                    }
                                                    if (line != null && line.length > 0) {
                                                        io.execCode(line, ...wrapper);
                                                        if (line.startsWith('io.')) {
                                                            io.setActive(3)
                                                        }
                                                    }
                                                }
                                            })
                                        },
                                    }
                                }
                            },
                            {
                                'title': null, 'body': `
                                            `,
                                'width': '100%',
                                'component':
                                {
                                    wid: 'button',
                                    componentRef: 'bottomPanel2',
                                    data: [
                                        {
                                            'label': '[Exec all]', ionfunction: createIonFunction(() => {
                                                editor.exec({ "name": "graph", "object": graph }, { "name": "io", "object": io }, { 'name': 'file', 'object': file },
                                                    { 'name': 'files', 'object': files }, { 'name': 'track', 'object': tracks }, { 'name': 'add', 'object': add }, { 'name': 'zoom', 'object': zoom });
                                            }), disableAfterClick: false
                                        },
                                        {
                                            'label': '[Exec line]', ionfunction: createIonFunction(() => {
                                                editor.exec({ "name": "graph", "object": graph }, { "name": "io", "object": io }, { 'name': 'file', 'object': file },
                                                    { 'name': 'files', 'object': files }, { 'name': 'track', 'object': tracks }, { 'name': 'add', 'object': add }, { 'name': 'zoom', 'object': zoom });
                                            }), disableAfterClick: false
                                        },
                                        {
                                            'label': 'Save', ionfunction: createIonFunction(() => {
                                                let count = folder.getCount();
                                                let activeContent = editor.getActiveTabContent();
                                                let tab = editor.getActiveTab();
                                                let name = editor.getActiveTabName();

                                                if (name != null)
                                                    folder.add({
                                                        'name': name,
                                                        'value': activeContent
                                                    })
                                            }), disableAfterClick: false
                                        },
                                        {
                                            'label': 'Clear', ionfunction: createIonFunction(() => {
                                                editor.setContent('')
                                            }), disableAfterClick: false
                                        }

                                    ]
                                }
                            }
                        ]]
                }
            })

        })
    })

    add('ENST00000311936')
}
