function (graph, genegraph_panel_layout, selectedTrack) {

    selectedTrack.select()

    return new Promise(async (resolve, reject) => {
        let Annotation = await exec('flexigraph/annotation.js')
        let rnaSplice = await exec('baja/bio/splicing/splice-motifs.js')
        let buttons__ = [
            {
                x: 0, y: 0, label: 'Donor Sites', ionFunction: createIonFunction(async () => {
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
                            let tr = new Annotation("Donor-Splice-Site", 'ss' + sp.site, selectedTrack.markstart + sp.position,
                                selectedTrack.markstart + sp.position + sp.site.length, selectedTrack.strand);
                            selectedTrack.add(tr);
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

                })
            },
            {
                x: 1, y: 0, label: 'Acceptor Sites', ionFunction: createIonFunction(async () => {
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
                                console.log(' sit ' + sp.position + ' length ' + sp.length)
                                sp.position+=1;

                                let tr = new Annotation("Acceptor-Splice-Site", 'ss' + sp.site, selectedTrack.markstart + sp.position,
                                    selectedTrack.markstart + sp.position + sp.site.length, selectedTrack.strand);
                                selectedTrack.add(tr);
                            }
                        }
                    }
                })
            },
            {
                x: 2, y: 0, label: 'Exonize', ionFunction: createIonFunction(async () => {
                    if (selectedTrack) {
                        graph.setMessage(" Creating new exon at " + selectedTrack.markstart + " " + selectedTrack.markend)
                        let va = await prompt("Name", ["Name"], { "Name": "" }, 300, 300)
                        if (va['Name'] == null || va["Name"].length <= 0) {
                            alert(' Please provide a name ')
                        } else {
                            let Annotation = await exec('flexigraph/annotation.js')
                            let name = va['Name'];
                            if (name === null || name.length <= 0) {
                                graph.setMessage('Please provide a valid name for this exon ')
                                return;
                            }
                            if (selectedTrack.markstart && selectedTrack.markend && (selectedTrack.markend - selectedTrack.markstart) > 1) {
                                graph.setMessage(" Creating new exon at " + selectedTrack.markstart + " " + selectedTrack.markend)
                                selectedTrack.add(new Annotation("Exon", name, Math.floor(selectedTrack.markstart), Math.floor(selectedTrack.markend) - 1, selectedTrack.strand))
                                selectedTrack.markstart = null;
                                selectedTrack.markend = null;
                            }
                        }
                    }
                })
            }
        ]

        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 30,
                'width': 900,
                'grid': {
                    xmin: 0,
                    xmax: 9,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': buttons__

            }
        }
        return resolve(button_canvas)
    })

}
