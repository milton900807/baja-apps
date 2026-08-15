function (graph) {

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

    graph.addMouseMoveListener((x, y) => {
        if (graph.menuVisible()) { } else {
            graph.selectOff();
            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                selectedTrack = graph.track[trackIndex]
                selectedTrack.select();
            }
        }
    })

    graph.addMouseDownListener((x, y) => {
        if (graph.menuVisible()) {
            return;
        }
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
            selectedTrack.select();
            ywc = selectedTrack.tgraph.Ywc(y);

        }

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

        let menuList = [
        ]

        if (selectedTrack) {

            menuList.push({
                label: `Tile here every 3bp`,
                click: async () => {
                    if (graph.props === null) {
                        graph.setMessage("Choose a chemistry first. (Tools->Chemistry)")
                        return;
                    }
                    let xcoord = Math.floor(selectedTrack.tgraph.Xwc(x) - selectedTrack.tgraph.xi*2);
                    let Biopolymer = await exec('baja/chem/biopolymer.js')

                    let chemistryObject = graph.props.selected_chemistry;
                    if (selectedTrack) {
                        currentSequence = selectedTrack.getHighlightedSequence();
                        if (graph.props.selected_chemistry === undefined) {
                            graph.setMessage(" No chemistry selected ")
                            return;
                        }
                        paused = true;
                        let base_count = 10;
                        base_count = Biopolymer.countBases(chemistryObject);
                        if (chemistryObject['length'] != null || chemistryObject['length'] > 0) {
                            base_count = chemistryObject['length']
                        }
                        let yy = selectedTrack.tgraph.ymin;
                        for (let i = xcoord - base_count - 1; i < xcoord + 1; i += 3) {
                            yy += 0.01;
                            let sequence = selectedTrack.getSequenceRange(i, i + base_count);
                            let bioObject = {
                                'targetSequence': sequence,
                                'trackName': selectedTrack.name,
                                'startIndex': i,
                                'y': 0.02,
                                'endIndex': i + base_count,
                                'strand': selectedTrack.strand,
                            }
                            let compound = await Biopolymer.generateCompound(chemistryObject, bioObject)
                            if (compound)
                                selectedTrack.addOligo(compound)
                        }
                    } else {
                        graph.setMessage(" Track not selected. ")
                    }
                },
                move: () => {
                }
            });
            menuList.push({
                label: `Tile here every 1bp`,
                click: async () => {
                    if (graph.props === null) {
                        graph.setMessage("Choose a chemistry first. (Tools->Chemistry)")
                        return;
                    }
                    let xcoord = Math.floor(selectedTrack.tgraph.Xwc(x) - selectedTrack.tgraph.xi*2);
                    let Biopolymer = await exec('baja/chem/biopolymer.js')

                    let chemistryObject = graph.props.selected_chemistry;
                    if (selectedTrack) {
                        currentSequence = selectedTrack.getHighlightedSequence();
                        if (graph.props.selected_chemistry === undefined) {
                            graph.setMessage(" No chemistry selected ")
                            return;
                        }
                        paused = true;
                        let base_count = 10;
                        base_count = Biopolymer.countBases(chemistryObject);
                        if (chemistryObject['length'] != null || chemistryObject['length'] > 0) {
                            base_count = chemistryObject['length']
                        }
                        let yy = selectedTrack.tgraph.ymin;
                        for (let i = xcoord - base_count - 1; i < xcoord + 1; i += 1) {

                            let sequence = selectedTrack.getSequenceRange(i, i + base_count);
                            let bioObject = {
                                'targetSequence': sequence,
                                'trackName': selectedTrack.name,
                                'startIndex': i,
                                'y': 0.1,
                                'endIndex': i + base_count,
                                'strand': selectedTrack.strand,
                            }
                            let compound = await Biopolymer.generateCompound(chemistryObject, bioObject)
                            if (compound)
                                selectedTrack.addOligo(compound)
                        }
                    } else {
                        graph.setMessage(" Track not selected. ")
                    }
                },
                move: () => {
                }
            });

            menuList.push(
                {
                    label: 'Tile (variants)', click: async () => {
                        if (graph.track.length > 0) {
                            let hasSnpindel = 0;
                            for (let t of graph.track) {
                                if (t.snpindels.length > 0) {
                                    hasSnpindel = 1;
                                }
                            }
                            if (hasSnpindel == 1) {
                                graph.setMessage('Choose variant to tile...')
                                await exec('baja/manchester/annotation/paint-oligos-snps.js', graph)
                            } else {
                                graph.setMessage('No variants found')
                            }
                        }
                    }
                });

            menuList.push(
                {
                    label: 'Tile phase 0',
                    click: async () => {
                        if (y > 0) {
                            console.log('Selected positive variant')
                        } else {
                            console.log('Selected negative variant')
                        }
                        let xwc = Math.floor(selectedTrack.tgraph.Xwc(x) - selectedTrack.tgraph.xi * 2);
                        let range = 500;
                        let variant = await selectedTrack.fetchSnpindel(xwc, -1, range);
                        if (variant != null) {
                            await exec('baja/manchester/annotation/tile-variant.js', variant, selectedTrack, graph, false)
                        } else {
                            graph.setMessage('Click closer to variant...');
                        }
                    },
                    move: () => {
                    },
                },
                {
                    label: 'Tile phase opposite (1)',
                    click: async () => {
                        if (y > 0) {
                            console.log('Selected positive variant')
                        } else {
                            console.log('Selected negative variant')
                        }

                        let xwc = selectedTrack.tgraph.Xwc(x) - selectedTrack.tgraph.xi * 2;
                        let range = 500;
                        let variant = await selectedTrack.fetchSnpindel(xwc, 1, range);
                        if (variant != null) {
                            await exec('baja/manchester/annotation/tile-variant.js', variant, selectedTrack, graph, true)
                        } else {
                            graph.setMessage('Click closer to variant');
                        }
                    },
                    move: () => {
                    },
                },
                {
                    label: 'Tile all variants',
                    click: async () => {
                        if (y > 0) {
                            console.log('Selected positive variant')
                        } else {
                            console.log('Selected negative variant')
                        }

                        let xwc = selectedTrack.tgraph.Xwc(x) - selectedTrack.tgraph.xi * 2;
                        let range = 500;
                        let variant = await selectedTrack.fetchSnpindel(xwc, null, range);
                        if (variant != null) {
                            await exec('baja/manchester/annotation/tile-variant.js', variant, selectedTrack, graph, true)
                        } else {
                            graph.setMessage('Click closer to variant');
                        }
                    },
                    move: () => {
                    },
                },
            );

        }
        else {
            graph.setMessage(" No track selected. ")
        }
        graph.showMenu(menuList, x, y, 200)
    });

}
