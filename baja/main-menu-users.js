function (library, id) {

    let sharepoint_config = {
        'scope': ['User.Read', 'Files.Read',
            'GroupMember.Read.All',
            'Files.ReadWrite', 'Files.ReadWrite.All',
            'Sites.Read.All', 'Sites.ReadWrite.All', 'Sites.ReadWrite.All']
    };

    let mkdir = async (email) => {
        let MSGraph = await exec('lib/msgraph.js')
        let client = await MSGraph.getClient(sharepoint_config);
        let filepath = `/drives/${library.id}/root:/bajabio-screens:/children`;

        try {
            let filepath2 = `/drives/${library.id}/root:/bajabio-screens/${email}`;
            let folder = await client.api(filepath2).get()
            return folder;
        } catch (exception) {

        }

        try {
            let new_exp_dir = {
                "name": email,
                "folder": {
                },
                "@microsoft.graph.conflictBehavior": "fail"
            }
            let folder = await client.api(filepath)
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

    let userfolder = null;
    clear();
    exec('lib/msgraph.js').then(async MSGraph => {
        let sharepointConfig = { 'scope': ['User.Read', 'Sites.Read.All', 'Sites.ReadWrite.All'] };
        let client = await MSGraph.getClient(sharepointConfig)
        let user = await client.api('/me').get();

        console.log('debubg');
        console.log(" user " + user.userPrincipalName)

        let email = user['mail']
        if (id === undefined) {
            let filepath = `/drives/${library.id}/root:/bajabio-screens/${email}`;
            try {
                userFolder = await client.api(filepath).get();
            } catch (exception) {
                userFolder = await mkdir(email);
            }
            id = userFolder.id;
        }

        if (!library.id) {
            let filepath = `/drives/${library}`;
            library = await client.api(filepath).get();
        }
        if (id != null) {
            window.history.pushState({ 'library': library.id }, 'main-menu', `app/baja/main-menu?library=${library.id}&id=${id}`);
        } else {
            window.history.pushState({ 'library': library.id }, 'main-menu', `app/baja/main-menu?library=${library.id}`);
        }
        let folderpath = `/drives/${library['id']}/root:/bajabio-screens`;

        if (id != null && id.length > 0) {
            folderpath = `/drives/${library['id']}/items/${id}`;
        }
        let rpanel;
        let __button_canvas = createIonFunction((rfpanel) => {
            rpanel = rfpanel;
        })
        showWidget({
            wid: 'html',
            data: `<h2> <img src='/assets/img/icons/png/caret-right.png'> ${user['displayName']}</h2>
                <hr>
            `
        })

        let cwrite = await MSGraph.canWriteToLib(library.id)
        if (!cwrite) {
            log("This folder is Readonly ")
        }

        let admin_path = `/drives/${library['id']}/root:/bajabio-xfiles/.config/admin:/children`;
        let res_admin_path = await client.api(admin_path).get();
        let res_admin_path_values = res_admin_path['value']
        let admin_items = []
        for (let r of res_admin_path_values) {
            let name = r['name']
            let obj = await GETJSON(r['@microsoft.graph.downloadUrl'])
            if (obj && obj['name']) {
                name = obj['name'];
            }
            admin_items.push({
                label: name,
                ionfunction: createIonFunction(() => {
                    let libid = library.id;
                    const host = window["env"]["appHost"];
                    if (obj['path'] === 'revolucion') {
                        let url = `https://${host}/${obj['path']}`
                        window.open(url, "_blank");
                    } else {
                        if (host.startsWith('http')) {
                            window.open(host, "_blank");
                        }
                        else {
                            let url = `https://${host}/app/${obj['path']}?libid=${libid}`
                            window.open(url, "_blank");
                        }
                    }
                })
            })
        }

        let w = {
            wid: 'menu',
            data: {
                menus: [
                    {
                        label: 'New',
                        items: [
                            {
                                label: 'General Experiment ',
                                ionfunction: createIonFunction(() => {
                                    clear();
                                    exec(`raredb/exp/new-experiment.js`, library, currentPath.id)

                                })

                            },
                            {
                                label: 'Target Annotation',
                                ionfunction: createIonFunction(() => {
                                    clear();
                                    exec(`raredb/exp/new-experiment.js`, library, currentPath.id)

                                })

                            },

                            {
                                label: 'In Vitro Screen',
                                ionfunction: createIonFunction(() => {
                                    clear();
                                    exec(`raredb/exp/new-experiment.js`, library, currentPath.id)

                                })

                            },
                            {
                                label: 'Rodent and Rabbit Toxicology',
                                ionfunction: createIonFunction(() => {
                                    clear();
                                    exec(`raredb/exp/new-experiment.js`, library, currentPath.id)

                                })

                            },

                            {
                                label: 'Clinical (HIPAA)',
                                ionfunction: createIonFunction(() => {
                                    clear();
                                    exec(`raredb/exp/new-experiment.js`, library, currentPath.id)

                                })
                            },

                        ]
                    },

                    {
                        label: 'Search',
                        items: [
                            {
                                label: 'Modalities',
                                ionfunction: createIonFunction(() => {
                                    const host = window["env"]["sharepoint_host"];
                                    let url = `https://${host}/app/raredb/plate/views/plate-layout-editor?libid=${libid}`
                                    window.open(url, "_blank");
                                })

                            },
                            {
                                label: 'Targets',
                                ionfunction: createIonFunction(() => {
                                    const host = window["env"]["sharepoint_host"];
                                    let url = `https://${host}/app/raredb/plate/views/plate-layout-editor?libid=${libid}`
                                    window.open(url, "_blank");
                                })

                            },
                            {
                                label: 'Disease',
                                ionfunction: createIonFunction(() => {
                                    const host = window["env"]["sharepoint_host"];
                                    let url = `https://${host}/app/raredb/plate/views/plate-layout-editor?libid=${libid}`
                                    window.open(url, "_blank");
                                })

                            }

                        ]
                    },
                    {
                        label: 'Luna',
                        items: [
                            {
                                label: 'Request patient data',
                                ionfunction: createIonFunction(() => {
                                })

                            },
                            {
                                label: 'Dashboard',
                                ionfunction: createIonFunction(() => {
                                })
                            }
                        ]
                    }, {
                        label: 'Publish',
                        items: [
                            {
                                label: 'To Open-access',
                                ionfunction: createIonFunction(() => {
                                })

                            },
                            {
                                label: 'To User/Group',
                                ionfunction: createIonFunction(() => {
                                })
                            }
                        ]
                    },
                ]
            }
        }

        let currentPath = null;
        let ww = {
            wid: 'folder-browser',
            width: 1000,
            data: {
                width: 800,
                path: folderpath,
                "ionfunction.canWriteToFolder": createIonFunction(async (canWrite) => {
                    canWriteFolder = canWrite;
                }),
                "ionfunction.folderadded": createIonFunction(async (folder) => {
                    if (rpanel) {
                        rpanel.icons = [];
                        rpanel.redraw();
                    }
                    try {
                        let filepath = `/drives/${library.id}/items/${currentPath.id}/children`;
                        console.log(' file path ' + filepath);
                        let new_exp_dir = {
                            "name": `${folder.name}`,
                            "folder": {
                            },
                            "@microsoft.graph.conflictBehavior": "fail"
                        }
                        let nfolder = await client.api(filepath)
                            .post(new_exp_dir)
                            .catch(error => {

                                let cs = JSON.stringify(error);
                                let jsonv = {
                                    'wid': 'json',
                                    'data': cs
                                }
                                showWidget(jsonv);
                            })
                    } catch (exception) {
                        console.log(exception)
                    }

                }),
                "ionfunction.fileClick": createIonFunction(async (lib, currentpath, element) => {
                    let iconlist = [{
                        x: 0, y: 0, label: currentPath.name, ionFunction: createIonFunction(() => {
                        }), islabel: true
                    },
                    {
                        x: 3, y: 0, label: 'Open', ionFunction: createIonFunction(async () => {
                            if (lib.startsWith('/')) {
                                lib = lib.substring(1).trim()
                            }
                            let d = `drives/${lib}/items/${currentPath.id}`;
                            let fileObject = await client.api(d).get();
                            window.open(`/app/raredb/screens/open-screen?lib_id=${lib}&file_id=${currentPath.id}`)
                        }),
                    },
                    {
                        x: 4, y: 0, label: 'Download', ionFunction: createIonFunction(async () => {

                            if (lib.startsWith('/')) {
                                lib = lib.substring(1).trim()
                            }
                            let d = `drives/${lib}/items/${currentPath.id}`;
                            let fileObject = await client.api(d).get();
                            if (fileObject != null && fileObject['webUrl'] != null) {
                                window.open(fileObject['webUrl'], '_blank')
                            } else {
                                showWidget({
                                    wid: 'json',
                                    data: JSON.stringify(fileObject)
                                })
                            }

                        }),
                    },
                    ]

                    if (!currentPath.name.endsWith('.screen')) {

                        if (currentPath.name.endsWith('VCF') || currentPath.name.endsWith("vcf")) {

                            iconlist.push(
                                {
                                    x: 5, y: 0, label: 'Install', ionFunction: createIonFunction(async () => {
                                        console.log('debubg');
                                        let d = `drives/${lib}/items/${currentPath.id}`;
                                        let fileObject = await client.api(d).get();

                                        let install_type = 'vcf'
                                        if (fileObject.name.endsWith('vcf') || fileObject.name.endsWith('vcf.gz')) {
                                            install_type = 'vcf'
                                        } else if (fileObject.name.endsWith('bed') || fileObject.name.endsWith('bed')) {
                                            install_type = 'bed'
                                        }

                                        let parentId = fileObject.parentReference.id;
                                        let l = `drives/${lib}/items/${parentId}`
                                        let folder = await client.api(l).get();

                                        let host = window["env"]["appHost"];
                                        if (!host.startsWith('https') && (!host.startsWith('http')))
                                            host = `https://${host}`

                                        let url = `${host}/app/raredb/main-menu?library=${library.id}&id=${parentId}`
                                        exec('raredb/io/install-largefile.js', library, folder, fileObject, { url: url }, install_type)

                                    }),
                                })
                        } else if (currentPath.name.endsWith('txt')) {
                            iconlist.push(
                                {
                                    x: 5, y: 0, label: 'Install', ionFunction: createIonFunction(async () => {
                                        console.log('debubg');
                                        let d = `drives/${lib}/items/${currentPath.id}`;
                                        let fileObject = await client.api(d).get();
                                        let install_type = 'txt'
                                        if (fileObject.name.endsWith('txt') || fileObject.name.endsWith('txt')) {
                                            install_type = 'txt'
                                        }
                                        let parentId = fileObject.parentReference.id;
                                        let l = `drives/${lib}/items/${parentId}`
                                        let folder = await client.api(l).get();
                                        let host = window["env"]["appHost"];
                                        if (!host.startsWith('https') && (!host.startsWith('http')))
                                            host = `https://${host}`
                                        let url = `${host}/app/raredb/main-menu?library=${library.id}&id=${parentId}`
                                        exec('raredb/io/install-largefile.js', library, folder, fileObject, { url: url }, install_type)

                                    }),
                                })
                        }
                    }
                    rpanel.icons = iconlist;
                    rpanel.redraw();
                }),
                "ionfunction.openfile": createIonFunction(async (file, text) => {
                    rpanel.icons = [];
                    rpanel.redraw();
                    if (!file['folder']) {
                        if (!file['@microsoft.graph.downloadUrl']) {

                            let filepath = `/drives/${library.id}/items/${file.id}`;
                            file = await client.api(filepath).get();
                        }
                        if (file['@microsoft.graph.downloadUrl']) {
                            let molObject = await GETJSON(file['@microsoft.graph.downloadUrl'])
                            editor.editorOptions = { language: 'json', automaticLayout: true };
                            editor.setContent(JSON.stringify(molObject))
                        }
                    }
                }
                ),
                "ionfunction.path": createIonFunction(async (path, nodes) => {
                    currentPath = path;
                    if (rpanel)
                        rpanel.icons = null;
                    if (nodes) {
                        let experimentFile = null;
                        let viewdoc = null;

                        for (let n of nodes) {
                            if (n.name.endsWith('.docx')) {
                                let temp = n.name.substring(0, n.name.lastIndexOf('.'))
                                if (!isNaN(temp.trim())) {
                                    experimentFile = n;
                                }
                            }
                            if (n.name === 'gene-graph.xlsx') {

                            }
                        }
                        if (viewdoc) {

                            let value = await GETJSON(viewdoc['@microsoft.graph.downloadUrl'])
                            if (value.entry === 'screen') {
                                let id = experimentFile.name
                                if (experimentFile.name.indexOf('.') > 0) {
                                    id = experimentFile.name.substring(0, experimentFile.name.lastIndexOf('.'))
                                }
                                clearMenu();
                                clear();
                                exec('raredb/screens/exp-view', library, viewdoc.parentReference, id, value.entryFile)
                            } else {
                            }

                        } else
                            if (experimentFile) {

                                console.log('debubg');
                                exec('raredb/eln/init.js', library, path, experimentFile);
                            }
                    }
                })
            }
        }

        let script_canvas = {

            wid: 'button-canvas',
            width: '100%',
            refCallback: __button_canvas,
            data: {
                'title': 'controls',
                'height': 25,
                'grid': {
                    xmin: 0,
                    xmax: 10,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': []
            }
        }

        let menu_set = [
            [
                {
                    'width': '100%',
                    'component': w
                },
                {
                    'width': '100%',
                    'component': ww
                },
                {
                    'width': '100%',
                    'component': script_canvas

                }
            ]
        ]

        if (!cwrite) {
            menu_set = [
                [
                    {
                        'width': '100%',
                        'component': ww
                    }
                ]]

            let t = {
                wid: 'card',
                width: '100%',
                data: {
                    cards: menu_set
                }
            }
            showWidget(t);

        } else {

            let t = {
                wid: 'card',
                width: '100%',
                data: {
                    cards: menu_set
                }
            }
            showWidget(t);
            showWidget({
                wid: 'html',
                data: `
                    Upload a files
                `

            })
            showWidget({
                wid: 'data-drop',
                data: {
                    onDropFunction: createIonFunction((file) => {

                        alert(file)

                    })
                }
            })

        }

    })
}
