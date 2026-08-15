function (graph) {
    graph.setMessage(" Select a track...")
    graph.setMouseMode("none")
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    return new Promise(async (resolve, rejecct) => {
        let TrackLink = await exec('baja/bio/track-link')
        let selectedTrack;

        let graphexons = async (startTrack, endTrack) => {
            if (startTrack && endTrack) {
                let st = startTrack
                let ed = endTrack;
                let start_strand = startTrack.strand;
                let end_strand = endTrack.strand;
                let sex = st.getExons();
                let eex = ed.getExons();
                let trackPoints = []
                let smatch = []
                let randomInteger = (max) => {
                    return Math.floor(Math.random() * (max + 1));
                }
                let randomRgbColor = (alpha) => {
                    let r = randomInteger(255);
                    let g = randomInteger(255);
                    let b = randomInteger(255);
                    return '' + r + ',' + g + ',' + b + ',' + alpha;
                }

                for (let s of sex) {
                    let ai = s.xi;
                    let af = s.xf;

                    let seqa = st.getSequenceRange(ai, af);
                    let matches = []
                    for (let e of eex) {
                        let bi = e.xi;
                        let bf = e.xf;

                        let seqb = ed.getSequenceRange(bi, bf);
                        if (startTrack.strand != endTrack.strand) {
                            seqb = seqb.split("").reverse().join("");
                        }
                        let vo = await exec('py/bio/compare-sequences-ld.py', seqa, seqb);
                        if (vo['percent'] != undefined && parseFloat(vo['percent']) != NaN) {

                            matches.push({
                                s: { i: ai, f: af },
                                e: { i: bi, f: bf },
                                score: vo['percent']
                            })

                        }
                    }
                    matches = matches.sort((a, b) => {
                        return parseFloat(b.score) - parseFloat(a.score);
                    })
                    console.log(" matches " + matches)
                    let sm = matches[0]
                    let ta1 = {
                        track: st,
                        xi: sm.s.i,
                        xf: sm.s.f,
                        y: 0
                    }
                    let tb1 = {
                        track: ed,
                        xi: sm.e.i,
                        xf: sm.e.f,
                        y: 0
                    }
                    let tlinkf = new TrackLink(ta1, tb1);
                    tlinkf.mode = 'rect';
                    tlinkf.alpha = sm.score;

                    tlinkf.color = 'rgb(' + randomRgbColor(sm.score / 100) + ')';
                    tlinkf.label = parseInt(sm.score) + '%';
                    tlinkf.setValue(parseInt(sm.score));
                    trackPoints.push(tlinkf)
                    graph.appendLayers(trackPoints)
                    trackPoints = []
                    smatch = []
                }
            }
        }

        let graphintrons = async (startTrack, endTrack) => {
            if (startTrack && endTrack) {
                let st = startTrack
                let ed = endTrack;

                let start_strand = startTrack.strand;
                let end_strand = endTrack.strand;
                let sex = st.getExons();
                let eex = ed.getExons();
                let trackPoints = []
                let presex = null;
                let preeex = null;
                let smatch = []

                let randomInteger = (max) => {
                    return Math.floor(Math.random() * (max + 1));
                }
                let randomRgbColor = (alpha) => {
                    let r = randomInteger(255);
                    let g = randomInteger(255);
                    let b = randomInteger(255);
                    return '' + r + ',' + g + ',' + b + ',' + alpha;
                }

                for (let s of sex) {
                    if (presex) {
                        let ai = presex.xf;
                        let af = s.xi;
                        if (start_strand < 0) {
                            ai = s.xf;
                            af = presex.xi;
                        }
                        let seqa = st.getSequenceRange(ai, af);
                        preeex = null;
                        let matches = []
                        for (let e of eex) {
                            if (preeex) {
                                let bi = preeex.xf;
                                let bf = e.xi;
                                if (end_strand < 0) {
                                    bi = e.xf;
                                    bf = preeex.xi;
                                }
                                let seqb = ed.getSequenceRange(bi, bf);
                                if (end_strand != st.strand) {
                                    seqb = seqb.split("").reverse().join("");
                                }
                                let vo = await exec('py/bio/compare-sequences-score.py', seqa, seqb);
                                if (vo['percent']) {
                                    matches.push({
                                        s: { i: ai, f: af },
                                        e: { i: bi, f: bf },
                                        score: vo['percent']
                                    })
                                }
                                preeex = e;
                            } else {
                                preeex = e;
                            }
                        }
                        presex = s;
                        matches = matches.sort((a, b) => {
                            return parseFloat(b.score) - parseFloat(a.score);
                        })
                        smatch.push({
                            s: { i: ai, f: af },
                            matches
                        })
                    } else {
                        presex = s;
                    }

                    for (let smlist of smatch) {
                        let sm = smlist.matches[0]
                        let ta1 = {
                            track: st,
                            xi: sm.s.i,
                            xf: sm.s.f,
                            y: 0
                        }
                        let tb1 = {
                            track: ed,
                            xi: sm.e.i,
                            xf: sm.e.f,
                            y: 0
                        }
                        let tlinkf = new TrackLink(ta1, tb1);
                        tlinkf.mode = 'rect';
                        tlinkf.alpha = sm.score;

                        tlinkf.color = 'rgb(' + randomRgbColor(sm.score / 100) + ')';
                        tlinkf.label = parseInt(sm.score) + '%';
                        tlinkf.setValue(parseInt(sm.score));

                        trackPoints.push(tlinkf)

                    }

                    graph.appendLayers(trackPoints)
                    trackPoints = []
                    smatch = []

                }
            }
        }

        let graphintrons_regions = async (introna, intronb) => {
            let TrackLink = await exec('baja/bio/track-link')
            if (startTrack && endTrack) {
                let trackPoints = []
                let seqa = startTrack.getSequenceRange(introna.xi, introna.xf);
                let seqb = endTrack.getSequenceRange(intronb.xi, intronb.xf);
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
                    if (score > 0.8) {

                        let ta1 = {
                            track: startTrack,
                            x: introna.xi,
                            y: 0
                        }
                        let tb1 = {
                            track: endTrack,
                            x: intronb.xi,
                            y: 0
                        }
                        let tlinkf = new TrackLink(ta1, tb1);
                        trackPoints.push(tlinkf)
                    }
                }
                startTrack = null;
                endTrack = null;
                graph.appendLayers(trackPoints)
            }
        }

        let graphAllintrons = async (startTrack, introna, endTrack, intronb) => {
            if (startTrack && endTrack) {
                let trackPoints = []
                let seqa = startTrack.getSequenceRange(introna.xi, introna.xf);
                let seqb = endTrack.getSequenceRange(intronb.xi, intronb.xf);
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
                    console.log(" score " + score)
                    if (score > 0) {
                        for (let ob of cl) {
                            let t = ob['t']
                            let q = ob['q']
                            let m = ob['m']
                            let start_index = q['start']
                            let start_index_f = t['start']
                            if (t['seq'] && t['seq'].length > 0
                                && m['seq'] && m['seq'].length > 0) {
                                let tseq = t['seq'].trim()
                                let mseq = m['seq'].trim()
                                tseq = tseq.split('');
                                mseq = mseq.split('');
                                length += tseq.length;
                                for (let o = 0; o < tseq.length; o++) {
                                    let mch = mseq[o]
                                    if (mch.trim() === '|') {
                                        let ta1 = {
                                            track: startTrack,
                                            x: introna.xi + start_index_f + o,
                                            y: 0
                                        }
                                        let tb1 = {
                                            track: endTrack,
                                            x: intronb.xi + start_index + o,
                                            y: 0
                                        }
                                        let tlinkf = new TrackLink(ta1, tb1);
                                        tlinkf.alpha = 1;
                                        trackPoints.push(tlinkf)
                                    }
                                }

                            }
                        }
                    } else {
                        alert(' not scored ')
                    }
                }
                graph.appendLayers(trackPoints)
            }
        }

        let compareIntrons = async (track, intron) => {
            for (let t of graph.track) {
                if (t.name != track.name) {
                    await graphintrons(track, t);

                }
            }
        }

        let selectedTrack2;

        let showButtons = () => {
            let buttons__ = [
                {
                    x: 0, y: 0, label: 'Introns', ionFunction: createIonFunction(async () => {
                        graph.setMouseMode('none')
                        graph.setMessage(" Select another track to compare introns ")
                        graph.addMouseDownListener(async (x, y) => {
                            graph.deselectAllTracks();
                            let trackIndex = graph.getTrack(x, y);
                            if (trackIndex >= 0) {
                                selectedTrack2 = graph.track[trackIndex]
                                let confirm = await exec('baja/lib/confirm.js', 'Compare Introns?', async () => {
                                    await graphintrons(selectedTrack, selectedTrack2)
                                })

                                showModal(confirm)
                            }
                        })

                    })
                },
                {
                    x: 1, y: 0, label: 'Exons', ionFunction: createIonFunction(async () => {
                        graph.setMouseMode('none')
                        graph.setMouseMode('none')
                        graph.setMessage(" Select another track to compare exons? ")
                        graph.addMouseDownListener(async (x, y) => {
                            graph.deselectAllTracks();
                            let trackIndex = graph.getTrack(x, y);
                            if (trackIndex >= 0) {
                                selectedTrack2 = graph.track[trackIndex]
                                let confirm = await exec('baja/lib/confirm.js', 'Compare Exons?', async () => {
                                    await graphexons(selectedTrack, selectedTrack2)
                                })
                                showModal(confirm)
                            }
                        })

                    })
                },
                {
                    x: 2, y: 0, label: 'Reset', ionFunction: createIonFunction(async () => {
                        graph.setMouseMode('none')
                        let hl = await exec('baja/manchester/menu/comparative-tools.js', graph)
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', hl);

                    })
                },
            ]

            let button_canvas = {
                wid: 'button-canvas',
                data: {
                    'title': 'controls',
                    'height': 25,
                    'width': 500,
                    'grid': {
                        xmin: 0,
                        xmax: 7,
                        ymin: -0.01,
                        ymax: 1,
                        xinset: 0,
                        yinset: 0
                    },
                    'buttons': buttons__

                }
            }
            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
            CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
        }

        graph.addMouseDownListener((x, y) => {
            graph.deselectAllTracks();
            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                selectedTrack = graph.track[trackIndex]
                if (selectedTrack) {
                    selectedTrack.select();

                    showButtons()
                }
            }
        })
        resolve();
    })

}
