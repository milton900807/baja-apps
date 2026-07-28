function (experiment) {
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
                                                    clear ( );
                                                    exec ( 'flexigraph/test2.js',  input_params['Experiment'])
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
                                        'Files': ['adfad', 'adfadf']
                                    }
                                    db.save(js, 'MT-EXP441')
                                })
                            })
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'OK', ionFunction: createIonFunction(() => {

                                            })
                                        },
                                        {
                                            label: 'Cancel', ionFunction: createIonFunction(() => {
                                                hideAllModal();
                                            })
                                        }
                                    ]
                                }
                            }
                        }
                    ]
                }
            ]
        }
    })

    exec('flexigraph/gene.js').then(async (geneGraph) => {
        graph = geneGraph;
        graph.addListener((_tracks) => {
            tracks = _tracks;
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
                            { 'name': 'track', 'object': tracks }, { 'name': 'add', 'object': add }];

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
                                { 'name': 'files', 'object': files }, { 'name': 'track', 'object': tracks }, { 'name': 'add', 'object': add });
                        }), disableAfterClick: false
                    },
                    {
                        'label': '[Exec line]', ionfunction: createIonFunction(() => {
                            editor.exec({ "name": "graph", "object": graph }, { "name": "io", "object": io }, { 'name': 'file', 'object': file },
                                { 'name': 'files', 'object': files }, { 'name': 'track', 'object': tracks }, { 'name': 'add', 'object': add });
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

}
