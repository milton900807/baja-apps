function (graph, io) {
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();

    let ed;
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })
    let start = -1;
    let end = -1;
    let ywc = -1;
    let highlight = false;
    let highlight_label = 'Highlight'
    let selectedTrack = null;
    let resizeTrack = false;
    let trackIndex = null;
    graph.addMouseMoveListener((x, y) => {
        if (resizeTrack && selectedTrack) {
            let scx = graph.X(x);
            let scy = graph.Y(y);
            let scxi = graph.X(selectedTrack.tgraph.xi)
            let scyi = graph.Y(selectedTrack.tgraph.yi)
            let scxwi = graph.X(selectedTrack.tgraph.xi + selectedTrack.tgraph.width)
            let scyhi = graph.Y(selectedTrack.tgraph.yi + (selectedTrack.tgraph.height))
            selectedTrack.tgraph.width = (x - selectedTrack.tgraph.xi)
            selectedTrack.tgraph.height = -1 * (selectedTrack.tgraph.yi - y)
            if (selectedTrack.tgraph.height > 0)
                selectedTrack.tgraph.height *= (-1)

            selectedTrack.tgraph.rescale();
        } else {

            let p_trackIndex = graph.getTrack(x, y);
            if (!resizeTrack && p_trackIndex == null) {
                graph.deselectAllTracks();
                return;
            }
            if (!resizeTrack && p_trackIndex >= 0) {
                graph.deselectAllTracks();
                graph.track[p_trackIndex].showResizeBar = true;
                return;
            }
        }
    })
    graph.addMouseUpListener((x, y) => {
        resizeTrack = false;
        console.log('debubg');
        graph.deselectAllTracks();
        selectedTrack = null;
    })

    graph.addMouseDownListener((x, y) => {
        trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
            graph.track[trackIndex].showResizeBar = true;
            resizeTrack = true;
        }
        ywc = y;
        if (selectedTrack) {
            let scx = graph.X(x);
            let scy = graph.Y(y);
            let scxi = graph.X(selectedTrack.tgraph.xi)
            let scyi = graph.Y(selectedTrack.tgraph.yi)

            let scxwi = graph.X(selectedTrack.tgraph.xi + selectedTrack.tgraph.width)
            let scyhi = graph.Y(selectedTrack.tgraph.yi + (selectedTrack.tgraph.height))

            if (Math.abs(scx - scxi) < 10 && Math.abs(scy - scyi) < 10) {

            }
            else if (Math.abs(scxwi - scx) < 10 && Math.abs(scyhi - scy) < 10) {

                console.log(" selectedTrack.tgraph.width " + selectedTrack.tgraph.width)
                selectedTrack.tgraph.rescale();
                resizeTrack = true;

                return;
            }
            else if (Math.abs(scxwi - scx) < 10 && Math.abs((scyi) - scy) < 10) {
                alert('upper right ')
            }
            else if (Math.abs(scxi - scx) < 10 && Math.abs((scyhi) - scy) < 10) {
                alert('lower left ')
            }
        }

        let menuList = [
            {
                label: 'Resize',
                click: (xwc, ywc) => {
                    resizeTrack = true;
                },
                move: () => {
                    log('movei running offtargets....')
                }

            }
        ]

        menuList.push({
            label: 'Set width',
            click: (xwc, ywc) => {

                let slice = '';
                let trackObj = selectedTrack;

                let dp = {
                    wid: 'card',
                    componentRef: 'bottomPanel',
                    data: {
                        height: '800px',
                        cards: [
                            [
                                {
                                    'title': '',
                                    'width': '100%',
                                    'component': {
                                        wid: 'html',
                                        data: `Set min and max`
                                    }
                                },
                                {
                                    'title': ' ', 'body': `Below is the RNA engine for algorithmic designs.
                                            `                   ,
                                    'width': '90%',
                                    'component':
                                    {

                                        wid: 'input-param-items',
                                        refCallback: nameHook,
                                        data: {
                                            'input_labels': ['xmin', 'xmax'],
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
                                                    label: 'Save', ionFunction: createIonFunction(() => {
                                                        console.log('debubg');
                                                        if (ed != null) {
                                                            let xmin = +ed.get('xmin')
                                                            let xmax = +ed.get('xmax')
                                                            let t = selectedTrack;
                                                            t.tgraph.xi = xmin;
                                                            t.tgraph.width = xmin + xmax;
                                                            t.tgraph.rescale();
                                                            hideAllModal();

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
                showModal(dp)
            },
            move: () => {
                log('movei running offtargets....')
            }

        })

        menuList.push({
            label: 'Show/Hide label',
            click: (xwc, ywc) => {

                if (selectedTrack) {
                    selectedTrack.showName = !selectedTrack.showName;
                }

            },
            move: () => {
                log('movei running offtargets....')
            }

        })

    });
}
