function (graph, io) {

    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.addMouseDownListener((x, y) => {

        let editor;

        let cb3 = createIonFunction((ref) => {
            editor = ref;
        })

        graph.showMenu([
            {
                label: 'Apply SNVs',
                click: () => {
                    showModal({
                        wid: 'card',
                        data: {
                            height: '800px',
                            cards: [
                                [
                                    {
                                        'title': 'SNV table',
                                        'width': '100%',
                                        'component': {
                                            wid: 'text-editor',
                                            refCallback: cb3,
                                            data: ''
                                        }
                                    },
                                    {
                                        'title': '',
                                        'width': '100%',
                                        'component': {
                                            wid: 'mt-button', data: {
                                                buttons: [
                                                    {
                                                        label: 'Apply', ionFunction: createIonFunction(async () => {
                                                            hideAllModal();
                                                            exec('baja/bio/overlay-annotations-on-track.js', graph, editor.code, x, y).then(tracks => {

                                                            })
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

                    ).then(async (editor) => {
                    })
                },
                move: () => {
                }
            },
            {
                label: 'Apply Insertions',
                click: () => {
                },
                move: () => {
                }

            },
            {
                label: 'Apply Deletions',
                click: () => {
                },
                move: () => {
                }
            }

        ], x, y)

    })
}
