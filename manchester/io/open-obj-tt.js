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
                        let config = {
                            silent: true,
                            user: getUser()
                        }

                        exec('baja/train-tracks', replaceFirstNode (element.path), config)
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

            menu_set = [
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

            let w = {
                wid: 'card',
                data: {
                    cards: [
                        [
                            {
                                'title': ' ', 'body': ``,
                                'width': '90%',
                                'component':
                                {
                                    wid: 'simple-file-browser',
                                    width: '100%',
                                    height: '100%',
                                    data: {
                                        width: '100%',
                                        drive: 'user',
                                        user: getUser(),
                                        root: '/' + getUser(),
                                        "ionfunction.fileClick": createIonFunction(async (element) => {
                                            clear();
                                            exec('baja/train-tracks', replaceFirstNode (element.path))

                                        }),
                                        "ionfunction.openfile": createIonFunction(async (file, text) => {
                                        }
                                        ),
                                        "ionfunction.path": createIonFunction(async (path, nodes) => {
                                            let p = path.path;
                                            p = p.substring(0, p.lastIndexOf('/'))
                                        })
                                    }
                                }
                            },

                        ]
                    ]
                }
            }

            let bwpanel = {
                wid: 'card',
                data: {
                    cards: [
                        [

                            {
                                'title': ' ', 'body': ``,
                                'width': '100%',
                                'component': w
                            },
                            {
                                'title': ' ', 'body': ``,
                                'width': '100%',
                                'component':
                                {
                                    wid: 'mt-button', data: {
                                        buttons: [

                                            {
                                                label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                    CurrentLayout.clearComponent('mainPanel')
                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                })
                                            },
                                            {
                                                label: 'Open', ionFunction: createIonFunction(async () => {
                                                    CurrentLayout.clearComponent('mainPanel')
                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                })
                                            },
                                        ]
                                    }
                                }
                            },
                        ]
                    ]
                }
            }

            CurrentLayout.clearComponent('mainPanel')
            CurrentLayout.setComponent('mainPanel', bwpanel);

        }

    })
}
