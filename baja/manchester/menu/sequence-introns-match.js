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
                    selectedTrack.highlightIntron(selectedTrack.tgraph.Xwc(x))
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

    let graphintrons = async () => {
        let TrackLink = await exec('baja/bio/track-link')
        console.log('debubg');

        if (startTrack && endTrack) {

            let sex = startTrack.getExons();
            let eex = endTrack.getExons();

            let indx = 0;
            let trackPoints = []
            let presex = null;
            let preeex = null;
            let i = startTrack.xi;
            let j = endTrack.xi;
            for (let s of sex) {

                if (presex) {

                    let ai = presex.xf;
                    let af = s.xi;

                    if (!startTrack) {
                        continue;
                    }

                    if (startTrack && startTrack.strand < 0) {
                        ai = s.xi;
                        af = presex.xf;
                    }
                    let seqa = startTrack.getSequenceRange(ai, af);
                    preeex = null;
                    for (let e of eex) {
                        if (preeex) {
                            let bi = preeex.xf;
                            let bf = e.xi;
                            if (endTrack.strand < 0) {
                                bi = e.xi;
                                bf = preeex.xf;
                            }

                            log(' starting... ')
                            console.log('debubg');
                            let seqb = endTrack.getSequenceRange(bi, bf);
                            let vo = await exec('py/bio/compare-sequences.py', seqa, seqb);
                            if (vo != null) {
                                let lines = vo.split('\n')

                                let c = {}
                                let cl = []
                                for (let l of lines) {
                                    l = l.trim();
                                    if (l.trim() === '') {
                                        cl.push(c);
                                        c = {}

                                    }
                                    else if (l.startsWith('target')) {
                                        let tem = l.substring(l.indexOf(' ')).trim().split(' ');
                                        if (tem.length === 2) {
                                            c['t'] = {
                                                start: parseInt(tem[0]),
                                                seq: tem[1]
                                            }
                                        } else {
                                            c['t'] = {
                                                start: parseInt(tem[0]),
                                                seq: tem[1],
                                                end: parseInt(tem[2])
                                            }
                                        }

                                    } else if (l.startsWith('query')) {
                                        let tem = l.substring(l.indexOf(' ')).trim().split(' ');
                                        if (tem.length === 2) {
                                            c['q'] = {
                                                start: parseInt(tem[0]),
                                                seq: tem[1]
                                            }
                                        } else {
                                            c['q'] = {
                                                start: parseInt(tem[0]),
                                                seq: tem[1],
                                                end: parseInt(tem[2])
                                            }
                                        }

                                    } else {

                                        let tem = l.substring(l.indexOf(' ')).trim().split(' ');
                                        if (tem.length === 1) {
                                            c['m'] = {
                                                seq: tem[0]
                                            }
                                        } else {
                                            c['m'] = {
                                                seq: tem[0],
                                                end: parseInt(tem[1])
                                            }
                                        }
                                    }

                                }

                                for (let ob of cl) {
                                    let t = ob['t']
                                    let q = ob['q']
                                    let m = ob['m']

                                    if (t['seq'] && t['seq'].length > 0 && m['seq'] && m['seq'].length > 0) {
                                        let tseq = t['seq'].trim()
                                        let mseq = m['seq'].trim()
                                        tseq = tseq.split('');
                                        mseq = mseq.split('');

                                        console.log('debubg');
                                        let start_index = t['start']
                                        let start_index_f = q['start']

                                        for (let o = 0; o < tseq.length; o += 100) {
                                            let mch = mseq[o]
                                            if (mch.trim() === '|') {
                                                let ta1 = {
                                                    track: startTrack,
                                                    x: ai + start_index + o,
                                                    y: 0
                                                }
                                                let tb1 = {
                                                    track: endTrack,
                                                    x: bi + start_index_f + o,
                                                    y: 0
                                                }
                                                let tlinkf = new TrackLink(ta1, tb1);
                                                trackPoints.push(tlinkf)
                                            }

                                        }
                                    }
                                }

                                if (trackPoints && trackPoints.length > 0) {
                                    showWidget({
                                        wid: 'json',
                                        data: JSON.stringify(trackPoints)
                                    })
                                }
                            }

                        } else {
                            preeex = e;
                        }
                    }

                } else {
                    presex = s;
                }
            }
            startTrack.deselect();
            endTrack.deselect();
            startTrack = null;
            endTrack = null;
            graph.appendLayers(trackPoints)
        }
    }

    let align = async (startTrack, annotationA, endTrack, annotationB) => {
        let TrackLink = await exec('baja/bio/track-link')
        let matches = []
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
            let vo = await exec('py/bio/compare-sequences.py', qseq, tseq);
            if (vo != null && vo.length > 0) {
                let lines = vo.split('\n')
                let c = {}
                let cl = []
                for (let l of lines) {
                    l = l.trim();
                    if (l.trim() === '') {
                        cl.push(c);
                        c = {}

                    }
                    else if (l.startsWith('target')) {
                        let tem = l.substring(l.indexOf(' ')).trim().split(' ');
                        if (tem.length === 2) {
                            c['t'] = {
                                start: parseInt(tem[0]),
                                seq: tem[1]
                            }
                        } else {
                            c['t'] = {
                                start: parseInt(tem[0]),
                                seq: tem[1],
                                end: parseInt(tem[2])
                            }
                        }

                    } else if (l.startsWith('query')) {
                        let tem = l.substring(l.indexOf(' ')).trim().split(' ');
                        if (tem.length === 2) {
                            c['q'] = {
                                start: parseInt(tem[0]),
                                seq: tem[1]
                            }
                        } else {
                            c['q'] = {
                                start: parseInt(tem[0]),
                                seq: tem[1],
                                end: parseInt(tem[2])
                            }
                        }

                    } else {

                        let tem = l.substring(l.indexOf(' ')).trim().split(' ');
                        if (tem.length === 1) {
                            c['m'] = {
                                seq: tem[0]
                            }
                        } else {
                            c['m'] = {
                                seq: tem[0],
                                end: parseInt(tem[1])
                            }
                        }
                    }

                }
                let score = 0;
                let length = 0;
                for (let ob of cl) {
                    let t = ob['t']
                    let q = ob['q']
                    let m = ob['m']

                    if (t['seq'] && t['seq'].length > 0 && m['seq'] && m['seq'].length > 0) {
                        let tseq = t['seq'].trim()
                        let mseq = m['seq'].trim()
                        tseq = tseq.split('');
                        mseq = mseq.split('');

                        length += tseq.length;
                        for (let o = 0; o < tseq.length; o++) {
                            let mch = mseq[o]
                            if (mch.trim() === '|') {
                                score++;
                            }
                        }
                    }
                }
                score = score / length;
                matches.push({
                    s: { i: annotationA.xi, f: annotationA.xf },
                    e: { i: annotationB.xi, f: annotationB.xf },
                    score: score
                })
            }

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
                tlinkf.setValue ( parseInt ( percent ) );

                trackPoints.push(tlinkf)
                graph.appendLayers(trackPoints)
            }
        }
    }

    let compare_annotations = async (startTrack, annotationA, endTrack, annotationB) => {
        let TrackLink = await exec('baja/bio/track-link')
        let matches = []
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
                tlinkf.setValue ( parseInt ( percent ) );
                trackPoints.push(tlinkf)
                graph.appendLayers(trackPoints)
            }
        }
    }

}
