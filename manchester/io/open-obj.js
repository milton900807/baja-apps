function (graph, genegraph_panel_layout, __path) {
    return new Promise(async (resolve, reject) => {
        function replaceFirstNode(path) {

            const startsWithSlash = path.startsWith('/');
            if (!startsWithSlash) {
                path = '/' + path;
            }

            const parts = path.split('/');

            for (let i = 1; i < parts.length; i++) {
                if (parts[i].length > 0) {
                    parts[i] = getUser();
                    break;
                }
            }

            const newPath = parts.join('/');

            return startsWithSlash ? newPath : newPath.substring(1);
        }

        // A .karyotype file is not an editor screen. It holds a genome, its variants and
        // a view, and manchester/karyotype.js is what reads that -- so it is handed the
        // path directly. Putting it through the track editor would open a screen with no
        // tracks in it, which reads as a file that failed to load.
        // .karyotype, and also the .karyotype.json these were saved as before the
        // extension changed -- those files are still in people's folders and are the
        // same format, so they open the same way.
        const isKaryotype = (el) => /\.karyotype(\.json)?$/i.test(
            ('' + ((el && (el.name || el.path)) || '')).trim());

        let MSGraph = await exec('lib/msgraph.js');

        if (MSGraph.isLoggedIn() && __path) {

            let ww = {
                wid: 'simple-file-browser',
                width: '100%',
                height: '100%',

                refCallback: createIonFunction((rf) => {
                    wrf = rf;
                }),
                data: {
                    showSearch: true,
                    width: '100%',
                    drive: 'user',
                    user: getUser(),
                    root: __path,
                    columns: 3,
                    "ionfunction.cmd": createIonFunction(async (element) => {
                        console.log(element.cmd);
                        commands.go('/', element.cmd);
                    }),

                    "ionfunction.fileClick": createIonFunction(async (element) => {
                        clear();
                        if (isKaryotype(element)) {
                            // Path AS-IS, for the same reason the editor gets it as-is:
                            // /load-file grants access on the folder id the browser is
                            // rooted at, not on the raw email.
                            exec('manchester/karyotype', element.path);
                            return;
                        }
                        let config = {
                            silent: true,
                            user: getUser()
                        }
                        // Pass element.path AS-IS: the file browser roots at the user's folder-id,
                        // and /load-file (key:'user') grants access only when the path contains that
                        // folder id (encodeEmail(user)). replaceFirstNode() rewrote it to the raw
                        // email, which no longer matches folder-id storage → "You do not have access".
                        exec('manchester/editor', element.path, config)
                        let iconlist = [{
                            x: 7, y: 0, label: element.name, ionFunction: createIonFunction(() => {
                            }), islabel: true
                        },
                        {
                            x: 0, y: 0, label: 'Open', ionFunction: createIonFunction(async () => {
                            }),
                        },
                        {
                            x: 1, y: 0, label: 'Open Folder', ionFunction: createIonFunction(async () => {
                            }),
                        },
                        {
                            x: 2, y: 0, label: 'Download', ionFunction: createIonFunction(async () => {
                            }),
                        },
                        ]
                        if (!element.name.endsWith('.baja')) {
                        }
                    }),
                    "ionfunction.openfile": createIonFunction(async (file, text) => {
                    }
                    ),
                    "ionfunction.path": createIonFunction(async (path, nodes) => {
                    })
                }
            }

            let caret = {
                wid: 'html',
                data: `<h2> <img src='/assets/img/icons/png/caret-right.png'> Screens </h2>
                <hr>
            `
            }

            let myfiles_button = {
                label: 'My Files',
                ionfunction: createIonFunction(() => {
                    view = '' + getUser();
                    CurrentLayout.clearComponent('bottomPanel')
                    CurrentLayout.setComponent('bottomPanel', tu);
                })
            }

            let w = {
                wid: 'menu',
                data: {
                    menus: [
                        {
                            label: 'New...',
                            items: [
                                {
                                    label: 'Screen Designer',
                                    ionfunction: createIonFunction(() => {
                                        clear();

                                        exec('manchester/editor.js')

                                    })
                                },

                                {
                                    label: 'Timeline',
                                    ionfunction: createIonFunction(() => {
                                        clear();
                                        exec('baja/timeline/vtp.js')
                                    })
                                },

                                {
                                    label: 'Folder',
                                    ionfunction: createIonFunction(() => {
                                        showModal({
                                            wid: 'input-param-items',
                                            data: {
                                                input_labels: ['Folder name'],
                                                buttons: [{
                                                    'label': 'Open', 'function': createIonFunction(async (button_label, input_params) => {
                                                        let host_ = window['env']['apiUrl']
                                                        let foldername = input_params['Folder name']
                                                        if (foldername != undefined && foldername != null && foldername.length > 0) {
                                                            let jsonobj = {
                                                                "key": "user",
                                                                "user": getUser(),
                                                                "spath": path_j + '/' + foldername,
                                                            }
                                                            let rs = await POSTJSON(jsonobj, host_ + '/save-user-dir');

                                                            await userFiles_panel.refresh();
                                                            await userFiles_panel.navigateToFolderNamed(foldername);
                                                        }
                                                        hideAllModal();

                                                    })
                                                }]
                                            }
                                        })

                                    })
                                },

                            ]
                        },
                        {
                            label: 'Files',
                            items: [
                                myfiles_button,
                            ]
                        },
                        {
                            label: 'Edit',
                            items: [
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
                                            msgpanel.html = ` <font color="red"> Click the file you want to delete </font> `
                                            setTimeout(() => {
                                                mode = null;
                                                msgpanel.html` <hr> `
                                            }, 5000)

                                        }
                                    })
                                },
                                {
                                    label: 'Delete current folder',
                                    ionfunction: createIonFunction(async () => {
                                        if (path_j === null || path_j === '' || path_j === '.') {
                                            infoPrompt(" Cannot remove root folder ")
                                        } else {
                                            let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to remove this folder and its contents?', async () => {
                                                let host_ = window['env']['apiUrl']
                                                let rs = await GETJSON(host_ + '/rm?path=' + path_j + "&key=user&user=" + getUser());
                                                await userFiles_panel.navigateUp();
                                                await userFiles_panel.refresh();
                                            })
                                            showModal(confirm)
                                        }

                                    })
                                },
                                {
                                    label: 'Share Folder...',
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

            let comp = null;
            let innerComponentCallback = createIonFunction((innerComponent) => {
                comp = innerComponent;
            });

            let init_path = '/' + getUser();
            if (init_path.endsWith('/')) {
                init_path = init_path.substring(0, init_path.length - 1);
            }

            // Same layout as save-obj (menu, divider, action row, then the file
            // browser as the last/stretching cell) — but the action is to LOAD:
            // clicking a file opens it in the editor.
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
                                                                            let host_ = window['env']['apiUrl'];
                                                                            let foldername = input_params['Folder name'];
                                                                            if (foldername != undefined && foldername != null && foldername.length > 0) {
                                                                                let directory = comp ? comp.currentPath : '/';
                                                                                if (!directory) directory = '/';
                                                                                let jsonobj = {
                                                                                    "key": "user",
                                                                                    "user": getUser(),
                                                                                    "spath": directory + '/' + foldername
                                                                                };
                                                                                await POSTJSON(jsonobj, host_ + '/save-user-dir');
                                                                                if (comp) {
                                                                                    await comp.refresh();
                                                                                    await comp.navigateToFolderNamed(foldername);
                                                                                }
                                                                            }
                                                                            hideAllModal();
                                                                        })
                                                                    }]
                                                                }
                                                            });
                                                        })
                                                    },
                                                    {
                                                        label: 'Delete this folder',
                                                        ionfunction: createIonFunction(async () => {
                                                            let path_j = comp ? comp.currentPath : null;
                                                            if (path_j === null || path_j === '' || path_j === '.') {
                                                                infoPrompt(" Cannot remove root folder ");
                                                            } else {
                                                                let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to remove this folder and its contents?', async () => {
                                                                    let host_ = window['env']['apiUrl'];
                                                                    let j = { 'path': path_j, 'user': getUser(), 'key': 'user' };
                                                                    await POSTJSON(j, host_ + '/rm');
                                                                    await comp.navigateUp();
                                                                    await comp.refresh();
                                                                });
                                                                showModal(confirm);
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
                                'component': {
                                    wid: 'html',
                                    width: '100%',
                                    height: '100%',
                                    data: ` <hr> `
                                }
                            },

                            {
                                'title': ' ', 'body': ``,
                                'width': '90%',
                                'component': {
                                    wid: 'mt-button', data: {
                                        buttons: [
                                            {
                                                label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                    CurrentLayout.clearComponent('mainPanel');
                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                    // Same as save-obj.js: restoring the mainPanel does not re-arm any
                                                    // canvas interaction, so back out of Open and the hover highlight
                                                    // and track menus are gone until the next click.
                                                    try { graph.clearMouseListeners(); } catch (e) { }
                                                    try { graph.setMouseMode('navigate'); } catch (e) { }
                                                    try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
                                                    try { if (graph.wake) graph.wake(); } catch (e) { }
                                                })
                                            },
                                        ]
                                    }
                                }
                            },

                            {
                                'title': ' ', 'body': ``,
                                'width': '90%',
                                'component': {
                                    wid: 'simple-file-browser',
                                    width: '100%',
                                    height: '100%',
                                    refCallback: innerComponentCallback,
                                    data: {
                                        width: '100%',
                                        columns: 3,
                                        showSearch: true,
                                        drive: 'user',
                                        user: getUser(),
                                        // Comma-separated; each entry is matched against the
                                        // END of the name, so a multi-part extension works.
                                        // '.karyotype.json' is listed separately because it does
                                        // NOT end in '.karyotype' -- it is what these were saved
                                        // as before the extension was shortened, same format.
                                        filetype: '.baja,.karyotype,.karyotype.json',
                                        root: init_path,
                                        "ionfunction.cmd": createIonFunction((element) => {
                                        }),
                                        "ionfunction.fileClick": createIonFunction(async (element) => {
                                            clear();
                                            if (isKaryotype(element)) {
                                                exec('manchester/karyotype', element.path);
                                                return;
                                            }
                                            window.history.replaceState('', 'editor', `/app/manchester/editor?path=${element.path}`);
                                            // Pass element.path AS-IS (folder-id rooted). Rewriting the
                                            // first segment to the email (replaceFirstNode) breaks
                                            // /load-file access, which needs the folder id in the path.
                                            exec('manchester/editor', element.path);
                                        }),
                                        "ionfunction.openfile": createIonFunction(async (file, text) => {
                                        }),
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

        }

    })
}
