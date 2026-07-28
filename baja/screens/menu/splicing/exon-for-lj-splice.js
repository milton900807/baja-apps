function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {

        let splice_motifs = await exec('baja/bio/splicing/splice-motifs')

        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
        graph.selectOff();
        graph.setMessage(" Select a track... ")
        let ywc = -1;
        let Xwc = -1;
        let selectedTrack = null;

        graph.addMouseMoveListener((x, y) => {
            let p_trackIndex = graph.getTrack(x, y);
            if (p_trackIndex >= 0) {
                graph.deselectAllTracks();
                if (graph.track[p_trackIndex] != null) {
                    graph.track[p_trackIndex].showResizeBar = true;
                    selectedTrack = graph.track[p_trackIndex]
                    if (selectedTrack)
                        selectedTrack.select();
                }
                return;
            }
        })
        graph.addMouseDownListener(async (x, y) => {
            ywc = y;
            Xwc = x;
            let menuList = []

            menuList.push({
                label: 'SpliceArc-simple',
                click: async (xwc, ywc) => {
                    if (selectedTrack) {
                        let site = selectedTrack.tgraph.Xwc(Xwc)
                        let AttributionSushimiLayer = await exec('baja/bio/attribution-sushimi-layer.js')
                        let attr = new AttributionSushimiLayer('Sashimi' + site, selectedTrack.xi, 0, selectedTrack.xf, 1, site, 0)
                        selectedTrack.addLayer(attr);
                    }
                }
            })
            menuList.push({
                label: 'SpliceArc-Skip',
                click: async (xwc, ywc) => {
                    if (selectedTrack) {
                        let site = selectedTrack.tgraph.Xwc(Xwc)
                        let AttributionSushimiLayer = await exec('baja/bio/attribution-sushimi-layer.js')
                        let attr = new AttributionSushimiLayer('Sashimi', selectedTrack.xi, 0, selectedTrack.xf, 1, site, 1)
                        selectedTrack.addLayer(attr);
                    }
                },
                move: () => {
                    log('')
                }
            })
            menuList.push({
                label: 'SpliceArc-narrow',
                click: async (xwc, ywc) => {

                    if (selectedTrack) {
                        let site = selectedTrack.tgraph.Xwc(Xwc)
                        let AttributionSushimiLayer = await exec('baja/bio/attribution-sushimi-layer.js')
                        let attr = new AttributionSushimiLayer('Sashimi', selectedTrack.xi, 0, selectedTrack.xf, 1, site, 0)
                        attr.window = 10;
                        selectedTrack.addLayer(attr);
                    }
                }
            })
            graph.addMouseDownListener(async (x, y) => {
                ywc = y;
                Xwc = x;
                let menuList = []

                menuList.push({
                    label: 'SpliceArc-simple',
                    click: async (xwc, ywc) => {
                        if (selectedTrack) {
                            let site = selectedTrack.tgraph.Xwc(Xwc)
                            let AttributionSushimiLayer = await exec('baja/bio/attribution-sushimi-layer.js')
                            let attr = new AttributionSushimiLayer('Sashimi', selectedTrack.xi, 0, selectedTrack.xf, 1, site, 0)
                            selectedTrack.addLayer(attr);
                        }
                    }
                })
                menuList.push({
                    label: 'SpliceArc-Skip',
                    click: async (xwc, ywc) => {
                        if (selectedTrack) {
                            let site = selectedTrack.tgraph.Xwc(Xwc)
                            let AttributionSushimiLayer = await exec('baja/bio/attribution-sushimi-layer.js')
                            let attr = new AttributionSushimiLayer('Sashimi', selectedTrack.xi, 0, selectedTrack.xf, 1, site, 1)
                            selectedTrack.addLayer(attr);
                        }
                    },
                    move: () => {
                        log('')
                    }
                })
                menuList.push({
                    label: 'SpliceArc-narrow',
                    click: async (xwc, ywc) => {

                        if (selectedTrack) {
                            let site = selectedTrack.tgraph.Xwc(Xwc)
                            let AttributionSushimiLayer = await exec('baja/bio/attribution-sushimi-layer.js')
                            let attr = new AttributionSushimiLayer('Sashimi', selectedTrack.xi, 0, selectedTrack.xf, 1, site, 0)
                            attr.window = 10;
                            selectedTrack.addLayer(attr);
                        }
                    }
                })

                menuList.push({
                    label: 'SpliceArc-wide',
                    click: async (xwc, ywc) => {

                        if (selectedTrack) {
                            let site = selectedTrack.tgraph.Xwc(Xwc)
                            let AttributionSushimiLayer = await exec('baja/bio/attribution-sushimi-layer.js')
                            let attr = new AttributionSushimiLayer('Sashimi', selectedTrack.xi, 0, selectedTrack.xf, 1, site, 0)
                            attr.window = 2000;
                            selectedTrack.addLayer(attr);
                        }
                    },
                    move: () => {
                        log('')
                    }
                })

                menuList.push({
                    label: 'SpliceArc-all',
                    click: async (xwc, ywc) => {
                        if (selectedTrack) {
                            let AttributionSushimiLayer = await exec('baja/bio/attribution-sushimi-layer.js')
                            let eexons = selectedTrack.getExons();
                            for (let e of eexons) {
                                let site = e.xi;
                                let attr = new AttributionSushimiLayer('Sashimi', selectedTrack.xi, 0, selectedTrack.xf, 1, site, 0)
                                attr.window = 100;
                                selectedTrack.addLayer(attr);
                            }
                        }
                    },
                    move: () => {
                        log('')
                    }
                })

                menuList.push({
                    label: 'Cryptic Exons',
                    click: async (xwc, ywc) => {
                        if (selectedTrack) {
                            await exec('baja/bio/splicing/splice-site-annotator-run.js', graph, genegraph_panel_layout)

                            let site = selectedTrack.tgraph.Xwc(Xwc)
                            let AttributionSushimiLayer = await exec('baja/bio/attribution-sushimi-layer.js')
                            let attr = new AttributionSushimiLayer('Sashimi', selectedTrack.xi, 0, selectedTrack.xf, 1, site, 0)
                            attr.window = 10;
                            selectedTrack.addLayer(attr);
                        }
                    }
                })

                menuList.push({
                    label: 'Donor splice sites',
                    click: async (xwc, ywc) => {
                        let Annotation = await exec('flexigraph/annotation.js')
                        let rnaSplice = await exec('baja/bio/splicing/splice-motifs.js')
                        function sleep(ms) {
                            return new Promise(resolve => setTimeout(resolve, ms));
                        }
                        graph.pushOntoHistory();
                        if (selectedTrack) {
                            let xtc = selectedTrack.tgraph.Xwc(x);
                            let xoffset = 20;
                            let introns = selectedTrack.getIntrons(xoffset);
                            let index = 0;
                            graph.pushOntoHistory();

                            let found = false;
                            for (let i of introns) {

                                if (i.xi < xtc && i.xf > xtc) {
                                    found = true;

                                    let fiveprime = i.seq.substring(0, i.seq.length);
                                    let values = rnaSplice.findDonorSpliceSites(fiveprime, selectedTrack.strand)
                                    let splice = values.potentialSites;
                                    let csplice = values.canonicalSites;

                                    for (let sp of splice) {
                                        await sleep(200);
                                        let tr = new Annotation("Donor-Splice-Site", 'ss' + sp.site, i.xi + sp.position,
                                            i.xi + sp.position + sp.site.length, selectedTrack.strand);
                                        selectedTrack.add(tr);
                                    }
                                    for (let sp of csplice) {
                                        await sleep(200);
                                        let tr = new Annotation("Canonical-Donor-Splice-Site", 'css' + sp.site, i.xi + sp.position,
                                            i.xi + sp.position + sp.site.length, selectedTrack.strand);
                                        selectedTrack.add(tr);
                                    }
                                }

                                index++;
                            }
                            if (!found) {
                            }
                        }

                    },
                    move: () => {
                        log('')
                    }
                })
                menuList.push({
                    label: 'Acceptor (Intron) splice sites',
                    click: async (xwc, ywc) => {
                        let Annotation = await exec('flexigraph/annotation.js')
                        let rnaSplice = await exec('baja/bio/splicing/splice-motifs.js')
                        function sleep(ms) {
                            return new Promise(resolve => setTimeout(resolve, ms));
                        }
                        if (selectedTrack) {

                            graph.pushOntoHistory();

                            let xtc = selectedTrack.tgraph.Xwc(x);
                            let xoffset = 20;
                            let introns = selectedTrack.getIntrons(xoffset);
                            let index = 0;
                            let found = false;
                            for (let i of introns) {

                                if (i.xi < xtc && i.xf > xtc) {
                                    found = true;
                                    let fiveprime = i.seq;

                                    let values = rnaSplice.findAcceptorSpliceSites(fiveprime, selectedTrack.strand)
                                    let splice = values;
                                    for (let sp of splice) {
                                        await sleep(50);
                                        let tr = new Annotation("Acceptor-Splice-Site", 'ss' + sp.site, i.xi + sp.position,
                                            i.xi + sp.position + sp.site.length, selectedTrack.strand);
                                        selectedTrack.add(tr);

                                    }

                                }

                                index++;
                            }
                            if (!found) {
                                graph.setMessage("Click on an intron in a track. ", graph.X(xwc), graph.Y(ywc) - 20)
                            }
                        }

                    },
                    move: () => {
                        log('')
                    }
                })

                menuList.push({
                    label: 'Add Cryptic Exon',
                    click: async (xwc, ywc) => {
                        if (selectedTrack) {
                            let site = selectedTrack.tgraph.Xwc(Xwc)
                            let AttributionSushimiLayer = await exec('baja/bio/attribution-sushimi-layer.js')
                            let attr = new AttributionSushimiLayer('SPLICE_MAP' + Xwc, selectedTrack.xi, 0, selectedTrack.xf, 1, site, 0, 'SPLICE_MAP')
                            attr.interctive = true;

                            selectedTrack.addLayer(attr);
                        }
                    }
                })

                menuList.push({
                    label: 'Splice finder',
                    click: async (xwc, ywc) => {
                        if (selectedTrack) {
                            let site = selectedTrack.tgraph.Xwc(Xwc)
                            let AttributionSushimiLayer = await exec('baja/bio/attribution-sushimi-layer.js')

                            let attr = new AttributionSushimiLayer('SPLICE_INTRON' + Xwc, selectedTrack.xi, 0, selectedTrack.xf, 1, site, 0, 'SPLICE_INTRON')
                            attr.interctive = true;
                            selectedTrack.addLayer(attr);
                        }
                    }
                })

                if (selectedTrack)
                    graph.showMenu(menuList, x, y)
            })

        })
    })

}
