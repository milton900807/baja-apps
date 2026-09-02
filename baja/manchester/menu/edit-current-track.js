function (graph, genegraph_panel_layout, selectedTrack) {




    if (!selectedTrack) {
        if (getSelectedTracks() != null && getSelectedTracks().length > 0)
            selectedTrack = getSelectedTracks()[0]
    }


    return new Promise(async (resolve, reject) => {
        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.showMenu([
            {
                'label': 'Track Details', click: async () => {
                    await exec('baja/manchester/menu/properties.js', graph, selectedTrack)
                    if (isMobile()) {
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                    }

                }
            },
            {
                'label': 'Complement sequence', click: async () => {
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
            }, {
                'label': 'Clear layers', click: async () => {
                    if (selectedTrack) {
                        let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to remove all layers on this track?', async () => {
                            selectedTrack.track_layers = []
                        })
                        showModal(confirm)
                    }
                }
            },
            {
                label: 'Create mutant track',
                click: (xwc, ywc) => {
                    let seq = selectedTrack.sequence;
                    if (!seq) {
                        prompt(" No sequence found ")
                    } else {
                        let track = selectedTrack.createTrackFromAnnotation('CDNA')
                        track.targetPhase = selectedTrack.targetPhase;
                        graph.track.push(graph.ensureUniqueTrackName ? graph.ensureUniqueTrackName(track) : track);
                        // Data is mirrored from the parent by the per-draw diff sync.
                        try { track.syncFromParent(); } catch (e) { }
                    }
                },
                move: () => {
                    log('move running offtargets....')
                }

            },
            {
                'label': 'Reverse sequence', click: async () => {
                    let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to reverse the transcript orientation?', async () => {
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
                    let tr = selectedTrack
                    tr.showSnpIndels = !tr.showSnpIndels;
                },
                move: () => {
                }
            },
            {
                label: 'Create mRNA',
                click: async (xwc, ywc) => {
                    if (selectedTrack) {
                        let seq = selectedTrack.sequence;
                        if (!seq) {
                            prompt(" No sequence found ")
                        } else {
                            let track = selectedTrack.createTrackFromAnnotation('CDNA')
                            track.targetPhase = selectedTrack.targetPhase;
                            graph.track.push(graph.ensureUniqueTrackName ? graph.ensureUniqueTrackName(track) : track);
                            // Data is mirrored from the parent by the per-draw diff sync.
                            try { track.syncFromParent(); } catch (e) { }
                            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
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

                }
                ,
                move: () => {
                    log('move running offtargets....')
                }
            }
            ,
            {
                label: `Copy to new track`,
                click: async (xwc, ywc) => {
                    let { Track } = await exec('baja/bio/track.js')


                    if (!selectedTrack) {
                        if (getSelectedTracks() != null && getSelectedTracks().length > 0)
                            selectedTrack = getSelectedTracks()[0]
                    }

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
                label: `Remove track annotations`,
                click: (xwc, ywc) => {
                    graph.pushOntoHistory();
                    selectedTrack.annotations = [];
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

        ])

        return resolve()

    })
}
