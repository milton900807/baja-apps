function (path, filebrowserplease) {

    let __path = path;

    filebrowserplease = true;

    return new Promise(async (resolve, reject) => {

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

        let host_ = window['env']['apiUrl']
        const h = host_;

        const nt = {
            wid: 'news-ticker',
            data: {
                referenceURL: `${host_}/internal-news`
            }
        }

        let ggee = null;
        if (!path || path === undefined) {
            path = null;
        }
        const MSGraph = await exec('lib/msgraph.js');
        let t = null;
        let mode = 'load'
        let path_j = '.'
        let userFiles_panel;
        let userFilesRef = createIonFunction((panel) => {
            userFiles_panel = panel;
        })
        let commands = await exec('screen/controls/cmds')
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
                filetype: '',
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

                        if (element.path.endsWith('.bjb')) {
                            clear();
                            let config = {
                                silent: true,
                                user: getUser(),
                                mode: 'editor'
                            }
                            exec('cpd/baja-analytics', element.path, config, `/app/baja/yak`)
                        } else if (element.path.endsWith('.bjb')) {
                            clear();
                            let config = {
                                silent: true,
                                user: getUser(),
                                mode: 'editor'
                            }
                            exec('cpd/bajabio-project', element.path, config, `/app/baja/yak`)
                        } else if (element.path.endsWith(".screen")) {

                            const path = element.path;
                            clear();
                            window.history.pushState({ 'rna-screen': path }, 'yak', `/app/screen/editor?path=${path}`);
                            exec('screen/editor', path, { mode: 'editor' })
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

        let w = {
            wid: 'menu',
            data: {
                menus: [
                    {
                        label: '[Folder options]',
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
                                            mode = 'loading'
                                        })
                                        showModal(confirm)
                                    }

                                })
                            },
                            {
                                'label': 'Upload', 'ionfunction': createIonFunction(async () => {
                                    let menu = await exec('baja/ml/upload-large-file.js', path_j);
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

                                    let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to share this folder and its contents?', async () => {

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
                                        console.log('debubg');

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
                                                                                    exec('baja/yak', directory)

                                                                                }, 1000)
                                                                            })
                                                                        },
                                                                        {
                                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {

                                                                                exec('baja/yak', path)

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
                ]
            }
        }

        if (!MSGraph.isLoggedIn() && (!path || !path.endsWith('.bjb'))) {





            let loginCheckInterval = null;
            const start = Date.now();
            const maxWait = 5 * 60 * 1000; // 5 minutes
            loginCheckInterval = setInterval(async () => {
                try {
                    const loggedIn = await MSGraph.isLoggedIn();

                    if (loggedIn) {
                        await exec('screen/fb.js');
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







            window.history.pushState({ 'rna-screen': {} }, 'init', `/app/baja/yak`);
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
                                        <center>
                                        <img src="/assets/splash.png" />
                                        </center>
                                        <br>
                                        </center>
`
                                }
                            }

                        ]]
                }
            }

            clear();
            showWidget(plate_panel)
            const timeoutMs = 5000
            let intervalMs = 1000
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
                if (MSGraph.isLoggedIn()) {
                    clear();
                    return exec('baja/yak', path, filebrowserplease)
                }
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            }
            exec('cpd/demo')
        }
        else {

            __path = path;
            if (!__path) {
                __path = '/' + getUser()
            }
            if (__path.endsWith('.bjb')) {
                clear();
                let config = {
                    silent: true,
                    user: getUser(),
                    mode: 'editor'
                }
                window.history.pushState({ 'yak': __path }, 'editor', `/app/baja/yak?path=${__path}`);
                exec('baja/main', __path, config, `/app/baja/yak`)
                return
            }
            let host_ = window['env']['apiUrl']

            let rlist = await GETJSON(host_ + `/get-nodes?key=user&path=/${getUser()}/`);
            if (rlist && rlist.values.length <= 0) {
                filebrowserplease = true;
            }
            if (!filebrowserplease) {
                if (rlist && rlist['values']) {
                    let v = rlist['values']
                    for (let i of v) {
                        if (i.name.endsWith('.screen')) {
                            window.history.pushState({ 'rna-screen': path }, 'yak', `/app/screen/editor?path=${__path}`);
                            exec('screen/editor', i.path, { mode: 'viewer' })
                            return resolve()
                        } else if (i.name.endsWith('.bjb')) {
                            window.history.pushState({ 'rna-screen': path }, 'yak', `/app/cpd/baja-analytics?path=${__path}`);
                            exec('cpd/baja-analytics', i.path, { mode: 'viewer' })
                        } else if (i.name.endsWith('.ljptx')) {
                            window.history.pushState({ 'rna-screen': path }, 'yak', `/app/cpd/bajabio-project?path=${__path}`);
                            exec('cpd/bajabio-project', i.path, { mode: 'viewer' })
                        }
                        else {
                            exec('screen/fb')
                        }
                        break;
                    }
                }
            } else {

                const tu = {
                    wid: 'card',
                    height: '100%',
                    width: '100%',
                    componentRef: 'userFiles',

                    data: {
                        cards: [
                            [
                                {
                                    'component': w,
                                    'width': '100%'
                                }
                            ],
                            [
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

                let fbmenu = []

                if (fbmenu && ggee) {
                    fbmenu.push(
                        {
                            label: 'Timelines',
                            ionfunction: createIonFunction(async () => {
                                clear();
                                await exec('baja/main', path, { mode: 'editor', type: 'Timelines' })
                            })
                        }
                    )
                }

                fbmenu.push(
                    {
                        label: 'Model builder',
                        ionfunction: createIonFunction(async () => {
                            clear();
                            await exec('baja/main', path, { mode: 'editor' })
                        })
                    },
                )

                let h = host;
                const nt = {
                    wid: 'news-ticker',
                    data: {
                        referenceURL: `${h}/internal-news`
                    }
                }

                let menu_set = [
                    [
                        {
                            'width': '100%',
                            'component': {
                                wid: 'simple-button-menu',
                                data: {
                                    buttons: [
                                        {
                                            label: 'Files', icon: 'home', click: createIonFunction(() => {

                                                CurrentLayout.clearComponent('userFiles')
                                                CurrentLayout.setComponent('userFiles', tu)

                                            })
                                        },
                                        {
                                            label: 'Apps', icon: 'home', click: createIonFunction(async () => {
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
                                                CurrentLayout.clearComponent('userFiles')
                                                CurrentLayout.setComponent('userFiles', demo_please)

                                            })
                                        },
                                        {
                                            label: 'Help', icon: 'help', click: createIonFunction(async () => {

                                                CurrentLayout.clearComponent('userFiles')
                                                CurrentLayout.setComponent('userFiles', menu_set)

                                            })
                                        },
                                    ]
                                }
                            }
                        }
                    ]

                ]
                let main_layout = {
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
                                'component': tu
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

            }

            return resolve()
        }
    })
}
