function () {

    return new Promise(async (resolve, reject) => {

        let buttons = [
            {
                x: 1, y: 0, label: 'How do I begin?', ionFunction: createIonFunction(() => {

                }),
            },
            {
                x: 3, y: 0, label: 'Upload', ionFunction: createIonFunction(() => {

                }),
            },

            {
                x: 5, y: 0, label: 'Previous work', ionFunction: createIonFunction(() => {

                }),
            },

        ]

        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 25,
                'grid': {
                    xmin: 0,
                    xmax: 10,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': buttons
            }
        }
        let __nameComponent;
        let __nameHook = createIonFunction((ref) => {
            __nameComponent = ref;
        })
        let currentFolder = null;

        let folderpath = getUser() + '/pit'
        let icon_canvas = {
            wid: 'card',
            data: {
                padding: "1px",
                height: '20px',
                cards: [
                    [
                        {
                            'title': ' ', 'body': ``,
                            'width': '90%',
                            'component':
                            {

                                wid: 'simple-file-browser',
                                width: '100%',
                                height: '30px',
                                refCallback: __nameHook,
                                data: {
                                    "ionfunction.cmd": createIonFunction((element) => {
                                    }),
                                    width: '100%',
                                    columns: 10,
                                    showSearch: false,
                                    drive: 'user',
                                    user: getUser(),

                                    root: folderpath,

                                    "ionfunction.fileClick": createIonFunction(async (element) => {
                                        let path = element.path
                                        let config = {
                                            silent: true,
                                            user: getUser()
                                        }
                                        let jsonobj = {
                                            'path': path,
                                            'key': 'user',
                                            'user': getUser()
                                        }
                                        let host_ = window['env']['apiUrl']
                                        let index = path.lastIndexOf('/')
                                        let rs = await POSTJSON(jsonobj, host_ + '/load-file');
                                        let p = decodeURIComponent(path).substring(index + 1)
                                        if (rs.msg) {
                                            clear();
                                            log(rs.msg + ' ' + p)
                                            return;
                                        } else {
                                            await graph.update(rs);
                                            graph.file = p;
                                        }

                                    }),
                                    "ionfunction.openfile": createIonFunction(async (file, text) => {
                                    }
                                    ),
                                    "ionfunction.path": createIonFunction(async (path, nodes) => {

                                    })
                                }
                            }
                        }
                    ]]
            }
        }

        resolve ( {
            wid:'html',
            data: ` `
        })

    })
}
