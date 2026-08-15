function (graph, showMainPanel) {

    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.addMouseDownListener((x, y) => {
        let structures = graph.getStructure(x, y)
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
        }
        console.log(JSON.stringify(structures))
        if (!structures || structures.length <= 0) {
            graph.hideMenu();
            return
        }
        for (let str of structures) {
            if (str && str.length > 0) {
                for (let s of str) {

                    if (s.highlight)
                        s.highlight(400);
                }
            }
        }

        graph.showMenu([

            {
                label: 'View/Edit Object',
                click: () => {

                    if ( structures.length <= 0 ){
                        alert ( ' no structure selected ')
                        return;
                    }

                    let value = structures[0][0]

                    let editor1;
                    let cb3 = createIonFunction((_editor) => {
                        editor1 = _editor;
                        setTimeout ( () => {
                            editor1.format ();

                        }, 2000 )
                    })

                    let structure_view = {
                        wid: 'card',
                        data: {
                            height: '800px',
                            cards: [
                                [
                                    {
                                        'title': '',
                                        'width': '100%',
                                        'height': '100%',
                                        'component': {
                                            wid: 'json',
                                            refCallback: cb3,
                                            data: JSON.stringify(value)
                                        }
                                    },
                                    {
                                        'title': '',
                                        'width': '100%',
                                        'component': {
                                            wid: 'mt-button', data: {
                                                buttons: [
                                                    {
                                                        label: 'Close', ionFunction: createIonFunction(() => {
                                                            showMainPanel()
                                                        })
                                                    },
                                                    {
                                                        label: 'Apply', ionFunction: createIonFunction(async () => {

                                                            let j = JSON.parse(editor1.data)
                                                            let Oligo = await exec('flexigraph/oligo.js')
                                                            const index = selectedTrack.oligos.findIndex(item => item.id === j.id);
                                                            if (index >= 0) {
                                                                selectedTrack.oligos[index] = Object.assign (new Oligo(), j);
                                                            }else
                                                            {
                                                                alert ( ' The object id was not found ' + j.id)
                                                                return;
                                                            }
                                                            showMainPanel()
                                                        })
                                                    },
                                                ]
                                            }
                                        }
                                    }
                                ]]
                        }
                    }
                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', structure_view);
                },
                move: () => {

                }

            },
            {
                label: 'View >Sequence',
                click: () => {

                    let strs = '';
                    for (let row of structures) {
                        for (let s of row) {
                            strs += s.sequence + '\n'
                        }
                    }
                    showModal({
                        wid: 'text-editor',
                        data: {
                            width: '700px',
                            'code': strs
                        }
                    })
                },
                move: () => {

                }

            },
            {
                label: 'Delete',
                click: () => {

                    let track = null;
                    let trackIndex = graph.getTrack(x, y)
                    if (trackIndex >= 0) {
                        track = graph.track[trackIndex]
                    }
                    for (let row of structures) {
                        for (let col of row) {

                            if (track != null) {
                                const id = track.oligos.indexOf(col);
                                if (id > -1) {
                                    track.oligos.splice(id, 1);
                                }
                            } else {
                                console.log(' track not found ')
                            }
                        }
                    }
                },
                move: () => {

                }

            },

        ], x, y)
    })
}
