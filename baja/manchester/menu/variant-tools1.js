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
                if (selectedMutation) {
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
                                            'label': 'Mutation', 'items': [
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
                                                                                                        if (m.start > selectedTrack.tgraph.xmin - 1000 && position <= selectedTrack.tgraph.xmax + 1000) {
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
                                                                                                                slnp.name = snpid;

                                                                                                                selectedTrack.addsnpindel(slnp);
                                                                                                                selectedTrack.markstart = position;
                                                                                                                selectedTrack.markend = position + 1;

                                                                                                                await graph.zoom(selectedTrack.tgraph.X(selectedTrack.markstart) - 100, selectedTrack.tgraph.X(selectedTrack.markend) + 100)

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
                                                    'label': 'Mutation from track sequence...', 'ionfunction': createIonFunction(async () => {
                                                        let selected_sequence = false;
                                                        for (let selectedTrack of graph.track) {
                                                        }
                                                        graph.setMessage(" Click and drag on a track sequence... ")
                                                        await exec('baja/manchester/menu/mutation-from-track-sequence.js', graph)
                                                    })
                                                },

                                                {
                                                    'label': 'Coding sequence nomenclature', 'ionfunction': createIonFunction(async () => {

                                                        graph.pushOntoHistory()

                                                        let Mutation = await exec('flexigraph/mutation-annotation.js');
                                                        let MGrid = await exec('flexigraph/grid.js')
                                                        let codons = await exec('baja/lib/codon-to-aa.js')
                                                        let Transcript = await exec('baja/lib/transcript.js')

                                                        let attr_window = '';
                                                        let va = await prompt("", ["GoTo"], { "GoTo": attr_window }, 300, 300)
                                                        let m = va['GoTo']
                                                        let mutation = m;
                                                        for (let selectedTrack of graph.track) {
                                                            let seq = selectedTrack.getSequences('Exon');
                                                            let trans = new Transcript(seq);
                                                            if (m != null && m.length > 0) {
                                                                let seqm = await exec('baja/bio/sequence-variant-parser.js')
                                                                let pv = seqm.parseVariant(m);
                                                                let start = pv.position
                                                                let end = pv.position;
                                                                let t = selectedTrack;
                                                                if (t.strand < 0) {
                                                                    let gf = t.codingToGenomic(start) + (pv.offset * (-1))
                                                                    let gi = t.codingToGenomic(end) + (pv.offset * (-1))
                                                                    await graph.zoomRect(t.tgraph.X(gi), t.tgraph.X(gf), t.tgraph.yi + t.tgraph.height - 3, t.tgraph.yi + 3);
                                                                    selectedMutation = new Mutation('mutation-annotation', gi,
                                                                        gf + 1, '' + mutation, 0, selectedTrack.strand)
                                                                    selectedTrack.addsnpindel(selectedMutation);
                                                                    selectedMutation = mutation;

                                                                } else {
                                                                    let gi = t.codingToGenomic(start) + pv.offset
                                                                    let gf = t.codingToGenomic(end) + pv.offset
                                                                    await graph.zoomRect(t.tgraph.X(gi), t.tgraph.X(gf), t.tgraph.yi + 2 * t.tgraph.height, t.tgraph.height * (-2));

                                                                    selectedMutation = new Mutation('mutation-annotation', gi,
                                                                        gf + 1, '' + mutation, 0, selectedTrack.strand)
                                                                    selectedTrack.addsnpindel(selectedMutation);
                                                                    selectedMutation = mutation;
                                                                }
                                                                await sleep(1000)
                                                            }

                                                        }

                                                    })
                                                },
                                                {
                                                    'label': 'AA mutation', 'ionfunction': createIonFunction(async () => {

                                                        const codonTable = {
                                                            A: ["GCT", "GCC", "GCA", "GCG"],
                                                            T: ["ACT", "ACC", "ACA", "ACG"],
                                                            C: ["TGT", "TGC"],
                                                            G: ["GGT", "GGC", "GGA", "GGG"],
                                                            P: ["CCT", "CCC", "CCA", "CCG"],
                                                            V: ["GTT", "GTC", "GTA", "GTG"],
                                                            L: ["TTA", "TTG", "CTT", "CTC", "CTA", "CTG"],
                                                            I: ["ATT", "ATC", "ATA"],
                                                            M: ["ATG"],
                                                            F: ["TTT", "TTC"],
                                                            Y: ["TAT", "TAC"],
                                                            W: ["TGG"],
                                                            S: ["TCT", "TCC", "TCA", "TCG", "AGT", "AGC"],
                                                            Q: ["CAA", "CAG"],
                                                            N: ["AAT", "AAC"],
                                                            H: ["CAT", "CAC"],
                                                            E: ["GAA", "GAG"],
                                                            D: ["GAT", "GAC"],
                                                            K: ["AAA", "AAG"],
                                                            R: ["CGT", "CGC", "CGA", "CGG", "AGA", "AGG"],
                                                        };

                                                        function proteinToNucleotideMutations(mutation) {

                                                            const originalAA = mutation[0];
                                                            const position = parseInt(mutation.slice(1, -1), 10);
                                                            const mutatedAA = mutation[mutation.length - 1];

                                                            const originalCodons = codonTable[originalAA];
                                                            const mutatedCodons = codonTable[mutatedAA];

                                                            const nucleotideMutations = [];

                                                            originalCodons.forEach(originalCodon => {
                                                                mutatedCodons.forEach(mutatedCodon => {
                                                                    for (let i = 0; i < 3; i++) {
                                                                        if (originalCodon[i] !== mutatedCodon[i]) {
                                                                            const nucleotideMutation = `${originalCodon} (${originalCodon[i]}${i + 1}${mutatedCodon[i]}) -> ${mutatedCodon}`;
                                                                            nucleotideMutations.push(nucleotideMutation);
                                                                        }
                                                                    }
                                                                });
                                                            });

                                                            return nucleotideMutations;
                                                        }
                                                        let va = await prompt("", ["Peptide mutation"], { "Peptide mutation": '' }, 300, 300)
                                                        let m = va['Peptide mutation']
                                                        let mutation = m.trim();
                                                        let nmutation = proteinToNucleotideMutations(mutation);
                                                        showModal({
                                                            wid: 'json',
                                                            data: JSON.stringify(nmutation)
                                                        })

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
                                                                let theight = selectedTrack.tgraph.height;
                                                                let screenHeight = graph.screenHeight(theight)

                                                                const placedBalls = [];

                                                                let snpsv = selectedTrack.getVisibleSNPs(twcxs, twcxf);
                                                                for (let s of snpsv) {

                                                                    ctx.save();
                                                                    ctx.strokeStyle = 'red';
                                                                    ctx.fillStyle = 'gray';
                                                                    ctx.lineWidth = 1;

                                                                    const x = graph.X(selectedTrack.tgraph.X(s.xi));
                                                                    const y = graph.Y(selectedTrack.tgraph.Y(s.y));
                                                                    const cx = x + 1;
                                                                    const cy = y + 1;

                                                                    const r = 4;
                                                                    const pad = 2;

                                                                    const minLen = 10;
                                                                    const maxLen = Math.min(80, Math.max(40, Math.floor(graph.screenHeight(selectedTrack.tgraph.height) * 0.15)));
                                                                    let baseLen = minLen + Math.abs(Math.floor((s.y * 7) % (maxLen - minLen)));

                                                                    const topBound = 0 + r + 1;
                                                                    const bottomBound = Math.max(cy - minLen, topBound + 1);

                                                                    let targetLen = Math.max(minLen, Math.min(maxLen, baseLen));
                                                                    let bx = cx;
                                                                    let by = cy - targetLen;

                                                                    if (by - r < topBound) {
                                                                        targetLen = Math.min(targetLen, cy - (topBound + r));
                                                                        by = cy - targetLen;
                                                                    }

                                                                    const overlaps = (nx, ny) => {
                                                                        for (const b of placedBalls) {
                                                                            const dx = nx - b.x;
                                                                            const dy = ny - b.y;
                                                                            const d2 = dx * dx + dy * dy;
                                                                            const minD = (r + b.r + pad);
                                                                            if (d2 < minD * minD) return true;
                                                                        }
                                                                        return false;
                                                                    };

                                                                    let attempts = 0;
                                                                    const step = 2;
                                                                    let dir = -1;
                                                                    let triedShorten = false, triedLengthen = false;

                                                                    while (overlaps(bx, by) && attempts < 400) {
                                                                        attempts++;

                                                                        if (dir === -1) {
                                                                            targetLen = Math.max(minLen, targetLen - step);
                                                                            by = cy - targetLen;

                                                                            if (by + r > bottomBound || targetLen <= minLen) {
                                                                                triedShorten = true;
                                                                                dir = +1;
                                                                            }
                                                                        } else {
                                                                            targetLen = Math.min(maxLen, targetLen + step);
                                                                            by = cy - targetLen;

                                                                            if (by - r < topBound || targetLen >= maxLen) {
                                                                                triedLengthen = true;
                                                                                dir = -1;
                                                                            }
                                                                        }

                                                                        if (triedShorten && triedLengthen) break;
                                                                    }

                                                                    const lineTopY = by + r;
                                                                    ctx.beginPath();
                                                                    ctx.moveTo(cx, cy);
                                                                    ctx.lineTo(cx, lineTopY);
                                                                    ctx.stroke();

                                                                    ctx.beginPath();
                                                                    ctx.arc(bx, by, r, 0, Math.PI * 2);
                                                                    ctx.fill();
                                                                    ctx.restore();

                                                                    placedBalls.push({ x: bx, y: by, r });
                                                                }

                                                            }
                                                        }
                                                        graph.highlightmethod = highlightmethod;

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
