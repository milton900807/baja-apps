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

        // The two tracks to compare: two highlighted tracks if exactly two are
        // highlighted, otherwise fall back to the first two tracks in the graph.
        function getTwoTracks() {
            let sel = getSelectedSeq();
            if (sel.length === 2) return sel;
            if (graph.track && graph.track.length === 2) return [graph.track[0], graph.track[1]];
            if (graph.track && graph.track.length >= 2) return [graph.track[0], graph.track[1]];
            return null;
        }

        // Entry point. Decide the two tracks (A = query, B = search target). If it's
        // ambiguous (more than two tracks and not exactly two highlighted), show a
        // menu so the user picks A, then B. Otherwise run directly.
        async function compareAllFeatures(kind) {
            const sel = getSelectedSeq();
            const tracks = graph.track || [];
            if (sel.length === 2) { return runAllFeatures(sel[0], sel[1], kind); }
            if (tracks.length === 2) { return runAllFeatures(tracks[0], tracks[1], kind); }
            if (tracks.length < 2) { graph.setMessage(' Need at least two tracks to compare.'); return; }
            // Ambiguous — let the user choose the two tracks via a menu.
            pickTrack('Compare all ' + kind + 's — pick the FIRST track (its ' + kind + 's are compared against the other):', null, (tA) => {
                pickTrack('Now pick the SECOND track to compare "' + (tA.name || 'track') + '" against:', tA, (tB) => {
                    runAllFeatures(tA, tB, kind);
                });
            });
        }

        // Show a side-menu of tracks (optionally excluding one); invokes cb(track).
        function pickTrack(title, exclude, cb) {
            graph.setMessage(title);
            const menu = (graph.track || [])
                .map((t, i) => ({ t: t, i: i }))
                .filter((o) => o.t !== exclude)
                .map((o) => ({
                    label: (o.t.name || ('track ' + (o.i + 1))),
                    click: () => { graph.showSideMenu(null); cb(o.t); },
                    move: () => { }
                }));
            graph.showSideMenu(menu);
        }

        // Iterate over EVERY feature of `kind` on track A and find each one's best
        // match anywhere in track B's sequence, drawing a % TrackLink per feature.
        async function runAllFeatures(tA, tB, kind) {
            if (!tA || !tB) { graph.setMessage(' Need two tracks to compare.'); return; }
            let listA = kind === 'intron' ? (tA.getIntrons ? tA.getIntrons(0) : []) : (tA.getExons ? tA.getExons() : []);
            const byLeft = (a, b) => Math.min(a.xi, a.xf) - Math.min(b.xi, b.xf);
            listA = (listA || []).slice().sort(byLeft);   // left-to-right on A
            if (!listA.length) { graph.setMessage(' No ' + kind + 's found on ' + (tA.name || 'track A') + '.'); return; }
            // B's full sequence is the search space for every A feature.
            let bSeq = tB.sequence || '';
            if (!bSeq) { try { bSeq = tB.getSequenceRange(tB.xi, tB.xf) || ''; } catch (e) { } }
            if (!bSeq) { graph.setMessage(' No sequence available on ' + (tB.name || 'track B') + '.'); return; }
            let TrackLink = await exec('baja/bio/track-link');
            graph.setMessage(' Comparing ' + listA.length + ' ' + kind + 's from '
                + (tA.name || 'track A') + ' against ' + (tB.name || 'track B') + '...');
            let pcts = [];
            for (let i = 0; i < listA.length; i++) {
                let a = listA[i];
                let sA = '';
                try { sA = tA.getSequenceRange(a.xi, a.xf) || (a.seq || ''); } catch (e) { sA = a.seq || ''; }
                if (!sA || sA.length > bSeq.length) continue;   // query must fit within B
                let r = await exec('py/baja/sequence-space/find-subseq.py', sA, bSeq);
                if (!r) continue;
                let pct = Math.max(0, Math.min(100, Math.round(100 * ((r['score'] || 0)) / (sA.length || 1))));
                let ta1 = { track: tA, xi: a.xi, xf: a.xf, y: 0 };
                // r.start/end are indices into B's whole sequence -> genomic = tB.xi + idx.
                let tb1 = { track: tB, xi: tB.xi + (r['start'] || 0), xf: tB.xi + (r['end'] || 0), y: 0 };
                let tl = new TrackLink(ta1, tb1);
                tl.mode = 'rect';
                tl.alpha = pct / 100;
                tl.color = 'rgb(116,245,163,0.5)';
                tl.label = pct + '%';
                if (tl.setValue) tl.setValue(pct);
                graph.appendLayers([tl]);
                pcts.push(pct);
            }
            if (!pcts.length) { graph.setMessage(' Could not compare any ' + kind + 's.'); return; }
            let avg = Math.round(pcts.reduce((x, y) => x + y, 0) / pcts.length);
            graph.setMessage(' Compared ' + pcts.length + ' ' + kind + 's from '
                + (tA.name || 'track A') + ' onto ' + (tB.name || 'track B') + ' — avg ' + avg + '% best-match identity');
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
                                                {
                                                    'label': 'All introns (pairwise)', 'ionfunction': createIonFunction(async () => {
                                                        await compareAllFeatures('intron');
                                                    })
                                                },
                                                {
                                                    'label': 'All exons (pairwise)', 'ionfunction': createIonFunction(async () => {
                                                        await compareAllFeatures('exon');
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
