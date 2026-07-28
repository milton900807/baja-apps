function (__path) {
    if (!__path) {
        __path = '/' + getUser()
    }
    clear();
    exec('lib/msgraph.js').then(async (MSGraph) => {
        let t = null;
        let mode = 'load'
        let view = 'myfiles';

        window.history.pushState({ 'apps': __path }, 'editor', `/app/baja/apps`);
        let path_j = '.'
        let userFiles_panel;
        let userFilesRef = createIonFunction((panel) => {
            userFiles_panel = panel;
        })

        let commands = await exec('screen/controls/cmds')

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

                        if (element.path.endsWith('.screen')) {
                            clear();
                            let config = {
                                silent: true,
                                user: getUser()
                            }
                            exec('screen/editor', element.path, config)
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

                                                                        console.log('debubg');

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
                                                                        console.log('debubg');
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

        let h = host;
        const nt = {
            wid: 'news-ticker',
            data: {
                referenceURL: `${h}/internal-news`
            }
        }

        if (MSGraph.isLoggedIn()) {

            let demo_please = {
                wid: 'card',
                data: {
                    height: '800px',
                    width: '800px',
                    cards: [
                        [
                            {
                                'title': ' ', 'body': ``
                                ,
                                'width': '90%',
                                'component': nt
                            },
                            {
                                'title': ' ', 'body': ``
                                ,
                                'width': '90%',
                                'component':
                                {
                                    wid: 'radio-buttons',
                                    data: {
                                        description: "",
                                        type: "Applications",
                                        unchecked: true,
                                        button_size: 300,
                                        buttons: [

                                            {
                                                label: 'Program management',
                                                description: 'AI-driven timelines and budgets',
                                                svg: await exec('icons/svg/project', 'bajabio Project', 'bajabio-Project: Create timelines and budgets'),
                                                ionfunction: createIonFunction(
                                                    async () => {

                                                        clear();
                                                        let config = {
                                                            silent: true,
                                                            user: getUser(),
                                                            mode: 'editor',
                                                            app: 'bajabio Project'
                                                        }
                                                        window.history.pushState({ 'yak': __path }, 'editor', `/app/cpd/bajabio-project`);
                                                        exec('cpd/bajabio-project', null, config, `/app/cpd/bajabio-project`)
                                                    }
                                                )
                                            },
                                            {
                                                label: 'Drug Designer',
                                                description: 'bajabio-Designer: Therapeutic design.',
                                                svg: await exec('icons/svg/bajabio', 'bajabio Designer', "Design a screening campaign"),
                                                ionfunction: createIonFunction(
                                                    async () => {
                                                        setTimeout(() => {
                                                            clear();
                                                            window.history.pushState({ 'yak': __path }, 'editor', `/app/screen/editor`);
                                                            exec('screen/editor')

                                                        }, 400)

                                                    }
                                                )
                                            },
                                            {
                                                label: 'Data Analysis',
                                                description: 'baja-analytics: Analyze/visualize data.',
                                                svg: await exec('icons/svg/barchart', 'bajabio Analytics', "Analyze results"),
                                                ionfunction: createIonFunction(
                                                    async () => {
                                                        clear();
                                                        let config = {
                                                            silent: true,
                                                            user: getUser(),
                                                            mode: 'editor',
                                                            app: 'bajabio Analytics'
                                                        }

                                                        exec('cpd/baja-analytics', config, `/app/cpd/baja-analytics`)

                                                    }
                                                )
                                            },
                                        ]

                                    }
                                }
                            },
                        ]
                    ]
                }
            }

            showWidget(demo_please)

        } else {
            exec('baja/init')
        }

    });
}
