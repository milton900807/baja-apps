function (plot) {
    return new Promise(async (resolve, reject) => {
        function replaceFirstNode(path, withf) {

            const startsWithSlash = path.startsWith('/');
            if (!startsWithSlash) {
                path = '/' + path;
            }

            const parts = path.split('/');

            for (let i = 1; i < parts.length; i++) {
                if (parts[i].length > 0) {
                    parts[i] = withf;
                    break;
                }
            }

            const newPath = parts.join('/');

            return startsWithSlash ? newPath : newPath.substring(1);
        }
        let MSGraph = await exec('lib/msgraph.js');
        let __path = '';
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
                        let jsonobj = {
                            'path': path,
                            'user': getUser()
                        }
                        let host_ = window['env']['apiUrl']
                        let index = path.lastIndexOf('/')
                        let rs = await POSTJSON(jsonobj, host_ + '/load-file');
                        let p = decodeURIComponent(path).substring(index + 1)
                        if (rs.msg && rs.msg.length) {
                            showWidget({
                                wid: 'html',
                                data: "<hr> " + rs.msg
                            })
                            return;

                        } else {

                            console.log('debubg');
                            showModal({
                                wid: 'json',
                                data: JSON.stringify(rs)
                            })

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
                                    label: 'Yakbench',
                                    ionfunction: createIonFunction(() => {
                                        clear();

                                        exec('baja/yak.js')

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
                                        filetype: '.bjb',
                                        drive: 'user',
                                        user: getUser(),

                                        root: '/' + getUser(),
                                        "ionfunction.fileClick": createIonFunction(async (element) => {
                                            CurrentLayout.reset('mainPanel');
                                            setTimeout(async () => {
                                                let path = replaceFirstNode(element.path, getUser())
                                                let jsonobj = {
                                                    'path': path,
                                                    'user': getUser()
                                                }
                                                let host_ = window['env']['apiUrl']
                                                let index = path.lastIndexOf('/')
                                                let rs = await POSTJSON(jsonobj, host_ + '/load-file');
                                                let currentPath = path;
                                                currentPath = path.replace('//', '/')
                                                setTimeout(async () => {

                                                    let importtimelines = [];
                                                    let pl = rs.plateTrack;
                                                    let flist = pl.root;

                                                    function extractTimelines(udata) {
                                                        if (udata.m_plots && udata.m_plots.length > 0) {
                                                            for (let m of udata.m_plots) {
                                                                if (m.type === 'timeline') {
                                                                    importtimelines.push(m);
                                                                }
                                                            }
                                                        }
                                                        if (udata.root && udata.root.length > 0) {
                                                            for (let child of udata.root) {
                                                                if (child.plateType === 'package') {
                                                                    const nestedData = __decompress(child.wells[0][0].properties['package']);
                                                                    extractTimelines(nestedData);
                                                                }
                                                            }
                                                        }
                                                    }

                                                    console.log('debubg');

                                                    for (let object of flist) {
                                                        if (object.plateType === 'package') {
                                                            const udata = __decompress(object.wells[0][0].properties['package']);
                                                            extractTimelines(udata);
                                                        }
                                                    }

                                                    for (let i of importtimelines) {
                                                        plot.scatterData.points.push(...i.scatterData.points);
                                                    }
                                                }, 1000)

                                            }, 1000)

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
                                                    CurrentLayout.reset('mainPanel');

                                                })
                                            },
                                            {
                                                label: 'Open', ionFunction: createIonFunction(async () => {
                                                    CurrentLayout.reset('mainPanel');
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
