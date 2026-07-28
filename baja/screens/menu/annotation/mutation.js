function (graph) {
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    let ed;
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })
    let start = -1;
    let end = -1;
    let ywc = -1;
    let selectedTrack = null;

    let menuList = []

    graph.addMouseMoveListener((x, y) => {
        let p_trackIndex = graph.getTrack(x, y);
        if (p_trackIndex >= 0) {
            graph.deselectAllTracks();
            if (graph.track[p_trackIndex]) {
                selectedTradck = graph.track[p_trackIndex];
                if (selectedTrack) {

                }
            }
            return;
        }
    }
    )
    graph.addMouseDownListener(async (x, y) => {
        let trackIndex = graph.getTrack(x, y);
        console.log(' selected track ' + trackIndex);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
        }
        ywc = y;
        if (selectedTrack) {

            menuList = []
            menuList.push(
                {
                    label: 'Remove all snps',
                    click: async (xwc, ywc) => {

                        let confirm = await exec('baja/lib/confirm-widget.js', () => {
                            selectedTrack.snpindels = [];

                        })
                        showModal(confirm)

                    }
                }
            );
            selectedTrack.showResizeBar = true;
            let xi = selectedTrack.tgraph.Xwc(x);
            let snp = selectedTrack.getSnpindelsInRange(xi - 20, xi + 20, graph)
            if (snp && snp.length > 0) {
                for (let s of snp) {
                    menuList.push(
                        {
                            label: s.name + ' (' + s.id + ')',
                            click: (xwc, ywc) => {

                                showModal(
                                    {
                                        wid: 'card',
                                        componentRef: 'bottomPanel',
                                        data: {
                                            height: '800px',
                                            cards: [
                                                [
                                                    {
                                                        'title': '',
                                                        'width': '100%',
                                                        'component': {
                                                            wid: 'html',
                                                            data: `SNP: ${s.name} (${s.id})`
                                                        }
                                                    },
                                                    {
                                                        'title': '',
                                                        'width': '100%',
                                                        'component': {
                                                            wid: 'mt-button', data: {
                                                                buttons: [

                                                                    {
                                                                        label: 'View details', ionFunction: createIonFunction(async () => {
                                                                            await hideAllModal();

                                                                            showModal({
                                                                                wid: 'json',
                                                                                data: JSON.stringify(s)
                                                                            })

                                                                        })
                                                                    },
                                                                    {
                                                                        label: 'Remove all other snps on this track', ionFunction: createIonFunction(async () => {

                                                                            let confirm = await exec('baja/lib/confirm-widget.js', () => {

                                                                                selectedTrack.snpindels = [];
                                                                                selectedTrack.snpindels.push(s);

                                                                            })
                                                                            showModal(confirm)

                                                                            await hideAllModal();
                                                                        })
                                                                    },
                                                                    {
                                                                        label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                            hideAllModal();
                                                                        })
                                                                    }
                                                                ]
                                                            }
                                                        }
                                                    }
                                                ]]
                                        }
                                    }
                                )
                            }
                        }
                    )
                }
            }
            menuList.push(

                {
                    label: 'SNP (amino acid notation)',
                    click: (xwc, ywc) => {
                        let seq = selectedTrack.sequence;
                        let panel;
                        let nameHook = createIonFunction((inputt) => {
                            panel = inputt;
                        });

                        if (!seq) {
                            prompt(" No sequence found; cannot apply an oligo ")
                        } else {

                            showModal(
                                {
                                    wid: 'card',
                                    componentRef: 'bottomPanel',
                                    data: {
                                        height: '800px',
                                        cards: [
                                            [
                                                {
                                                    'title': '',
                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'html',
                                                        data: `Enter mutation`
                                                    }
                                                },
                                                {
                                                    'title': ' ', 'body': `Below is the RNA engine for algorithmic designs.
                                            `                   ,
                                                    'width': '90%',
                                                    'component':
                                                    {

                                                        wid: 'input-param-items',
                                                        refCallback: nameHook,
                                                        data: {
                                                            'input_labels': ['Mutation'],
                                                        }
                                                    }
                                                },
                                                {
                                                    'title': '',
                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'mt-button', data: {
                                                            buttons: [
                                                                {
                                                                    label: 'Apply', ionFunction: createIonFunction(async () => {

                                                                        let Mutation = await exec('flexigraph/mutation-annotation.js');
                                                                        let MGrid = await exec('flexigraph/grid.js')

                                                                        selectedTrack.generateORF();

                                                                        let mutation = panel.get('Mutation')
                                                                        let aamutations = mutation.split(/\d+/g);
                                                                        let mutationIndex = mutation.split(/[^0-9.]/g);
                                                                        let fromaa = aamutations[0]
                                                                        let aaindex = +mutationIndex[1] - 2
                                                                        let codon_location = selectedTrack.getCodon(aaindex);
                                                                        let orf = selectedTrack.orf;
                                                                        for (let o of orf.cdsi) {
                                                                            if (o.codon_index === aaindex) {
                                                                                codon_location = o.index + 1;
                                                                            }
                                                                        }

                                                                        let start = codon_location;
                                                                        let end = codon_location + 3

                                                                        selectedTrack.addsnpindel(new Mutation('mutation-annotation', start,
                                                                            end, '' + mutation, 0, selectedTrack.strand));

                                                                        let grid = Object.assign(new MGrid(), graph.graph.grid)
                                                                        grid.xmax = selectedTrack.tgraph.X(end + 10);
                                                                        grid.xmin = selectedTrack.tgraph.X(start - 10);
                                                                        grid.ymin = selectedTrack.tgraph.yi - Math.abs(selectedTrack.tgraph.height - 0.5);
                                                                        grid.rescale();
                                                                        await graph.addBookmark(mutation, grid)
                                                                        graph.goToBookmark(grid);

                                                                        await hideAllModal();
                                                                    })
                                                                },
                                                                {
                                                                    label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                        hideAllModal();
                                                                    })
                                                                }
                                                            ]
                                                        }
                                                    }
                                                }
                                            ]]
                                    }
                                }

                            )

                        }
                    },
                    move: () => {
                        log('movei running offtargets....')
                    }
                }
                ,
                {
                    label: 'Find index',
                    click: (xwc, ywc) => {
                        let seq = selectedTrack.sequence;
                        let panel;
                        let nameHook = createIonFunction((inputt) => {
                            panel = inputt;
                        });

                        if (!seq) {
                            prompt(" No sequence found; cannot apply an oligo ")
                        } else {

                            showModal(
                                {
                                    wid: 'card',
                                    componentRef: 'bottomPanel',
                                    data: {
                                        height: '800px',
                                        cards: [
                                            [
                                                {
                                                    'title': '',
                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'html',
                                                        data: `Enter mutation`
                                                    }
                                                },
                                                {
                                                    'title': ' ', 'body': `Below is the RNA engine for algorithmic designs.
                                            `                   ,
                                                    'width': '90%',
                                                    'component':
                                                    {

                                                        wid: 'input-param-items',
                                                        refCallback: nameHook,
                                                        data: {
                                                            'input_labels': ['Mutation'],
                                                        }
                                                    }
                                                },
                                                {
                                                    'title': '',
                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'mt-button', data: {
                                                            buttons: [
                                                                {
                                                                    label: 'Apply', ionFunction: createIonFunction(async () => {

                                                                        if (selectedTrack.strand < 0) {

                                                                            let Mutation = await exec('flexigraph/mutation-annotation.js');
                                                                            let MGrid = await exec('flexigraph/grid.js')

                                                                            let Transcript = await exec('baja/lib/transcript.js')
                                                                            let seq = selectedTrack.getSequences('Exon');
                                                                            let trans = new Transcript(seq);
                                                                            let mutation = panel.get('Mutation')
                                                                            let peptide = trans.translate();
                                                                            let aamutations = mutation.split(/\d+/g);
                                                                            let mutationIndex = mutation.split(/[^0-9.]/g);
                                                                            let fromaa = aamutations[0]
                                                                            let toaa = aamutations[2]
                                                                            let aaindex = +mutationIndex[1]
                                                                            if (aaindex > peptide.length) {
                                                                                showModal({
                                                                                    wid: 'json',
                                                                                    data: 'Peptide length is less than the index for this mutation'
                                                                                })
                                                                                return;
                                                                            }

                                                                            aaindex = peptide.length - aaindex;

                                                                            let codon_location = selectedTrack.getCodon(aaindex - 1);
                                                                            let start = codon_location['start']
                                                                            let end = codon_location['end']

                                                                            selectedTrack.addsnpindel(new Mutation('mutation-annotation', start,
                                                                                end, '' + mutation, 0, selectedTrack.strand));
                                                                            let grid = Object.assign(new MGrid(), graph.graph.grid)
                                                                            grid.xmax = selectedTrack.tgraph.X(end + 10);
                                                                            grid.xmin = selectedTrack.tgraph.X(start - 10);
                                                                            grid.ymax = selectedTrack.tgraph.yi + Math.abs(selectedTrack.tgraph.height) / 6;
                                                                            grid.ymin = selectedTrack.tgraph.yi - Math.abs(selectedTrack.tgraph.height - 0.5);
                                                                            grid.rescale();
                                                                            await graph.addBookmark(mutation, grid)
                                                                            graph.goToBookmark(grid);

                                                                        } else {

                                                                            let Mutation = await exec('flexigraph/mutation-annotation.js');
                                                                            let MGrid = await exec('flexigraph/grid.js')
                                                                            let codons = await exec('baja/lib/codon-to-aa.js')
                                                                            let Transcript = await exec('baja/lib/transcript.js')
                                                                            let seq = selectedTrack.getSequences('Exon');
                                                                            let trans = new Transcript(seq);
                                                                            let mutation = panel.get('Mutation')
                                                                            let peptide = trans.translate();
                                                                            let aamutations = mutation.split(/\d+/g);
                                                                            let mutationIndex = mutation.split(/[^0-9.]/g);
                                                                            let fromaa = aamutations[0]
                                                                            let toaa = aamutations[2]
                                                                            let aaindex = +mutationIndex[1]
                                                                            let codon_location = selectedTrack.getCodon(aaindex - 1);
                                                                            let start = codon_location['start']
                                                                            let end = codon_location['end']

                                                                            selectedTrack.addsnpindel(new Mutation('mutation-annotation', start,
                                                                                end, '' + mutation, 0, selectedTrack.strand));
                                                                            let grid = Object.assign(new MGrid(), graph.graph.grid)
                                                                            grid.xmax = selectedTrack.tgraph.X(end + 10);
                                                                            grid.xmin = selectedTrack.tgraph.X(start - 10);
                                                                            grid.ymax = selectedTrack.tgraph.yi + Math.abs(selectedTrack.tgraph.height) / 6;
                                                                            grid.ymin = selectedTrack.tgraph.yi - Math.abs(selectedTrack.tgraph.height - 0.5);
                                                                            grid.rescale();
                                                                            await graph.addBookmark(mutation, grid)
                                                                            graph.goToBookmark(grid);

                                                                        }

                                                                        await hideAllModal();
                                                                    })
                                                                },
                                                                {
                                                                    label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                        hideAllModal();
                                                                    })
                                                                }
                                                            ]
                                                        }
                                                    }
                                                }
                                            ]]
                                    }
                                }

                            )

                        }
                    },
                    move: () => {
                        log('movei running offtargets....')
                    }
                }

                , {
                    label: 'CDNA/Genomic Nomenclature',
                    click: (xwc, ywc) => {
                        let seq = selectedTrack.sequence;
                        let panel;
                        let nameHook = createIonFunction((inputt) => {
                            panel = inputt;
                        });
                        if (!seq) {
                            prompt(" No sequence found; cannot apply an oligo ")
                        } else {

                            showModal(
                                {
                                    wid: 'card',
                                    componentRef: 'bottomPanel',
                                    data: {
                                        height: '800px',
                                        cards: [
                                            [
                                                {
                                                    'title': '',
                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'html',
                                                        data: `Enter mutation`
                                                    }
                                                },
                                                {
                                                    'title': ' ', 'body': `Below is the RNA engine for algorithmic designs.
                                            `                   ,
                                                    'width': '90%',
                                                    'component':
                                                    {

                                                        wid: 'input-param-items',
                                                        refCallback: nameHook,
                                                        data: {
                                                            'input_labels': ['Mutation'],
                                                        }
                                                    }
                                                },
                                                {
                                                    'title': '',
                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'mt-button', data: {
                                                            buttons: [
                                                                {
                                                                    label: 'Add', ionFunction: createIonFunction(async () => {

                                                                        graph.pushOntoHistory()

                                                                        let Mutation = await exec('flexigraph/mutation-annotation.js');
                                                                        let MGrid = await exec('flexigraph/grid.js')
                                                                        let codons = await exec('baja/lib/codon-to-aa.js')
                                                                        let Transcript = await exec('baja/lib/transcript.js')
                                                                        let seq = selectedTrack.getSequences('Exon');
                                                                        let trans = new Transcript(seq);
                                                                        let mutation = panel.get('Mutation')

                                                                        if (mutation.startsWith('c.')) {

                                                                            let genomic_index = selectedTrack.getGenomicIndexForCDNAIndex(mutation)
                                                                            if (genomic_index != undefined) {

                                                                                selectedTrack.addsnpindel(new Mutation('mutation-annotation', genomic_index,
                                                                                    genomic_index + 1, '' + mutation, 0, selectedTrack.strand));

                                                                                graph.animateTo(selectedTrack.tgraph.X(genomic_index - 1),
                                                                                    selectedTrack.tgraph.X(genomic_index + 1),
                                                                                    selectedTrack.tgraph.Y(-3), selectedTrack.tgraph.Y(1))

                                                                            }

                                                                        } else {

                                                                            let peptide = trans.translate();
                                                                            let aamutations = mutation.split(/\d+/g);
                                                                            let mutationIndex = mutation.split(/[^0-9.]/g);
                                                                            let fromaa = aamutations[0]
                                                                            let toaa = aamutations[2]
                                                                            let aaindex = +mutationIndex[1]
                                                                            let codon_location = selectedTrack.getCodon(aaindex - 1);
                                                                            let start = codon_location['start']
                                                                            let end = codon_location['end']

                                                                            selectedTrack.addsnpindel(new Mutation('mutation-annotation', start,
                                                                                end, '' + mutation, 0, selectedTrack.strand));

                                                                            let grid = Object.assign(new MGrid(), graph.graph.grid)
                                                                            grid.xmax = selectedTrack.tgraph.X(end + 10);
                                                                            grid.xmin = selectedTrack.tgraph.X(start - 10);
                                                                            grid.ymax = selectedTrack.tgraph.yi + Math.abs(selectedTrack.tgraph.height) / 6;
                                                                            grid.ymin = selectedTrack.tgraph.yi - Math.abs(selectedTrack.tgraph.height - 0.5);
                                                                            grid.rescale();
                                                                            await graph.addBookmark(mutation, grid)
                                                                            graph.goToBookmark(grid);
                                                                        }
                                                                        await hideAllModal();
                                                                    })
                                                                },
                                                                {
                                                                    label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                        hideAllModal();
                                                                    })
                                                                }
                                                            ]
                                                        }
                                                    }
                                                }
                                            ]]
                                    }
                                }

                            )

                        }
                    },
                    move: () => {
                        log('movei running offtargets....')
                    }

                },

            )
            if (selectedTrack)
                graph.showMenu(menuList, x, y)
        }
    });
}
