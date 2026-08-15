function (graph, genegraph_panel_layout, size) {

    exec('baja/math/le-distance.js').then(async le => {

        function calculateTm(sequence) {
            let gcCount = 0;
            for (let i = 0; i < sequence.length; i++) {
                if (sequence[i] === 'G' || sequence[i] === 'C') {
                    gcCount++;
                }
            }
            let atCount = sequence.length - gcCount;
            return 2 * atCount + 4 * gcCount;
        }

        function calculateGCContent(sequence) {
            let gcCount = 0;
            for (let i = 0; i < sequence.length; i++) {
                if (sequence[i] === 'G' || sequence[i] === 'C') {
                    gcCount++;
                }
            }
            return (gcCount / sequence.length) * 100;
        }

        let HL = await exec('flexigraph/highlight-obj')

        function calculateGCContent(seq) {
            const gcCount = (seq.match(/[GC]/gi) || []).length;
            return (gcCount / seq.length) * 100;
        }

        function calculateTm(seq) {
            const aCount = (seq.match(/A/gi) || []).length;
            const tCount = (seq.match(/T/gi) || []).length;
            const gCount = (seq.match(/G/gi) || []).length;
            const cCount = (seq.match(/C/gi) || []).length;

            return 2 * (aCount + tCount) + 4 * (gCount + cCount);
        }

        function complementSequence(seq) {
            const complement = {
                'A': 'T', 'T': 'A', 'C': 'G', 'G': 'C',
                'a': 't', 't': 'a', 'c': 'g', 'g': 'c'
            };
            return seq.split('').map(base => complement[base] || base).join('');
        }

        function calculateTmAndGC(sequence) {
            const complementSeq = complementSequence(sequence);
            return {
                sequence: sequence,
                complement: complementSeq,
                tm: calculateTm(sequence),
                complementTm: calculateTm(complementSeq),
                gcContent: calculateGCContent(sequence),
                complementGCContent: calculateGCContent(complementSeq)
            };
        }

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
        let ho = new HL()

        graph.addMouseMoveListener((x, y) => {
            let trackIndex = graph.getTrack(x, y);

            if (trackIndex >= 0) {
                let cselectedTrack = graph.track[trackIndex]
                if (cselectedTrack && selectedTrack != cselectedTrack) {
                    if (selectedTrack)
                        selectedTrack.showResizeBar = false;
                }
                if (selectedTrack) {
                    let xi = selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2) - size / 2
                    let xf = selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2) + size / 2
                    selectedTrack.markstart = xi;
                    selectedTrack.markend = xf;
                    let seq = selectedTrack.getHighlightedSequence();
                    let calc = calculateTmAndGC(seq);
                    let w = selectedTrack.tgraph.X(selectedTrack.markend) - selectedTrack.tgraph.X(selectedTrack.markstart)
                    let s = 'TM: ' + parseInt(calc.complementTm)
                    s += ' GC: ' + parseInt(calc.gcContent)
                    ho.s = s;
                    ho.x = x - size / 2
                    ho.y = y + 0.1;
                    ho.w = size;
                    ho.h = 0.1;
                    graph.highlightObject = ho;

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

            let menuList = []

            if (selectedTrack) {
                let xi = selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2) - size / 2
                let xf = selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2) + size / 2

                let oligos = graph.getStructure(x, y);
                if (oligos && oligos.length) {
                    for (let oligo of oligos) {
                        if (oligo && oligo.length > 0) {
                            for (let o of oligo) {
                                if (o.type === 'amplicon') {
                                    menuList.push({
                                        label: 'Drop probe here',
                                        click: async (x, y) => {

                                            console.log(" createing the prolb,em ")
                                            let probe = Biopolymer.createProbe(xi, xf, selectedTrack)
                                            o.mid = probe;

                                            o.mid.xi = xi;
                                            o.mid.xf = xf;
                                        },
                                        move: () => {
                                        }
                                    },)

                                    menuList.push({
                                        label: 'Best guess',
                                        click: async (x, y) => {

                                            let findBestPrimer = (dnaSequence, primerLength) => {
                                                let bestPrimer = {
                                                    sequence: '',
                                                    tm: 0,
                                                    gcContent: 0,
                                                    startIndex: -1
                                                };
                                                function calculateTm(seq) {
                                                    const aCount = (seq.match(/A/gi) || []).length;
                                                    const tCount = (seq.match(/T/gi) || []).length;
                                                    const gCount = (seq.match(/G/gi) || []).length;
                                                    const cCount = (seq.match(/C/gi) || []).length;

                                                    return 2 * (aCount + tCount) + 4 * (gCount + cCount);
                                                }

                                                function calculateGCContent(seq) {
                                                    const gcCount = (seq.match(/[GC]/gi) || []).length;
                                                    return (gcCount / seq.length) * 100;
                                                }

                                                for (let start = 0; start <= dnaSequence.length - primerLength; start++) {
                                                    let primer = dnaSequence.substring(start, start + primerLength);
                                                    let tm = calculateTm(primer);
                                                    let gcContent = calculateGCContent(primer);

                                                    if (tm > bestPrimer.tm || (tm === bestPrimer.tm && gcContent > bestPrimer.gcContent)) {
                                                        bestPrimer.sequence = primer;
                                                        bestPrimer.tm = tm;
                                                        bestPrimer.gcContent = gcContent;
                                                        bestPrimer.startIndex = start;
                                                    }
                                                }

                                                return bestPrimer;
                                            }

                                            let left_end = o.left.xf + 10;
                                            let right_start = o.right.xi - 10;
                                            let sequence_window = selectedTrack.getSequenceRange(left_end, right_start);

                                            graph.rungraph(async () => {

                                                let r = findBestPrimer(sequence_window, size)
                                                let probe = Biopolymer.createProbe(left_end + r.startIndex, left_end + r.startIndex + size, selectedTrack)
                                                o.mid = probe;
                                                o.mid.xi = left_end + parseInt(r.startIndex)
                                                o.mid.xf = o.mid.xi + size;
                                            })

                                            CurrentLayout.setComponent('labelPanel', {
                                                wid: 'html',
                                                data: ' Click on a track to see menu options... '
                                            })

                                        }
                                    })
                                    menuList.push({
                                        label: 'Download sequences ',
                                        click: async (x, y) => {
                                            let header = 'ID,left, probe, right\n'
                                            const csvContent = o.IO + ',' +

                                                o.right.synthesisSequence + ',' +
                                                o.mid.synthesisSequence + ',' + o.right.synthesisSequence + '\n'

                                            const blob = new Blob([header, csvContent], { type: 'text/csv;charset=utf-8;' });
                                            const link = document.createElement('a');
                                            link.href = URL.createObjectURL(blob);
                                            link.download = o.name + 'ppset.csv';
                                            link.style.display = 'none';
                                            document.body.appendChild(link);
                                            link.click();
                                            document.body.removeChild(link);
                                            console.log("The input string is 'ASO sequences'.");
                                        },
                                        move: () => {
                                        }
                                    },)

                                }
                            }
                        }
                    }
                }

            }

            graph.showMenu(menuList, x, y, 200)
        });

    })

}
