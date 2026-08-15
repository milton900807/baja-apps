function (graph) {
    let start;
    let end;

    let startx;
    let starty;

    let track = null;
    let selectedTrack = null;
    let md = false;
    graph.clearMouseListeners();
    graph.selectOff();
    selected = null;
    graph.addMouseDownListener(async (x, y) => {
        md = true;
        for (let track of graph.track) {
            let stru = track.getStructure(x, y)
            if (stru && stru.length > 0) {
                selected_track = track;
                selected = stru[0];
                if (selected) {
                    selected.fix_to_sequence_length = false;
                    selected.selected = true;
                }
            }
        }
        if (selected && selected != null && selected.tgraph && selected_track.tgraph) {
            startx = x;
            starty = y - selected.tgraph.yi;
        }
    });
    graph.addMouseMoveListener((x, y) => {
        if (graph.menuVisible()) {
            return;
        }
        if (md) {
            let dx = startx - x * 2;
            let dy = y + starty;
            if (selected) {
                if (!isNaN(selected.tgraph.yi) && !isNaN(selected.tgraph.xi)) {

                    selected.xg = Math.abs((x - selected.tgraph.xi))
                    selected.fix_to_graph = true;

                }
            }
        } else {

            for (let track of graph.track) {
                for (let s of track.structures) {
                    s.selected = false;
                }
            }
            for (let track of graph.track) {
                let stru = track.getStructure(x, y)
                if (stru) {
                    selected = stru;
                    selected.selected = true;
                }
            }
        }

    });
    graph.addMouseUpListener((x, y) => {

        md = false;
        seleced = null;
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
                                                                if (sequence.length > 7000) {

                                                                }

                                                                let xi = selectedTrack.markstart - selectedTrack.tgraph.xi
                                                                let t = await selectedTrack.createSecondaryStructure(xi, sequence, name, new EngineMonitor((msg) => { }))
                                                                t.tgraph.yi = selectedTrack.tgraph.yi
                                                                t.anchorY = selectedTrack.tgraph.yi;

                                                                graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
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
        }

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
