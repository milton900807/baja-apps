function (graph, genegraph_panel_layout) {
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.addMouseMoveListener((x, y) => {
        if (graph.menuVisible()) {
            return;
        }
        for (let t of graph.track) {
            t.deselect();
        }
        let si = graph.getTrack(x, y);
        let selectedTrack = graph.track[si]
        if (selectedTrack) {
            selectedTrack.select();
        }

    })
    graph.addMouseDownListener(async (x, y) => {
        let si = graph.getTrack(x, y);
        let selectedTrack = graph.track[si]
        if (selectedTrack) {
            selectedTrack.select();
        } else {
            return;
        }





        if (!selectedTrack) {
            if (getSelectedTracks() != null && getSelectedTracks().length > 0)
                selectedTrack = getSelectedTracks()[0]
        }

        graph.showMenu([
            {
                'label': 'Properties', click: async () => {
                    let selectedtrackIndex = graph.getTrack(x, y);
                    await exec('baja/screens/menu/properties.js', graph, graph.track[selectedtrackIndex])

                    if (isMobile()) {
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                    }

                }
            },
            {
                'label': 'Complement sequence', click: async () => {
                    let selectedtrackIndex = graph.getTrack(x, y);
                    let selectedTrack = graph.track[selectedtrackIndex];

                    var complement = {
                        'C': 'G',
                        'G': 'C',
                        'A': 'T',
                        'T': 'A',
                        'N': 'N',
                        ',': ','
                    }
                    if (selectedTrack) {
                        let sequence = selectedTrack.sequence;
                        selectedTrack.sequence = sequence.replace(/[A,C,T,G,N]/gi, m => complement[m]);
                    }

                    if (isMobile()) {
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                    }

                }
            },

            {
                'label': 'Move', click: async () => {
                    await exec('baja/screens/menu/translate-track.js', graph)

                    if (isMobile()) {
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                    }
                }
            },

            {
                'label': 'Resize height', click: async () => {
                    await exec('baja/screens/menu/resize-track-height.js', graph)

                    if (isMobile()) {
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                    }
                }
            },
            {
                'label': 'Left Justify all tracks', click: () => {
                    let tracks = graph.getTracks();
                    for (let t of tracks) {
                        t.setTrackCoordinates(1, -1);
                    }
                    for (let t of tracks) {
                        t.setTrackCoordinates(1, (t.sequence.length));
                    }

                    if (isMobile()) {
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                    }
                }
            }, {
                'label': 'Clear layers', click: async () => {

                    let selectedtrackIndex = graph.getTrack(x, y);
                    if (selectedtrackIndex < 0) {
                        graph.setMessage('No track selected... ')
                        return;
                    }

                    let selectedTrack = graph.track[selectedtrackIndex]
                    if (selectedTrack) {
                        let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to remove all layers on this track?', async () => {
                            selectedTrack.track_layers = []

                        })
                        showModal(confirm)
                    }
                }
            },

            {
                'label': 'Remove all other tracks', click: () => {
                    let selectedtrackIndex = graph.getTrack(x, y);
                    if (selectedtrackIndex < 0) {
                        graph.setMessage('No track selected... ')
                        return;
                    }
                    let selectedTrack = graph.track[selectedtrackIndex]

                    graph.track = []
                    graph.track.push(selectedTrack)
                }
            },
            {
                label: 'Create mutant track',
                click: (xwc, ywc) => {
                    let slice = '';
                    let selectedtrackIndex = graph.getTrack(x, y);
                    if (selectedtrackIndex < 0) {
                        graph.setMessage('No track selected... ')
                        return;
                    }
                    let selectedTrack = graph.track[selectedtrackIndex]
                    let seq = selectedTrack.sequence;
                    if (!seq) {
                        prompt(" No sequence found ")
                    } else {
                        let track = selectedTrack.createTrackFromAnnotation('CDNA')

                        if (selectedTrack.snpindels.length > 0) {

                            track.liftSnpindels();

                            track.targetPhase = selectedTrack.targetPhase;
                        }

                        if (selectedTrack.oligos && selectedTrack.oligos.length > 0) {
                            track.liftCompounds();
                        }
                        if (selectedTrack.plots && selectedTrack.plots.length > 0) {
                            track.liftPlots();
                        }

                        graph.track.push(track);
                    }
                },
                move: () => {
                    log('move running offtargets....')
                }

            },
            {
                'label': 'Reverse sequence', click: async () => {

                    let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to reverse the transcript orientation?', async () => {

                        let selectedtrackIndex = graph.getTrack(x, y);
                        let selectedTrack = graph.track[selectedtrackIndex];
                        if (selectedTrack) {
                            let sequence = selectedTrack.sequence;
                            selectedTrack.sequence = sequence.split('').reverse().join('');
                        }

                        if (isMobile()) {
                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                        }
                    })
                    showModal(confirm)

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
                        selectedTrack.flipAnnotationsHorizontal();
                    }
                },
                move: () => {
                }
            },

            {
                label: 'Create mRNA',
                click: async (xwc, ywc) => {

                    let confirm = await exec('baja/lib/confirm.js', 'Create mRNA track...', () => {

                        if (selectedTrack) {
                            let seq = selectedTrack.sequence;
                            if (!seq) {
                                prompt(" No sequence found ")
                            } else {
                                let track = selectedTrack.createTrackFromAnnotation('CDNA')
                                if (selectedTrack.snpindels.length > 0) {

                                    track.liftSnpindels();
                                    track.targetPhase = selectedTrack.targetPhase;
                                }

                                if (selectedTrack.oligos && selectedTrack.oligos.length > 0) {
                                    track.liftCompounds();
                                }
                                if (selectedTrack.plots && selectedTrack.plots.length > 0) {
                                    track.liftPlots();
                                }

                                graph.track.push(track);
                                graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
                                graph.deselectAllTracks()
                                track.select();
                                graph.animateTo(track.tgraph.xi - 100,
                                    track.tgraph.xi + track.tgraph.width + 100,
                                    track.tgraph.Y(-3), track.tgraph.Y(3))

                                if (isMobile()) {
                                    CurrentLayout.clearComponent('mainPanel')
                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                }
                            }
                        }
                    })
                    showModal(confirm)

                }
                ,
                move: () => {
                    log('move running offtargets....')
                }
            }
            ,

            {
                label: `Remove plots`,
                click: (xwc, ywc) => {
                    start = -1;
                    end = -1;
                    graph.pushOntoHistory();

                    if (selectedTrack) {
                        selectedTrack.plots = []
                    }

                },
                move: () => {
                }
            },

            {
                label: `Copy to new track`,
                click: async (xwc, ywc) => {
                    let { Track } = await exec('baja/bio/track.js')
                    graph.pushOntoHistory();
                    start = -1;
                    end = -1;
                    let index = 0;
                    var foo = Object.assign(new Track(), selectedTrack);
                    foo.track_layers = selectedTrack.copyLayers()

                    foo.name = selectedTrack.name + '**'

                    let t = await graph.addTrackJSON(foo);
                    t.tgraph.yi = selectedTrack.tgraph.yi + 2;

                },
                move: () => {
                }
            },

            {
                label: `Remove track link`,
                click: (xwc, ywc) => {
                    graph.pushOntoHistory();

                    selectedTrack.trackRef = null;
                },
                move: () => {
                }
            },
            {
                label: `Remove track annotations`,
                click: (xwc, ywc) => {
                    graph.pushOntoHistory();

                    selectedTrack.annotations = [];
                },
                move: () => {
                }
            },
            {
                label: `Delete tracks without sequence `,
                click: (xwc, ywc) => {
                    start = -1;
                    end = -1;
                    let removeset = []
                    for (let t = 0; t < graph.track.length; t++) {
                        if (!graph.track[t].sequence || graph.track[t].sequence.length <= 0) {
                            removeset.push(t);
                        }
                    }
                    for (let r of removeset) {
                        graph.removeTrack(r)
                    }
                },
                move: () => {
                }
            },

            {
                label: `Delete track `,
                click: (xwc, ywc) => {
                    start = -1;
                    end = -1;
                    let removeset = []
                    for (let t = 0; t < graph.track.length; t++) {
                        if (graph.track[t] === selectedTrack && graph.track[t].name === selectedTrack.name) {
                            removeset.push(t);
                        }
                    }
                    for (let r of removeset) {
                        graph.removeTrack(r)
                    }

                },
                move: () => {
                }
            },

        ], x, y)

    })
}
