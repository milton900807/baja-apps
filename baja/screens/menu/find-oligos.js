function (graph) {
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    graph.addMouseDownListener((x, y) => {
        let structures = graph.getStructure(x, y)
        let trackIndex = graph.getTrack(x, y);

        graph.showMenu([
            {
                label: 'Mismatches',
                click: () => {
                    track = null;
                    if (trackIndex >= 0) {
                        track = graph.track[trackIndex]
                    }
                    if (track === null) {
                        graph.setMessage(" Please select a track")
                        return;
                    }

                    graph.setMessage ( " Searching " + track.oligos.length + " compounds...")
                    for (let s of track.oligos) {

                        let target = track.getSequenceRange(s.xi, s.xf);
                        let compund = s.sequence;
                        if (target != compund) {
                            console.log(" mismatch " + target + "  for " + compund)

                            let m = []
                            let cindex = 0;
                            for ( let c of compund ) {
                                let tc = target.substring ( cindex, cindex+1)
                                if ( c != tc ){
                                    m.push ( cindex )
                                }
                                cindex++;
                            }
                            s.mismatch = m;

                            s.setSelected(true)
                        }
                    }

                },
                move: () => {
                }

            },
            {
                label: 'IDs',
                click: () => {
                    track = null;
                    if (trackIndex >= 0) {
                        track = graph.track[trackIndex]
                    }
                    if (track === null) {
                        graph.setMessage(" Please select a track")
                        return;
                    }

                    for (let s of track.oligos) {
                        s.showId = true;
                        s.selected = false;
                    }

                },
                move: () => {

                }

            },
            {
                label: 'Off-targets',
                click: async () => {

                    let track = null;
                    let trackIndex = graph.getTrack(x, y)
                    if (trackIndex >= 0) {
                        track = graph.track[trackIndex]
                    }
                    for (let row of structures) {
                        for (let s of row) {
                            window.open(`/app/baja/align/align-panel?__sequence=${s.name}`)
                        }
                    }
                },
                move: () => {

                }

            },
        ], x, y)
    })

}
