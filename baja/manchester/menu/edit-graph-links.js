function (graph) {
    graph.setMessage(" Select intron...")
    graph.setMouseMode("none")
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    let selectedTrack;
    let startTrack;
    let endTrack;
    let startIntron = null;
    let endIntron = null;
    let md = false;

    graph.addMouseDownListener(async (x, y) => {
        md = true;
        if (graph.menuVisible()) {
            graph.hideMenu();
            selectedTrack = null;
            return;
        } else {
            graph.showMenu(m, x, y);
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

    graph.addMouseUpListener(async (x, y) => {

        md = false;
        let selectedtrackIndex = graph.getTrack(x, y);
        if (selectedtrackIndex != null && selectedtrackIndex >= 0) {
            selectedTrack = graph.track[selectedtrackIndex]
            if (!startTrack) {
                startTrack = selectedTrack;
                let trackX = startTrack.tgraph.Xwc(x);

                let sex = startTrack.getExons();
                let ps = null;
                for (let s of sex) {

                    if (startTrack.strand <= 0) {
                        if (ps != null && trackX < ps.xf && trackX > s.xi) {
                            graph.setMessage("Intron" + ps.xf + ' ... ' + s.xi)
                            startIntron = {
                                xf: ps.xi,
                                xi: s.xf
                            }
                        }
                    }
                    ps = s;
                }
                graph.setMessage('Selected: ' + startTrack.name);
                startTrack.select();
            } else {
                endTrack = selectedTrack;
                let trackX = endTrack.tgraph.Xwc(x);

                let eex = endTrack.getExons();
                let ps = null;
                for (let s of eex) {

                    if (endTrack.strand < 0) {
                        if (ps != null && trackX < ps.xf && trackX > s.xi) {
                            endIntron = {
                                xf: ps.xi,
                                xi: s.xf
                            }
                        }
                    }
                    ps = s;
                }
                endTrack.select();
            }
        } else {

            if (startTrack) {
                startTrack.deselect();
            }
            if (endTrack) {
                endTrack.deselect();
            }
            startTrack = null;
            endTrack = null;
            graph.setMessage(" Please click on a track")
        }
        if (graph.menuVisible()) {
            graph.hideMenu();
            return;
        }

    })

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

    let run_button_panel = {
        wid: 'card',
        componentRef: 'runbutton_panel',
        data: {
            cards: [
                [
                    {
                        'title': ' ', 'body': ``,
                        'width': '100%',
                        'component':
                        {
                            wid: 'mt-button', data: {
                                buttons: [

                                    {
                                        label: 'Filter', ionFunction: createIonFunction(async () => {

                                        })
                                    }, {
                                        label: 'Cancel', ionFunction: createIonFunction(async () => {

                                        })
                                    }
                                ]
                            }
                        }
                    },
                ]
            ]
        }
    }

    let m = [

        {
            label: 'do something else',
            click: async () => {
                let panel;

                console.log('debubg');

                const __nameHook = createIonFunction((hook) => {
                    panel = hook;
                })
                let alignGraph_panel_layout = {
                    wid: 'card',
                    componentRef: 'alignGraph',
                    data: {
                        cards: [
                            [
                                {
                                    'title': ' ', 'body': ``,
                                    'width': '100%',
                                    'component':
                                    {
                                        wid: 'input-param-items',
                                        refCallback: __nameHook,
                                        data: {
                                            'input_labels': ['Percent cutoff'],
                                            input_function: {
                                                'Percent cutoff': createIonFunction((value) => {

                                                })
                                            }
                                        }
                                    }
                                },
                                {
                                    'width': '100%',
                                    'component':
                                    {
                                        wid: 'mt-button', data: {
                                            buttons: [

                                                {
                                                    label: 'Filter', ionFunction: createIonFunction(async () => {

                                                        let th = panel.input_param['Percent cutoff'];
                                                        for (let layer of graph.layers) {
                                                            console.log ( " layer value " + layer.value );

                                                            if (layer.value < th) {
                                                                layer.visible = false;
                                                            }

                                                        }
                                                    })
                                                }, {
                                                    label: 'Cancel', ionFunction: createIonFunction(async () => {

                                                    })
                                                }
                                            ]
                                        }
                                    }
                                },
                            ]
                        ]
                    }
                }
                showModal(alignGraph_panel_layout)
            },
            move: () => {
            }

        },

        {
            label: 'Remove exon matches',
            click: async () => {
                let panel;
                const __nameHook = createIonFunction((hook) => {
                    panel = hook;
                })
                let alignGraph_panel_layout = {
                    wid: 'card',
                    componentRef: 'alignGraph',
                    data: {
                        cards: [
                            [
                                {
                                    'title': ' ', 'body': ``,
                                    'width': '100%',
                                    'component':
                                    {
                                        wid: 'input-param-items',
                                        refCallback: __nameHook,
                                        data: {
                                            'input_labels': ['Percent cutoff'],
                                            input_function: {
                                                'Percent cutoff': createIonFunction((value) => {

                                                })
                                            }
                                        }
                                    }
                                },
                                {
                                    'width': '100%',
                                    'component':
                                    {
                                        wid: 'mt-button', data: {
                                            buttons: [

                                                {
                                                    label: 'Filter', ionFunction: createIonFunction(async () => {

                                                        let th = panel.input_param['Percent cutoff'];
                                                        let nl = []
                                                        for (let layer of graph.layers) {
                                                            if (layer.value < th) {
                                                                layer.visible = false;
                                                            }else {
                                                                nl.push ( layer );
                                                            }
                                                        }
                                                        graph.layers = nl;
                                                    })
                                                }, {
                                                    label: 'Cancel', ionFunction: createIonFunction(async () => {

                                                    })
                                                }
                                            ]
                                        }
                                    }
                                },
                            ]
                        ]
                    }
                }
                showModal(alignGraph_panel_layout)
            },
            move: () => {
            }

        },

        {
            label: 'Compare Introns',
            click: async () => {
            },
            move: () => {
            }

        },
        {
            label: 'Cancel',
            click: () => {
            },
            move: () => {
            }

        }
    ];

}
