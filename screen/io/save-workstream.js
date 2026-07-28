function (path, workflow, plate_track) {
    return new Promise(async (resolve, reject) => {

        let dv = '';

        function getLastFolderFromPath(filePath) {
            const normalizedPath = filePath.replace(/\\/g, '/');
            const segments = normalizedPath.split('/');
            segments.pop();
            const lastFolder = segments.pop();
            return lastFolder;
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
                                                                                "spath": directory + '/' + foldername
                                                                            }
                                                                            let rs = await POSTJSON(jsonobj, host_ + '/save-user-dir');
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
                                            progressBar(20)

                                            let ljlstructure = {
                                                user: getUser(),
                                                date: Date.now(),
                                                code: workflow,
                                            }
                                            let gs = JSON.stringify(ljlstructure, function (key, value) {
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
                                            let rs = await POSTJSON(jsonobj, host_ + '/save-user-data');
                                            if (rs['path'].indexOf('myfiles') >= 0 && rs['path'].indexOf(getUser()) >= 0) {
                                                rs['path'] = rs['path'].replace('/' + getUser(), '')
                                            }
                                            currentPath = rs['path']
                                            currentPath = currentPath.replace('//', '/')
                                            window.history.pushState({ 'rna-screen': currentPath }, 'yak', `/app/baja/yak?path=${currentPath}`);
                                            progressBar(100)

                                            if (rs.status === "saved") {
                                                CurrentLayout.reset('mainPanel')
                                                setTimeout(() => {
                                                    plate_track.setMessage('Saved')
                                                }, 1000)
                                            }
                                        })
                                    },
                                    {
                                        'label': 'Cancel', 'function': createIonFunction(async (button_label, input_params) => {

                                            setTimeout(async () => {
                                                await exec('baja/table/show-flow-editor', workflow)
                                            }, 500)

                                            CurrentLayout.reset('mainPanel')

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
                                drive: 'user',
                                user: getUser(),

                                data: {
                                    "ionfunction.cmd": createIonFunction((element) => {

                                    }),
                                    drive: 'user',
                                    user: getUser(),

                                    filetype: '.bjb',
                                    root: getUser(),
                                    width: '100%',
                                    columns: 3,
                                    showSearch: true,
                                    drive: 'user',
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

        CurrentLayout.clearComponent('mainPanel');
        CurrentLayout.setComponent('mainPanel', w);
        resolve('')
    })
}
