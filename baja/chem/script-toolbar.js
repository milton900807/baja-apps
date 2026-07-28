function (graph, library) {

    let editor_;
    let editor_function = createIonFunction((editor) => {
        editor_ = editor;
    })

    let sharepoint_config = {
        'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All',
            'Sites.ReadWrite.All']
    }

    let button_canvas = {
        wid: 'button-canvas',
        data: {
            'title': 'controls',
            'height': 30,
            'width': 1200,
            'grid': {
                xmin: 0,
                xmax: 5,
                ymin: -0.01,
                ymax: 1,
                xinset: 0,
                yinset: 0
            },
            'buttons': [
                {
                    x: 0, y: 0, label: 'Chemistry preferences', ionFunction: createIonFunction(async () => {
                        let selectMethod = async (v) => {

                            let ChemistryTemplateDB = await exec('baja/chem/chem-template-db.js', library.id)

                            let cdb = await new ChemistryTemplateDB();
                            let dataobject = await cdb.loadChem(v);
                            dataobject['name'] = v.name;
                            graph.props.selected_chemistry = dataobject;
                        }
                        let myChem = await exec('baja/chem/my-chem-w.js', library.id, selectMethod)
                        showModal(myChem)
                    })
                },
                {
                    x: 1, y: 0, label: 'Create chemistry', ionFunction: createIonFunction(async () => {
                        let m = {
                            wid: 'card',
                            data: {
                                cards: [
                                    [
                                        {
                                            'width': '900px',
                                            'component': {
                                                wid: 'html',
                                                data: '<h5> Chemistry template editor </h5>'
                                            }

                                        },
                                        {
                                            'title': ' ', 'body': `Below is the RNA engine for algorithmic designs.
                                            `,
                                            'width': '100%',
                                            'component':
                                            {
                                                wid: 'text-editor',
                                                refCallback: editor_function,
                                                height: '100%',
                                                data: {

                                                    editorOptions: { language: 'json', automaticLayout: true },
                                                    libs: [
                                                        { 'name': 'core', 'path': 'genome/lib/core.js' },
                                                        { 'name': 'sample', 'path': 'genome/sample-gff.js' }
                                                    ],
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
                                                data: [
                                                    {
                                                        'label': 'Open', ionfunction: createIonFunction(async () => {

                                                            let folderpath = `/drives/${library.id}/root:/bajabio-xfiles/.chem`

                                                            showModal({
                                                                wid: 'folder-browser',
                                                                data: {
                                                                    width: 800,
                                                                    height: '600px',
                                                                    path: folderpath,
                                                                    "ionfunction.folderadded": createIonFunction(async (folder) => {

                                                                    }),
                                                                    "ionfunction.openfile": createIonFunction(async (file, text) => {

                                                                    }),
                                                                    "ionfunction.path": createIonFunction(async (file, nodes) => {
                                                                        if (!file['folder']) {

                                                                            if (!file['@microsoft.graph.downloadUrl']) {
                                                                                let MSGraph = await exec('lib/msgraph.js')
                                                                                console.log('debubg');
                                                                                let client = await MSGraph.getClient(sharepoint_config);
                                                                                let filepath = `/drives/${library.id}/items/${file.id}`;
                                                                                file = await client.api(filepath).get();
                                                                            }
                                                                            if (file['@microsoft.graph.downloadUrl']) {
                                                                                let molObject = await GETJSON(file['@microsoft.graph.downloadUrl'])
                                                                                editor_.setContent(JSON.stringify(molObject))
                                                                            }
                                                                        }
                                                                    })
                                                                }
                                                            })

                                                            hideAllModal();
                                                        }), disableAfterClick: false
                                                    },
                                                    {
                                                        'label': 'Save', ionfunction: createIonFunction(async () => {
                                                            let in_seq = editor_.getContent();
                                                            in_seq = in_seq.trim();
                                                            let panel;
                                                            let __nameHook = createIonFunction((ed) => {
                                                                panel = ed;
                                                            });

                                                            let folderpath = `/drives/${library.id}/root:/bajabio-xfiles/.chem`
                                                            let currentFolder = null;

                                                            showModal({
                                                                wid: 'card',
                                                                data: {
                                                                    cards: [
                                                                        [
                                                                            {
                                                                                width: '100%',
                                                                                'component':
                                                                                {
                                                                                    wid: 'html', data: 'Save chemistry'
                                                                                }
                                                                            }, {
                                                                                width: '100%',
                                                                                'component': {
                                                                                    wid: 'folder-browser',
                                                                                    data: {
                                                                                        path: folderpath, 'ionfunction.path': createIonFunction(async (file) => {
                                                                                        }),
                                                                                        "ionfunction.path": createIonFunction(async (folder, nodes) => {
                                                                                            if (!folder['folder']) {

                                                                                            } else {
                                                                                                currentFolder = folder;
                                                                                            }
                                                                                        })
                                                                                    }
                                                                                }
                                                                            },
                                                                            {
                                                                                'title': ' ', 'body': `Save Chemistry.
                                                                                            `                   ,
                                                                                'width': '90%',
                                                                                'component':
                                                                                {
                                                                                    wid: 'input-param-items',
                                                                                    refCallback: __nameHook,
                                                                                    data: {
                                                                                        'input_labels': ['Chemistry'],
                                                                                    }
                                                                                }
                                                                            },
                                                                            {
                                                                                'title': '',
                                                                                'width': '100%',
                                                                                'component': {
                                                                                    wid: 'mt-button', data: {
                                                                                        buttons: [
                                                                                            {
                                                                                                label: 'Save', ionFunction: createIonFunction(async () => {
                                                                                                    let filename = panel.get('Chemistry')

                                                                                                    if (!filename) {
                                                                                                        alert('Please provide a name')
                                                                                                        return;
                                                                                                    }
                                                                                                    let ds = JSON.parse(in_seq);
                                                                                                    var blob = new Blob([JSON.stringify(ds, (key, value) => {
                                                                                                        if (key == "img") {
                                                                                                            let imgv = value;
                                                                                                            let v = getBase64Image(imgv);
                                                                                                            return v
                                                                                                        } else if (key == 'canvas') {
                                                                                                            return null;
                                                                                                        } else if (key == 'trackRef') {
                                                                                                            if (value != null && value.track != null) {
                                                                                                                return "->:" + value.track.name + ':map:' + JSON.stringify(value.map) + ':showMismatches:' + value.showMismatches + ':';
                                                                                                            }
                                                                                                            return value;
                                                                                                        }
                                                                                                        else {
                                                                                                            return value;
                                                                                                        }
                                                                                                    })], { type: 'application/json' });

                                                                                                    if (!filename.endsWith('.ljlchem')) {
                                                                                                        filename = filename + '.ljlchem'
                                                                                                    }
                                                                                                    let chemistry = `/drives/${library.id}/items/${currentFolder.id}:/${filename}:/content`
                                                                                                    try {
                                                                                                        let MSGraph = await exec('lib/msgraph.js')
                                                                                                        let client = await MSGraph.getClient(sharepoint_config);
                                                                                                        await client.api(chemistry)
                                                                                                            .put(blob);
                                                                                                    } catch (exception) {
                                                                                                        console.log(exception);
                                                                                                    }
                                                                                                    hideAllModal();
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
                                                                        ]]
                                                                }
                                                            })

                                                            hideAllModal();
                                                        }), disableAfterClick: false
                                                    },
                                                    {
                                                        'label': 'Cancel', ionfunction: createIonFunction(() => {
                                                            hideAllModal();

                                                        }), disableAfterClick: false
                                                    }
                                                ]
                                            }
                                        }
                                    ]]
                            }
                        }
                        showModal(m)

                    })
                },
                {
                    x: 2, y: 0, label: 'Phase Sequence', ionFunction: createIonFunction(async () => {
                        if (graph.track.length > 0) {
                            let hasSnpindel = 0;
                            for (let t of graph.track) {
                                if (t.snpindels.length > 0) {
                                    hasSnpindel = 1;
                                }
                            }
                            if (hasSnpindel == 1) {
                                graph.setMessage('Select a phase')
                                await exec('baja/screens/annotation/variant-primer-probe-actions.js', graph, true, true);
                            } else {
                                graph.setMessage('No variants found')
                            }
                        }
                        hideAllModal();

                    })
                },
                {
                    x: 3, y: 0, label: 'Phase sequence surrounding variant', ionFunction: createIonFunction(async () => {
                        if (graph.track.length > 0) {
                            let hasSnpindel = 0;
                            for (let t of graph.track) {
                                if (t.snpindels.length > 0) {
                                    hasSnpindel = 1;
                                }
                            }
                            if (hasSnpindel == 1) {
                                graph.setMessage('Select a phase')
                                await exec('baja/screens/annotation/variant-primer-probe-actions.js', graph, false, true);
                            } else {
                                graph.setMessage('No variants found')
                            }
                        }
                        hideAllModal();

                    })
                },

            ]
        }
    }
    return button_canvas

}
