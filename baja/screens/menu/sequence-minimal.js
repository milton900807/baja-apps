function (graph, io) {

    let m = {
        'label': 'Sequence', 'ionfunction': createIonFunction(async () => {

            let tm = await exec ( 'baja/math/tm')
            let start;
            let end;
            let lstart;
            let lend;
            let track = null;
            hide_menu = false;
            let selectedTrack = null;
            let sequence = null;
            let md = false;

            graph.selectOff();

            graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
            graph.addMouseDownListener(async (x, y) => {
                md = true;
                let trackIndex = graph.getTrack(x, y)
                if (trackIndex >= 0) {
                    track = graph.track[trackIndex]
                    if (track != null) {
                        x = x - track.tgraph.xi * 2;
                        if (start < 0)
                            start = 0;
                        start = Math.floor(track.tgraph.Xwc(x));
                        end = Math.floor(track.tgraph.Xwc(x));
                        track.highlight(start, end)
                    } else {
                        graph.hideMenu();

                        start = -1;

                        end = -1;
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
                } else {
                    if (track) {
                        x = x - track.tgraph.xi * 2;
                        end = Math.floor(track.tgraph.Xwc(x));
                        if (end > 1) {
                            console.log(" end " + end);
                        }
                        track.highlight(start, end);
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
                lstart = start;
                lend = end;
                if (end - start > 0) {
                    graph.showMenu(menuList, x, y, 200);
                }
                else
                    graph.hideMenu();
                start = -1;
                end = -1;
            });

            sequence_phase = -1;

            let menuList = [
                {
                    label: 'Add indel/SNP',
                    click: () => {
                        let editor_;
                        let annotation_editor = createIonFunction((editor) => {
                            editor_ = editor;
                        })
                        graph.hideMenu();
                        let sequence = selectedTrack.getHighlightedSequence();
                        let dp = {
                            wid: 'card',
                            componentRef: 'bottomPanel',
                            data: {
                                cards: [
                                    [
                                        {
                                            'title': '',
                                            'component': {
                                                wid: 'html',
                                                data: `Enter annotation for (${lstart} - ${lend})`
                                            }
                                        },
                                        {
                                            'title': '',
                                            'component': {
                                                wid: 'text-editor',
                                                refCallback: annotation_editor,
                                                data: {
                                                    editorOptions: { language: 'text', automaticLayout: false },
                                                    text: sequence,
                                                    showButton: false
                                                }
                                            }
                                        },
                                        {
                                            'title': '',
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Save', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();
                                                                let SnpIndel = await exec('flexigraph/snpindel.js')
                                                                let wv = editor_.getWidgetValue();
                                                                console.log('debubg');
                                                                if (selectedTrack) {
                                                                    if (sequence.length > 0) {
                                                                        if (wv.length < sequence.length) {
                                                                            let slnp = new SnpIndel('del', lstart, sequence, wv, 0, selectedTrack.strand);
                                                                            selectedTrack.addsnpindel(slnp)
                                                                        }
                                                                        else if (wv.length > sequence.length) {
                                                                            let slnp = new SnpIndel('ins', lstart, sequence, wv, 0, selectedTrack.strand);
                                                                            selectedTrack.addsnpindel(slnp)
                                                                        } else {
                                                                            console.log('debubg');
                                                                            alert(' snp ')
                                                                            let slnp = new SnpIndel('snp', lstart, sequence, wv, 0, selectedTrack.strand);
                                                                            selectedTrack.addsnpindel(slnp)
                                                                        }

                                                                    }
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
                        showModal(dp, 300, 300)

                    },
                    move: () => {

                    }

                },

                {
                    label: 'Copy ',
                    click: () => {
                        if (selectedTrack) {
                            let sequence = selectedTrack.getHighlightedSequence();
                            const item = new Blob([sequence], { type: 'text/plain' });

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

        })
    }
    return m;
}
