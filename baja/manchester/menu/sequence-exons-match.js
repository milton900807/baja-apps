function (graph) {
    graph.setMessage(" Select a track...")
    graph.setMouseMode("none")
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    let selectedTrack;
    let startTrack;
    let endTrack;
    let md = false;

    let getMenu = (selectedTrack) => {

        let m = [
            {
                label: 'Set as Query sequence',
                click: async () => {
                    let Annotation = await exec('flexigraph/annotation.js')

                    if (selectedTrack) {
                        graph.setMessage('Track: ' + selectedTrack.name + " query track..");
                        if (selectedTrack.markstart > 0 && selectedTrack.markend > 0) {
                            for (let t of graph.track) {
                                t.removeAnnotationByType('Query');
                            }
                            selectedTrack.add(new Annotation('Query', 'Query', selectedTrack.markstart, selectedTrack.markend))
                        }
                    }

                },
                move: () => {
                }

            },

            {
                label: 'Set Query-Target',
                click: async () => {
                    let Annotation = await exec('flexigraph/annotation.js')
                    if (selectedTrack) {
                        if (selectedTrack.markstart > 0 && selectedTrack.markend > 0) {

                            for (let t of graph.track) {
                                t.removeAnnotationByType('Query-Target');
                            }
                            selectedTrack.add(new Annotation('Query-Target', 'Query-Target', selectedTrack.markstart, selectedTrack.markend))
                        }
                    }
                },
                move: () => {
                }

            },

            {
                label: 'Diff...',
                click: () => {

                    let q = null;
                    let qt = null;
                    let target = null;
                    let tt = null;
                    let tracks = graph.track;
                    for (let t of tracks) {
                        let annotations = t.annotations;
                        for (let a of annotations) {
                            if (a.type === 'Query') {
                                q = a;
                                qt = t;
                            } else if (a.type === 'Query-Target') {
                                target = a;
                                tt = t;
                            }
                        }
                    }
                    compare_annotations(qt, q, tt, target);

                },
                move: () => {
                }

            },
            {
                label: 'Remove query annotations',
                click: () => {

                    for (let t of graph.track) {
                        t.removeAnnotationByType('Query-Target');
                        t.removeAnnotationByType('Query');
                    }
                },
                move: () => {
                }

            }, {
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
        return m;

    }

    graph.addMouseDownListener(async (x, y) => {
        if (graph.menuVisible()) {
            graph.hideMenu();
            return;
        } else {

            let selectedtrackIndex = graph.getTrack(x, y);
            if (selectedtrackIndex != null && selectedtrackIndex >= 0) {
                selectedTrack = graph.track[selectedtrackIndex]
                if (selectedTrack) {
                    selectedTrack.highlightAnnotation(selectedTrack.tgraph.Xwc(x))
                    graph.showMenu(getMenu(selectedTrack), x, y);
                }
            }

        }
        md = true;
    })
    graph.addMouseMoveListener(async (x, y) => {

        if (md) {
            return;
        }
        if (graph.menuVisible()) {
            return;
        }

        let selectedtrackIndex = graph.getTrack(x, y);
        if (selectedtrackIndex != null && selectedtrackIndex >= 0) {
            selectedTrack = graph.track[selectedtrackIndex]
        } else {

            clearSelect();

        }

    })

    let clearSelect = () => {
        for (let t of graph.track) {
            t.markend = -1;
            t.markstart = -1;
        }
    }

    graph.addMouseUpListener(async (x, y) => {
        md = false;
        if (graph.menuVisible()) {
            graph.hideMenu();
            clearSelect();

            return;
        }
    })

    let compare_annotations = async (startTrack, annotationA, endTrack, annotationB) => {
        let TrackLink = await exec('baja/bio/track-link')
        if (startTrack && endTrack) {
            let st = startTrack
            let ed = endTrack;

            let randomInteger = (max) => {
                return Math.floor(Math.random() * (max + 1));
            }
            let randomRgbColor = (alpha) => {
                let r = randomInteger(255);
                let g = randomInteger(255);
                let b = randomInteger(255);
                return '' + r + ',' + g + ',' + b + ',' + alpha;
            }
            let qseq = startTrack.getSequenceRange(annotationA.xi, annotationA.xf);
            let tseq = endTrack.getSequenceRange(annotationB.xi, annotationB.xf);

            console.log('debubg');
            let vo = await exec('py/bio/compare-sequences-ld.py', qseq, tseq);

            let trackPoints = [];

            if (vo['ld'] != null) {
                let score = vo['ld']
                let percent = vo['percent']

                let ta1 = {
                    track: st,
                    xi: annotationA.xi,
                    xf: annotationA.xf,
                    y: 0
                }
                let tb1 = {
                    track: ed,
                    xi: annotationB.xi,
                    xf: annotationB.xf,
                    y: 0
                }
                let tlinkf = new TrackLink(ta1, tb1);
                tlinkf.mode = 'rect';
                tlinkf.alpha = score;

                tlinkf.color = 'rgb(' + randomRgbColor(percent / 100) + ')';
                tlinkf.label = parseInt(percent) + '%';
                tlinkf.setValue(parseInt(percent))
                trackPoints.push(tlinkf)
                graph.appendLayers(trackPoints)
            }
        }
    }

}
