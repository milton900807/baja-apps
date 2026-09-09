function (gs, path) {

    function getLastFolderFromPath(filePath) {
        const normalizedPath = filePath.replace(/\\/g, '/');
        const segments = normalizedPath.split('/');
        segments.pop();
        const lastFolder = segments.pop();
        return lastFolder;
    }

    return new Promise(async (resolve, reject) => {
        let dv = '';
        let comp = null;
        let currentPath = path;
        if (!currentPath || currentPath.trim() < 0) {
            currentPath = '/'
        }
        currentPath = currentPath.trim();
        if (currentPath.startsWith('/myfiles')) {
            currentPath = currentPath.replace('/myfiles', '')
        }
        if (dv.startsWith('/myfiles/'))
            dv = dv.replace('/myfiles/', '')
        currentPath = getLastFolderFromPath(currentPath);
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
                const folders = currentPath.split('/').filter(folder => folder !== '');
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
                                                                             "key": "wd",
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
                                            console.log(" current path " + currentPath);
                                            currentPath = comp.currentPath;
                                            if (!currentPath) {
                                                currentPath = '/'
                                            }

                                            console.log('debubg');

                                            if (!name.endsWith('.ljp')) {
                                                name = name + '.ljp'
                                            }
                                            let binaryData = compressString(JSON.stringify(gs))
                                            const chunkSize = 0x8000;
                                            let stringData = '';
                                            for (let i = 0; i < binaryData.length; i += chunkSize) {
                                                const chunk = binaryData.subarray(i, i + chunkSize);
                                                stringData += String.fromCharCode.apply(null, chunk);
                                            }
                                            currentPath = currentPath.replace('//', '/')
                                            if (!name.endsWith('.ljp')) {
                                                name = name + '.ljp'
                                            }
                                            let host_ = window['env']['apiUrl']
                                            let jsonobj = {
                                                "name": name,
                                                "key": "wd",
                                                "spath": 'baja/templates/' + currentPath,
                                                "value": stringData,
                                                "user": getUser()
                                            }
                                            let rs = await POSTJSON(jsonobj, host_ + '/save-script');
                                            if (rs['status']) {
                                                infoPrompt(rs['status'])
                                            }
                                            CurrentLayout.reset('mainPanel')
                                        })
                                    },

                                    {
                                        'label': 'Cancel', 'function': createIonFunction(async (button_label, input_params) => {
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
                                data: {
                                    "ionfunction.cmd": createIonFunction((element) => {

                                    }),

                                    width: '100%',
                                    columns: 3,
                                    showSearch: true,
                                    drive: 'wd',
                                    user: getUser(),
                                    root: '/baja/templates/timelines',

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
