function (graph, main_layout, path) {
    return new Promise(async (resolve, reject) => {

        function getLastFolderFromPath(filePath) {
            const normalizedPath = filePath.replace(/\\/g, '/');
            const segments = normalizedPath.split('/');
            segments.pop();
            const lastFolder = segments.pop();
            return lastFolder;
        }

        let dv = '';
        if (graph.file) {
            dv = graph.file;
        }
        let comp = null;

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
        let init_path = '/' + getUser();
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
                                                    ionfunction: createIonFunction(async () => {
                                                                     // The navy dialog, not a bare input-param-items widget handed to showModal. That
                                                                     // had no title saying what was being asked, no cancel, and an unstyled input
                                                                     // rendered against the modal's own background, which is where the unreadable
                                                                     // boxes came from. baja/lib/prompt-name.js is the shared one.
                                                                     let directory = (comp && comp.currentPath) || '/';
                                                                     const where = ('' + directory).split('/').filter(Boolean).pop();
                                                                     const foldername = await exec('baja/lib/prompt-name.js', {
                                                                         title: 'New folder',
                                                                         message: where ? ('It will be created in ' + where + '.')
                                                                             : 'It will be created in your files.',
                                                                         label: 'Folder name',
                                                                         placeholder: 'e.g. KRAS screens',
                                                                         confirmLabel: 'Create',
                                                                         // A path segment on the server, so a slash would create something other than
                                                                         // what was typed.
                                                                         validate: (v) => {
                                                                             if (v.indexOf('/') >= 0) return 'A folder name cannot contain a slash.';
                                                                             if (v === '.' || v === '..') return 'Choose a different name.';
                                                                             if (v.charAt(0) === '.') return 'A name starting with a dot is hidden.';
                                                                             return '';
                                                                         }
                                                                     });
                                                                     if (!foldername) return;
                                                                 
                                                                     const host_ = window['env']['apiUrl'];
                                                                     try {
                                                                         const rs = await POSTJSON({
                                                                             "key": "user",
                                                                             "user": getUser(),
                                                                             "spath": directory + '/' + foldername
                                                                         }, host_ + '/save-user-dir');
                                                                         // Refresh first, THEN navigate: navigating into a folder the listing has not
                                                                         // seen yet lands on an empty view that looks like the create failed.
                                                                         if (comp) {
                                                                             await comp.refresh();
                                                                             try { await comp.navigateToFolderNamed(foldername); } catch (e) { }
                                                                         }
                                                                         // A create that failed used to say nothing at all.
                                                                         if (rs && rs.error) infoPrompt(' ' + foldername + ' was not created: ' + rs.error + ' ');
                                                                     } catch (e) {
                                                                         infoPrompt(' ' + foldername + ' was not created: '
                                                                             + (e && e.message ? e.message : e) + ' ');
                                                                     }
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
                            'component':
                            {
                                wid: 'html',
                                width: '100%',
                                height: '100%',
                                data: ` <hr> `
                            }
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

                                            let gs = JSON.stringify(graph, function (key, value) {

                                                if (key != null && key.toLocaleLowerCase().endsWith('_transient_')) {
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
                                                            if (seenObjects.has(value)) {

                                                                return '[c_c]';
                                                            }
                                                            seenObjects.add(value);
                                                        }
                                                    }
                                                return value;
                                            });
                                            if (!name.endsWith('.baja')) {
                                                name = name + '.baja'
                                            }

                                            if (gs.track === null) {
                                                alert(' no track ')
                                                return;
                                            }
                                            hideAllModal();

                                            let binaryData = compressString(gs)
                                            const chunkSize = 0x8000;
                                            let stringData = '';
                                            for (let i = 0; i < binaryData.length; i += chunkSize) {
                                                const chunk = binaryData.subarray(i, i + chunkSize);
                                                stringData += String.fromCharCode.apply(null, chunk);
                                            }

                                            currentPath = currentPath.replace('//', '/')
                                            let host_ = window['env']['apiUrl']
                                            let jsonobj = {
                                                "name": name,
                                                "key": "user",
                                                "user": getUser(),
                                                "spath": currentPath,
                                                "value": stringData
                                            }

                                            let rs = await POSTJSON(jsonobj, host_ + '/save-user-data');

                                            if (rs['path'].indexOf('myfiles') >= 0 && rs['path'].indexOf(getUser()) >= 0) {
                                                rs['path'] = rs['path'].replace('/' + getUser(), '')
                                            }
                                            currentPath = rs['path']
                                            currentPath = currentPath.replace('//', '/')

                                            window.history.pushState({ 'rna-screen': currentPath }, 'editor', `/app/baja/train-tracks?path=${currentPath}`);

                                            if (rs.status === "saved") {
                                                let returned = await GETJSON(host_ + '/validate-file?path=/' + rs['path'] + "&key=user&user=" + getUser());
                                                let tcount = 0;
                                                let ocount = 0;
                                                let snpsc = 0;
                                                let tracks = returned.track;
                                                tcount = tracks.length;
                                                if (t.oligos) {
                                                    ocount += t.oligos.length;
                                                }
                                                if (t.snpindels)
                                                    snpsc += t.snpindels.length;

                                                infoPrompt(` Saved`)
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

                                    root: init_path,

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
