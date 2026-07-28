function () {
    let graph;
    let io;
    let folder;
    let file;
    let files;
    let tracks;
    let add = (str) => {
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

    let experimentid = 'MT-EXP441'
    exec('flexigraph/db.js').then(async (db) => {

        let working = await showWidget({
            wid: 'working'
        })
        db.load(experimentid).then(expdata => {
            working.status = 'complete'
            let values = expdata['values']
            let track_items = []
            let index = 0;
            for (let v of values) {

                if (index > 0 && v[0] != null && v[0].length > 0) {
                    let t = {
                        'label': '' + v[0], 'ionfunction': createIonFunction(() => {
                            let jo = JSON.parse(v[1]);
                            graph.addTrack(jo);
                        })
                    }
                    track_items.push(t);
                }
                index++;
            }

            let menuItems = []
            menuItems.push(
                {
                    'name': 'My Screens',
                    'onclick': createIonFunction(() => {
                        clear();

                        exec('baja/screens/myscreens.js')
                    })
                },
                {
                    'name': 'New Screen',
                    'onclick': createIonFunction(() => {
                        clear();
                        exec('flexigraph/test.js')
                    })
                },
                {
                    'name': 'Screen editor',
                    'onclick': createIonFunction(() => {
                        clear();

                        exec('baja/screens/screen-editor.js')
                    })
                },
                {
                    'name': 'Screen results',
                    'onclick': createIonFunction(() => {
                        clear();
                        exec('MT-eln/new-experiment');
                    })
                },
                {
                    'name': 'Plates',
                    'onclick': createIonFunction(() => {
                        clear();
                        exec('MT-eln/me/recent.js');
                    })
                },
                {
                    'name': 'Primer-probes',
                    'onclick': createIonFunction(() => {
                        clear();
                        exec('MT-eln/me/recent.js');
                    })
                },
                {
                    'name': 'Chemistry',
                    'onclick': createIonFunction(() => {
                        clear();
                        exec('baja/chem/init.js');
                    })
                },
                {
                    'name': 'Cell lines',
                    'onclick': createIonFunction(() => {
                        exec('MT-eln/templates/show-templates.js');
                    })
                }
            )
            let menu_config = {
                'items': menuItems,
                'position': 'left',
                'menuLogo': '/assets/logos/bajabio.png'

            }
            showMenu(menu_config);

            let exptracks = {
                'label': 'EXP', 'items': track_items
            }

            showWidget({
                wid: 'menu',
                data: {
                    menus: [
                        {
                            'label': 'File', 'items': [
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
                                    'label': 'Load MT-EXP441', 'ionfunction': createIonFunction(() => {
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
                                                console.log(' track ' + JSON.stringify(t))
                                                tlist.push(JSON.stringify(t))
                                            }
                                            let js = {
                                                'Tracks': tlist,
                                            }
                                            db.saveSet(js, '')
                                        })
                                    })
                                }
                            ]
                        }, exptracks
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

                let html = '';
                folder = await showWidget({
                    wid: 'icon-canvas',
                    data: {
                        'title': 'files',
                        'height': 100,
                        'ymax': 2,
                        'click': createIonFunction((content) => {
                            if (content['value'] != null)
                                io.setContent(content['value']);
                        }),
                        'listener': createIonFunction((_files) => {
                            files = _files;
                        }),
                        'save': createIonFunction((id, content) => {
                        })
                    }
                })

                showWidget({
                    wid: 'text-editor',
                    data: {
                        editorOptions: { language: 'javascript', automaticLayout: true },
                        libs: [
                            { 'name': 'core', 'path': 'genome/lib/core.js' },
                            { 'name': 'sample', 'path': 'genome/sample-gff.js' }
                        ],
                        keybinding: {
                            'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                let line = content.trim();
                                if (content.indexOf('\n') > 0) {
                                    let sp = content.split('\n')
                                    line = sp[lineNumber - 1]
                                }

                                if (line != null && line.length > 0) {
                                    let wrapper = [{ "name": "graph", "object": graph }, { "name": "io", "object": io }, { 'name': 'file', 'object': file },
                                    { 'name': 'files', 'object': files },
                                    { 'name': 'track', 'object': tracks }, { 'name': 'add', 'object': add }, { 'name': 'zoom', 'object': zoom }];

                                    io.execCode(line, ...wrapper);
                                    if (line.startsWith('io.')) {
                                        io.setActive(3)
                                    }
                                }
                            })
                        },
                        height: '300px'
                    }
                }).then(async (editor) => {
                    io = editor;
                    file = {
                        getData() {
                            return io.getContent(
                                'file'
                            )
                        }
                    }

                    showWidget({
                        wid: 'button',
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
                    })
                })
            })

        })
    })

}
