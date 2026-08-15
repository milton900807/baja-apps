function (graph) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.addMouseDownListener(async (x, y) => {
        let editor;

        graph.showMenu([
            {
                label: 'Count bases',
                click: async () => {
                    let trackIndex = graph.getTrack(x, y);
                    if (trackIndex >= 0) {
                        let selectedTrack = graph.track[trackIndex]
                        let length = selectedTrack.sequence.length;
                        graph.setMessage(' Bases : ' + length);

                    }
                },
                move: () => {
                }
            }, {
                label: 'Motif',
                click: async () => {
                    let trackIndex = graph.getTrack(x, y);
                    if (trackIndex >= 0) {

                        let motif_modal = {
                            wid: 'card',
                            data: {
                                height: '800px',
                                cards: [
                                    [
                                        {
                                            'width': '100%',
                                            "style.padding-top": '4px',
                                            "style.border": '1px',
                                            'component':
                                            {
                                                'wid': 'input-textfield',
                                                'title': 'Motif :',
                                                'data': {
                                                    'blocking': false,
                                                    'show-button': false,
                                                    'ionHookFunction': createIonFunction((w) => {
                                                    }),
                                                    'ionfunction': createIonFunction((title) => {
                                                    })
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
                                                            label: 'Run', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();

                                                                if (trackIndex >= 0) {
                                                                    let selectedTrack = graph.track[trackIndex]
                                                                    let length = selectedTrack.sequence.count ( );
                                                                    graph.setMessage(' Bases : ' + length);

                                                                }

                                                            })
                                                        },
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(() => {
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
                        showModal(motif_modal)

                    }
                },
                move: () => {
                }
            },
            {
                label: 'Track width',
                click: () => {
                    let trackIndex = graph.getTrack(x, y);
                    if (trackIndex >= 0) {
                        let selectedTrack = graph.track[trackIndex]
                        graph.setMessage(' Width : ' + selectedTrack.tgraph.width);

                    }
                },
                move: () => {
                }

            },
            {
                label: 'Track Height',
                click: () => {

                    let trackIndex = graph.getTrack(x, y);
                    if (trackIndex >= 0) {
                        let selectedTrack = graph.track[trackIndex]
                        graph.setMessage(' Height : ' + selectedTrack.tgraph.height);
                    }

                },
                move: () => {
                }

            },

        ], x, y)

    })
}
