function (libraryid, folderid, plateTrack, type, genegraph_panel_layout, paint_panel, currentFile) {

    return new Promise(async (resolve, reject) => {

        let currentFileName = ''
        console.log('debubg');
        if ( currentFile && currentFile.name ){
            currentFileName = currentFile.name;
        }

        let db = await exec('baja/lib/db.js', libraryid);
        let MSGraph = await exec('lib/msgraph.js')
        let sharepoint_config = {
            'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All']
        }

        mkdir = async (foldername, praentpath) => {
            praentpath = praentpath + '/children'

            foldername = foldername.trim();
            praentpath = parentpath.trim();

            let client = await MSGraph.getClient(sharepoint_config);
            try {
                let new_exp_dir = {
                    "name": foldername,
                    "folder": {
                    },
                    "@microsoft.graph.conflictBehavior": "fail"
                }
                let folder = await client.api(praentpath)
                    .post(new_exp_dir)
                    .catch(error => {
                        log("Folder already exists in this location...  Error creating experiment, please send the following output to informatics:")
                        let cs = JSON.stringify(error);
                        let jsonv = {
                            'wid': 'json',
                            'data': cs
                        }
                        showModal(jsonv);
                    })
                return folder;
            } catch (exception) {
                console.log(exception)
            }
        }

        let panel;
        let __nameHook = createIonFunction((ed) => {
            panel = ed;
        });

        let progress = 0;
        let progressBar;

        resolve({
            wid: 'card',
            data: {
                cards: [
                    [
                        {
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Return', ionFunction: createIonFunction(() => {
                                                hideAllModal();

                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', paint_panel);

                                            })
                                        },
                                    ]
                                }
                            }
                        },
                        {
                            width: '100%',
                            'component':
                            {
                                wid: 'html', data: 'Designs for this target'
                            }
                        },

                        {
                            width: '100%',
                            height: '50%',
                            'component': {
                                wid: 'folder-browser',
                                data: {
                                    path: `/drives/${libraryid}/items/${folderid}`, 'ionfunction.path': createIonFunction(async (file) => {
                                    }),
                                    folderDialogFunction: createIonFunction((path) => {
                                        showModal({
                                            wid: 'input-param-items',
                                            data: {
                                                input_labels: ['Name'],
                                                buttons: [{
                                                    'label': 'Create', 'function': createIonFunction((button_label, input_params) => {

                                                        let foldername = input_params['Name'];
                                                        if (foldername || foldername.length === 0) {
                                                            alert(" Please provide a folder name ")
                                                            return;
                                                        }

                                                        mkdir(foldername, `/drives/${libraryid}/items/${folderid}`)
                                                        hideAllModal();
                                                    })
                                                }]
                                            }
                                        })
                                    })
                                }
                            }
                        },
                        {
                            width: '100%',
                            'component':
                            {
                                wid: 'input-param-items',
                                refCallback: __nameHook,
                                data: {
                                    'input_labels': ['File'],
                                    'default_values': {'File':currentFileName}
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
                                            label: 'Save', ionFunction: createIonFunction(async (button) => {
                                                button.disabled = true;
                                                let name = panel.get('File')

                                                const seenObjects = new WeakSet();

                                                let gs = await JSON.parse(JSON.stringify(plateTrack, function (key, value) {
                                                    if (key != null) {
                                                        if (key === 'fun') {
                                                            if (value != null)
                                                                return value.toString();
                                                        }
                                                        if (key.toString().toLowerCase() === 'toplate' && value) {
                                                            return 'toPlate:' + value[key].uid
                                                        }
                                                        if (key.toString().toLowerCase() === 'fromplate' && value) {
                                                            return 'fromPlate:' + value[key].uid
                                                        }
                                                        if (key != null && key.toLocaleLowerCase().endsWith('_transient_')) {
                                                            return null;
                                                        }
                                                        return value;

                                                    }

                                                    return value;
                                                }));
                                                if (!name.endsWith('.bjb')) {
                                                    name = name + '.bjb'
                                                }
                                                db.saveScreen(libraryid, folderid, gs, name, (cstart, cend, total, fileid) => {
                                                    progress = cstart / total * 100;
                                                    if (progressBar) {

                                                        progressBar(progress)

                                                        if (progress === 100) {
                                                            setTimeout(() => {
                                                                clear();
                                                                exec('baja/plate/views/plate-layout-editor.js', libraryid, fileid)

                                                            }, 1000)
                                                        }

                                                    }
                                                }).then(r => {

                                                })
                                                hideAllModal();
                                            })
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'progress', data: {
                                    'progress': 0,
                                    'progressBar': createIonFunction((progessBar) => {
                                        progressBar = progessBar;
                                    })
                                }
                            }
                        },
                    ]
                ]
            }
        })
    })
}
