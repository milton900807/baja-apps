function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {

        let count = 0;
        let t = graph.track;
        for (let trc of t) {
            if (trc != null && trc.snpindels != null)
                count += trc.snpindels.length;
        }
        graph.setMessage(" Currenty " + count + " snpindels found in the graph.")

        let SnpIndel = await exec('flexigraph/snpindel.js')

        let start;
        let end;
        hide_menu = false;
        let selectedTrack = null;
        let md = false;
        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        let panel = null;
        let __nameHook = createIonFunction((name) => {
            panel = name;
        })

        let highlightmethod2 = (ctx, graph) => {
            let tracks = graph.track;
            for (let selectedTrack of tracks) {
                let gwcxs = graph.Xwc(0);
                if (!gwcxs)
                    return;
                let gwcxf = graph.Xwc(0 + graph.graph.grid.width);
                if (!gwcxf)
                    return;
                let twcxs = selectedTrack.tgraph.Xwc(gwcxs - 2 * selectedTrack.tgraph.xi);
                let twcxf = selectedTrack.tgraph.Xwc(gwcxf - 2 * selectedTrack.tgraph.xi);
                let snpsv = selectedTrack.getVisibleSNPs(twcxs, twcxf);
                ctx.strokeStyle = 'lightRed';
                ctx.lineWidth = 2;
                for (let s of snpsv) {

                    let x = graph.X(selectedTrack.tgraph.X(s.xi))
                    let y = graph.Y(selectedTrack.tgraph.Y(s.y))
                    let w = 2;
                    let h = 2;

                    var kappa = .5522848,
                        ox = (w / 2) * kappa,
                        oy = (h / 2) * kappa,
                        xe = x + w,
                        ye = y + h,
                        xm = x + w / 2,
                        ym = y + h / 2;

                    ctx.beginPath();
                    ctx.moveTo(x, ym);
                    ctx.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
                    ctx.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
                    ctx.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
                    ctx.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);

                    ctx.stroke();
                }
                if ( selectedMutation ) {
                    ctx.strokeStyle = 'magenta';
                    ctx.lineWidth = 10;

                    let x = graph.X(selectedTrack.tgraph.X(selectedMutation.xi))
                    let y = graph.Y(selectedTrack.tgraph.Y(selectedMutation.y))
                    let w = 2;
                    let h = 2;
                    var kappa = .5522848,
                        ox = (w / 2) * kappa,
                        oy = (h / 2) * kappa,
                        xe = x + w,
                        ye = y + h,
                        xm = x + w / 2,
                        ym = y + h / 2;

                    ctx.beginPath();
                    ctx.moveTo(x, ym);
                    ctx.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
                    ctx.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
                    ctx.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
                    ctx.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);

                    ctx.stroke();

                }

            }
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
                                            'label': 'New...', 'items': [
                                                {
                                                    'label': 'SNP ID', 'ionfunction': createIonFunction(async () => {

                                                        let alignGraph_panel_layout = {
                                                            wid: 'card',
                                                            data: {
                                                                cards: [
                                                                    [
                                                                        {
                                                                            'title': ' ', 'body': ``,
                                                                            'width': '100%',
                                                                            'component':
                                                                            {
                                                                                wid: 'input-param-items',
                                                                                data: {
                                                                                    'input_labels': ['Variant ID'],
                                                                                    buttons: [{
                                                                                        'label': 'Apply', 'function': createIonFunction(async (button_label, input_params) => {
                                                                                            let snpid = input_params['Variant ID']

                                                                                            if (snpid.indexOf('.') > 1) {
                                                                                                snpid = snpid.substring(0, snpid.indexOf('.'))
                                                                                            }

                                                                                            let vr = await GETJSON(`https://rest.ensembl.org/variation/human/${snpid}?content-type=application/json`)
                                                                                            if (vr['mappings']) {

                                                                                                let consequence = vr['most_severe_consequence']
                                                                                                let mappings = vr['mappings']
                                                                                                let lastone = null;
                                                                                                let tracks = graph.track;
                                                                                                for (let selectedTrack of tracks) {
                                                                                                    for (let m of mappings) {
                                                                                                        let position = m.start;
                                                                                                        if (m.start > selectedTrack.tgraph.xmin && position <= selectedTrack.tgraph.xmax) {
                                                                                                            let strand = m.strand;
                                                                                                            let geno = m.allele_string.split(/[/|]/g)
                                                                                                            for (let c = 1; c < geno.length; c++) {
                                                                                                                let g = geno[c];
                                                                                                                let reference = m.ancestral_allele;
                                                                                                                if (!reference)
                                                                                                                    reference = "indel"
                                                                                                                let as = m.allele_string;

                                                                                                                if (selectedTrack == null) {
                                                                                                                    graph.setMessage(" Select a track")
                                                                                                                    return;
                                                                                                                }

                                                                                                                let slnp = new SnpIndel('snp', position, geno[0], g,
                                                                                                                    0, selectedTrack.strand);
                                                                                                                lastone = slnp;

                                                                                                                selectedTrack.addsnpindel(slnp);
                                                                                                                selectedTrack.markstart = position;
                                                                                                                selectedTrack.markend = position + 1;
                                                                                                            }
                                                                                                        }
                                                                                                    }
                                                                                                }

                                                                                                let highlightmethod = (ctx, graph) => {

                                                                                                    let tracks = graph.track;
                                                                                                    for (let selectedTrack of tracks) {
                                                                                                        let gwcxs = graph.Xwc(0);
                                                                                                        if (!gwcxs)
                                                                                                            return;
                                                                                                        let gwcxf = graph.Xwc(0 + graph.graph.grid.width);
                                                                                                        if (!gwcxf)
                                                                                                            return;
                                                                                                        let twcxs = selectedTrack.tgraph.Xwc(gwcxs - 2 * selectedTrack.tgraph.xi);
                                                                                                        let twcxf = selectedTrack.tgraph.Xwc(gwcxf - 2 * selectedTrack.tgraph.xi);
                                                                                                        let snpsv = selectedTrack.getVisibleSNPs(twcxs, twcxf);
                                                                                                        for (let s of snpsv) {
                                                                                                            ctx.strokeStyle = 'magenta';
                                                                                                            ctx.lineWidth = 9;

                                                                                                            let x = graph.X(selectedTrack.tgraph.X(s.xi))
                                                                                                            let y = graph.Y(selectedTrack.tgraph.Y(s.y))
                                                                                                            let w = 10;
                                                                                                            let h = 10;

                                                                                                            var kappa = .5522848,
                                                                                                                ox = (w / 2) * kappa,
                                                                                                                oy = (h / 2) * kappa,
                                                                                                                xe = x + w,
                                                                                                                ye = y + h,
                                                                                                                xm = x + w / 2,
                                                                                                                ym = y + h / 2;

                                                                                                            ctx.beginPath();
                                                                                                            ctx.moveTo(x, ym);
                                                                                                            ctx.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
                                                                                                            ctx.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
                                                                                                            ctx.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
                                                                                                            ctx.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);

                                                                                                            ctx.stroke();
                                                                                                        }

                                                                                                    }
                                                                                                }

                                                                                                graph.highlightmethod = highlightmethod;
                                                                                                setTimeout(() => {

                                                                                                    graph.highlightmethod = null;
                                                                                                }, 10000)

                                                                                                hideAllModal();
                                                                                            } else {
                                                                                                alert(" Failed to find the ID ")
                                                                                            }
                                                                                        })
                                                                                    }]
                                                                                }
                                                                            }
                                                                        }
                                                                    ]
                                                                ]
                                                            }
                                                        }
                                                        showModal(alignGraph_panel_layout, 400, 240)
                                                    })
                                                },
                                                {
                                                    'label': 'Edit track sequence...', 'ionfunction': createIonFunction(async () => {

                                                        setTimeout(async () => {

                                                            graph.setMessage(" Select a sequence on a track.")
                                                            await exec('baja/manchester/menu/sequence.js', graph, genegraph_panel_layout, true)
                                                        }, 2000)
                                                        CurrentLayout.clearComponent('mainPanel')
                                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                    })
                                                },

                                                {
                                                    'label': 'Coding sequence nomenclature', 'ionfunction': createIonFunction(async () => {

                                                        let panel;
                                                        let nameHook = createIonFunction((inputt) => {
                                                            panel = inputt;
                                                        });

                                                        console.log('debubg');

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
                                                                                'title': ' ', 'body': `Below is the RNA engine for algorithmic designs.`,
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

                                                                                                    for (let selectedTrack of graph.track) {

                                                                                                        let seq = selectedTrack.getSequences('Exon');
                                                                                                        let trans = new Transcript(seq);
                                                                                                        let mutation = panel.get('Mutation')

                                                                                                        if (mutation.startsWith('c.')) {

                                                                                                            let mutationObj = selectedTrack.getGenomicIndexForCDNAIndex(mutation)
                                                                                                            if (mutationObj.type === 'SNP') {
                                                                                                                selectedMutation = new Mutation('mutation-annotation', mutationObj.start,
                                                                                                                mutationObj.start + 1, '' + mutation, 0, selectedTrack.strand)
                                                                                                                selectedTrack.addsnpindel(selectedMutation);
                                                                                                                    selectedMutation = mutation;
                                                                                                                    graph.highlightmethod = highlightmethod2;
                                                                                                                    setTimeout(() => {
                                                                                                                        graph.highlightmethod = null;
                                                                                                                    }, 10000)

                                                                                                                } else if (mutationObj.type === 'delins') {

                                                                                                                    selectedMutation = new Mutation('mutation-annotation', mutationObj.start,
                                                                                                                    mutationObj.end, '' + mutation, 0, selectedTrack.strand);
                                                                                                                    selectedTrack.addsnpindel(selectedMutation);
                                                                                                                    graph.highlightmethod = highlightmethod2;
                                                                                                                    setTimeout(() => {
                                                                                                                        graph.highlightmethod = null;
                                                                                                                    }, 10000)

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

                                                    })
                                                }

                                            ]
                                        },
                                        {
                                            'label': 'Edit', 'items': [
                                                {
                                                    'label': 'Mutations', 'ionfunction': createIonFunction(async () => {
                                                        graph.setMessage(" Select a snp on a track... ")
                                                        let snpsMenu = await exec('baja/manchester/menu/snp-tools-mouse-menu.js', graph, genegraph_panel_layout)

                                                    })
                                                },
                                            ]
                                        },
                                        {
                                            'label': 'Highlight', 'items': [
                                                {
                                                    'label': 'Mutations', 'ionfunction': createIonFunction(async () => {

                                                        let highlightmethod = (ctx, graph) => {

                                                            let tracks = graph.track;
                                                            for (let selectedTrack of tracks) {
                                                                let gwcxs = graph.Xwc(0);
                                                                if (!gwcxs)
                                                                    return;
                                                                let gwcxf = graph.Xwc(0 + graph.graph.grid.width);
                                                                if (!gwcxf)
                                                                    return;
                                                                let twcxs = selectedTrack.tgraph.Xwc(gwcxs - 2 * selectedTrack.tgraph.xi);
                                                                let twcxf = selectedTrack.tgraph.Xwc(gwcxf - 2 * selectedTrack.tgraph.xi);
                                                                let snpsv = selectedTrack.getVisibleSNPs(twcxs, twcxf);
                                                                for (let s of snpsv) {
                                                                    ctx.strokeStyle = 'red';
                                                                    ctx.lineWidth = 6;

                                                                    let x = graph.X(selectedTrack.tgraph.X(s.xi))
                                                                    let y = graph.Y(selectedTrack.tgraph.Y(s.y))
                                                                    let w = 2;
                                                                    let h = 2;

                                                                    var kappa = .5522848,
                                                                        ox = (w / 2) * kappa,
                                                                        oy = (h / 2) * kappa,
                                                                        xe = x + w,
                                                                        ye = y + h,
                                                                        xm = x + w / 2,
                                                                        ym = y + h / 2;

                                                                    ctx.beginPath();
                                                                    ctx.moveTo(x, ym);
                                                                    ctx.bezierCurveTo(x, ym - oy, xm - ox, y, xm, y);
                                                                    ctx.bezierCurveTo(xm + ox, y, xe, ym - oy, xe, ym);
                                                                    ctx.bezierCurveTo(xe, ym + oy, xm + ox, ye, xm, ye);
                                                                    ctx.bezierCurveTo(xm - ox, ye, x, ym + oy, x, ym);

                                                                    ctx.stroke();
                                                                }

                                                            }
                                                        }

                                                        graph.highlightmethod = highlightmethod;
                                                        setTimeout(() => {

                                                            graph.highlightmethod = null;
                                                        }, 10000)

                                                    })
                                                },

                                            ]
                                        }
                                    ]
                                }
                            }
                        },

                    ]
                ]
            }
        }
        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
        CurrentLayout.setComponent('buttonMenuPanel', bpanel);

        resolve();

    })

}
