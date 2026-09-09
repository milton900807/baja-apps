function (pm) {
    return new Promise(async (resolve, reject) => {

        let HM = await exec('baja/history/HM')

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

        if (getUser()) {

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

                    filetype: '.nautilus',
                    root: getUser(),
                    columns: 3,
                    "ionfunction.cmd": createIonFunction(async (element) => {
                        console.log(element.cmd);
                        commands.go('/', element.cmd);
                    }),

                    "ionfunction.fileClick": createIonFunction(async (element) => {
                        clear();
                        let path = replaceFirstNode(element.path)
                        let jsonobj = {
                            'path': path,
                            'user': getUser()
                        }
                        let host_ = window['env']['apiUrl']
                        let rs = await POSTJSON(jsonobj, host_ + '/load-file');

                        CurrentLayout.reset('mainPanel')
                        setTimeout ( async () => {
                            let button_canvas_ = await exec('manchester/controls/nautilus-navigation.js', pm, rs)

                        }, 1000)

                    }),
                    "ionfunction.openfile": createIonFunction(async (file, text) => {
                    }
                    ),
                    "ionfunction.path": createIonFunction(async (path, nodes) => {
                    })
                }
            }
            let w = {
                wid: 'menu',
                data: {
                    menus: [
                        {
                            label: 'New...',
                            items: [
                                {
                                    label: 'Folder',
                                    ionfunction: createIonFunction(async () => {
                                                     // The navy dialog, not a bare input-param-items widget handed to showModal.
                                                     // Same shared prompt as the other New-folder menus.
                                                     const __dir = (path_j) || '/';
                                                     const where = ('' + __dir).split('/').filter(Boolean).pop();
                                                     const foldername = await exec('baja/lib/prompt-name.js', {
                                                         title: 'New folder',
                                                         message: where ? ('It will be created in ' + where + '.')
                                                             : 'It will be created in your files.',
                                                         label: 'Folder name',
                                                         placeholder: 'e.g. KRAS screens',
                                                         confirmLabel: 'Create',
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
                                                             "spath": __dir + '/' + foldername
                                                         }, host_ + '/save-user-dir');
                                                         if (userFiles_panel) {
                                                             await userFiles_panel.refresh();
                                                             try { await userFiles_panel.navigateToFolderNamed(foldername); } catch (e) { }
                                                         }
                                                         if (rs && rs.error) infoPrompt(' ' + foldername + ' was not created: ' + rs.error + ' ');
                                                     } catch (e) {
                                                         infoPrompt(' ' + foldername + ' was not created: '
                                                             + (e && e.message ? e.message : e) + ' ');
                                                     }
                                                 })
                                },

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
                    },
                    {
                        'title': '',
                        'width': '100%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Close', ionFunction: createIonFunction(() => {
                                            CurrentLayout.reset('mainPanel')
                                        })
                                    }
                                ]
                            }
                        }
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
                componentRef: 'openPanel',
                data: {
                    cards: menu_set
                }

            }

            fmain_layout = {
                wid: 'card',
                height: '100%',
                width: '100%',
                componentRef: 'bottomOpenPanel',
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

            alert(' You are not logged in...')

        }

    })
}
