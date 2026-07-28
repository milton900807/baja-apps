function (graph, genegraph_panel_layout) {

    let editor_;
    let editor_function = createIonFunction((editor) => {
        editor_ = editor;
    })

    return new Promise(async (resolve, reject) => {
        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
        let panel = null;
        let __nameHook = createIonFunction((name) => {
            panel = name;
        })
        let bpanel = {
            wid: 'card',
            data: {
                cards: [
                    [
                        {
                            width: '100%',
                            'component': {
                                wid: 'menu',
                                data: {
                                    title: '  ',
                                    style: 'sub-container',
                                    menus: [
                                        {
                                            'label': 'Primer-probes', 'items': [
                                                {
                                                    'label': 'New primers...', 'ionfunction': createIonFunction(async () => {
                                                        graph.setMessage('Select a track ')
                                                        graph.rungraph(async () => { await exec('baja/screens/menu/primer-probe-action.js', graph, genegraph_panel_layout) })
                                                        CurrentLayout.setComponent('labelPanel', {
                                                            wid: 'html',
                                                            data: ' Click on a track to see menu options... '
                                                        })

                                                    })
                                                },
                                                {
                                                    'label': 'Set probe...', 'ionfunction': createIonFunction(async () => {
                                                        let attr_window = 20;
                                                        let va = await prompt("Length", ["Length"], { "Length": attr_window }, 300, 300)
                                                        let m = va['Length']
                                                        if (m === null) {
                                                            attr_window = 20
                                                        } else {
                                                            attr_window = parseInt(m);
                                                        }

                                                        graph.rungraph(async () => { await exec('baja/screens/menu/probe-action.js', graph, genegraph_panel_layout, attr_window) })
                                                        CurrentLayout.setComponent('labelPanel', {
                                                            wid: 'html',
                                                            data: ' Click on a track to see menu options... '
                                                        })

                                                    })
                                                },
                                                {
                                                    'label': 'Remove all primer-probes', 'ionfunction': createIonFunction(async () => {

                                                        let confirm = await exec('baja/lib/confirm-widget.js', async () => {
                                                            graph.setMessage(" ")

                                                            graph.rungraph(async () => {
                                                                for (let t of graph.track) {
                                                                    let am = []

                                                                    for (let oligo of t.oligos) {
                                                                        if (oligo.type === 'amplicon') {
                                                                            am.push(oligo);
                                                                        }
                                                                    }
                                                                    if (am.length > 0)
                                                                        t.removeOligos(am);
                                                                }

                                                            });
                                                        }, "Are you sure you want to remove all primer-probes?")
                                                        showModal(confirm)

                                                    })
                                                },

                                                {
                                                    'label': 'Edit', 'ionfunction': createIonFunction(async () => {
                                                        graph.setMessage('Select a track ')
                                                        graph.rungraph(async () => { await exec('baja/screens/menu/primer-probe-action-edit.js', graph, genegraph_panel_layout) })
                                                        CurrentLayout.setComponent('labelPanel', {
                                                            wid: 'html',
                                                            data: ' Click on a track to see menu options... '
                                                        })

                                                    })
                                                },
                                            ]
                                        },

                                    ]
                                }
                            }
                        },

                    ]
                ]
            }
        }
        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
        CurrentLayout.setComponent('buttonMenuPanel', bpanel);

        resolve();
    })

}
