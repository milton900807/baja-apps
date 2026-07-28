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
                                            'label': 'Sequence', 'items': [
                                                {
                                                    'label': 'Selected sequences', 'ionfunction': createIonFunction(async () => {
                                                        graph.setMessage('Select a track ')
                                                        graph.rungraph(() => await exec('baja/screens/menu/primer-probe-action.js', graph, genegraph_panel_layout))
                                                        CurrentLayout.setComponent('labelPanel', {
                                                            wid: 'html',
                                                            data: ' Click on a track to see menu options... '
                                                        })

                                                    })
                                                },
                                            ]
                                        },
                                        {
                                            'label': 'Annotations (not available)', 'items': [
                                                {
                                                    'label': 'Exons', 'ionfunction': createIonFunction(async () => {
                                                    })
                                                },
                                                {
                                                    'label': 'Introns', 'ionfunction': createIon(async () => {
                                                    })
                                                },
                                                {
                                                    'label': 'Motifs', ionFunction: createIonFunction(async () => {
                                                    })

                                                }

                                            ]
                                        }
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
