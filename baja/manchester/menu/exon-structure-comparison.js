function (graph) {
    graph.setMessage(" Select a track...")
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    let selectedTrack;
    let startTrack;
    let endTrack;

    graph.addMouseDownListener(async (x, y) => {
        let selectedtrackIndex = graph.getTrack(x, y);
        if (selectedtrackIndex != null && selectedtrackIndex >= 0) {
            selectedTrack = graph.track[selectedtrackIndex]
            if (!startTrack) {
                startTrack = selectedTrack;
                graph.setMessage('Selected: ' + startTrack.name);
                startTrack.select();
            } else {
                endTrack = selectedTrack;
                endTrack.select();
            }
        } else {
            graph.setMessage(" Please click on a track")
            return;
        }
    })
    graph.addMouseMoveListener(async (x, y) => {
        let selectedtrackIndex = graph.getTrack(x, y);
        if (selectedtrackIndex != null && selectedtrackIndex >= 0) {
            selectedTrack = graph.track[selectedtrackIndex]
            graph.setMessage('Track: ' + selectedTrack.name);
        }
        else if (startTrack && (!endTrack)) {
            graph.setMessage('Select another track....');
        }
    })

    let graphit = async () => {
        let TrackLink = await exec('baja/bio/track-link')
        if (startTrack && endTrack) {
            exec('baja/math/le-distance.js').then(async le => {
                let minLe = -1;

                let sex = startTrack.getExons();
                let eex = endTrack.getExons();
                let indx = 0;
                let trackPoints = []
                for (let s of sex) {
                    let ai = s.xi;
                    let af = s.xf;
                    let seqa = startTrack.getSequenceRange(ai, af);

                    for (let e of eex) {
                        let bi = e.xi;
                        let bf = e.xf;
                        let seqb = endTrack.getSequenceRange(bi, bf);
                        let value = le(seqa, seqb)

                        if (minLe < 0) {
                            minLe = value;
                        }
                        if (value < minLe) {
                            minLe = value;
                        }

                        let lg = 1*(1/(1+value))

                        let ta1 = {
                            track: startTrack,
                            trackId: startTrack.id,
                            x: ai,
                            y: 0
                        }
                        let ta2 = {
                            track: startTrack,
                            trackId: startTrack.id,
                            x: af,
                            y: 0
                        }
                        let tb1 = {
                            track: endTrack,
                            trackId: endTrack.id,
                            x: bi,
                            y: 0
                        }
                        let tb2 = {
                            track: endTrack,
                            trackId: endTrack.id,
                            x: bf,
                            y: 0
                        }
                        let tlinki = new TrackLink(ta1, tb1);
                        let tlinkf = new TrackLink(ta2, tb2);
                        tlinkf.alpha = lg;
                        tlinki.alpha = lg;
                        trackPoints.push(tlinki)
                        trackPoints.push(tlinkf)
                    }
                    indx++;
                }

                startTrack.deselect();
                endTrack.deselect();
                startTrack = null;
                endTrack = null;
                graph.appendLayers(trackPoints)
                setTimeout(() => {
                    showModal({
                        wid: 'json',
                        data: ' Minimum LE distance : ' + minLe
                    })

                }, 100)
            })
        }
    }

    let m = [
        {
            label: 'Compare exon structures',
            click: async () => {

                showModal(
                    {
                        wid: 'card',
                        data: {
                            padding: "10px",
                            cards: [
                                [
                                    {
                                        'title': ' ', 'body': ``,
                                        'width': '90%',
                                        'component':
                                        {
                                            wid: 'input-param-items',
                                            data: {
                                                'input_labels': ['Levenstein Threashold'],
                                                buttons: [{
                                                    'label': 'Cancel', 'function': createIonFunction((button_label, input_params) => {
                                                        hideAllModal();
                                                    })
                                                }, {
                                                    'label': 'Apply', 'function': createIonFunction(async (button_label, input_params) => {
                                                        let threshold = +input_params['Levenstein Threashold']
                                                        let TrackLink = await exec('baja/bio/track-link')
                                                        if (startTrack && endTrack) {
                                                            exec('baja/math/le-distance.js').then(async le => {

                                                                let minLe = -1;

                                                                let sex = startTrack.getExons();
                                                                let eex = endTrack.getExons();
                                                                let indx = 0;
                                                                let trackPoints = []
                                                                for (let s of sex) {
                                                                    let ai = s.xi;
                                                                    let af = s.xf;
                                                                    let seqa = startTrack.getSequenceRange(ai, af);

                                                                    for (let e of eex) {
                                                                        let bi = e.xi;
                                                                        let bf = e.xf;
                                                                        let seqb = endTrack.getSequenceRange(bi, bf);
                                                                        let value = le(seqa, seqb)

                                                                        if (minLe < 0) {
                                                                            minLe = value;
                                                                        }
                                                                        if (value < minLe) {
                                                                            minLe = value;
                                                                        }
                                                                        if (value < threshold) {

                                                                            let ta1 = {
                                                                                track: startTrack,
                                                                                trackId: startTrack.id,
                                                                                x: ai,
                                                                                y: 0
                                                                            }
                                                                            let ta2 = {
                                                                                track: startTrack,
                                                                                trackId: startTrack.id,
                                                                                x: af,
                                                                                y: 0
                                                                            }
                                                                            let tb1 = {
                                                                                track: endTrack,
                                                                                trackId: endTrack.id,
                                                                                x: bi,
                                                                                y: 0
                                                                            }
                                                                            let tb2 = {
                                                                                track: endTrack,
                                                                                trackId:endTrack.id,
                                                                                x: bf,
                                                                                y: 0
                                                                            }
                                                                            let tlinki = new TrackLink(ta1, tb1);
                                                                            let tlinkf = new TrackLink(ta2, tb2);
                                                                            trackPoints.push(tlinki)
                                                                            trackPoints.push(tlinkf)
                                                                        }
                                                                    }
                                                                    indx++;
                                                                }

                                                                startTrack.deselect();
                                                                endTrack.deselect();
                                                                startTrack = null;
                                                                endTrack = null;
                                                                graph.appendLayers(trackPoints)
                                                                setTimeout(() => {
                                                                    showModal({
                                                                        wid: 'json',
                                                                        data: ' Minimum LE distance : ' + minLe
                                                                    })

                                                                }, 100)
                                                            })

                                                        } else {
                                                            graph.setMessage(" Select a track... ")
                                                        }
                                                        hideAllModal();
                                                    })
                                                }]
                                            }
                                        }
                                    },
                                ]]
                        }
                    }

                )

            },
            move: () => {

            }

        },
        {
            label: 'Exon comparison plot',
            click: () => {

                graphit ();

            },
            move: () => {
            }

        },
        {
            label: 'Cancel',
            click: () => {

                if (startTrack && endTrack) {
                    startTrack.deselect();
                    endTrack.deselect();
                    startTrack = null;
                    endTrack = null;
                }

            },
            move: () => {
            }

        }

    ];

    graph.addMouseUpListener(async (x, y) => {
        if (startTrack && endTrack) {
            graph.showMenu(m, x, y);
        }
    })
}
