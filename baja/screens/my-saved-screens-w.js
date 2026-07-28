function (libraryid, folderid, graph, type, genegraph_panel_layout) {
    return new Promise(async (resolve, reject) => {
        let db = await exec('baja/lib/db.js', libraryid);
        let MSGraph = await exec('lib/msgraph.js')
        let sharepoint_config = {
            'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All']
        }

        mkdir = async (foldername, praentpath) => {
            praentpath = parentpath.trim();
            praentpath = praentpath + '/children'

            let sharepoint_config = {
                'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All']
            }

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
                        showWidget(jsonv);
                    })
                return folder;
            } catch (exception) {
                console.log(exception)
            }
        }

        if (!type) {
            resolve(
                {
                    wid: 'folder-browser',
                    data: {
                        path: `/drives/${libraryid}/items/${folderid}`, 'ionfunction.path': createIonFunction(async (file) => {
                            if (file['name'].endsWith('.json') || file['name'].endsWith('.screen')) {
                                let fs = await db.loadJSONFile(libraryid, file.id);
                                await graph.update(fs, false);
                            }
                        })
                    }
                });
        } else if (type === 'save') {
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
                                                label: 'Return to Design', ionFunction: createIonFunction(() => {
                                                    hideAllModal();

                                                    CurrentLayout.clearComponent('mainPanel')
                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

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
                                    wid: 'html', data: 'My designs for this target'
                                }
                            }, {
                                width: '100%',
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
                                            }, 400,)
                                        })
                                    }
                                }
                            },
                            {
                                'title': ' ', 'body': `Save Design.
                                            `                   ,
                                'width': '90%',
                                'component':
                                {
                                    wid: 'input-param-items',
                                    refCallback: __nameHook,
                                    data: {
                                        'input_labels': ['Design'],
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
                                                    let name = panel.get('Design')
                                                    graph.canvas = null;

                                                    graph.mouseDownListeners = []
                                                    graph.mouseUpListeners = []
                                                    graph.mouseMoveListeners = []

                                                    var cache = [];
                                                    let gs = await JSON.parse(JSON.stringify(graph, function (key, value) {

                                                        if (key != null && key.toLocaleLowerCase().endsWith('_transient_')) {
                                                            return null;
                                                        }

                                                        if ( key ==='track')
                                                        {
                                                            console.log ( "save key track ")
                                                            console.log('debubg');
                                                        }
                                                        if (key === 'opener') {
                                                            console.log(" skip opener ")
                                                            return null;

                                                        } else if ( key === 'selectedTrack' || key === 'selectedTrack'){
                                                            return null;
                                                        }

                                                        else
                                                            if (typeof value === 'object' && value !== null) {
                                                                if (cache.indexOf(value) !== -1) {

                                                                    console.log ( ' circ ' + key);
                                                                    return;
                                                                }
                                                                if ( value.showSnpIndels ){
                                                                    console.log('debubg');
                                                                }

                                                                cache.push(value);
                                                            }
                                                        return value;
                                                    }));

                                                    if (!name.endsWith('.screen')) {
                                                        name = name + '.screen'
                                                    }

                                                    console.log('debubg');

                                                    if ( gs.track === null ){
                                                        alert ( ' no track ' )
                                                        return;
                                                    }

                                                    db.saveScreen(libraryid, folderid, gs, name, (cstart, cend, total, fileid) => {
                                                        progress = cstart / total * 100;
                                                        if (progressBar) {

                                                            progressBar(progress)

                                                            if (progress === 100) {
                                                                setTimeout(() => {
                                                                    clear ();
                                                                    exec ( 'baja/screens/open-screen', libraryid, fileid)

                                                                }, 2000)
                                                            }

                                                        }
                                                    }).then ( r=>{

                                                        console.log ( ' file id '  + fileid )

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
                        ]]
                }
            })
        }
    })
}
