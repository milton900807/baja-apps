function (path) {
    return new Promise(async (resolve, reject) => {
        let ggee = null;

        publicUser900807()

        if (!path || path === undefined) {
            path = null;
        }
        const bsize = 48

        window.history.pushState({ 'rna-screen': {} }, 'init', `/app/baja/pub/yak52`);

        let progressBar;
        let progressw = {
            wid: 'progress',
            componentRef: 'progressBar',
            data: {
                'progress': 1,
                'progressBar': createIonFunction((progessBar) => {
                    progressBar = progessBar;
                })
            }
        }
        await showWidget(progressw)
        progressBar(20);

        let host_ = window['env']['apiUrl']
        const jsonobj = {
            email: getUser()
        };
        let __path = path;
        if (!__path) {
            __path = '/' + getUser()
        }
        if (__path.endsWith('.bjb')) {
            clear();
            let config = {
                silent: true,
                user: getUser()
            }
            exec('baja/pub/yakgen', __path, config)
            return
        }
        progressBar(40);

        let t = null;
        let mode = 'load'
        let view = 'myfiles';

        let path_j = '.'
        let userFiles_panel;
        let userFilesRef = createIonFunction((panel) => {
            userFiles_panel = panel;
        })
        let commands = await exec('manchester/controls/cmds')
        progressBar(80);
        let userfiles = {
            wid: 'simple-file-browser',

            width: '100%',
            height: '100%',
            refCallback: userFilesRef,
            data: {
                width: '100%',
                drive: 'user',
                user: getUser(),
                root: '/' + getUser(),
                columns: 3,
                showSearch: true,
                "ionfunction.cmd": createIonFunction((element) => {
                    commands.go(path_j, element.cmd);

                }),
                "ionfunction.fileClick": createIonFunction(async (element) => {
                    path_j = element.path;
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
        let ww = {
            wid: 'simple-file-browser',
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

                root: __path,
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
                    if (element.path.endsWith('.baja')) {

                        exec('manchester/screening_editor', element.path, config)
                    }
                    else if (element.path.endsWith('.bjb') || element.path.endsWith('.bjb-share')) {
                        clear();
                        exec('baja/pub/yakgen', element.path, config)
                        return;

                    }
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
                    if (!element.name.endsWith('.bjb')) {
                    }
                }),
                "ionfunction.openfile": createIonFunction(async (file, text) => {
                }
                ),
                "ionfunction.path": createIonFunction(async (path, nodes) => {

                })
            }
        }
        function getSecondToLastName(filePath) {

            filePath = filePath.replace(/\\/g, '/');

            const parts = filePath.split('/');

            if (parts[parts.length - 1] === '') {

                parts.pop();
            }

            if (parts.length < 2) {
                throw new Error("The file path does not contain enough parts to extract the second-to-last name.");
            }

            return parts[parts.length - 2];
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

        if (__path && !__path.endsWith(getUser())) {
        }

        fbmenu.push(
            {
                label: 'Simple Gene Editor ',
                ionfunction: createIonFunction(async () => {
                    clear();
                    await exec('manchester/screening_editor.js', path)
                })
            },
            {
                label: 'Data Yak',
                ionfunction: createIonFunction(async () => {
                    clear();
                    await exec('baja/pub/yakgen.js', path)
                })
            },
        )

        menu_set = [
            {
                'width': '100%',
                'component': {
                    wid: 'html',
                    data: '<hr>'
                }
            }
        ]
        folder_set = [
            [

                {
                    'width': '100%',
                    'component': ww
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

        progressBar(100);
        clear();

        showWidget(
            usermain_layout
        );
        return resolve()
    })
}
