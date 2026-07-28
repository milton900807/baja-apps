function (graph) {
    let start;
    let end;

    let startx;
    let starty;
    let startIndex = -1;
    let endIndex = -1;
    let selectedTrack = null;
    let md = false;
    let complete = false;
    graph.clearMouseListeners();
    graph.selectOff();
    let selected = null;
    exec('baja/chem/biopolymer.js').then(Biopolymer => {
        graph.addMouseDownListener(async (x, y) => {
            md = true;
            let selected_chemistry = graph.props.selected_chemistry;
            if (selected_chemistry == null) {
                graph.setMessage("Please select chemistry ")
                return;
            }
            if (selected && startIndex >= 0 && endIndex > startIndex) {
                let xxww = x - selected.tgraph.xi * 2;
                let xw = selected.tgraph.Xwc(xxww);
                let yw = selected.tgraph.Ywc(y - 2 * selected.tgraph.yi)
                startx = xw;
                starty = yw;
                endIndex = selected.getIndex(startx, starty)
                complete = true;
                selected.setDesign(startIndex, endIndex)

                currentSequence = selectedTrack.getHighlightedSequence();

                let chemistryObject = graph.props.selected_chemistry;

                let bioObject = {
                    'targetSequence': currentSequence,
                    'trackName': selectedTrack.name,
                    'startIndex': startIndex,
                    'strand': selectedTrack.strand,
                    'endIndex': endIndex,
                    'y': (selectedTrack.tgraph.ymax - currentY)
                }
                let compound = await Biopolymer.generateCompound(chemistryObject, bioObject)

                alert ( ' compound ')

                this.startx = -1
                this.endx = -1
                this.selected = null;
                this.selectedTrack = null;
                complete = false;

            } else {
                for (let track of graph.track) {
                    let selected_list = track.getStructure(x, y)
                    if (selected_list && selected_list.length > 0) {
                        selected = selected_list[0]
                        selectedTrack = track;
                        if (selected.tgraph && selected.tgraph.xi) {
                            let xxww = x - selected.tgraph.xi * 2;
                            let xw = selected.tgraph.Xwc(xxww);
                            let yw = selected.tgraph.Ywc(y - 2 * selected.tgraph.yi)
                            startx = xw;
                            starty = yw;
                            startIndex = selected.getIndex(startx, starty)
                        }
                    }
                }
            }
        }
        );

        graph.addMouseMoveListener((x, y) => {
            if (graph.menuVisible()) {
                return;
            }

            if (selected) {

                if (!complete) {

                    let xxww = x - selected.tgraph.xi * 2;
                    let xw = selected.tgraph.Xwc(xxww);
                    let yw = selected.tgraph.Ywc(y - 2 * selected.tgraph.yi)
                    startx = xw;
                    starty = yw;
                    endIndex = selected.getIndex(startx, starty)

                    if (endIndex) {
                        selected.selectIndexRange(startIndex, endIndex);
                    }
                }

            } else {
                for (let track of graph.track) {
                    let selected_list = track.getStructure(x, y)
                    if (selected_list) {
                        for (let selected of selected_list) {
                            let xxww = x - selected.tgraph.xi * 2;
                            let xw = selected.tgraph.Xwc(xxww);
                            let yw = selected.tgraph.Ywc(y - 2 * selected.tgraph.yi) + 10
                            selected.select(xw, yw)
                        }
                    }
                }
            }
        });
        graph.addMouseUpListener((x, y) => {
            if (selected && complete) {
                if (startIndex >= 0 && endIndex >= 0) {
                    md = false;
                    selected.deselect();
                    selected = null;
                }
            }
            if (graph.menuVisible()) {
                graph.hideMenu();
                return;
            }

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
                                                                    let t = await selectedTrack.createSecondaryStructure(xi, sequence, name, new EngineMonitor ( (msg)=>{}))
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
                    log('move running offtargets....')
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
    })

}
