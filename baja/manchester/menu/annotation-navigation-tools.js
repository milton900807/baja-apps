function (graph, genegraph_panel_layout) {

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
                                        // Save the CURRENT view (zoom/pan) onto the bookmark/view stack under a name.
                                        'label': 'Bookmark', 'ionfunction': createIonFunction(async () => {
                                            let res = await prompt('Bookmark', ['Name'], { 'Name': '' }, 400, 200);
                                            let nm = res && res.Name != null ? ('' + res.Name).trim() : '';
                                            if (nm && graph.setBookmark) graph.setBookmark(nm);
                                        })
                                    },
                                    {
                                        'label': 'Go to...', 'items': [
                                            {
                                                'label': 'Coordinate', 'ionfunction': createIonFunction(async () => {
                                                    graph.setMessage("Select track to view nav menu")
                                                    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                                                    graph.selectOff();
                                                    let selectedTrack = null;
                                                    graph.addMouseMoveListener((x, y) => {
                                                        let p_trackIndex = graph.getTrack(x, y);
                                                        if (p_trackIndex >= 0) {
                                                            graph.deselectAllTracks();
                                                            if (graph.track[p_trackIndex])
                                                                graph.track[p_trackIndex].showResizeBar = true;
                                                            return;
                                                        }
                                                    })
                                                    graph.addMouseDownListener((x, y) => {
                                                        let trackIndex = graph.getTrack(x, y);
                                                        if (trackIndex >= 0) {
                                                            selectedTrack = graph.track[trackIndex]
                                                        }

                                                        if (selectedTrack) {
                                                            let menuList = []
                                                            menuList.push(
                                                                {
                                                                    label: 'Track coordinate...',
                                                                    click: async (xwc, ywc) => {
                                                                        let attr_window = '';
                                                                        let va = await prompt("", ["Track coordinate"], { "Track coordinate": attr_window }, 300, 300)
                                                                        let m = va['Track coordinate']
                                                                        if (m != null && m.length > 0) {
                                                                            try {
                                                                                let itm = selectedTrack.tgraph.xmin + parseInt(m);

                                                                                await graph.animateTo((selectedTrack.tgraph.X(itm)) - 100, (selectedTrack.tgraph.X(itm)) + 100, selectedTrack.tgraph.yi - 5, Math.abs(selectedTrack.tgraph.yi + selectedTrack.tgraph.height) + 5);

                                                                            } catch (exception) {
                                                                                alert(' Failed to parse the integer value ')
                                                                            }

                                                                        }
                                                                    },
                                                                    move: () => {
                                                                    }
                                                                })
                                                            menuList.push(
                                                                {
                                                                    label: 'Genomic coordinate...',
                                                                    click: async (xwc, ywc) => {
                                                                        let attr_window = '';
                                                                        let va = await prompt("", ["Genomic coordinate"], { "Genomic coordinate": attr_window }, 300, 300)
                                                                        let m = va['Genomic coordinate']
                                                                        if (m != null && m.length > 0) {
                                                                            let itm = parseInt(m);
                                                                            await graph.animateTo((selectedTrack.tgraph.X(itm)) - 100, (selectedTrack.tgraph.X(itm)) + 100, selectedTrack.tgraph.yi - 5, Math.abs(selectedTrack.tgraph.yi + selectedTrack.tgraph.height) + 5);
                                                                        }
                                                                    },
                                                                    move: () => {
                                                                    }
                                                                })

                                                            menuList.push(
                                                                {
                                                                    label: 'Coding sequence index...',
                                                                    click: async (xwc, ywc) => {
                                                                        let attr_window = '';
                                                                        let va = await prompt("", ["GoTo"], { "GoTo": attr_window }, 300, 300)
                                                                        let m = va['GoTo']
                                                                        if (m != null && m.length > 0) {
                                                                            let seqm = await exec('baja/bio/sequence-variant-parser.js')
                                                                            if (m.startsWith('c.')) {

                                                                                let pv = seqm.parseVariant(m);
                                                                                let start = pv.position
                                                                                let end = pv.position;

                                                                                let t = selectedTrack;
                                                                                if (t.strand < 0) {
                                                                                    pv.offset *= (-1)
                                                                                    let gf = t.codingToGenomic(start) + pv.offset
                                                                                    let gi = t.codingToGenomic(end) + pv.offset
                                                                                    await graph.zoomRect(t.tgraph.X(gi), t.tgraph.X(gf), t.tgraph.yi + t.tgraph.height - 3, t.tgraph.yi + 3);

                                                                                } else {
                                                                                    let gi = t.codingToGenomic(start) + pv.offset
                                                                                    let gf = t.codingToGenomic(end) + pv.offset
                                                                                    await graph.zoomRect(t.tgraph.X(gi), t.tgraph.X(gf), t.tgraph.yi + 2 * t.tgraph.height, t.tgraph.height * (-2));
                                                                                }
                                                                                await sleep(2000)
                                                                            } else {
                                                                                let parseMutation = await exec('baja/bio/aa/mutation-parser.js');
                                                                                let SnpIndel = await exec('flexigraph/snpindel.js')
                                                                                console.log('debubg');

                                                                                let mutation = parseMutation(m.trim())
                                                                                showModal({
                                                                                    wid: 'json',
                                                                                    data: JSON.stringify(mutation)
                                                                                })

                                                                                let t = selectedTrack;
                                                                                let gi = t.codingToGenomic(mutation.position)
                                                                                let gf = t.codingToGenomic(mutation.end)
                                                                                graph.zoomRect(gi, gf, t.tgraph.yi - t.tgraph.height, t.tgraph.yi);

                                                                            }

                                                                        }
                                                                    },
                                                                    move: () => {
                                                                    }
                                                                })
                                                            menuList.push(
                                                                {
                                                                    label: 'Peptide index',
                                                                    click: async (xwc, ywc) => {
                                                                        let attr_window = '';
                                                                        let va = await prompt("", ["Peptide index"], { "Peptide index": attr_window }, 300, 300)
                                                                        let m = va['Peptide index']
                                                                        if (m != null && m.length > 0) {
                                                                            let itm = parseInt(m);

                                                                            let it = 0;

                                                                            selectedTrack.generateORF();
                                                                            if (selectedTrack.orf && selectedTrack.orf.cdsi) {
                                                                                for (let oor of selectedTrack.orf.cdsi) {
                                                                                    if (oor.codon_index === itm) {
                                                                                        it = oor.index;
                                                                                    }
                                                                                }
                                                                            }

                                                                            await graph.animateTo((selectedTrack.tgraph.X(it)) - 100, (selectedTrack.tgraph.X(it)) + 100, selectedTrack.tgraph.yi - 5, Math.abs(selectedTrack.tgraph.yi + selectedTrack.tgraph.height) + 5);

                                                                        }
                                                                    },
                                                                    move: () => {
                                                                    }
                                                                })
                                                            graph.showMenu(menuList, x, y)
                                                        }

                                                    });

                                                })
                                            },
                                            {
                                                'label': 'Mutation', 'ionfunction': createIonFunction(async () => {
                                                    let attr_window = '';
                                                    let va = await prompt("", ["GoTo"], { "GoTo": attr_window }, 300, 300)
                                                    let m = va['GoTo']
                                                    if (m != null && m.length > 0) {
                                                        let seqm = await exec('baja/bio/sequence-variant-parser.js')
                                                        if (m.startsWith('c.')) {

                                                            let pv = seqm.parseVariant(m);
                                                            let start = pv.position
                                                            let end = pv.position;

                                                            for (let t of graph.track) {
                                                                if (t.strand < 0) {
                                                                    pv.offset *= (-1)
                                                                    let gf = t.codingToGenomic(start) + pv.offset
                                                                    let gi = t.codingToGenomic(end) + pv.offset
                                                                    await graph.zoomRect(t.tgraph.X(gi), t.tgraph.X(gf), t.tgraph.yi + t.tgraph.height - 3, t.tgraph.yi + 3);

                                                                } else {
                                                                    let gi = t.codingToGenomic(start) + pv.offset
                                                                    let gf = t.codingToGenomic(end) + pv.offset
                                                                    await graph.zoomRect(t.tgraph.X(gi), t.tgraph.X(gf), t.tgraph.yi + 2 * t.tgraph.height, t.tgraph.height * (-2));
                                                                }
                                                                await sleep(2000)
                                                            }

                                                        } else {
                                                            let parseMutation = await exec('baja/bio/aa/mutation-parser.js');
                                                            let SnpIndel = await exec('flexigraph/snpindel.js')
                                                            console.log('debubg');

                                                            let mutation = parseMutation(m.trim())
                                                            showModal({
                                                                wid: 'json',
                                                                data: JSON.stringify(mutation)
                                                            })
                                                            for (let t of graph.track) {
                                                                let gi = t.codingToGenomic(mutation.position)
                                                                let gf = t.codingToGenomic(mutation.end)

                                                                graph.zoomRect(gi, gf, t.tgraph.yi - t.tgraph.height, t.tgraph.yi);

                                                            }
                                                        }

                                                    }

                                                })

                                            },

                                        ]
                                    },
                                    {
                                        'label': 'Highlight', 'items': [
                                            {
                                                'label': "Mutations on tracks", 'ionfunction': createIonFunction(async () => {

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
                                            {
                                                'label': 'Oligos...', 'ionfunction': createIonFunction(async () => {
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
    return bpanel;

}
