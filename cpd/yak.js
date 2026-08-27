function (path, filebrowserplease) {
    return new Promise(async (resolve, reject) => {

        let mode = 'load'
        let path_j = '.'
        let userFiles_panel;
        let userFilesRef = createIonFunction((panel) => {
            userFiles_panel = panel;
        })

        let ggee = null;
        if (!path || path === undefined) {
            path = null;
        }
        const bsize = 48
        const MSGraph = await exec('lib/msgraph.js');
        if (path) {
            path = path.trim();
            if (path.startsWith('public')) {
                window.history.pushState({ 'public': path }, 'viewer', `/app/cpd/view?path=${path}`);
                exec('cpd/view', path)
                return;
            }

        }
        if (!MSGraph.isLoggedIn() && (!path || !path.endsWith('.baja'))) {



            let loginCheckInterval = null;
            const start = Date.now();
            const maxWait = 5 * 60 * 1000; // 5 minutes
            loginCheckInterval = setInterval(async () => {
                try {
                    debugger
                    const loggedIn = await MSGraph.isLoggedIn();

                    if (loggedIn) {
                        await exec('manchester/fb.js', path);
                        clearInterval(loginCheckInterval);

                        return;
                    }

                    if (Date.now() - start >= maxWait) {
                        clearInterval(loginCheckInterval);
                        console.log("stopped checking login status");
                    }
                } catch (err) {
                    console.error("login check failed:", err);
                }
            }, 300);

            window.history.pushState({ 'rna-screen': {} }, 'init', `/app/cpd/init`);
            let plate_panel = {
                wid: 'card',
                width: '100%',
                data: {
                    cards: [
                        [
                            {
                                'width': '100%',
                                'component': {
                                    wid: 'html',
                                    data: `

                                        <center style="cursor: pointer;">
                                        <img src="/assets/splash.png" />
                                        <br>
                                        </center>
`
                                }
                            }

                        ]]
                }
            }

            let purchase_please = {
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
                                'component':
                                {
                                    wid: 'radio-buttons',

                                    data: [
                                        {
                                            label: 'Free Signup',
                                            svg: await exec('icons/svg/free'),
                                            ionfunction: createIonFunction(
                                                async () => {
                                                    signup();

                                                    return;
                                                }
                                            )
                                        }]
                                }
                            },
                        ]
                    ]
                }
            }

            let button_canvas2 = {
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
                                'component':
                                {
                                    wid: 'radio-buttons',

                                    data: [
                                        {
                                            label: 'Login',
                                            svg: await exec('icons/svg/login'),
                                            ionfunction: createIonFunction(
                                                () => {
                                                    login();
                                                }
                                            )
                                        }]
                                }
                            },
                        ]
                    ]
                }
            }

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
                                'component':
                                {
                                    wid: 'html',
                                    data: `or...  `
                                }
                            },
                            {
                                'title': ' ', 'body': ``
                                ,
                                'width': '90%',
                                'component':
                                {
                                    wid: 'radio-buttons',
                                    data: [

                                        {
                                            label: 'Demo please',
                                            svg: await exec('icons/svg/demo'),
                                            ionfunction: createIonFunction(
                                                async () => {
                                                    let s = {
                                                        wid: 'carousel',
                                                        data: {
                                                            images: [
                                                                await exec('icons/svg/editor-features', 'genomics-mutations'),
                                                                await exec('icons/svg/editor-features', 'sirna'),
                                                                await exec('icons/svg/editor-features', 'offtargets'),
                                                                await exec('icons/svg/editor-features', 'primers'),
                                                                await exec('icons/svg/editor-features', 'splicing'),
                                                                await exec('icons/svg/editor-features', 'rbp'),
                                                                await exec('icons/svg/editor-features', 'rnaseq'),
                                                                await exec('icons/svg/editor-features', 'mrna'),
                                                                await exec('icons/svg/editor-features', 'structure'),
                                                                await exec('icons/svg/editor-features', 'aso'),
                                                                await exec('icons/svg/editor-features', 'patents'),
                                                                await exec('icons/svg/editor-features', 'tracks')
                                                            ], links: [
                                                                () => {

                                                                    window.open(`https://www.youtube.com/watch?v=t8vHuw33R1Q`, "_blank");

                                                                },
                                                                () => {

                                                                    window.open(`https://www.youtube.com/watch?v=AOg7a4N-PCo`, "_blank");

                                                                },
                                                                () => {

                                                                    window.open(`https://www.youtube.com/watch?v=i4f-l5M8rq4`, "_blank");

                                                                },
                                                                () => {

                                                                    window.open(`https://www.youtube.com/watch?v=t8vHuw33R1Q`, "_blank");

                                                                }, () => {

                                                                    hideAllModal();
                                                                    clear();

                                                                    setTimeout(async () => {
                                                                        signup();

                                                                    }, 50)

                                                                }
                                                            ]
                                                        }
                                                    }
                                                    clear();

                                                    let carousel_card = {
                                                        wid: 'card',
                                                        data: {
                                                            height: '800px',
                                                            width: '800px',
                                                            cards: [
                                                                [
                                                                    {
                                                                        'title': ' ', 'body': ``
                                                                        ,
                                                                        'width': '100%',
                                                                        'component': {
                                                                            wid: 'title',
                                                                            data: '<hr>  <h3> </h3>'
                                                                        },
                                                                    }, {
                                                                        'title': ' ', 'body': ``
                                                                        ,
                                                                        'width': '90%',
                                                                        'component': s,
                                                                    },
                                                                ]
                                                            ]
                                                        }
                                                    }
                                                    showWidget(carousel_card)
                                                }
                                            )
                                        }]
                                }
                            },
                        ]
                    ]
                }
            }

            let getStarted = {
                wid: 'carousel',
                data: {
                    images: [
                        await exec('icons/svg/editor-features', 'genomics-mutations'),
                        await exec('icons/svg/editor-features', 'sirna'),
                        await exec('icons/svg/editor-features', 'offtargets'),
                        await exec('icons/svg/editor-features', 'primers'),
                        await exec('icons/svg/editor-features', 'splicing'),
                        await exec('icons/svg/editor-features', 'rbp'),
                        await exec('icons/svg/editor-features', 'rnaseq'),
                        await exec('icons/svg/editor-features', 'mrna'),
                        await exec('icons/svg/editor-features', 'structure'),
                        await exec('icons/svg/editor-features', 'aso'),
                        await exec('icons/svg/editor-features', 'patents'),
                        await exec('icons/svg/editor-features', 'tracks')
                    ], links: [
                        () => {
                            window.open(`https://www.youtube.com/watch?v=t8vHuw33R1Q`, "_blank");

                        },
                        () => {

                            window.open(`https://www.youtube.com/watch?v=AOg7a4N-PCo`, "_blank");

                        },
                        () => {

                            window.open(`https://www.youtube.com/watch?v=i4f-l5M8rq4`, "_blank");

                        },
                        () => {

                            window.open(`https://www.youtube.com/watch?v=t8vHuw33R1Q`, "_blank");

                        }, () => {

                            hideAllModal();
                            clear();
                            setTimeout(async () => {
                                signup();

                            }, 50)

                        }
                    ]
                }
            }

            let getStarted_button = {
                wid: 'mt-button', data: {
                    useStyledButtons: true,
                    buttons: [
                        {
                            label: 'Get started...', ionFunction: createIonFunction(async () => {
                                clear();
                                showWidget(button_canvas2)
                                setTimeout(() => {
                                    showWidget(demo_please)
                                    setTimeout(() => {
                                        showWidget(purchase_please)

                                    }, 1000)

                                }, 1000)
                            })
                        },
                    ]
                }
            }
            setTimeout(() => {
                clear();

                showWidget(getStarted)
                showWidget({
                    wid: 'html',
                    data: `<center> click through the demos above or... </center>`
                })
                showWidget(getStarted_button)

            }, 300)
            clear();
            showWidget(plate_panel)
        }
        else {

            if (window['env']['auth'] === 'b2c') {
                let host_ = window['env']['apiUrl']
                const jsonobj = {
                    email: getUser()
                };
            }

            let host_ = window['env']['apiUrl']

            let rf = await GETJSON(host_ + '/get-folder?key=user&path=/', getUser())
            let ch = rf.children;
            if (!ch || ch.length === 0) {

                await exec('manchester/editor', path, { mode: 'editor' })
                return;
            }

            let __path = path;
            if (!__path) {
                __path = '/' + getUser()
            }
            if (__path.endsWith('.ljl')) {
                clear();
                let config = {
                    silent: true,
                    user: getUser(),
                    mode: 'editor'
                }
                window.history.pushState({ 'yak': __path }, 'editor', `/app/manchester/editor?path=${__path}`);
                exec('cpd/main', __path, config, `/app/manchester/editor`)
                return
            }

            exec('lib/msgraph.js').then(async (MSGraph) => {
                let progressBar;
                let ww = {
                    wid: 'progress',
                    componentRef: 'progressBar',
                    data: {
                        'progress': 1,
                        'progressBar': createIonFunction((progessBar) => {
                            progressBar = progessBar;
                        })
                    }
                }
                await showWidget(ww)
                progressBar(20);
                progressBar(40);
                let t = null;
                let mode = 'load'
                let path_j = '.'
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
                        filetype: 'baja',
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
                                                                        mode = 'loading'
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
                                                                        userFiles_panel.refresh();
                                                                        mode = 'loading'
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

                                if (element.path.endsWith('.ljl')) {
                                    clear();
                                    let config = {
                                        silent: true,
                                        user: getUser(),
                                        mode: 'editor'
                                    }
                                    exec('manchester/editor', element.path, config, `/app/manchester/editor`)
                                }
                                else if (element.path.endsWith(".baja")) {

                                    const path = element.path;
                                    clear();
                                    window.history.pushState({ 'rna-screen': path }, 'yak', `/app/manchester/editor?path=${path}`);
                                    exec('manchester/editor', path, { mode: 'editor' })
                                } else if (element.path.endsWith('.bjb')) {
                                    clear();
                                    let config = {
                                        silent: true,
                                        user: getUser(),
                                        mode: 'editor'
                                    }
                                    exec('cpd/ptx-project', element.path, config, `/app/cpd/ptx-project`)
                                }
                                else {
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

                                                                                let path = userFiles_panel.currentPath;
                                                                                let host_ = window['env']['apiUrl']
                                                                                let lastSlashIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
                                                                                let filename = '.share';
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

                                                                                CurrentLayout.reset('bottomPanel')

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

                                                                                    }, 100)
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
                                    'component': {
                                        wid: 'title',
                                        data: '<h4>Your Files </h4>'

                                    },
                                    'width': '100%'
                                },
                                {
                                    'component': userfiles,
                                    'width': '100%'
                                }
                            ]
                        ]
                    }

                };

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

                // let myfiles_button = await exec('baja/app-menu')


                let fbmenu = []

                if (fbmenu && ggee) {
                    fbmenu.push(
                        {
                            label: 'Timelines',
                            ionfunction: createIonFunction(async () => {
                                clear();
                                await exec('cpd/main', path, { mode: 'editor', type: 'Timelines' })
                            })
                        }
                    )
                }

                fbmenu.push(
                    {
                        label: 'Model builder',
                        ionfunction: createIonFunction(async () => {
                            clear();
                            await exec('cpd/main', path, { mode: 'editor' })
                        })
                    },
                )

                let w = {
                    wid: 'menu',
                    data: {
                        menus: [
                            {
                                label: 'Files & Folders',
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
                                                                let directory = userFiles_panel.currentPath;
                                                                if (!directory) {
                                                                    directory = '/'
                                                                }
                                                                let jsonobj = {
                                                                    "key": "user",
                                                                    "user": getUser(),
                                                                    "spath": directory + '/' + foldername
                                                                }
                                                                let rs = await POSTJSON(jsonobj, host_ + '/save-user-dir');
                                                                if (userFiles_panel) {
                                                                    await userFiles_panel.refresh();
                                                                    await userFiles_panel.navigateToFolderNamed(foldername);
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
                                        'label': 'Upload', 'ionfunction': createIonFunction(async () => {
                                            let menu = await exec('ljl/ml/upload-large-file.js', graph, genegraph_panel_layout);
                                            graph.showWindowMenu(menu, 10, 10, 400)
                                        })
                                    },
                                    {
                                        label: 'Delete this folder',
                                        ionfunction: createIonFunction(async () => {
                                            path_j = userFiles_panel.currentPath;
                                            if (path_j === null || path_j === '' || path_j === '.') {
                                                infoPrompt(" Cannot remove root folder ")
                                            } else {
                                                let confirm = await exec('ljl/lib/confirm.js', 'Are you sure you want to remove this folder and its contents?', async () => {
                                                    let host_ = window['env']['apiUrl']
                                                    let j = {
                                                        'path': path_j,
                                                        'user': getUser(),
                                                        'key': 'user'
                                                    }
                                                    let rs = await POSTJSON(j, host_ + '/rm');
                                                    await userFiles_panel.navigateUp();
                                                    await userFiles_panel.refresh();
                                                    mode = 'loading'
                                                })
                                                showModal(confirm)
                                            }

                                        })
                                    },
                                    {
                                        label: 'Share this folder',
                                        ionfunction: createIonFunction(async () => {
                                            path_j = userFiles_panel.currentPath;
                                            if (!path_j) {
                                                path_j = '';
                                                userFiles_panel.currentPath = path_j;
                                            }

                                            let confirm = await exec('ljl/lib/confirm.js', 'Are you sure you want to share this folder and its contents?', async () => {

                                                let editor_;
                                                let editor_function = createIonFunction((editor) => {
                                                    editor_ = editor;
                                                })
                                                let host_ = window['env']['apiUrl']

                                                let jsonobj = {
                                                    'path': path_j + '/.share',
                                                    'key': 'user',

                                                    'user': getUser()
                                                }
                                                let rs = await POSTJSON(jsonobj, host_ + '/load-file');

                                                let contents = rs;
                                                if (rs.msg) {
                                                    contents = '';
                                                }

                                                let export_sequence = {
                                                    wid: 'card',
                                                    data: {
                                                        height: '800px',
                                                        cards: [
                                                            [
                                                                {
                                                                    'title': 'Enter email address of users who have edit access. ',
                                                                    'width': '100%',
                                                                    'height': '500px',
                                                                    'component': {
                                                                        wid: 'text-editor',
                                                                        height: '200px',
                                                                        refCallback: editor_function,
                                                                        data: {
                                                                            text: contents,
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
                                                                            background: 'white',
                                                                            buttons: [
                                                                                {
                                                                                    label: 'Save', ionFunction: createIonFunction(async () => {
                                                                                        let path = userFiles_panel.currentPath;
                                                                                        let host_ = window['env']['apiUrl']
                                                                                        let filename = '.share';
                                                                                        let directory = path;
                                                                                        let jsonobj = {
                                                                                            'spath': '.',
                                                                                            "key": "user",
                                                                                            "user": getUser(),
                                                                                            "spath": directory,
                                                                                            'name': filename,
                                                                                            'value': editor_.getActiveTabContent()
                                                                                        }
                                                                                        let rs = await POSTJSON(jsonobj, host_ + '/save-user-data');

                                                                                        setTimeout(async () => {
                                                                                            exec('ljl/yak', directory)

                                                                                        }, 400)
                                                                                    })
                                                                                },
                                                                                {
                                                                                    label: 'Cancel', ionFunction: createIonFunction(async () => {

                                                                                        exec('ljl/yak', path)

                                                                                    })
                                                                                }
                                                                            ]
                                                                        }
                                                                    }
                                                                }
                                                            ]]
                                                    }
                                                }

                                                CurrentLayout.clearComponent('bottomPanel')
                                                CurrentLayout.setComponent('bottomPanel', export_sequence);

                                            })
                                            showModal(confirm)

                                        })
                                    },

                                    {
                                        label: 'Delete file',
                                        ionfunction: createIonFunction(() => {
                                            mode = 'delete'

                                        })
                                    },
                                ]
                            },

                            {
                                label: 'Library',
                                items: [

                                    {
                                        label: 'Browse library',
                                        ionfunction: createIonFunction(async () => {


                                            let path_j = '.'
                                            let userFiles_panel;
                                            let userFilesRef = createIonFunction((panel) => {
                                                userFiles_panel = panel;
                                            })
                                            let commands = await exec('manchester/controls/cmds')

                                            let userfiles = {
                                                wid: 'simple-file-browser',
                                                width: '100%',
                                                height: '100%',
                                                refCallback: userFilesRef,
                                                data: {
                                                    width: '100%',
                                                    drive: 'wd',
                                                    user: getUser(),
                                                    root: 'library',
                                                    columns: 3,
                                                    showSearch: true,
                                                    "ionfunction.cmd": createIonFunction((element) => {
                                                        commands.go(path_j, element.cmd);
                                                    }),
                                                    "ionfunction.fileClick": createIonFunction(async (element) => {
                                                        path_j = element.path;
                                                        // the element is this 
                                                        // {
                                                        //   "parent": 33609327,
                                                        //   "name": "Pharmacokinetics_and_Pharmacodynamics.pdf",
                                                        //   "path": "/library/Pharmacokinetics_and_Pharmacodynamics.pdf",
                                                        //   "id": 33609369,
                                                        //   "size": 570286,
                                                        //   "isFolder": false,
                                                        //   "lastEdited": "2026-07-09T13:59:10.591Z"
                                                        // }

                                                        let host_ = window['env']['apiUrl']
                                                        const user = getUser();
                                                        const key = 'library';

                                                        const pdfUrl =
                                                            `${host_}/load-pdf` +
                                                            `?path=${encodeURIComponent(element.path)}` +
                                                            `&key=${encodeURIComponent(key)}` +
                                                            `&user=${encodeURIComponent(user)}`;

                                                        window.open(pdfUrl, "_blank", "noopener,noreferrer");





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


                                            clear();
                                            showWidget(tu);
                                        })
                                    },
                                    {
                                        'label': 'Upload', 'ionfunction': createIonFunction(async () => {
                                            let menu = await exec('ljl/ml/upload-large-file.js', graph, genegraph_panel_layout);
                                            graph.showWindowMenu(menu, 10, 10, 400)
                                        })
                                    },
                                    {
                                        label: 'Delete file',
                                        ionfunction: createIonFunction(() => {
                                            mode = 'delete'

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
                main_layout = {
                    wid: 'card',
                    height: '100%',
                    width: '100%',
                    componentRef: 'mainPanel',
                    data: {
                        cards: menu_set
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
                                'component': userfiles
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
            });

            return resolve()
        }
    })
}
