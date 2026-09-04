function (__path) {
    if (!__path) {
        __path = '/' + getUser()
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
                        } else if (element.path.endsWith('.bjb')) {
                            clear();
                            let config = {
                                silent: true,
                                user: getUser(),
                                mode: 'editor'
                            }
                            exec('cpd/bajabio-project', element.path, config, `/app/cpd/bajabio-project`)
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
                                                                        CurrentLayout.clearComponent('mainFilePanel')
                                                                        CurrentLayout.setComponent('mainFilePanel', main_layout);

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
                                                                        CurrentLayout.clearComponent('mainFilePanel')
                                                                        CurrentLayout.setComponent('mainFilePanel', main_layout);

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
                                CurrentLayout.clearComponent('mainFilePanel')
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

            // Clicking a .vcf.gz / .bed.gz here (the general file browser -- no canvas, no
            // track to click first the way baja/data/my-data.js's track-first flow works)
            // applies it straight onto whichever tracks are current on the graph the user
            // still has open elsewhere. "Elsewhere" is reached via
            // CurrentLayout.getStashed('graph') -- the same mechanism baja/lib/confirm.js
            // already relies on to find "the current graph" from outside the editor -- and
            // "current tracks" via baja/lib/target-tracks.js's usual precedence (a sequence
            // selection, else selected tracks, else every track). The actual VCF/BED ->
            // track conversion is the exact same code baja/data/my-data.js's track-first
            // flow uses, factored out to baja/data/apply-vcf-to-track.js /
            // apply-bed-to-track.js so the two flows can't drift apart.
            const applyGzFileToCurrentGraph = async (element) => {
                const graph = (typeof CurrentLayout !== 'undefined' && CurrentLayout.getStashed)
                    ? CurrentLayout.getStashed('graph') : null;
                if (!graph) {
                    infoPrompt(' Open the RNA editor first (that is what this loads onto), then come back and click this file again. ');
                    return;
                }

                const lname = ('' + (element.name || element.path || '')).toLowerCase();
                let kind = null;
                if (lname.endsWith('.vcf.gz')) kind = 'vcf';
                else if (lname.endsWith('.bed.gz')) kind = 'bed';
                if (!kind) {
                    infoPrompt(' ' + (element.name || element.path)
                        + ' is gzipped but not a type this loads directly (.vcf.gz / .bed.gz). '
                        + 'Open it from the "My data" library on a track instead. ');
                    return;
                }

                let target = null;
                try { target = await exec('baja/lib/target-tracks.js', graph); } catch (e) { target = null; }
                const tracks = (target && target.items && target.items.filter((t) => t && t.chr != null)) || [];
                if (!tracks.length) {
                    infoPrompt(' No track with a chromosome to apply ' + (element.name || element.path)
                        + ' to -- load a gene/transcript track first. ');
                    return;
                }

                const fixChr = (ochr) => {
                    if (/^chrx$/i.test(ochr)) return 'X';
                    if (/^chry$/i.test(ochr)) return 'Y';
                    return ochr;
                };

                let totalCount = 0;
                for (const t of tracks) {
                    let chr = '' + t.chr;
                    if (!chr.startsWith('chr')) chr = 'chr' + chr;
                    chr = fixChr(chr);
                    const sel = (t.selectedRange && t.selectedRange()) || null;
                    const start = sel ? sel.start : t.xi;
                    const end = sel ? sel.end : t.xf;
                    try {
                        if (kind === 'vcf') {
                            totalCount += await exec('baja/data/apply-vcf-to-track.js', t, element.path, chr, start, end, t.strand);
                        } else {
                            totalCount += await exec('baja/data/apply-bed-to-track.js', t, element.path, chr, start, end, t.strand);
                        }
                    } catch (e) {
                        console.error('apply ' + kind + ' to track failed:', e);
                    }
                }

                try {
                    graph.setResultMessage && graph.setResultMessage(
                        ' Applied ' + (element.name || element.path) + ': ' + totalCount
                        + ' item' + (totalCount === 1 ? '' : 's') + ' across ' + tracks.length
                        + ' track' + (tracks.length === 1 ? '' : 's') + '. ');
                } catch (e) { }
            };

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
                        if (('' + (element.name || element.path || '')).toLowerCase().endsWith('.gz')) {
                            // Applies straight onto the currently-open graph's tracks and comes
                            // right back here -- no clear(), this isn't navigating anywhere.
                            await applyGzFileToCurrentGraph(element);
                            try { CurrentLayout.reset('mainPanel'); } catch (e) { }
                            return;
                        }

                        clear();
                        let config = {
                            silent: true,
                            user: getUser()
                        }
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
                        } else if (element.path.endsWith('.bjb')) {
                            clear();
                            let config = {
                                silent: true,
                                user: getUser(),
                                mode: 'editor'
                            }
                            exec('cpd/bajabio-project', element.path, config, `/app/cpd/bajabio-project`)
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
                        if (!element.name.endsWith('.baja')) {
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

            let caret = {
                wid: 'html',
                data: `<h2> <img src='/assets/img/icons/png/caret-right.png'>  </h2>
                <hr>
            `
            }

            let myfiles_button = {
            }

            let fbmenu = []

            if (__path && !__path.endsWith(getUser())) {

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
                            label: 'Apps',
                            items: [
                                {
                                    'label': 'Oligodesigner', 'ionfunction': createIonFunction(async () => {
                                        clear();
                                        await exec('manchester/editor');

                                    })
                                },
                            ]
                        },
                        {
                            label: 'Files & Folder',
                            items: [
                                {
                                    'label': 'Upload', 'ionfunction': createIonFunction(async () => {
                                        try {
                                            // userFiles_panel is set by the file browser's own
                                            // refCallback -- guarded rather than assumed, since an
                                            // unguarded .currentPath on undefined here would throw
                                            // before anything else runs, with nothing on screen to
                                            // show for it.
                                            let currentPath = (userFiles_panel && userFiles_panel.currentPath) || '/';
                                            if (!currentPath.endsWith('/'))
                                                currentPath += '/'

                                            // Put the SAME menu (already built, sitting in main_layout) straight
                                            // back into mainFilePanel when done, instead of re-running this whole
                                            // script (which redoes the MSGraph login check and could silently
                                            // land somewhere else) or jumping to baja/yak, an unrelated browser.
                                            let menu = await exec('baja/ml/upload-large-file.js', currentPath, () => {
                                                try { userFiles_panel.refresh(); } catch (e) { }


                                                CurrentLayout.clearComponent('mainFilePanel');
                                                CurrentLayout.setComponent('mainFilePanel', main_layout);
                                            });
                                        } catch (e) {
                                            console.error('Upload menu failed:', e);
                                            infoPrompt(' Could not open Upload: ' + (e && e.message ? e.message : e) + ' ');
                                        }
                                    })
                                },
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
                componentRef: 'mainFilePanel',
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
                componentRef: 'mainFilePanel1',
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

            CurrentLayout.stash('mainFilePanel1', usermain_layout)

        } else {
            login();
        }
    });
}
