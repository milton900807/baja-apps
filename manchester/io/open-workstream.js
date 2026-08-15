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

                    filetype: '.bjb',
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
                        setTimeout(async () => {

                            return resolve((rs).code)

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
