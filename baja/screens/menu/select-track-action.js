function (graph) {

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

    graph.addMouseMoveListener((x, y) => {
        let trackIndex = graph.getTrack(x, y);

        if (trackIndex >= 0) {
            let cselectedTrack = graph.track[trackIndex]
            if (cselectedTrack && selectedTrack != cselectedTrack) {
                if (selectedTrack)
                    selectedTrack.showResizeBar = false;
            }
            selectedTrack = cselectedTrack;
            if (selectedTrack)
                selectedTrack.showResizeBar = true;
        } else {
            graph.selectOff();
            selectedTrack = null;
        }
    })

    graph.addMouseDownListener((x, y) => {
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
        }
        ywc = y;
        if (highlight && selectedTrack) {
            if (start < 0) {
                let xsc = graph.X(x);
                selectedTrack.tgraph.rescale();
                console.log(xsc + ' xi : ' + selectedTrack.tgraph.xi);
                let t = selectedTrack.tgraph.xi;
                start = selectedTrack.tgraph.Xwc(x - t * 2);
                selectedTrack.markstart = start;
            }
            else if (start > 0 && end < 0) {
                let t = selectedTrack.tgraph.xi;
                end = selectedTrack.tgraph.Xwc(x - t * 2);
                selectedTrack.markend = end;
            }
            highlight_label = 'Clear highlight'

        } else {
            highlight_label = 'Highlight'
        }

        let menuList = [

            {
                label: 'Show/Hide coords',
                click: (xwc, ywc) => {
                    start = -1;
                    end = -1;
                    let trackIndex = graph.getTrack(x, y);
                    let tr = graph.track[trackIndex];
                    tr.hideTrackCoords = !tr.hideTrackCoords;
                },
                move: () => {
                }
            },

            {
                label: 'Show/Hide SNPs',
                click: (xwc, ywc) => {
                    start = -1;
                    end = -1;
                    let trackIndex = graph.getTrack(x, y);
                    if (trackIndex >= 0) {
                        let tr = graph.track[trackIndex];
                        tr.showSnpIndels = !tr.showSnpIndels;
                    }
                },
                move: () => {
                }
            },
            {
                label: 'Flip track horizontal',
                click: (xwc, ywc) => {
                    start = -1;
                    end = -1;

                    if (selectedTrack) {
                        let trackIndex = graph.getTrack(x, y);
                        let tr = graph.track[trackIndex];

                        let xt = selectedTrack.tgraph.xmin;
                        selectedTrack.tgraph.xmin = selectedTrack.tgraph.xmax;
                        selectedTrack.tgraph.xmax = xt;
                        selectedTrack.strand = selectedTrack.strand * (-1);
                        if (selectedTrack.tgraph.xmax - selectedTrack.tgraph.xmin < 0)
                            selectedTrack.xi = selectedTrack.xi + 1;
                    }
                },
                move: () => {
                }
            },
            {
                label: 'Show/Hide Off-Targets',
                click: (xwc, ywc) => {
                    if (selectedTrack) {
                        let tr = selectedTrack;
                        tr.showOfftargets = !tr.showOfftargets;
                    }

                },
                move: () => {
                }
            },
            {
                label: 'Show/Hide Data layers',
                click: (xwc, ywc) => {
                    if (selectedTrack) {
                        let tr = selectedTrack;
                        tr.showLayers = !tr.showLayers;
                    }
                },
                move: () => {
                }
            }

            ,
            {
                label: 'Copy track',
                click: () => {
                    const item = new Blob([JSON.stringify(selectedTrack)], { type: 'text/plain' });
                    const citem = new ClipboardItem({
                        'text/plain': item
                    });
                    navigator.clipboard.write([citem]);
                },
                move: () => {

                }
            },
            {
                label: 'Label Track',
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
                                            data: `Enter label for track`
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
                                                            let trackIndex = Math.abs(Math.round(ywc));
                                                            let track = graph.getTrack(trackIndex)
                                                            if (editor_.code != null) {
                                                                editor_.code = editor_.code.trim();
                                                            }
                                                            track.name = editor_.code;
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

            }
        ]

        menuList.push({
            label: 'Track width',
            click: (xwc, ywc) => {

                let slice = '';
                let trackObj = selectedTrack;
                let xmin = selectedTrack.tgraph.xi;
                let xmax = selectedTrack.tgraph.xi + selectedTrack.tgraph.width;

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
                                            'input_labels': ['xmin', 'xmax'], default_values: {
                                                xmin: xmin,
                                                xmax: xmax
                                            },
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
                                                            t.tgraph.width = xmax - xmin;
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

        if (highlight && selectedTrack) {
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
            menuList.push({
                label: 'Track from seq',
                click: (xwc, ywc) => {
                    let slice = '';
                    let seq = selectedTrack.sequence;
                    if (!seq) {
                        prompt(" No sequence found ")
                    } else {
                        let initx = selectedTrack.markstart - selectedTrack.tgraph.xmin;
                        let tox = selectedTrack.markend - selectedTrack.tgraph.xmin;
                        slice = seq.substring(initx + 1, tox + 1);

                        let t = graph.createTrack(selectedTrack.name + '*', 0, slice.length, '+');
                        let trf = new TrackRef(selectedTrack, selectedTrack.markstart, selectedTrack.markend)
                        t.trackREf = trf;

                        t.setSequence(slice)

                        t.tgraph.xi = selectedTrack.tgraph.xi;
                        t.tgraph.width = selectedTrack.tgraph.width;
                        t.tgraph.yi = selectedTrack.tgraph.yi - selectedTrack.tgraph.height - 0.5;

                        t.tgraph.rescale();
                    }
                },
                move: () => {
                    log(' running offtargets....')
                }

            })

        }

        setTimeout(() => {
            graph.showMenu(menuList, x, y, 200)
        }, 100)
    });

}
