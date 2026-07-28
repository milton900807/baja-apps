function (graph, genegraph_panel_layout) {
    let selectedTrack = null;
    let md = false;
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    let selected = null;
    let selected_track;
    graph.addMouseDownListener(async (x, y) => {
        md = true;
        for (let track of graph.track) {
            let stru = track.getStructure(x, y)
            if (stru && stru.length > 0) {
                selected_track = track;
                selected = stru[0];
            }
        }
        if (!selected) {
            graph.setMessage("Click on a secondary structure")
        }

        graph.showMenu(menuList, x, y, 200)

    });
    graph.addMouseMoveListener((x, y) => {
        if (graph.menuVisible()) {
            return;
        }

    });
    graph.addMouseUpListener((x, y) => {
        md = false;
        seleced = null;
        if (graph.menuVisible()) {
            graph.hideMenu();
            return;
        }

    });

    let menuList = [

        {
            label: 'Design w/ fixed length chemistry ',
            click: async () => {
                await exec('baja/screens/menu/design-on-secondary-structure-fixed-chem.js', graph);

            }

        },
        {
            label: 'Design with variable length',
            click: async () => {
                await exec('baja/screens/menu/design-on-secondary-structure.js', graph);

            }

        },
        {
            label: 'Tile',
            click: async () => {
                await exec('baja/screens/menu/design-on-secondary-structure-tile.js', graph);

            }

        },
        {
            label: 'Delete',
            click: async (xwc, ywc) => {
                if (selected) {

                    let confirm = await exec('baja/lib/confirm-widget.js', () => {
                        const index = selected_track.structures.indexOf(selected, 0);
                        if (index > -1) {
                            selected_track.structures.splice(index, 1);
                        }
                    })
                    showModal(confirm)

                    graph.hideMenu();
                }
            },
            move: () => {
                log('movei running offtargets....')
            }
        },
        {
            label: 'Edit label',
            click: () => {
                let editor_;
                let annotation_editor = createIonFunction((editor) => {
                    editor_ = editor;
                    if ( selected )
                    {
                        editor_.code = selected.name
                    }
                })

                let dp = {
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

                                                        let text = editor_.code;
                                                        selected.name = text;

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
