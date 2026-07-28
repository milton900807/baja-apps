function (graph, genegraph_panel_layout) {
    let start;
    let end;
    let track = null;
    hide_menu = false;
    let selectedTrack = null;
    let md = false;
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.addMouseDownListener(async (x, y) => {
        md = true;
        let trackIndex = graph.getTrack(x, y)
        if (trackIndex >= 0) {
            track = graph.track[trackIndex]
            if (track) {
                x = x - track.tgraph.xi * 2;
                start = Math.round(track.tgraph.Xwc(x));
                end = Math.round(track.tgraph.Xwc(x));
                track.highlight(start, end)
            } else {
                graph.hideMenu();
                start = -1;
                end = 0;
            }
        }
    });
    graph.addMouseMoveListener((x, y) => {

        if (graph.menuVisible()) {
            return;
        }
        if (!md) {
            graph.hideMenu();
            return;
        }

        if (track) {
            x = x - track.tgraph.xi * 2;
            end = Math.round(track.tgraph.Xwc(x));
            track.highlight(start, end);

            if (track != null) {
                let sequence = track.getHighlightedSequence();
                if (sequence.length > 7000) {
                    graph.setMessage(" Selected sequence is too long for secondary structure prediction")
                }
            }

        }

    })
    graph.addMouseUpListener((x, y) => {

        md = true;
        let trackIndex = graph.getTrack(x, y)
        if (trackIndex < 0) {
            start = -1;
            end = -1;
            return;
        }

        if (graph.menuVisible()) {
            graph.hideMenu();
            return;
        }
        selectedTrack = track;
        if (selectedTrack != null) {
            let sequence = selectedTrack.getHighlightedSequence();
            if (sequence.length > 1000) {

                graph.setMessage(" Sequence is too long for the prediction tool ")
                return;
            }
        }

        if (end - start > 3) {
            graph.showMenu(menuList, x, y, 200);
        }
        else
            graph.hideMenu();
        start = -1;
        end = -1;
    });

    let menuList = [
        {
            label: 'New structure...',
            click: (xwc, ywc) => {

                if (selectedTrack) {

                    let panel;
                    const __nameHook = createIonFunction((editor) => {
                        panel = editor;
                    })

                    showModal(
                        {
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
                                                data: ``
                                            }
                                        },
                                        {
                                            'title': ' ', 'body': `.
                                        `                   ,
                                            'width': '90%',
                                            'component':
                                            {

                                                wid: 'input-param-items',
                                                refCallback: __nameHook,
                                                data: {
                                                    'input_labels': ['Name'],
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
                                                            label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                let name = panel.get('Name')
                                                                let sequence = selectedTrack.getHighlightedSequence();
                                                                if (sequence.length > 1000) {

                                                                }
                                                                let xi = selectedTrack.markstart - selectedTrack.xi
                                                                let t = await selectedTrack.createSecondaryStructure(xi, sequence, name, new EngineMonitor((msg) => { }))
                                                                t.tgraph.yi = selectedTrack.tgraph.yi
                                                                t.anchorY = selectedTrack.tgraph.yi;
                                                                graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
                                                                graph.selectOff();

                                                                graph.hideMenu();
                                                                await hideAllModal();
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
                        })
                } else {
                    graph.hideMenu();
                }
            },
            move: () => {
                log('movei running offtargets....')
            }
        },

        {
            label: 'Annotate',
            click: () => {
                let editor_;
                let annotation_editor = createIonFunction((editor) => {
                    editor_ = editor;
                })

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
                                        data: `Enter annotation for (${start} - ${end})`
                                    }
                                },
                                {
                                    'title': '',
                                    'width': '100%',
                                    'component': {
                                        wid: 'text-editor',
                                        refCallback: annotation_editor,
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
                                                    label: 'Save', ionFunction: createIonFunction(() => {
                                                        hideAllModal();
                                                        showModal({
                                                            wid: 'json',
                                                            data: JSON.stringify(editor_.code)
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
                showModal(dp)

            },
            move: () => {

            }

        },
        {
            label: 'Copy ',
            click: () => {
                if (selectedTrack) {
                    const item = new Blob([JSON.stringify(selectedTrack)], { type: 'text/plain' });
                    const citem = new ClipboardItem({
                        'text/plain': item
                    });
                    navigator.clipboard.write([citem]);
                } else {
                    graph.hideMenu();
                }
            },
            move: () => {

            }
        },
        {
            label: 'Tile sequence',
            click: async () => {

                graph.hideMenu();

                if (selectedTrack) {
                    hide_menu = true;

                    await exec('baja/screens/annotation/tile-oligos-window.js', graph, selectedTrack, selectedTrack.markstart, selectedTrack.markend);

                }

            },
            move: () => { }
        },
        {
            label: 'Add OCR',
            click: async () => {

                graph.hideMenu();

                if (selectedTrack) {
                    hide_menu = true;

                    await exec('baja/screens/annotation/tile-oligos-window.js', graph, selectedTrack, selectedTrack.markstart, selectedTrack.markend);

                }

            },
            move: () => { }
        },

    ]

    if (selectedTrack) {
        menuList.push({
            label: 'Show sequence',
            click: (xwc, ywc) => {
                let slice = '';

                let editor_;
                let annotation_editor = createIonFunction((editor) => {
                    editor_ = editor;
                    editor.code = slice;
                })
                let seq = selectedTrack.sequence;
                if (!seq) {
                    prompt(" No sequence found ")
                } else {
                    let initx = selectedTrack.markstart - selectedTrack.tgraph.xmin;
                    let tox = selectedTrack.markend - selectedTrack.tgraph.xmin;
                    slice = seq.substring(initx + 1, tox + 1);
                    prompt(slice)
                }
            },
            move: () => {
                log('movei running offtargets....')
            }

        })
    }
}
