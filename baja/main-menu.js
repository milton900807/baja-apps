function (library, id) {
    exec('lib/msgraph.js').then(async MSGraph => {
        let loading = true;
        let sharepointConfig = { 'scope': ['User.Read', 'Sites.Read.All', 'Sites.ReadWrite.All'] };
        let client = await MSGraph.getClient(sharepointConfig)
        if (!library.id) {
            let filepath = `/drives/${library}`;
            library = await client.api(filepath).get();
        }
        if (library['name'] && library['name'].toLowerCase() === 'my data') {
            return exec('baja/main-menu-users.js', library, id)
        }
        if (id != null) {
            window.history.pushState({ 'library': library.id }, 'main-menu', `/app/baja/main-menu?library=${library.id}&id=${id}`);
        } else {
            window.history.pushState({ 'library': library.id }, 'main-menu', `/app/baja/main-menu?library=${library.id}`);
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
            data: `<h2> <img src='/assets/img/icons/png/caret-right.png'> ${library['name']}</h2>
                <hr>
            `
        })

        let cwrite = await MSGraph.canWriteToLib(library.id)
        if (!cwrite) {
            log("This folder is Readonly ")
        }

        let admin_path = `/drives/${library['id']}/root:/bajabio-xfiles/.config/admin:/children`;
        try {

            try {

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
            } catch (exception) {

            }

            let w = {
                wid: 'menu',
                data: {
                    menus: [
                        {
                            label: 'New',
                            items: [
                                {
                                    label: 'Screen Experiment',
                                    ionfunction: createIonFunction(() => {
                                        clear();
                                        console.log('debubg');
                                        exec(`baja/exp/new-experiment.js`, library, currentPath.id)
                                    })
                                }
                            ]
                        },

                        {
                            label: 'Tools',
                            items: [
                                {
                                    label: 'Train-tracks',
                                    ionfunction: createIonFunction(() => {
                                        let host = window["env"]["appHost"];
                                        if (!host.startsWith('https'))
                                            host = `https://${host}`
                                        let url = `${host}/app/baja/train-tracks`
                                        window.open(url, "_blank");
                                    })

                                }, {
                                    label: 'Oligo-Search',
                                    ionfunction: createIonFunction(() => {
                                        let host = window["env"]["appHost"];
                                        if (!host.startsWith('https'))
                                            host = `https://${host}`

                                        let url = `${host}/app/baja/util/bajabio-oligo-search`
                                        window.open(url, "_blank");
                                    })

                                },
                                {
                                    label: 'Plate Editor',
                                    ionfunction: createIonFunction(() => {
                                        let host = window["env"]["appHost"];
                                        if (!host.startsWith('https'))
                                            host = `https://${host}`

                                        let url = `${host}/app/baja/plate/views/plate-layout-editor?libid=${library.id}`
                                        window.open(url, "_blank");
                                    })

                                },
                            ]
                        },

                    ]
                }
            }
            let currentPath = null;

            let ww = {
                wid: 'folder-browser',
                width: '100%',
                height: '100%',
                data: {
                    width: '100%',
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
                        let iconlist = [

                            {
                                x: 0, y: 0, label: 'Open', ionFunction: createIonFunction(async () => {
                                    if (lib.startsWith('/')) {
                                        lib = lib.substring(1).trim()
                                    }

                                    let d = `drives/${lib}/items/${currentPath.id}`;
                                    let fileObject = await client.api(d).get();
                                    if (fileObject.name.endsWith('.screen'))
                                        window.open(`/app/baja/screens/open-screen?lib_id=${lib}&file_id=${currentPath.id}`)
                                    else {

                                        if (fileObject != null && fileObject['webUrl'] != null) {
                                            window.open(fileObject['webUrl'], '_blank')
                                        }

                                    }
                                }),
                            },
                            {
                                x: 1, y: 0, label: 'Open Folder', ionFunction: createIonFunction(async () => {
                                    if (lib.startsWith('/')) {
                                        lib = lib.substring(1).trim()
                                    }

                                    let d = `drives/${lib}/items/${currentPath.id}`;
                                    let fileObject = await client.api(d).get();
                                    if (fileObject['parentReference']) {
                                        let parentFolder = await client.api(`drives/${lib}/items/${fileObject['parentReference']['id']}`).get();
                                        window.open(parentFolder['webUrl'], '_blank')
                                        return;
                                    }

                                }),
                            },
                            {
                                x: 2, y: 0, label: 'Download', ionFunction: createIonFunction(async () => {

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
                                        x: 3, y: 0, label: 'Install', ionFunction: createIonFunction(async () => {
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

                                            let url = `${host}/app/baja/main-menu?library=${library.id}&id=${parentId}`
                                            exec('baja/io/install-largefile.js', library, folder, fileObject, { url: url }, install_type)

                                        }),
                                    })
                            } else if (currentPath.name.endsWith('txt')) {
                                iconlist.push(
                                    {
                                        x: 4, y: 0, label: 'Install', ionFunction: createIonFunction(async () => {
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
                                            let url = `${host}/app/baja/main-menu?library=${library.id}&id=${parentId}`
                                            exec('baja/io/install-largefile.js', library, folder, fileObject, { url: url }, install_type)

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
                        } else {

                        }
                    }
                    ),
                    "ionfunction.path": createIonFunction(async (path, nodes) => {
                        if (path === currentPath && path === null || path == undefined || (currentPath != null && path.id === currentPath.id)) {
                            return;
                        }
                        currentPath = path;
                        window.history.pushState({ 'library': library.id }, 'main-menu', `app/baja/main-menu?library=${library.id}&id=${currentPath.id}`);

                        if (rpanel) {
                            rpanel.icons = [{
                                x: 0, y: 0, label: 'Sharepoint', ionFunction: createIonFunction(async () => {
                                    let lib = currentPath.parentReference.driveId;
                                    if (lib.startsWith('/')) {
                                        lib = lib.substring(1).trim()
                                    }
                                    let d = `drives/${lib}/items/${currentPath.id}`;
                                    let fileObject = await client.api(d).get();
                                    let parentFolder = await client.api(`drives/${lib}/items/${fileObject['id']}`).get();
                                    window.open(parentFolder['webUrl'], '_blank')
                                })
                            },
                            {
                                x: 1, y: 0, label: 'Upload', ionFunction: createIonFunction(async () => {
                                    let lib = currentPath.parentReference.driveId;
                                    if (lib.startsWith('/')) {
                                        lib = lib.substring(1).trim()
                                    }
                                    let d = `drives/${lib}/items/${currentPath.id}`;
                                    let fileObject = await client.api(d).get();
                                    let parentFolder = await client.api(`drives/${lib}/items/${fileObject['id']}`).get();
                                    let file_drop_object = null;

                                })
                            }
                            ]
                        }
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
                                    exec('baja/screens/exp-view', library, viewdoc.parentReference, id, value.entryFile)
                                } else {
                                }

                            } else
                                if (experimentFile) {
                                    if (isMobile()) {
                                        await exec('baja/eln/init-m.js', library, path, experimentFile);
                                    } else {
                                        setTimeout(() => {
                                            exec('baja/eln/init.js', library, path, experimentFile);
                                        }, 100)
                                    }
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
                        'component': script_canvas

                    },

                    {
                        'width': '100%',
                        'component': ww
                    },
                    {
                        'width': '100%',
                        'component': {
                            wid: 'file-drop',
                            data: {
                                'showUploadButton': false,
                                'getUploadFolder': createIonFunction(() => {
                                    return `/drives/${library['id']}/items/${currentPath['id']}`
                                }),
                                'getRef': createIonFunction((ref) => {
                                    file_drop_object = ref;
                                }),
                                'onDropFunction': createIonFunction(async (file) => {

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

                                    CurrentLayout.clearComponent('progress_panel')
                                    CurrentLayout.setComponent('progress_panel', w);

                                    let responses = await file_drop_object.upload(client, (progress) => {
                                        progressBar(progress)
                                        if (progress > 99) {
                                            CurrentLayout.clearComponent('progress_panel')
                                            CurrentLayout.setComponent('progress_panel',
                                                {
                                                    wid: 'html',
                                                    componentRef: 'progress_panel',
                                                    data: 'Upload complete. <hr>'

                                                }

                                            )

                                        }
                                    });
                                    if (responses != null && responses.length > 0) {
                                    }
                                })
                            }
                        }
                    }, {
                        'width': '100%',
                        'component': {
                            wid: 'html',
                            componentRef: 'progress_panel',
                            data: '<hr>'

                        }
                    }
                ]
            ]

            if (!cwrite) {
                menu_set = [
                    [
                        {
                            'width': '100%',
                            'component': ww
                        },
                    ]]
            }

            let t = {
                wid: 'card',
                height: '100%',
                width: '100%',
                data: {
                    cards: menu_set
                }
            }
            showWidget(t);

            let library_id = `/drives/${library['id']}/root/children`;
            let res = await client.api(library_id).get();
            let res_values = res['value']
            for (let r of res_values) {

                if (r['name'] === 'bajabio-targets.xlsx') {
                    let filepath = `/drives/${library['id']}/items/${r['id']}/workbook/worksheets/Targets/range(address='A1:C100')`;

                    let fileobj = await client.api(filepath).get();
                    let objValues = fileobj['values']
                    let va = [
                    ]
                    let index = 0;
                    for (let o of objValues) {
                        if (index > 0 && (o[1].length > 0)) {
                            va.push({
                                'id': o[0],
                                button: {
                                    'label': o[1], 'ionFunction': createIonFunction(() => {
                                        exec('baja/lib/db.js', library['id']).then(async LibDB => {

                                            let filepath = `/drives/${library['id']}/items/${r['id']}`
                                            let fileObject = await client.api(filepath).get();
                                            window.open(fileObject.webUrl, "_blank");

                                        })
                                    })
                                },
                                'status': o[2]
                            })
                        }
                        index++;
                    }
                    showWidget({
                        wid: 'card',
                        data: {
                            'style.padding-left': '12px',
                            cards: [
                                [{
                                    'component':
                                    {
                                        wid: 'table', data: {
                                            title: 'Targets',
                                            width: '100%',
                                            padding_top: '1px',
                                            showHeader: false,
                                            rows: va
                                        }
                                    }
                                }
                                ]]
                        }
                    })

                    showWidget({
                        wid: 'card',
                        data: {
                            'padding': '10px',
                            cards: [
                                [
                                    {
                                        'title': '', 'body': ` `,
                                        'width': '100%',
                                        'height': '100px',
                                        'component': {
                                            wid: 'html', componentRef: 'gene-graph', data: ``

                                        }
                                    },
                                ]
                            ]
                        }
                    })

                }
            }

        } catch (exception) {

        }

    })
}
