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
        let primerProbeButtons = [
            {
                x: 0,
                y: 0,
                label: 'New Transcript',
                ionFunction: createIonFunction(async () => {

                    exec('baja/screens/add-track.js', graph)



                }),
                icon: await exec('icons/svg/plus'),
                mouseOver: createIonFunction(() => {
                    graph.setMessage('Create new transcript track');
                })
            },
            {
                x: 2,
                y: 0,
                label: 'New primers',
                ionFunction: createIonFunction(async () => {
                    graph.setMessage('Select a track');

                    graph.rungraph(async () => {
                        await exec(
                            'baja/screens/menu/primer-probe-action.js',
                            graph,
                            genegraph_panel_layout
                        );
                    });

                    CurrentLayout.setComponent('labelPanel', {
                        wid: 'html',
                        data: ' Click on a track to see menu options... '
                    });
                }),
                icon: await exec('icons/svg/plus'),
                mouseOver: createIonFunction(() => {
                    graph.setMessage('Create new primer-probes');
                })
            },

            {
                x: 4,
                y: 0,
                label: 'Set probe',
                ionFunction: createIonFunction(async () => {
                    let attr_window = 20;

                    let va = await prompt(
                        'Length',
                        ['Length'],
                        { Length: attr_window },
                        300,
                        300
                    );

                    let m = va['Length'];

                    if (m === null) {
                        attr_window = 20;
                    } else {
                        attr_window = parseInt(m);
                    }

                    graph.rungraph(async () => {
                        await exec(
                            'baja/screens/menu/probe-action.js',
                            graph,
                            genegraph_panel_layout,
                            attr_window
                        );
                    });

                    CurrentLayout.setComponent('labelPanel', {
                        wid: 'html',
                        data: ' Click on a track to see menu options... '
                    });
                }),
                icon: await exec('icons/svg/probe'),
                mouseOver: createIonFunction(() => {
                    graph.setMessage('Set probe length and select a track');
                })
            },

            {
                x: 6,
                y: 0,
                label: 'Remove all',
                ionFunction: createIonFunction(async () => {
                    let confirm = await exec(
                        'baja/lib/confirm-widget.js',
                        async () => {
                            graph.setMessage(' ');

                            graph.rungraph(async () => {
                                for (let t of graph.track) {
                                    let am = [];

                                    for (let oligo of t.oligos) {
                                        if (oligo.type === 'amplicon') {
                                            am.push(oligo);
                                        }
                                    }

                                    if (am.length > 0) {
                                        t.removeOligos(am);
                                    }
                                }
                            });
                        },
                        'Are you sure you want to remove all primer-probes?'
                    );

                    showModal(confirm);
                }),
                icon: await exec('icons/svg/trash'),
                mouseOver: createIonFunction(() => {
                    graph.setMessage('Remove all primer-probes');
                })
            },

            {
                x: 8,
                y: 0,
                label: 'Edit',
                ionFunction: createIonFunction(async () => {
                    graph.setMessage('Select a track');

                    graph.rungraph(async () => {
                        await exec(
                            'baja/screens/menu/primer-probe-action-edit.js',
                            graph,
                            genegraph_panel_layout
                        );
                    });

                    CurrentLayout.setComponent('labelPanel', {
                        wid: 'html',
                        data: ' Click on a track to see menu options... '
                    });
                }),
                icon: await exec('icons/svg/edit'),
                mouseOver: createIonFunction(() => {
                    graph.setMessage('Edit primer-probes');
                })
            }
        ];

        let bpanel = {
            wid: 'button-canvas',
            data: {
                title: 'Primer-probes',
                height: 35,
                grid: {
                    xmin: 0,
                    xmax: 10,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                buttons: primerProbeButtons,
                background: 'white'
            }
        };
        resolve(bpanel);
    })

}
