function (graph, genegraph_panel_layout) {
    let editor_;
    let editor_function = createIonFunction((editor) => {
        editor_ = editor;
    })
    return new Promise(async (resolve, reject) => {

        function getSelectedSeq() {
            let s = []
            for (let t of graph.track) {
                let hs = t.getHighlightedSequence();
                if (hs != null && hs.length > 0) {
                    s.push(t)
                }
            }
            return s;
        }

        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        let panel = null;
        let __nameHook = createIonFunction((name) => {
            panel = name;
        })

        let randomInteger = (max) => {
            return Math.floor(Math.random() * (max + 1));
        }

        let randomRgbColor = (alpha) => {
            let r = randomInteger(255);
            let g = randomInteger(255);
            let b = randomInteger(255);
            return '' + r + ',' + g + ',' + b + ',' + alpha;
        }

        let bpanel = {
            wid: 'card',
            data: {
                cards: [
                    [
                        {
                            width: '100%',
                            'component': {
                                wid: 'menu',
                                data: {
                                    title: '  ',
                                    style: 'sub-container',
                                    menus: [
                                        {
                                            'label': 'Nucleotide', 'items': [
                                                {
                                                    'label': 'Pairwise nucleotide sequences', 'ionfunction': createIonFunction(async () => {
                                                        let tracks = getSelectedSeq();
                                                        if (tracks.length != 2) {
                                                            let c1 = {
                                                                wid: 'card',
                                                                data: {
                                                                    'style.padding-left': '12px',
                                                                    cards: [
                                                                        [

                                                                            {
                                                                                'title': '',
                                                                                width: '100%',

                                                                                'body': `  `, 'component':
                                                                                {
                                                                                    wid: 'selection-list',
                                                                                    width: '100%',
                                                                                    refCallback: selectPanel,
                                                                                    data: {
                                                                                        listItems: tracks,

                                                                                        single_selection: true,
                                                                                        show_button: false,
                                                                                        singleSelect: true,
                                                                                        button_function: createIonFunction(async (items) => {
                                                                                            let name = items[0]
                                                                                            for (let item of l) {
                                                                                                if (item.name === name) {
                                                                                                    select(item)
                                                                                                }
                                                                                            }
                                                                                        })
                                                                                    }
                                                                                }
                                                                            },

                                                                        ], [

                                                                        ]
                                                                    ]
                                                                }
                                                            }
                                                            showModal ( c1 );

                                                        }
                                                        else {
                                                            graph.setMessage(" Running pairwise comparison... ")
                                                            let seqs = [tracks[0].getHighlightedSequence(), tracks[1].getHighlightedSequence()]
                                                            let query = 0;
                                                            let target = 1;
                                                            let shortseq = seqs[0]
                                                            let longseq = seqs[1]
                                                            if (seqs[1].lengnth > longseq) {
                                                                shortseq = seqs[1]
                                                                longseq = seqs[0]
                                                                query = 1;
                                                                target = 0;
                                                            }
                                                            let r = await exec('py/baja/sequence-space/find-subseq.py', shortseq, longseq)
                                                            let TrackLink = await exec('baja/bio/track-link')

                                                            let index = tracks[query]
                                                            let ta1 = {
                                                                track: tracks[query],
                                                                xi: index.markstart,
                                                                xf: index.markend,
                                                                y: 0
                                                            }
                                                            let tb1 = {
                                                                track: tracks[target],
                                                                xi: tracks[target].markstart + r['start'],
                                                                xf: tracks[target].markstart + r['end'],
                                                                y: 0
                                                            }
                                                            let tlinkf = new TrackLink(ta1, tb1);
                                                            tlinkf.mode = 'rect';
                                                            tlinkf.alpha = r['score'];

                                                            tlinkf.color = "rgb(116,245,163,0.5)"
                                                            tlinkf.label = parseInt(r['score']);
                                                            tlinkf.setValue(parseInt(r['score']));

                                                            graph.appendLayers([tlinkf])

                                                            showModal({
                                                                wid: 'json',
                                                                data: JSON.stringify(r)
                                                            }, 800, 500)

                                                        }

                                                    })
                                                },
                                            ]
                                        },
                                        {
                                            'label': 'Peptide', 'items': [
                                                {
                                                    'label': 'Pairwise ORFs', 'ionfunction': createIonFunction(async () => {
                                                        let tracks = getSelectedSeq();
                                                        if (tracks.length != 2) {
                                                            infoPrompt(" Please select only two sequences to comapare... ")
                                                            return;
                                                        }
                                                        else {

                                                            tracks[0].generateORF()
                                                            tracks[1].generateORF()
                                                            graph.setMessage(" Running pairwise comparison... ")
                                                            let seqs = [tracks[0].getORFPeptide(), tracks[1].getORFPeptide()]
                                                            let query = 0;
                                                            let target = 1;
                                                            let shortseq = seqs[0]
                                                            let longseq = seqs[1]
                                                            if (seqs[1].lengnth > longseq) {
                                                                shortseq = seqs[1]
                                                                longseq = seqs[0]
                                                                query = 1;
                                                                target = 0;
                                                            }

                                                            longseq = longseq.substring ( 0, shortseq.length )
                                                            let r = await exec('py/sequence/protein-sequence.py', shortseq, longseq)
                                                            let TrackLink = await exec('baja/bio/track-link')
                                                            let index = tracks[query]

                                                            showModal({
                                                                wid: 'json',
                                                                data: JSON.stringify(r)
                                                            }, 800, 500)
                                                        }
                                                    })
                                                },
                                            ]
                                        },

                                    ]
                                }
                            }
                        },

                    ]
                ]
            }
        }
        resolve(bpanel);
    })
}
