function (graph) {

    return new Promise(async (resolve, reject) => {

        let editor_;
        let editor_function = createIonFunction((editor) => {
            editor_ = editor;
        })

        let SnpIndel = await exec('flexigraph/snpindel.js')

        let items = [
            {
                x: 0, y: 0, label: 'Apply SNP to ALL tracks', ionFunction: createIonFunction(async () => {

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
                                                'input_labels': ['SNP ID'],
                                                buttons: [{
                                                    'label': 'Apply', 'function': createIonFunction(async (button_label, input_params) => {
                                                        let snpid = input_params['SNP ID']
                                                        let vr = await GETJSON(`https://rest.ensembl.org/variation/human/${snpid}?content-type=application/json`)
                                                        if (vr['mappings']) {

                                                            let consequence = vr['most_severe_consequence']
                                                            let mappings = vr['mappings']
                                                            let lastone = null;
                                                            let tracks = graph.track;
                                                            for (let selectedTrack of tracks) {
                                                                for (let m of mappings) {
                                                                    let position = m.start;
                                                                    console.log('debubg');
                                                                    if (m.start > selectedTrack.tgraph.xmin && position <= selectedTrack.tgraph.xmax) {
                                                                        let strand = m.strand;
                                                                        let geno = m.allele_string.split(/[/|]/g)
                                                                        for (let c = 1; c < geno.length; c++) {
                                                                            let g = geno[c];
                                                                            let reference = m.ancestral_allele;
                                                                            let as = m.allele_string;

                                                                            if (reference) {
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

                                                        }else {
                                                            alert ( ' ID not found ')
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
                    showModal(alignGraph_panel_layout)

                })
            },
            {
                x: 1, y: 0, label: 'Edit track SNPs', ionFunction: createIonFunction(async () => {
                    let snpsMenu = await exec('baja/manchester/menu/snp-tools-mouse-menu.js', graph)
                })
            },
            {
                x: 2, y: 0, label: 'Pepetide sequence (ORFs)', ionFunction: createIonFunction(async () => {
                    await exec('baja/bio/orfs/orf-finder.js', graph)
                })
            },
            {
                x: 3, y: 0, label: 'SNPs', ionFunction: createIonFunction(async () => {
                    await exec('baja/bio/orfs/orf-finder.js', graph)
                })
            }
        ]

        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 30,
                'width': 800,
                'grid': {
                    xmin: 0,
                    xmax: 5,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': items
            }
        }

        return resolve(button_canvas)
    })

}
