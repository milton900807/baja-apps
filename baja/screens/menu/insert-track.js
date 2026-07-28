function (graph) {

    graph.clearMouseListeners();
    graph.selectOff();
    graph.addMouseDownListener(async (x, y) => {

        let editor1;
        let cb3 = createIonFunction((_editor) => {
            editor1 = _editor;
        })

        const { Track, TrackRef } = await exec('baja/bio/track.js')

        graph.showMenu([
            {
                label: 'ENSEMBL ID here....',
                click: () => {
                    let v = '';
                    let export_sequence = {
                        wid: 'card',
                        data: {
                            height: '800px',
                            cards: [
                                [
                                    {
                                        'title': '',
                                        'width': '100%',
                                        'component': {
                                            wid: 'input-textfield',
                                            data: {
                                                'show-button': false,
                                                'title': 'ENSEMBLE ID',
                                                'ionHookFunction': createIonFunction((input_box) => {
                                                    v = input_box;
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
                                                        label: 'Load', ionFunction: createIonFunction(async () => {
                                                            await graph.add(v.value, x, y)
                                                            hideAllModal();
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
                    showModal(export_sequence)

                },
                move: () => {

                }

            },
            {
                label: 'FASTA  here....',
                click: () => {

                    let editor;
                    let cb = createIonFunction((_editor) => {
                        editor = _editor;
                    })

                    let v = '';
                    let export_sequence = {
                        wid: 'card',
                        data: {
                            height: '800px',
                            cards: [
                                [
                                    {
                                        'title': '',
                                        'width': '100%',
                                        'component': {
                                            wid: 'text-editor',
                                            refCallback: cb,
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
                                                        label: 'Load', ionFunction: createIonFunction(async () => {
                                                            await graph.addFASTA(editor.code, x, y)
                                                            hideAllModal();
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
                    showModal(export_sequence)

                },
                move: () => {

                }

            }, {
                label: 'CLUSTAL Tracks  here....',
                click: () => {
                    let v = '';
                    let export_sequence = {
                        wid: 'card',
                        data: {
                            height: '800px',
                            cards: [
                                [
                                    {
                                        'title': 'CLUSTAL O Alignment file',
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
                                                        label: 'Load', ionFunction: createIonFunction(async () => {
                                                            hideAllModal();
                                                            exec('baja/bio/alginment-to-tracks.js', editor1.code, x, y).then(tracks => {
                                                                let prev = null;
                                                                for (let t of tracks) {

                                                                    graph.track.push(t)
                                                                    prev = t;
                                                                }
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
                    showModal(export_sequence)

                },
                move: () => {

                }

            }
        ], x, y)
    })
}
