function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let buttons__ = [

            {
                x: 0, y: 0, label: 'LJSplice', ionFunction: createIonFunction(async () => {
                    graph.setMouseMode('none')
                    await exec('baja/bio/splicing/splicing-attributions.js', graph, genegraph_panel_layout)
                })
            },

            {
                x: 1, y: 0, label: 'Splice Vis', ionFunction: createIonFunction(async () => {

                    await exec('baja/manchester/menu/splicing/exon-for-lj-splice.js', graph, genegraph_panel_layout)

                })
            },
            {
                x: 2, y: 0, label: 'PTC Vis', ionFunction: createIonFunction(async () => {
                    await exec('baja/manchester/menu/splicing/ptc-arcs.js', graph, genegraph_panel_layout)
                })
            },
        ]

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
                                            'label': 'LJSplice', 'items': [
                                                {
                                                    'label': 'Cis-regulatory attributes...', 'ionfunction': createIonFunction(async () => {
                                                        graph.setMouseMode('none')
                                                        graph.setMessage("Click on a track to plot attributes")
                                                        await exec('baja/bio/splicing/splicing-attributions.js', graph, genegraph_panel_layout)

                                                    })
                                                },
                                            ]
                                        },
                                        {
                                            'label': 'Splice sites', 'items': [
                                                {
                                                    'label': 'Acceptor sites', 'ionfunction': createIonFunction(async () => {
                                                        graph.setMouseMode('none')
                                                        let Annotation = await exec('flexigraph/annotation.js')
                                                        let rnaSplice = await exec('baja/bio/splicing/splice-motifs.js')
                                                        function sleep(ms) {
                                                            return new Promise(resolve => setTimeout(resolve, ms));
                                                        }

                                                        let selected = false;
                                                        for (let selectedTrack of graph.track) {
                                                            if (selectedTrack.markend > selectedTrack.markstart) {
                                                                selected = true;
                                                            }
                                                        }
                                                        if (!selected) {
                                                            infoPrompt("You must first select a sequence range on at least one track.")
                                                            return;
                                                        }

                                                        for (let selectedTrack of graph.track) {
                                                            if (selectedTrack.markend > selectedTrack.markstart) {
                                                                let Annotation = await exec('flexigraph/annotation.js')
                                                                let rnaSplice = await exec('baja/bio/splicing/splice-motifs.js')
                                                                function sleep(ms) {
                                                                    return new Promise(resolve => setTimeout(resolve, ms));
                                                                }

                                                                if (selectedTrack) {

                                                                    if (selectedTrack.strand < 0) {
                                                                        let seq = selectedTrack.sequence;
                                                                        let initx = selectedTrack.markstart - selectedTrack.tgraph.xmin;
                                                                        let tox = selectedTrack.markend - selectedTrack.tgraph.xmin;
                                                                        let slice = seq.substring(initx, tox);

                                                                        let splice = rnaSplice.findAcceptorSpliceSites(slice, selectedTrack.strand)
                                                                        for (let sp of splice) {
                                                                            await sleep(50);
                                                                            sp.position += 1;

                                                                            let tr = new Annotation("Acceptor-Splice-Site", 'ss' + sp.site, selectedTrack.markstart + sp.position,
                                                                                selectedTrack.markstart + sp.position + sp.site.length, selectedTrack.strand);
                                                                            selectedTrack.add(tr);
                                                                        }
                                                                    } else {
                                                                        let seq = selectedTrack.sequence;
                                                                        let initx = selectedTrack.markstart - selectedTrack.tgraph.xmin;
                                                                        let tox = selectedTrack.markend - selectedTrack.tgraph.xmin;
                                                                        let slice = seq.substring(initx, tox);
                                                                        let splice = rnaSplice.findAcceptorSpliceSites(slice, selectedTrack.strand)
                                                                        for (let sp of splice) {
                                                                            await sleep(50);
                                                                            sp.position += 1;
                                                                            console.log(' sit ' + sp.position + ' length ' + sp.length)

                                                                            let tr = new Annotation("Acceptor-Splice-Site", 'ss' + sp.site, selectedTrack.markstart + sp.position,
                                                                                selectedTrack.markstart + sp.position + sp.site.length, selectedTrack.strand);
                                                                            selectedTrack.add(tr);
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }

                                                    })
                                                },
                                                {
                                                    'label': 'Donor sites', 'ionfunction': createIonFunction(async () => {

                                                        let selected = false;
                                                        for (let selectedTrack of graph.track) {
                                                            if (selectedTrack.markend > selectedTrack.markstart) {
                                                                selected = true;
                                                            }
                                                        }
                                                        if (!selected) {
                                                            infoPrompt("You must first select a sequence range on at least one track.")
                                                            return;
                                                        }

                                                        let count = 0;

                                                        for (let selectedTrack of graph.track) {
                                                            if (selectedTrack.markend > selectedTrack.markstart) {
                                                                let Annotation = await exec('flexigraph/annotation.js')
                                                                let rnaSplice = await exec('baja/bio/splicing/splice-motifs.js')
                                                                function sleep(ms) {
                                                                    return new Promise(resolve => setTimeout(resolve, ms));
                                                                }
                                                                if (selectedTrack) {
                                                                    let xi = selectedTrack.markstart;
                                                                    let xf = selectedTrack.markend;

                                                                    let seq = selectedTrack.sequence;
                                                                    let initx = selectedTrack.markstart - selectedTrack.tgraph.xmin;
                                                                    let tox = selectedTrack.markend - selectedTrack.tgraph.xmin;
                                                                    let slice = seq.substring(initx + 1, tox + 1);
                                                                    let values = rnaSplice.findDonorSpliceSites(slice, selectedTrack.strand)
                                                                    let splice = values.potentialSites;
                                                                    let csplice = values.canonicalSites;
                                                                    for (let sp of splice) {
                                                                        await sleep(50);
                                                                        if (selectedTrack.strand < 0) {
                                                                            sp.position += 1;

                                                                        } else {
                                                                            sp.position += 1;
                                                                        }

                                                                        let tr = new Annotation("Donor-Splice-Site", 'ss' + sp.site, selectedTrack.markstart + sp.position,
                                                                            selectedTrack.markstart + sp.position + sp.site.length, selectedTrack.strand);

                                                                        selectedTrack.add(tr);
                                                                        count++;
                                                                    }
                                                                    for (let sp of csplice) {
                                                                        await sleep(50);
                                                                        let tr = new Annotation("Canonical-Donor-Splice-Site", 'css' + sp.site, selectedTrack.markstart + sp.position,
                                                                            selectedTrack.markstart + sp.position + sp.site.length, selectedTrack.strand);
                                                                        selectedTrack.add(tr);
                                                                    }
                                                                    let script_canvas = await exec('baja/manchester/menu/annotation-navigation-tools.js', graph)
                                                                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                                    CurrentLayout.setComponent('buttonMenuPanel', script_canvas);
                                                                }
                                                            }
                                                        }
                                                    })
                                                },
                                                {
                                                    'label': 'Exon sites', 'ionfunction': createIonFunction(async () => {
                                                        await exec('baja/manchester/menu/splicing/exon-for-lj-splice.js', graph, genegraph_panel_layout)

                                                    })
                                                },

                                            ]
                                        },
                                        {
                                            'label': 'Peptide', 'items': [
                                                {
                                                    'label': 'PTC arcs', 'ionfunction': createIonFunction(async () => {

                                                        await exec('baja/manchester/menu/splicing/ptc-arcs.js', graph, genegraph_panel_layout)

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
        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
        CurrentLayout.setComponent('buttonMenuPanel', bpanel);

    })

}
