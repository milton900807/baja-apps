function (graph, main_layout, path, reference_object, image) {
    return new Promise(async (resolve, reject) => {

        function getLastFolderFromPath(filePath) {
            const normalizedPath = filePath.replace(/\\/g, '/');
            const segments = normalizedPath.split('/');
            segments.pop();
            const lastFolder = segments.pop();
            return lastFolder;
        }

        let sequenceTextEditor;
        let descHook = createIonFunction((p) => {
            sequenceTextEditor = p;
        });

        function replaceFirstNode(path, withf) {

            const startsWithSlash = path.startsWith('/');
            if (!startsWithSlash) {
                path = '/' + path;
            }

            const parts = path.split('/');

            for (let i = 1; i < parts.length; i++) {
                if (parts[i].length > 0) {
                    parts[i] = withf;
                    break;
                }
            }

            const newPath = parts.join('/');

            return startsWithSlash ? newPath : newPath.substring(1);
        }

        function removeMyFilesNode(currentPath) {

            if (currentPath.startsWith("/myfiles")) {

                return currentPath.slice("/myfiles".length);
            } else if (currentPath.startsWith("myfiles")) {

                return currentPath.slice("myfiles".length);
            }

            return currentPath;
        }

        let dv = '';
        if (graph.file) {
            dv = graph.file;
        }
        let comp = null;

        path = removeMyFilesNode(path);
        let currentPath = path;

        if (!currentPath || currentPath.trim() < 0) {
            currentPath = '/'
        }
        currentPath = currentPath.trim();

        if (currentPath.startsWith('/myfiles')) {
            currentPath = currentPath.replace('/myfiles', '')
        }
        currentPath = getLastFolderFromPath(path);
        if (currentPath === 'myfiles') {
            currentPath = ''
        }
        let init_path = 'public/' + getUser();
        if (init_path.endsWith('/')) {
            init_path = init_path.substring(0, init_path.length - 1)
        }
        let innerComponentCallback = createIonFunction(async (innerComponent) => {
            comp = innerComponent;

            setTimeout(async () => {
                await comp.refresh();
                const folders = path.split('/').filter(folder => folder !== '');
                for (const folder of folders) {

                    if (folder && folder.length > 0) {
                        await comp.navigateToFolderNamed(folder);
                        await comp.refresh();
                    }
                }
            }, 700)
        });

        let progressBar;
        let pw = {
            wid: 'progress',
            componentRef: 'progressBar',
            data: {
                'progress': 0,
                'progressBar': createIonFunction((progessBar) => {
                    progressBar = progessBar;
                })
            }
        }

        let w = {
            wid: 'card',
            data: {
                cards: [
                    [

                        {
                            'width': '100%',
                            'component': {
                                wid: 'menu',
                                data: {
                                    menus: [
                                        {
                                            label: 'Files',
                                            items: [

                                                {
                                                    label: 'New folder',
                                                    ionfunction: createIonFunction(() => {

                                                        showModal({
                                                            wid: 'input-param-items',
                                                            data: {
                                                                input_labels: ['Folder name'],
                                                                buttons: [{
                                                                    'label': 'Create', 'function': createIonFunction(async (button_label, input_params) => {
                                                                        let host_ = window['env']['apiUrl']
                                                                        let foldername = input_params['Folder name']
                                                                        if (foldername != undefined && foldername != null && foldername.length > 0) {
                                                                            let directory = comp.currentPath;
                                                                            if (!directory) {
                                                                                directory = '/'
                                                                            }
                                                                            let jsonobj = {
                                                                                "key": "user",
                                                                                "user": getUser(),
                                                                                "spath": 'public/' + directory + '/' + foldername
                                                                            }
                                                                            let rs = await POSTJSON(jsonobj, host_ + '/save-to-user-public');
                                                                            if (comp) {
                                                                                await comp.refresh();
                                                                                await comp.navigateToFolderNamed(foldername);
                                                                            }
                                                                        }
                                                                        hideAllModal();
                                                                    })
                                                                }]
                                                            }
                                                        })

                                                    })
                                                },
                                                {
                                                    label: 'Delete this folder',
                                                    ionfunction: createIonFunction(async () => {
                                                        path_j = comp.currentPath;
                                                        if (path_j === null || path_j === '' || path_j === '.') {
                                                            infoPrompt(" Cannot remove root folder ")
                                                        } else {
                                                            let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to remove this folder and its contents?', async () => {
                                                                let host_ = window['env']['apiUrl']
                                                                let j = {
                                                                    'path': path_j,
                                                                    'user': getUser(),
                                                                    'key': 'user'
                                                                }
                                                                let rs = await POSTJSON(j, host_ + '/rm');
                                                                await comp.navigateUp();
                                                                await comp.refresh();
                                                            })
                                                            showModal(confirm)
                                                        }

                                                    })
                                                },

                                                {
                                                    label: 'Delete file',
                                                    ionfunction: createIonFunction(() => {
                                                        if (view === 'public') {
                                                            msgpanel.html = ` <font color="blue"> Cannot delete public files.  Select "File->My Files". </font> `
                                                            setTimeout(() => {
                                                                msgpanel.html = ` <hr> `

                                                            }, 5000)

                                                        } else {
                                                            mode = 'delete'
                                                            msgpanel.html = ` <font color="red"> Click the file you want to delete. </font> `

                                                        }
                                                    })
                                                },
                                            ]
                                        },
                                    ]
                                }
                            }
                        },

                        {
                            'title': ' ', 'body': ``,
                            'width': '90%',
                            'component': pw
                        },
                        {
                            'title': ' ', 'body': ``
                            ,
                            'width': '90%',
                            'component':
                            {
                                wid: 'input-param-items',
                                width: '100%',
                                data: {
                                    input_labels: ['Name'],
                                    default_values: { 'Name': dv },
                                    buttons: [{

                                        'label': 'Save', 'function': createIonFunction(async (button_label, input_params) => {
                                            let name = input_params['Name'];
                                            currentPath = comp.currentPath;
                                            if (!currentPath) {
                                                currentPath = '/'
                                            }
                                            graph.canvas = null;
                                            graph.mouseDownListeners = []
                                            graph.mouseUpListeners = []
                                            graph.mouseMoveListeners = []
                                            const seenObjects = new WeakSet();

                                            for (let t of graph.track) {
                                                for (let o of t.oligos) {
                                                    if (o.mi_targets_transient_) {
                                                        o.mi_targets_transient_ = null;
                                                    }
                                                }
                                            }
                                            progressBar(20)
                                            let gs = JSON.stringify(graph, function (key, value) {
                                                if (key != null && key.toLowerCase().startsWith('_')) {
                                                    return null;
                                                }
                                                else
                                                    if (typeof value === 'object' && value !== null) {
                                                        if (Array.isArray(value) && value.every(elem => elem && typeof elem === 'object' && 'x' in elem && 'y' in elem)) {
                                                            return value;
                                                        } else if (value.x != null && value.y != null && !isNaN(key) && parseInt(key, 10).toString() === key) {
                                                            return value;
                                                        }
                                                        else {
                                                            return value;
                                                        }
                                                    }
                                                return value;
                                            });

                                            if (!name.endsWith('.bjb')) {
                                                name = name + '.bjb'
                                            }
                                            gs.owner = getUser();

                                            if (gs.track === null) {
                                                alert(' no track ')
                                                return;
                                            }
                                            hideAllModal();
                                            progressBar(40)
                                            let binaryData = compressString(gs)
                                            const chunkSize = 0x8000;
                                            let stringData = '';
                                            for (let i = 0; i < binaryData.length; i += chunkSize) {
                                                const chunk = binaryData.subarray(i, i + chunkSize);
                                                stringData += String.fromCharCode.apply(null, chunk);
                                            }
                                            progressBar(80)
                                            currentPath = currentPath.replace('//', '/')
                                            let host_ = window['env']['apiUrl']
                                            let jsonobj = {
                                                "name": name,
                                                "key": "user",
                                                "user": getUser(),
                                                "spath": currentPath,
                                                "value": stringData
                                            }

                                            let rs = await POSTJSON(jsonobj, host_ + '/save-to-user-public');
                                            if (image) {
                                                let thumb = {
                                                    "name": name + '.png',
                                                    "key": "user",
                                                    "user": getUser(),
                                                    "spath": currentPath,
                                                    "value": image
                                                }
                                                let rts = await POSTJSON(thumb, host_ + '/save-to-user-public');

                                            }

                                            if (rs['path'].indexOf('myfiles') >= 0 && rs['path'].indexOf(getUser()) >= 0) {
                                                rs['path'] = rs['path'].replace('/' + getUser(), '')
                                            }
                                            currentPath = rs['path']
                                            currentPath = currentPath.replace('//', '/')
                                            if (!reference_object) {
                                                reference_object = '/app/baja/yak'
                                            }
                                            if (rs.status === "saved") {

                                                let apphost = window['env']['appHost']

                                                let returned = await GETJSON(host_ + '/validate-file?path=/' + rs['path'] + "&key=user&user=" + getUser());
                                                let tcount = 0;
                                                let ocount = 0;
                                                let snpsc = 0;
                                                let tracks = returned.track;
                                                tcount = tracks.length;
                                                for (let t of tracks) {
                                                    if (t.oligos) {
                                                        ocount += t.oligos.length;
                                                    }
                                                    if (t.snpindels)
                                                        snpsc += t.snpindels.length;

                                                }
                                                let pp = rs['path'].replace('//', '/');
                                                let linfile = (`${apphost}/ionworks/ln?path=${pp}`)

                                                let sequence_input = {
                                                    wid: 'card',
                                                    "height": "300px",
                                                    data: {
                                                        "style.padding-top": '1px',
                                                        "style.border": '1px',
                                                        "style.height": "200px",
                                                        cards: [
                                                            [
                                                                {
                                                                    'width': '100%',
                                                                    'component': {
                                                                        wid: 'html',
                                                                        data: `<hr>
<H4>
  <font color="navy">Copy this line </font>
</H4>

                                                <hr>

                                                `
                                                                    }

                                                                },
                                                                {
                                                                    'width': '100%',
                                                                    'component': {
                                                                        wid: 'text-editor',
                                                                        refCallback: descHook,
                                                                        data: {
                                                                            height: "500px",

                                                                            showButton: false,
                                                                            editorOptions: {
                                                                                value: '',
                                                                                language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                                                suggestOnTriggerCharacters: false,
                                                                                quickSuggestions: false,
                                                                                parameterHints: { enabled: false },
                                                                                minimap: { enabled: false },
                                                                                fontFamily: "Courier New, monospace",
                                                                                placeholder: "Enter a paragraph that describes the timeline you want to create.  For example:  I want to create a timeline that describes important milestones about Vasco De Gamma around the Cape of Good Hope",
                                                                                cursorStyle: "block"
                                                                            },
                                                                            onDidFocusEditorWidget: createIon(() => {
                                                                                if (initalText)
                                                                                    sequenceTextEditor.setContent("")
                                                                                initalText = false;
                                                                            }),

                                                                            keybinding: {
                                                                                'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                                                })
                                                                            },
                                                                        }
                                                                    }
                                                                },
                                                                {
                                                                    'width': '100%',
                                                                    'component': {
                                                                        wid: 'html',
                                                                        data: '<hr>'
                                                                    }
                                                                },
                                                                {
                                                                    'component': {
                                                                        wid: 'mt-button', data: {
                                                                            buttons: [
                                                                                {
                                                                                    label: 'Close', ionFunction: createIonFunction(async () => {
                                                                                        hideAllModal();
                                                                                        CurrentLayout.reset('mainPanel')

                                                                                    })
                                                                                },

                                                                            ]

                                                                        }
                                                                    }
                                                                }
                                                            ]

                                                        ]
                                                    }
                                                }
                                                CurrentLayout.setComponent('mainPanel', sequence_input)

                                                infoPrompt(linfile, 900, 200)
                                                let zoom_to = {
                                                    wid: 'card',
                                                    componentRef: 'bottomPanel',
                                                    data: {
                                                        height: '800px',
                                                        cards: [
                                                            [
                                                                {
                                                                    'title': ' ', 'body': ``
                                                                    ,
                                                                    'width': '90%',
                                                                    'component':
                                                                    {
                                                                        wid: 'html',
                                                                        data: '<font color=blue> Saved </font>'
                                                                    }
                                                                },
                                                                {
                                                                    'title': '',
                                                                    'width': '100%',
                                                                    'component': {
                                                                        wid: 'mt-button', data: {
                                                                            buttons: [
                                                                                {
                                                                                    label: 'OK', ionFunction: createIonFunction(async () => {
                                                                                        hideAllModal();
                                                                                    })
                                                                                },
                                                                            ]
                                                                        }
                                                                    }
                                                                }
                                                            ]]
                                                    }
                                                }

                                                graph.setMessage("Saved.")
                                            }

                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', main_layout);

                                        })
                                    },

                                    {
                                        'label': 'Cancel', 'function': createIonFunction(async (button_label, input_params) => {

                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', main_layout);

                                        })
                                    }

                                    ]
                                }
                            }
                        },
                        {
                            'title': ' ', 'body': ``,
                            'width': '90%',
                            'component':
                            {

                                wid: 'simple-file-browser',
                                width: '100%',
                                height: '100%',
                                refCallback: innerComponentCallback,
                                data: {
                                    "ionfunction.cmd": createIonFunction((element) => {

                                    }),

                                    width: '100%',
                                    columns: 3,
                                    showSearch: true,
                                    drive: 'user',
                                    user: getUser(),

                                    root: '' + init_path,

                                    "ionfunction.fileClick": createIonFunction(async (element) => {
                                        hideAllModal();
                                    }),
                                    "ionfunction.openfile": createIonFunction(async (file, text) => {
                                    }
                                    ),
                                    "ionfunction.path": createIonFunction(async (path, nodes) => {

                                    })
                                }
                            }
                        }
                    ]
                ]
            }
        }

        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', w);

    })
}
