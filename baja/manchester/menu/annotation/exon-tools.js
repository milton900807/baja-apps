function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
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
                                                    'label': 'Exon...', 'ionfunction': createIonFunction(async () => {
                                                        graph.setMouseMode('none')
                                                        let selected = false;
                                                        for (let selectedTrack of graph.track) {
                                                            if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) {
                                                                selected = true;
                                                                let confirm = await exec('baja/lib/confirm.js', 'Create exon from selected squence on track ' +
                                                                    selectedTrack.name + '(' + selectedTrack.description + ')?', async () => {

                                                                        await graph.animateTo((selectedTrack.tgraph.X(selectedTrack.markstart)) - 10, (selectedTrack.tgraph.X(selectedTrack.markend)) + 10, selectedTrack.tgraph.yi + 2, selectedTrack.tgraph.height * (-1));
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
                                                                                selectedTrack.add(new Annotation("Exon", name, Math.floor(selectedTrack.markstart), Math.floor(selectedTrack.markend), selectedTrack.strand))
                                                                            }

                                                                            selectedTrack.generateORF();
                                                                        }
                                                                    })

                                                                showModal(confirm)

                                                            }
                                                        }

                                                        if (!selected) {
                                                            graph.setMessage(" You need to select a sequence on a track to create an exon")
                                                            infoPrompt('You need to select a sequence on a track to create an exon')
                                                        }

                                                    })
                                                },
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
                                            ]
                                        },
                                        {
                                            'label': 'Edit', 'items': [
                                                {
                                                    'label': "Exon...", 'ionfunction': createIonFunction(async () => {
                                                        graph.setMessage(" Click on an exon to to see menu options... ")
                                                        await exec('baja/manchester/menu/annotation/edit-exons.js', graph, genegraph_panel_layout)
                                                        CurrentLayout.clearComponent('labelPanel')
                                                        CurrentLayout.setComponent('labelPanel', {
                                                            wid: 'html',
                                                            data: "Exon editor: Select an exon to edit. "
                                                        });

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
        CurrentLayout.clearComponent('buttonMenuPanel')
        CurrentLayout.setComponent('buttonMenuPanel', bpanel);

    })
}
