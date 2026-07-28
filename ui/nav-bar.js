function () {

    return new Promise(async (resolve, reject) => {
        let xmac_ = 40
        let height = 20;
        let buttons = []
        let bbuttons = []

        let selected = '';
        let lb = null;

        buttons = [
            {
                x: 0, y: 0, label: 'Left', ionFunction: createIonFunction(() => {
                    selected = 'left.png'
                    lb.setHTML(selected);
                }), icon: '/assets/img/icons/png/left.png'
            },
            {
                x: 2, y: 0, label: 'Right', ionFunction: createIonFunction(() => {
                    selected = 'right.png'
                    lb.setHTML(selected);
                }), icon: '/assets/img/icons/png/right.png'
            },
            {
                x: 4, y: 0, label: 'Up', ionFunction: createIonFunction(() => {
                    selected = 'up.png'
                    lb.setHTML(selected);
                }), icon: '/assets/img/icons/png/up.png'
            },
            {
                x: 6, y: 0, label: 'Down', ionFunction: createIonFunction(() => {
                    selected = 'down.png'
                    lb.setHTML(selected);
                }), icon: '/assets/img/icons/png/down.png'
            },
            {
                x: 8, y: 0, label: 'Zoom out', ionFunction: createIonFunction(() => {
                    selected = 'zoom-out.png'
                    lb.setHTML(selected);
                }), icon: '/assets/img/icons/png/zoom-out.png'
            },
            {
                x: 10, y: 0, label: 'zoom in', ionFunction: createIonFunction(() => {
                    selected = 'zoom-in.png'
                    lb.setHTML(selected);
                }), icon: '/assets/img/icons/png/zoom-in.png'
            },
            {
                x: 12, y: 0, label: 'expand up', ionFunction: createIonFunction(() => {
                    selected = 'contract-y.png'
                    lb.setHTML(selected);
                }), icon: '/assets/img/icons/png/contract-y.png'
            },
            {
                x: 14, y: 0, label: 'expand down', ionFunction: createIonFunction(() => {
                    selected = 'expand-y-up.png'
                    lb.setHTML(selected);
                }), icon: '/assets/img/icons/png/expand-y-up.png'
            },
        ]

        bbuttons = [
            {
                x: 0, y: 0, label: 'Bookmark', ionFunction: createIonFunction(async () => {
                    selected = 'bookmark.png'
                    lb.setHTML(selected);
                }), icon: '/assets/img/icons/png/bookmark.png'

            },
            {
                x: 2, y: 0, label: 'Show Bookmark', ionFunction: createIonFunction(async () => {
                    selected = 'show-bookmarks.png'
                    lb.setHTML(selected);
                }), icon: '/assets/img/icons/png/show-bookmarks.png'

            },
            {
                x: 4, y: 0, label: 'Show Tracks', ionFunction: createIonFunction(async () => {
                    selected = 'menu-bar.png'
                    lb.setHTML(selected);
                }), icon: '/assets/img/icons/png/menu-bar.png'

            },
            {
                x: 6, y: 0, label: 'Map Oligos', ionFunction: createIonFunction(async () => {
                    selected = 'map.png'
                    lb.setHTML(selected);
                }), icon: '/assets/img/icons/png/map.png'

            }, {
                x: 8, y: 0, label: 'Move options', ionFunction: createIonFunction(async () => {
                    selected = 'move.png'
                    lb.setHTML(selected);
                }), icon: '/assets/img/icons/png/move.png'

            }, {
                x: 10, y: 0, label: 'Box zoom', ionFunction: createIonFunction(async () => {
                    selected = 'nav.png'
                    lb.setHTML(selected);
                }), icon: '/assets/img/icons/png/nav.png'

            },

            {
                x: 12, y: 0, label: 'resize x', ionFunction: createIonFunction(() => {
                    selected = 'contract-x2.png'
                    lb.setHTML(selected);
                }), icon: '/assets/img/icons/png/contract-x2.png'
            },
            {
                x: 14, y: 0, label: 'expand down', ionFunction: createIonFunction(() => {
                    selected = 'expand-x2.png'
                    lb.setHTML(selected);
                }), icon: '/assets/img/icons/png/expand-x2.png'

            },
        ]

        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': height,
                'grid': {
                    xmin: 0,
                    xmax: xmac_,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': buttons
            }
        }

        let bottom_button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': height,
                'grid': {
                    xmin: 0,
                    xmax: xmac_,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': bbuttons
            }
        }

        let buttonMenuPanel = {
            wid: 'card',
            data: {
                cards: [
                    [

                        {
                            'title': '',
                            'component': button_canvas
                        },
                        {
                            'title': '',
                            'component': bottom_button_canvas

                        }
                    ]]
            }
        }
        showWidget(buttonMenuPanel)

        lb = await showWidget({
            wid: 'html',
            data: `
                Selected icon:
                `
        })

        let file = null;
        let ps = '';
        let path = createIonFunction((p) => {
            ps = p;
        })

        let ww = {
            wid: 'input-param-items',
            componentRef: path,
            data: {
                input_labels: ['Icon'],
                buttons: [{
                    'label': 'Save', 'function': createIonFunction(async (button_label, input_params) => {
                        if (file) {

                            let host_ = window['env']['apiUrl']
                            let jsonobj = {
                                'name':selected
                            }
                            let rs = await POSTFile(file, jsonobj, host_ + '/save-icon');
                            if (rs.status === "saved") {
                            }
                        }
                    })
                }]
            }
        }

        let data_drop = {
            wid: 'file-drop',
            data: {
                'getRef': createIonFunction((ref) => {
                }),
                'onDropFunction': createIonFunction(async (_file) => {
                    file = _file;
                    let host_ = window['env']['apiUrl']
                    let jsonobj = {
                        'name':selected
                    }
                    let rs = await POSTFile(file, jsonobj, host_ + '/save-icon');
                    if (rs.status === "saved") {
                    }
                }),
		    'showUploadButton':false
            }
        }
        let plate_panel = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '800px',
                cards: [
                    [
                        {
                            'width': '100%',
                            'height': "300px",
                            'component': data_drop
                        }
                    ]]
            }
        }
        showWidget(plate_panel)

    })
}
