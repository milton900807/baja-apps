function (path) {



    if (!path) {
        path = '/'
    }




    if (window['env']['auth'] === 'b2c') {
        let host_ = window['env']['apiUrl']
        const jsonobj = {
            email: getUser()
        };
    }
    clear();
    exec('lib/msgraph.js').then(async (MSGraph) => {
        let t = null;
        let mode = 'load'
        let view = 'myfiles';
        let path_j = path
        let userFiles_panel;
        let userFilesRef = createIonFunction((panel) => {
            userFiles_panel = panel;
        })
        let commands = await exec('manchester/controls/cmds')
        let userfiles = {
            wid: 'market-file-browser',
            width: '100%',
            height: '100%',
            refCallback: userFilesRef,
            data: {
                width: '100%',
                drive: 'user',
                user: getUser(),

                root: '/' + path,
                columns: 3,
                showSearch: true,
                "ionfunction.cmd": createIonFunction((element) => {
                    commands.go(path_j, element.cmd);

                }),
                "ionfunction.fileClick": createIonFunction(async (element) => {
                    path_j = element.path;




                    if (mode === 'delete') {
                        let zoom_to = {
                            wid: 'card',
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
                                                data: '<font color=red> Are you sure you want to permanently remove this file? </font>'
                                            }
                                        },
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Yes', ionFunction: createIonFunction(async () => {
                                                                let host_ = window['env']['apiUrl']
                                                                console.log(`Removing file: ${element.path}`);
                                                                console.log(`rm ${element.path}`);
                                                                let jsonobj = {
                                                                    'path': element.path,
                                                                    'key': 'user',
                                                                    'user': getUser()
                                                                }
                                                                POSTJSON(jsonobj, host_ + '/rm').then(r => {
                                                                    console.log(r)

                                                                })
                                                                msgpanel.html = `  `
                                                                userFiles_panel.refresh();
                                                                hideAllModal();
                                                            })
                                                        },
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(() => {

                                                                userFiles_panel.refresh();

                                                                hideAllModal();
                                                            })
                                                        }
                                                    ]
                                                }
                                            }
                                        }
                                    ]]
                            }
                        }
                        showModal(zoom_to)

                    } else {
                        if (element.path.endsWith('.bjb')) {
                            clear();
                            let config = {
                                silent: true,
                                user: getUser(),
                                mode: 'editor'
                            }
                            exec('cpd/baja-analytics', element.path, config, `/app/cpd/baja-analytics`)
                        }
                        else if (element.path.endsWith(".baja")) {

                            const path = element.path;
                            clear();
                            window.history.pushState({ 'rna-screen': path }, 'yak', `/app/manchester/editor?path=${path}`);
                            exec('manchester/editor', path, { mode: 'editor' })
                        } else {

                            if (element.path.endsWith('.share')) {
                                let host_ = window['env']['apiUrl']
                                let jsonobj = {
                                    'path': element.path,
                                    'key': 'user',
                                    'user': getUser()
                                }
                                let rs = await POSTJSON(jsonobj, host_ + '/load-file');
                                let editorPanel;
                                let editor = createIonFunction((panel) => {
                                    editorPanel = panel;
                                })

                                let export_sequence = {
                                    wid: 'card',
                                    data: {
                                        height: '800px',
                                        cards: [
                                            [
                                                {
                                                    'title': 'This folder is shared with the following users. ',
                                                    'width': '100%',
                                                    'height': '500px',
                                                    'component': {
                                                        wid: 'text-editor',
                                                        height: '200px',
                                                        refCallback: editor,
                                                        data: {
                                                            text: rs.toString(),
                                                            height: "350px",
                                                            showButton: false,
                                                            editorOptions: { language: 'text', automaticLayout: true },
                                                            keybinding: {
                                                                'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                                })
                                                            },
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

                                                                        let path = userFiles_panel.currentPath = '/' + folderName;

                                                                        let host_ = window['env']['apiUrl']
                                                                        let lastSlashIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
                                                                        let filename = path.substring(lastSlashIndex + 1);
                                                                        let directory = path.substring(0, lastSlashIndex)
                                                                        let jsonobj = {
                                                                            'spath': '.',
                                                                            "key": "user",
                                                                            "user": getUser(),
                                                                            "spath": directory,
                                                                            'name': filename,
                                                                            'value': editorPanel.getActiveTabContent()
                                                                        }
                                                                        let rs = await POSTJSON(jsonobj, host_ + '/save-user-data');

                                                                        CurrentLayout.clearComponent('bottomPanel')
                                                                        CurrentLayout.setComponent('bottomPanel', tu);
                                                                        CurrentLayout.clearComponent('mainPanel')
                                                                        CurrentLayout.setComponent('mainPanel', main_layout);

                                                                    })
                                                                },
                                                                {
                                                                    label: 'Cancel', ionFunction: createIonFunction(async () => {

                                                                        let i = element.path.lastIndexOf('/');
                                                                        const lastSlashIndex = (element.path.lastIndexOf('/', i - 1));
                                                                        const firstindex = (element.path.indexOf('/', 2));
                                                                        let npath = element.path.substring(firstindex + 1, lastSlashIndex);
                                                                        let nupath = element.path.substring(lastSlashIndex);
                                                                        let rpath = element.path.substring(0, lastSlashIndex)
                                                                        let folderName = getSecondToLastName(element.path)
                                                                        rpath = rpath.replace(/\/+/g, '/');

                                                                        userfiles.root = '/';
                                                                        const tu = {
                                                                            wid: 'card',
                                                                            height: '100%',
                                                                            width: '100%',
                                                                            data: {
                                                                                cards: [
                                                                                    [
                                                                                        {
                                                                                            'component': userfiles,
                                                                                            'width': '100%'
                                                                                        }
                                                                                    ]
                                                                                ]
                                                                            }

                                                                        };
                                                                        CurrentLayout.clearComponent('bottomPanel')
                                                                        CurrentLayout.setComponent('bottomPanel', tu);
                                                                        CurrentLayout.clearComponent('mainPanel')
                                                                        CurrentLayout.setComponent('mainPanel', main_layout);

                                                                        if (rpath != null && rpath.length > 0) {
                                                                            setTimeout(async () => {

                                                                                let p = '/' + rpath + '/' + folderName;

                                                                                p = p.replace(/\/+/g, '/');

                                                                                let ch = {
                                                                                    id: element.parent,
                                                                                    isFolder: true,
                                                                                    name: folderName,
                                                                                    path: p
                                                                                }

                                                                                if (npath === '/') {
                                                                                    ch = {
                                                                                        id: element.parent,
                                                                                        isFolder: true,
                                                                                        parent: 'root',
                                                                                        name: getUser(),
                                                                                        path: rpath
                                                                                    }
                                                                                    userFiles_panel.currentPath = '/' + folderName;
                                                                                    userFiles_panel.currentPath = userFiles_panel.currentPath.replace(/\/+/g, '/');

                                                                                } else {
                                                                                    console.log(" fodlder " + npath)
                                                                                    userFiles_panel.currentPath = '/' + npath + '/' + folderName;
                                                                                    userFiles_panel.currentPath = userFiles_panel.currentPath.replace(/\/+/g, '/');
                                                                                }
                                                                                await userFiles_panel.load(ch);
                                                                                userFiles_panel.canNavigateUp = true;

                                                                            }, 1000)
                                                                        } else {

                                                                        }
                                                                    })
                                                                }
                                                            ]
                                                        }
                                                    }
                                                }
                                            ]]
                                    }
                                }
                                CurrentLayout.clearComponent('mainPanel')
                                CurrentLayout.setComponent('bottomPanel', export_sequence);
                            }
                        }
                    }
                }),
                "ionfunction.openfile": createIonFunction(async (file, text) => {

                }
                ),
                "ionfunction.path": createIonFunction(async (path) => {
                    path_j = path;
                })
            }
        }
        const tu = {
            wid: 'card',
            height: '100%',
            width: '100%',
            data: {
                cards: [
                    [
                        {
                            'component': userfiles,
                            'width': '100%'
                        }
                    ]
                ]
            }

        };

        let msgpanel;
        let progress_panel = createIonFunction((panel) => {
            msgpanel = panel;
        })

        let folder_set;
        let menu_set;
        let fmain_layout;
        let main_layout;

        if (MSGraph.isLoggedIn()) {


            let ww = {
                wid: 'market-file-browser',
                width: '100%',
                height: '100%',

                refCallback: createIonFunction((rf) => {
                    userFiles_panel = rf;
                }),
                data: {
                    showSearch: true,
                    width: '100%',
                    drive: 'user',
                    user: getUser(),
                    root: path,
                    columns: 3,
                    "ionfunction.cmd": createIonFunction(async (element) => {
                        console.log(element.cmd);
                        if (element.cmd.startsWith('cd')) {
                            let foldername = element.cmd.split(' ')[1].trim()
                            if (foldername === '..') {
                                await userFiles_panel.navigateUp();
                            } else {
                                await userFiles_panel.navigateToFolderNamed(foldername);

                            }
                            await userFiles_panel.refresh();

                        } else {

                            commands.go(userFiles_panel.currentPath, element.cmd);
                            await userFiles_panel.refresh();
                        }
                    }),

                    "ionfunction.fileClick": createIonFunction(async (element) => {
                        clear();

                        const lowerPath = (element?.path || '').toLowerCase();

                        if (lowerPath.endsWith('.bjb')) {
                            exec(
                                'cpd/baja-analytics',
                                element.path,
                                {
                                    silent: true,
                                    user: getUser(),
                                    mode: 'editor'
                                },
                                '/app/cpd/baja-analytics'
                            );
                            return;
                        }

                        if (lowerPath.endsWith('.baja')) {
                            const path = element.path;
                            window.history.pushState({ 'rna-screen': path }, 'yak', `/app/manchester/editor?path=${encodeURIComponent(path)}`);
                            exec('manchester/editor', path, { mode: 'editor' });
                            return;
                        }

                        if (lowerPath.endsWith('.pdf')) {

                            let host_ = window['env']['apiUrl']
                            const user = getUser();
                            const key = element.key || 'default';

                            const pdfUrl =
                                `${host_}/load-pdf` +
                                `?path=${encodeURIComponent(element.path)}` +
                                `&key=${encodeURIComponent(key)}` +
                                `&user=${encodeURIComponent(user)}`;

                            showWidget({
                                wid: 'purchase-pdf',
                                data: {
                                    url: pdfUrl,
                                    name: element.name,
                                    close: createIonFunction(async () => {
                                        await exec('baja/init');
                                    })
                                }
                            });

                            return;
                        }
                    }),
                    "ionfunction.openfile": createIonFunction(async (file, text) => {
                    }
                    ),
                    "ionfunction.path": createIonFunction(async (path, nodes) => {

                        console.log(" - - - - - -path : " + path);

                    })
                }
            }
            let myfiles_button = {
                label: 'My Files',
                ionfunction: createIonFunction(() => {
                    view = '' + getUser();
                    CurrentLayout.clearComponent('bottomPanel')
                    CurrentLayout.setComponent('bottomPanel', tu);
                })
            }
            let fbmenu = []
            if (path && !path.endsWith(getUser())) {
                fbmenu.push({
                    label: 'bajabio Project',
                    ionfunction: createIonFunction(() => {
                        clear();
                        exec('baja/yak')

                    })
                })
            }
            fbmenu.push(

                {
                    label: 'bajabio Designer',
                    ionfunction: createIonFunction(() => {
                        clear();
                        let currentPath = userFiles_panel.currentPath;
                        if (!currentPath || currentPath.length <= 0) {
                            currentPath = '/'
                        }
                        if (!currentPath.endsWith('/'))
                            currentPath += '/'

                        exec('manchester/editor.js', currentPath)
                    })
                },

                {
                    label: 'bajabio Analytics',
                    ionfunction: createIonFunction(() => {
                        clear();
                        exec('baja/yak.js')
                    })
                },
                {
                    label: 'ASO-Search',
                    ionfunction: createIonFunction(() => {
                        let host = window["env"]["appHost"];
                        if (!host.startsWith('https'))
                            host = `https://${host}`

                        let url = `${host}/app/baja/util/bajabio-oligo-search`
                        window.open(url, "_blank");
                    })

                },

            )
            let w = {
                wid: 'menu',
                data: {
                    menus: [
                        {
                            label: 'Tools',
                            items: fbmenu
                        },
                        {
                            label: 'Files',
                            items: [
                                myfiles_button,
                                {
                                    'label': 'Upload', 'ionfunction': createIonFunction(async () => {
                                        let currentPath = userFiles_panel.currentPath;
                                        if (!currentPath || currentPath.length <= 0) {
                                            currentPath = '/'
                                        }
                                        if (!currentPath.endsWith('/'))
                                            currentPath += '/'


                                        let menu = await exec('baja/ml/upload-large-file.js', currentPath);
                                    })
                                },
                            ]
                        },
                        {
                            label: 'Edit',
                            items: [

                                {
                                    label: 'New folder',
                                    ionfunction: createIonFunction(async () => {
                                                     // The navy dialog, not a bare input-param-items widget handed to showModal. That
                                                     // had no title saying what was being asked, no cancel, and an unstyled input
                                                     // rendered against the modal's own background, which is where the unreadable
                                                     // boxes came from. baja/lib/prompt-name.js is the shared one.
                                                     let directory = (userFiles_panel && userFiles_panel.currentPath) || '/';
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
                                                         if (userFiles_panel) {
                                                             await userFiles_panel.refresh();
                                                             try { await userFiles_panel.navigateToFolderNamed(foldername); } catch (e) { }
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
                                        path_j = userFiles_panel.currentPath;
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
                                                await userFiles_panel.navigateUp();
                                                await userFiles_panel.refresh();
                                            })
                                            showModal(confirm)
                                        }

                                    })
                                },
                                {
                                    label: 'Share Folder',
                                    ionfunction: createIonFunction(async () => {
                                        let host_ = window['env']['apiUrl']
                                        let jsonobj = {
                                            'spath': '.',
                                            "key": "user",
                                            "user": getUser(),
                                            "spath": path_j,
                                            'name': '.share',
                                            'value': '{remove this and replace with a list of emails you want to share.  One email per line}'

                                        }
                                        let rs = await POSTJSON(jsonobj, host_ + '/save-user-data');

                                        userFiles_panel.refresh();

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
            menu_set = [
                [

                    {
                        'width': '100%',
                        'component': w
                    }
                ]
            ]
            folder_set = [
                [
                    {
                        'width': '100%',
                        'component': ww
                    },
                    {
                        'width': '100%',
                        'component': {
                            wid: 'html',
                            refCallback: progress_panel,
                            data: '<hr>'
                        }
                    }
                ]
            ]

            main_layout = {
                wid: 'card',
                height: '100%',
                width: '100%',
                componentRef: 'mainPanel',
                data: {
                    cards: menu_set
                }

            }

            fmain_layout = {
                wid: 'card',
                height: '100%',
                width: '100%',
                componentRef: 'bottomPanel',
                data: {
                    cards: folder_set
                }
            }

            let usermain_layout = {
                wid: 'card',
                height: '100%',
                width: '100%',
                data: {
                    cards: [[
                        {
                            'width': '100%',
                            'component': main_layout
                        },

                        {
                            'width': '100%',
                            'component': fmain_layout
                        },
                    ]
                    ]
                }
            }

            clear();

            showWidget(
                usermain_layout
            );
        } else {
            login();
        }
    });
}
