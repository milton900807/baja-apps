function (lib, folder, experimentFile) {

    return new Promise(async (resolve, rejct) => {
        let MSGraph = await exec('lib/msgraph.js');
        let sharepoint_config = {
            'scope': ['User.Read', 'Files.Read', 'Files.ReadWrite', 'Files.ReadWrite.All', 'Sites.Read.All',
                'Sites.ReadWrite.All']
        }
        let client = await MSGraph.getClient(sharepoint_config);

        if (!lib.id) {
            let libid = lib;
            lib = await client.api(`/drives/${libid}`).get();
            folder = await client.api(`/drives/${libid}/items/${folder}`).get();
            experimentFile = await client.api(`/drives/${libid}/items/${experimentFile}`).get();
        }

        await clear();
        let cwrite = await MSGraph.canWriteToLib(lib.id)
        let readonly = false;
        if (!cwrite) {
            log("This folder is Readonly ")
            readonly = true;
        }
        let experimentid = experimentFile.name;
        if (experimentid.indexOf('.') > 0) {
            experimentid = experimentid.substring(0, experimentid.lastIndexOf('.'))
        }

        let path = `/drives/${lib.id}/items/${experimentFile.id}`
        let exppath = '/drives/' + lib.id + '/items/' + folder.id + '/children'

        let me = await client.api('/me').get()

        let msobject = await client.api(path).get();
        if (msobject == null) {

            let bu = {
                wid: 'button',
                data: {
                    'label': 'Back to experiment search...', 'function': createIonFunction(() => {
                        clear();

                    }),
                    'icon': 'action-undo-3x.png'
                }
            }
            showWidget(bu);
            return;
        }

        const host = window["env"]["sharepoint_host"];

        let etg = experimentFile['eTag'];
        etg = etg.trim();
        let start = etg.indexOf('{')
        let end = etg.indexOf('}')
        if (start > 0) {
            let t = etg.substring(start + 1, end)
            let doc = `https://${host}/_layouts/15/Doc.aspx?sourcedoc=%7B${t}%7D&file=${experimentFile.name}&amp;action=embedview&amp;wdStartOn=1`
            let w = {
                'wid': 'eln',
                componentRef: 'eln',
                'data': {
                    'experimentID': experimentid,
                    'groupID': "",
                    'driveID': lib.id,
                    'readonly': readonly,
                    'mainDocURL': doc,
                    "experimentPath": exppath,
                    "dataMenuActions": {
                        'docx': [
                            {
                                name: 'Open', ionfunction: createIonFunction((doc) => {
                                    let url = doc['webUrl']
                                    window.open(url, "_blank");
                                })
                            }
                        ],
                        'json': [
                            {
                                name: 'View', ionfunction: createIonFunction(async (f) => {

                                    let id = f.id;
                                    let libid = lib.id;

                                    window.open(`/app/baja/screens/open-screen?lib_id=${libid}&file_id=${id}`)

                                })
                            }
                        ],
                        'screen': [
                            {
                                name: 'Screen Editor', ionfunction: createIonFunction(async (f) => {

                                    let id = f.id;
                                    let libid = lib.id;
                                    let rooturl = window.location.hostname;
                                    window.open(`/app/baja/screens/open-screen?lib_id=${libid}&file_id=${id}`)

                                })
                            }
                        ],
                        'vcf': [
                            {
                                name: 'Install vcf', ionfunction: createIonFunction(async (f) => {
                                    console.log('debubg');
                                    hideAllModal();
                                    exec('baja/io/install-largefile.js', lib, folder, f, w, "vcf")

                                })
                            }
                        ],
                        'vcf.gz': [
                            {
                                name: 'Install vcf', ionfunction: createIonFunction(async (f) => {
                                    console.log('debubg');
                                    hideAllModal();

                                    exec('baja/io/install-largefile.js', lib, folder, f, w, "vcf")

                                })
                            }
                        ],
                        'bigwig': [
                            {
                                name: 'Install bigwig', ionfunction: createIonFunction(async (f) => {
                                    exec('baja/io/install-largefile.js', lib, folder, f, w, "bw")

                                })
                            }
                        ],
                        'bw': [
                            {
                                name: 'Install bigwig', ionfunction: createIonFunction(async (f) => {
                                    exec('baja/io/install-largefile.js', lib, folder, f, w, "bw")

                                })
                            }
                        ],
                        'bed': [
                            {
                                name: 'Install ', ionfunction: createIonFunction(async (f) => {
                                    exec('baja/io/install-largefile.js', lib, folder, f, w, "bed")
                                })
                            }

                        ],
                        'bb': [
                            {
                                name: 'Install bed', ionfunction: createIonFunction(async (f) => {
                                    exec('baja/io/bed/install-bed.js', lib.id, folder.id, f.id, 'inst')
                                })
                            }
                        ]
                    },
                    "folderMenuItems": [
                        {
                            'label': 'Screen',
                            'ionfunction': createIonFunction(() => {

                                clear();
                                exec('baja/screens/open-screen', lib.id, folder.id)
                            })
                        },

                    ],
                    "menuItems": [
                        {
                            "label": "Folder View",
                            "click": createIonFunction(() => {
                                clear();
                                exec('baja/eln/folder-view.js', lib.id, folder.id)

                            })
                        }, {
                            'label': 'Edit Summary',
                            'click': createIonFunction(() => {
                                let url = msobject['webUrl'];
                                var win = window.open(url, '_blank');
                                win.focus();
                            })
                        },
                        {
                            "label": "Share",
                            "click": createIonFunction(() => {
                            })
                        },

                    ],
                }
            }
            folder_view = await showWidget(w);
        }

        resolve();

    });
}
