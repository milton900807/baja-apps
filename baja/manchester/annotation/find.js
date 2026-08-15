function (lib, folderid, graph) {

    let ed;

    let find_panel = {
        wid: 'card',
        componentRef: 'bottomPanel',
        data: {
            height: '80px',
            width: '1100px',
            cards: [
                [
                    {
                        'title': '', 'body': ``,
                        'width': '20%',
                        'component':
                        {
                            wid: 'html',
                            'data': `Annotation name`
                        }
                    },
                    {
                        'title': '', 'body': ``,
                        'width': '20%',
                        'component':
                        {
                            wid: 'input-textfield',

                            'data': {
                                'blocking': false,
                                'show-button': false,
                                'ionHookFunction': createIonFunction((w) => {
                                    ed = w
                                }),
                                'ionfunction': createIonFunction((title) => {
                                })
                            }
                        }
                    },
                    {
                        'title': '', 'body': ``,
                        'width': '49%',
                        'component':
                        {
                            wid: 'button',
                            data: {
                                label: 'Find',
                                'function': createIonFunction(() => {

                                    let alist = []
                                    let value = ed.value;
                                    let tracks = graph.track
                                    for (let t of tracks) {

                                        let annotations = t.annotations;
                                        for (let a of annotations) {
                                            if (a.name.toLowerCase().indexOf(value.toLowerCase()) >= 0) {
                                                alist.push({ 't': t, 'a': a });
                                            }
                                        }
                                    }

                                    let b = []
                                    let i = 0;
                                    for (let al of alist) {
                                        let c = {
                                            x: 0, y: i, label: '' + al.a.name, ionFunction: createIonFunction(() => {
                                                hideAllModal();
                                                graph.animateTo(al.t.tgraph.X(al.a.xi - 5),
                                                    al.t.tgraph.X(al.a.xf + 5),
                                                    al.t.tgraph.Y(al.a.y - 2),
                                                    al.t.tgraph.Y(al.a.y + 2))
                                            })
                                        }
                                        b.push(c)
                                        i++;
                                    }

                                    let heightl = i * 25
                                    let button_canvas = {
                                        wid: 'button-canvas',
                                        data: {
                                            'title': 'controls',
                                            'height': heightl,
                                            'width': 500,
                                            'grid': {
                                                xmin: 0,
                                                xmax: 1,
                                                ymin: -0.01,
                                                ymax: alist.length,
                                                xinset: 0,
                                                yinset: 0
                                            },
                                            'buttons': b
                                        }
                                    }

                                    let tpanel = {
                                        wid: 'card',
                                        data: {
                                            height: '580px',
                                            width: '600px',
                                            cards: [
                                                [
                                                    {
                                                        'title': '', 'body': ``,
                                                        'width': '20%',
                                                        'component': button_canvas
                                                    }
                                                ]
                                            ]
                                        }
                                    }
                                    showModal(tpanel)
                                }),
                                'disableAfterClick': false
                            }
                        }
                    },

                ],

            ]
        }
    }

    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
    CurrentLayout.setComponent('buttonMenuPanel', find_panel);
}
