function (libid, graph, showMainPanel, genomes) {

    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.addMouseDownListener((x, y) => {
        let structures = graph.getStructure(x, y)
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
        }

        if (!structures || structures.length <= 0) {
            return
        }

        let structureType = null;

        for (let str of structures) {
            if (str && str.length > 0) {
                for (let s of str) {

                    structureType = s.type;

                    if (s.highlight)
                        s.highlight(400);
                }
            }
        }

        let m = []
        if (structureType === 'siRNA') {
            for (let g of genomes) {
                if (g.toString().toLowerCase() === 'Homo_sapiens.GRCh38.88.3utr'.toLowerCase()) {
                    m.push(
                        {
                            label: 'Seed sequence Human 3utr only',
                            click: () => {
                            },
                            move: () => {
                            }
                        }
                    )
                }
            }
            m.push(
                {
                    label: 'Seed sequence report',
                    click: () => {
                        let structure_view = {
                            wid: 'card',
                            data: {
                                height: '800px',
                                cards: [
                                    [
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component': {
                                                wid: 'json',
                                                width: 800,
                                                data: JSON.stringify(genomes)
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

                                                                hideAllModal();

                                                            })
                                                        },
                                                    ]
                                                }
                                            }
                                        }
                                    ]]
                            }
                        }

                        showModal(structure_view)
                    },
                    move: () => {

                    }

                },

            )
        }

        m.push(
            {
                label: 'Direct sequence match',
                click: () => {
                    let strs = []
                    for (let row of structures) {
                        if (row && row.length > 0) {
                            strs.push(row)
                        }
                    }
                    let structure_view = {
                        wid: 'card',
                        data: {
                            height: '800px',
                            cards: [
                                [
                                    {
                                        'title': '',
                                        'width': '100%',
                                        'component': {
                                            wid: 'json',
                                            width: 800,
                                            data: JSON.stringify(strs)
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

                                                            hideAllModal();

                                                        })
                                                    },
                                                ]
                                            }
                                        }
                                    }
                                ]]
                        }
                    }

                    showModal(structure_view)
                },
                move: () => {

                }

            })

        m.push(
            {
                label: 'Sequence with edit distance',
                click: () => {
                    let strs = []
                    for (let row of structures) {
                        if (row && row.length > 0) {
                            strs.push(row)
                        }
                    }
                    let structure_view = {
                        wid: 'card',
                        data: {
                            height: '800px',
                            cards: [
                                [
                                    {
                                        'title': '',
                                        'width': '100%',
                                        'component': {
                                            wid: 'json',
                                            width: 800,
                                            data: JSON.stringify(strs)
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

                                                            hideAllModal();

                                                        })
                                                    },
                                                ]
                                            }
                                        }
                                    }
                                ]]
                        }
                    }

                    showModal(structure_view)
                },
                move: () => {

                }

            })

        graph.showMenu(m, x, y)
    })
}
