function (graph, genegraph_panel_layout) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
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
        }

        graph.showMenu([
            {
                'label': 'Edit w/ phase 0 mutations', click: async () => {
                    graph.pushOntoHistory();
                    let selectedtrackIndex = graph.getTrack(x, y);
                    let selectedTrack = graph.track[selectedtrackIndex];
                    if ( selectedTrack ){
                        selectedTrack.applySnpIndelsToSequence (0)
                    }
                }
            },
            {
                'label': 'Edit w/ phase 1 mutations', click: async () => {
                    graph.pushOntoHistory();
                    let selectedtrackIndex = graph.getTrack(x, y);
                    let selectedTrack = graph.track[selectedtrackIndex];
                    if ( selectedTrack ){
                        selectedTrack.mutateTrack (1)
                    }
                }
            },

            {
                'label': 'Export Sequence', click: async () => {
                    if (selectedTrack) {
                        exportFile(selectedTrack.sequence, selectedTrack.name + '.sequence')
                    }
                }
            },
            {
                'label': 'Complement sequence', click: async () => {
                    let selectedtrackIndex = graph.getTrack(x, y);
                    let selectedTrack = graph.track[selectedtrackIndex];
                    graph.pushOntoHistory();

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
                }
            },
            {
                label: 'Create mutant track',
                click: (xwc, ywc) => {
                    graph.pushOntoHistory();

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

                        if ( selectedTrack.oligos && selectedTrack.oligos.length > 0 ){
                            track.liftCompounds ();
                        }
                        if ( selectedTrack.oligos && selectedTrack.oligos.length > 0 ){
                            track.liftLayers ();
                        }

                        graph.track.push(graph.ensureUniqueTrackName ? graph.ensureUniqueTrackName(track) : track);
                    }
                },
                move: () => {
                    log('move running offtargets....')
                }

            },

            {
                label: 'Create CDNA',
                click: (xwc, ywc) => {
                    let slice = '';
                    let selectedtrackIndex = graph.getTrack(x, y);
                    if (selectedtrackIndex < 0) {
                        graph.setMessage('No track selected... ')
                        return;
                    }
                    let selectedTrack = graph.track[selectedtrackIndex]
                    graph.pushOntoHistory();

                    let seq = selectedTrack.sequence;
                    if (!seq) {
                        prompt(" No sequence found ")
                    } else {
                        let track = selectedTrack.createTrackFromAnnotation('CDNA')

                        if (selectedTrack.snpindels.length > 0) {

                            track.liftSnpindels();

                            track.targetPhase = selectedTrack.targetPhase;
                        }
                        if ( selectedTrack.oligos && selectedTrack.oligos.length > 0 ){
                            track.liftCompounds ();
                        }

                        graph.track.push(graph.ensureUniqueTrackName ? graph.ensureUniqueTrackName(track) : track);

                    }
                },
                move: () => {
                    log('move running offtargets....')
                }
            }

        ], x, y)

    })
}
