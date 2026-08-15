function (graph, genegraph_panel_layout) {

    exec('baja/math/le-distance.js').then(async le => {
        let Biopolymer = await exec('baja/chem/biopolymer.js')

        let Amplicon = await exec('flexigraph/amplicon.js')
        let Oligo = await exec('flexigraph/oligo.js')
        graph.setMessage(" Click on a track to view operations menu")

        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.selectOff();
        let ed;
        const nameHook = createIonFunction((editor) => {
            ed = editor;
        })
        let start = -1;
        let end = -1;
        let ywc = -1;
        let highlight = false;
        let highlight_label = 'Highlight'
        let selectedTrack = null;
        let resizeTrack = false;
        let fmode = 'forward'
        let rmode = 'reverse'
        let pmode = 'forward-complement'

        graph.addMouseMoveListener((x, y) => {
            let trackIndex = graph.getTrack(x, y);

            if (trackIndex >= 0) {
                let cselectedTrack = graph.track[trackIndex]
                if (cselectedTrack && selectedTrack != cselectedTrack) {
                    if (selectedTrack)
                        selectedTrack.showResizeBar = false;
                }
                selectedTrack = cselectedTrack;
                if (selectedTrack)
                    selectedTrack.showResizeBar = true;
            } else {
                graph.selectOff();
                selectedTrack = null;
            }
        })

        graph.addMouseDownListener((x, y) => {
            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                selectedTrack = graph.track[trackIndex]
            }
            ywc = y;
            if (highlight && selectedTrack) {
                if (start < 0) {
                    let xsc = graph.X(x);
                    selectedTrack.tgraph.rescale();
                    console.log(xsc + ' xi : ' + selectedTrack.tgraph.xi);
                    let t = selectedTrack.tgraph.xi;
                    start = selectedTrack.tgraph.Xwc(x - t * 2);
                    selectedTrack.markstart = start;
                }
                else if (start > 0 && end < 0) {
                    let t = selectedTrack.tgraph.xi;
                    end = selectedTrack.tgraph.Xwc(x - t * 2);
                    selectedTrack.markend = end;
                }
                highlight_label = 'Clear highlight'

            } else {
                highlight_label = 'Highlight'
            }

            let menuList = [
                {
                    label: 'Generate primers',
                    click: async (xwc, ywc) => {

                        let temp = async (graph) => {

                            start = -1;
                            end = -1;
                            let trackIndex = graph.getTrack(x, y);
                            let tr = graph.track[trackIndex];
                            let sequence = tr.sequence;
                            let splicekeys = null;

                            let splicedtrack = sequence;
                            let splicedindices = Array(sequence.length).fill(tr.xi).map((x_, y_) => x_ + y_);
                            let spreadPrimers = 1;
                            let designJunctions = 1;
                            if (spreadPrimers) {
                                let interval = 3;
                                let chunkSize = Math.floor(sequence.length / interval);
                                for (let i = 0; i < interval; i++) {
                                    let spreadSequence = null;
                                    let spreadIndices = null;
                                    let spreadKeys = {};
                                    spreadIndices = splicedindices.slice(i * chunkSize, (i + 1) * chunkSize);
                                    spreadSequence = sequence.slice(i * chunkSize, (i + 1) * chunkSize);
                                    for (let j = 0; j < spreadSequence.length; j++) {

                                        spreadKeys[j] = spreadIndices[j];

                                    }

                                    if (tr.strand < 0) {
                                        spreadSequence = spreadSequence.split("").reverse().join("");
                                    }

                                    let okRegionList = ``;
                                    if (designJunctions) {

                                        let junctions = [];
                                        if (tr.annotations.length > 1) {
                                            for (let anno of tr.annotations) {
                                                if ((anno.xi > spreadIndices[0] && anno.xi < spreadIndices[spreadSequence.length - 1])) {
                                                    junctions.push(spreadIndices.indexOf(anno.xi));
                                                } else if (anno.xf > spreadIndices[0] && anno.xf < spreadIndices[spreadSequence.length - 1]) {
                                                    junctions.push(spreadIndices.indexOf(anno.xf));
                                                }
                                            }
                                        }

                                        if (junctions && tr.strand > 0) {
                                            for (let j of junctions) {
                                                okRegionList += `0,${j};${j + 1},${spreadSequence.length - j - 1}`;
                                                okRegionList += `;`;
                                            }

                                        } else if (junctions && tr.strand < 0) {
                                            for (let j of junctions) {
                                                let flip = spreadSequence.length;
                                                okRegionList += `0,${flip - j - 2};${flip - j - 1},${j}`;
                                                okRegionList += `;`;
                                            }
                                        }
                                    }

                                    if (!(okRegionList.length > 0)) {
                                        okRegionList += `,,,`;
                                    }
                                    let engineMonitor = new EngineMonitor((msg) => {
                                        graph.setMessage(msg)
                                    });

                                    graph.setMessage(' Generating primers... ')

                                    let r = await exec('/py/ppsets/generate-ppsets.py', engineMonitor, spreadSequence, okRegionList, 1)
                                    let primer_ = await exec('baja/manchester/ppsets/apply-primer3.js', r, chunkSize * i, tr, graph)

                                }

                            } else {

                                if (tr.strand < 0) {
                                    sequence = sequence.split("").reverse().join("");
                                }

                                POSTJSON({
                                    id: tr.id,
                                    seq: sequence,
                                    taqman: 1,
                                }, ht).then(res => {
                                    showModal({
                                        wid: 'json',
                                        data: JSON.stringify(res)
                                    })
                                    console.log(res)

                                    exec('baja/manchester/annotation/apply-variant-amplicon.js', res, tr, splicekeys).then(primer_probe => {
                                        tr.addOligo(primer_probe)
                                    });
                                })

                            }

                        }
                        graph.runfun(temp)

                    },
                    move: () => {
                    }
                },
                {
                    label: 'Paste',
                    click: async (xwc, ywc) => {
                        start = -1;
                        end = -1;
                        let trackIndex = graph.getTrack(x, y);
                        let selectedTrack = graph.track[trackIndex];
                        let messagePanel;
                        let platePanel = createIonFunction((m) => {
                            messagePanel = m;
                        })

                        let reverseComp = (str) => {
                            let s = reverseString(str);
                            let a = '';
                            let index = 0;
                            for (let c of s) {
                                c = '' + c;

                                if (c == 'A') {
                                    a += 'T'
                                } else if (c == 'T') {
                                    a += 'A'
                                } else if (c == 'G') {
                                    a += 'C'
                                } else if (c == 'C') {
                                    a += 'G'
                                }

                                index++;

                            }
                            return a;
                        }

                        let runsequence = (in_seq, ledistance) => {
                            if (ledistance == undefined) {
                                ledistance = 0;
                            }
                            for (let t of graph.track) {
                                let sp = in_seq.split('\t')
                                let seq = '';
                                let start = -1;
                                let idv;
                                if (sp && sp.length === 3) {
                                    idv = sp[0]
                                    seq = sp[1]
                                    start = +sp[2] + 1
                                }
                                else
                                    if (sp && sp.length > 1) {
                                        start = +sp[1] + 1
                                        seq = sp[0]
                                    } else {
                                        seq = in_seq;
                                    }
                                let len = seq.length;
                                if (start > 0) {

                                } else {
                                    let coordinates = []
                                    let sequence = t.sequence.trim();
                                    for (let i = 0; i < sequence.length - len; i++) {
                                        let seq_slice = sequence.substring(i, i + len);
                                        if (ledistance == undefined || ledistance === 0) {

                                            if (seq_slice === in_seq) {

                                                let xcoord = t.xi + i;
                                                coordinates.push(xcoord)
                                            }
                                        } else {
                                            let distance = le(seq, seq_slice);
                                            let percent = (len - distance) / len
                                            if (!ledistance || ledistance < 0) {
                                                ledistance = 0;
                                            }

                                            if (distance <= ledistance) {
                                                let xcoord = t.xi + i;
                                                coordinates.push(xcoord)

                                            }
                                        }
                                    } return coordinates;
                                }
                            }
                        }
                        let forward;
                        let reverse;
                        let probe;
                        let filter_panel = {
                            wid: 'card',
                            componentRef: 'filter_panel',
                            data: {
                                cards: [
                                    [

                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'radio-buttons',
                                                data: [
                                                    {
                                                        label: 'Forward',
                                                        ionfunction: createIonFunction(
                                                            () => {
                                                                fmode = 'forward'
                                                            }
                                                        )
                                                    },
                                                    {
                                                        label: 'Reverse',
                                                        ionfunction: createIonFunction(
                                                            () => {
                                                                fmode = 'reverse'
                                                            }
                                                        )
                                                    },
                                                    {
                                                        label: 'Forward complement',
                                                        ionfunction: createIonFunction(
                                                            () => {
                                                                fmode = 'forward-complement'
                                                            }
                                                        )
                                                    },
                                                    {
                                                        label: 'Reverse complement',
                                                        ionfunction: createIonFunction(
                                                            async () => {
                                                                fmode = 'reverse-complement'
                                                            }
                                                        )
                                                    }]
                                            }

                                        },

                                        {
                                            'width': '100%',
                                            "style.padding-top": '4px',
                                            "style.border": '1px',
                                            'component':
                                            {
                                                'wid': 'input-textfield',
                                                'title': 'Forward:',
                                                'data': {
                                                    'blocking': false,
                                                    'show-button': false,
                                                    'ionHookFunction': createIonFunction((w) => {
                                                        forward = w;
                                                    }),
                                                    'ionfunction': createIonFunction((title) => {

                                                    })
                                                }
                                            }
                                        },

                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'radio-buttons',
                                                data: [
                                                    {
                                                        label: 'Forward',
                                                        ionfunction: createIonFunction(
                                                            () => {
                                                                rmode = 'forward'
                                                            }
                                                        )
                                                    },
                                                    {
                                                        label: 'Reverse',
                                                        ionfunction: createIonFunction(
                                                            () => {
                                                                rmode = 'reverse'
                                                            }
                                                        )
                                                    },
                                                    {
                                                        label: 'Forward complement',
                                                        ionfunction: createIonFunction(
                                                            () => {
                                                                rmode = 'forward-complement'
                                                            }
                                                        )
                                                    },
                                                    {
                                                        label: 'Reverse complement',
                                                        ionfunction: createIonFunction(
                                                            async () => {
                                                                rmode = 'reverse-complement'
                                                            }
                                                        )
                                                    }]
                                            }

                                        },

                                        {
                                            'width': '100%',
                                            "style.padding-top": '4px',
                                            "style.border": '1px',
                                            'component':
                                            {
                                                'wid': 'input-textfield',
                                                'title': 'Reverse:',
                                                'data': {
                                                    'blocking': false,
                                                    'show-button': false,
                                                    'ionHookFunction': createIonFunction((w) => {
                                                        reverse = w;
                                                    }),
                                                    'ionfunction': createIonFunction((title) => {
                                                    })
                                                }
                                            }
                                        },

                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'radio-buttons',
                                                data: [
                                                    {
                                                        label: 'Forward',
                                                        ionfunction: createIonFunction(
                                                            () => {
                                                                pmode = 'forward'
                                                            }
                                                        )
                                                    },
                                                    {
                                                        label: 'Reverse',
                                                        ionfunction: createIonFunction(
                                                            () => {
                                                                pmode = 'reverse'
                                                            }
                                                        )
                                                    },
                                                    {
                                                        label: 'Forward complement',
                                                        ionfunction: createIonFunction(
                                                            () => {
                                                                pmode = 'forward-complement'
                                                            }
                                                        )
                                                    },
                                                    {
                                                        label: 'Reverse complement',
                                                        ionfunction: createIonFunction(
                                                            async () => {
                                                                pmode = 'reverse-complement'
                                                            }
                                                        )
                                                    }]
                                            }

                                        },

                                        {
                                            'width': '100%',
                                            "style.padding-top": '4px',
                                            "style.border": '1px',
                                            'component':
                                            {
                                                'wid': 'input-textfield',
                                                'title': 'Probe:',
                                                'data': {
                                                    'blocking': false,
                                                    'show-button': false,
                                                    'ionHookFunction': createIonFunction((w) => {
                                                        probe = w;
                                                    }),
                                                    'ionfunction': createIonFunction((title) => {
                                                    })
                                                }
                                            }
                                        },

                                        {
                                            'title': ' ', 'body': ``,
                                            'width': '30%',
                                            'component':
                                            {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Align', ionFunction: createIonFunction(async () => {
                                                                let f = forward.value;
                                                                let r = reverse.value;
                                                                let p = probe.value;

                                                                if (f && f.length > 0 && r && r.length > 0 && p && p.length > 0) {

                                                                    if (fmode === 'forward') { }
                                                                    else if (fmode === 'reverse') {
                                                                        f = Biopolymer.reverse(f)
                                                                    } else if (fmode === 'reverse-complement') {
                                                                        f = Biopolymer.reverseComp(f)
                                                                    } else if (fmode === 'forward-complement') {
                                                                        f = Biopolymer.comp(f)
                                                                    }
                                                                    if (rmode === 'forward') { }
                                                                    else if (rmode === 'reverse') {
                                                                        r = Biopolymer.reverse(r)
                                                                    } else if (rmode === 'reverse-complement') {
                                                                        r = Biopolymer.reverseComp(r)
                                                                    } else if (rmode === 'forward-complement') {
                                                                        r = Biopolymer.comp(r)
                                                                    }

                                                                    if (pmode === 'forward') { }
                                                                    else if (pmode === 'reverse') {
                                                                        p = Biopolymer.reverse(p)
                                                                    } else if (pmode === 'reverse-complement') {
                                                                        p = Biopolymer.reverseComp(p)
                                                                    } else if (pmode === 'forward-complement') {
                                                                        p = Biopolymer.comp(p)
                                                                    }
                                                                    let xf = runsequence((f), 2);
                                                                    let xr = runsequence((r), 2);
                                                                    let xp = runsequence((p), 2);

                                                                    let results = {
                                                                        'f': f,
                                                                        'r': r,
                                                                        'p': p,
                                                                        'forward': xf,
                                                                        'reverse': xr,
                                                                        'probe': xp
                                                                    }

                                                                    let amplicon_set = []
                                                                    console.log('debubg');
                                                                    for (let i = 0; i < xf.length; i++) {
                                                                        let fx = xf[i]
                                                                        if (i >= xp.length || i >= xr.length) {
                                                                            console.log(" missing some things for the amplicon ")
                                                                            break;
                                                                        }
                                                                        let px = xp[i]
                                                                        let rx = xr[i]
                                                                        let mchemistry_template = `([?]d.p.){${p.length - 1}}([?]d){1}`
                                                                        let mo = Biopolymer.createFromOS(mchemistry_template, p, 'primer', px, 0.45);
                                                                        let lchemistry_template = `([?]d.p.){${f.length - 1}}([?]d){1}`
                                                                        let lo = Biopolymer.createFromOS(lchemistry_template, f, 'primer', fx, 0.45);
                                                                        let rchemistry_template = `([?]d.p.){${r.length - 1}}([?]d){1}`
                                                                        let ro = Biopolymer.createFromOS(rchemistry_template, r, 'primer', rx, 0.45)
                                                                        let amplicon = new Amplicon(lo, ro, mo);
                                                                        amplicon_set.push(amplicon)
                                                                        selectedTrack.addOligo(amplicon)
                                                                    }

                                                                    showModal({
                                                                        wid: 'json',
                                                                        data: JSON.stringify(amplicon_set)
                                                                    })

                                                                }
                                                            })
                                                        }
                                                    ]
                                                }
                                            }
                                        },
                                        {
                                            'title': ' ', 'body': ``,
                                            'width': '30%',
                                            'component':
                                            {
                                                wid: 'html',
                                                refCallback: platePanel,
                                                data: ''
                                            }
                                        },
                                    ]
                                ]
                            }
                        }
                        showModal(filter_panel)

                    },
                    move: () => {
                    }
                }
            ]

            graph.showMenu(menuList, x, y, 200)
        });

    })

}
