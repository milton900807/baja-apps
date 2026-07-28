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
    let highlight = false;
    let highlight_label = 'Highlight'
    let selectedTrack = null;

    graph.addMouseMoveListener((x, y) => {
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
            selectedTrack.select();
        }
        else {
            for (let t of graph.track) {
                t.deselect();
            }
        }
    })
    graph.addMouseDownListener((x, y) => {
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
            selectedTrack.select();
        }
        ywc = y;
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
            menuList.push(
                {
                    label: 'Track match', click: async (x, y) => {
                        if (selectedTrack) {
                            let edit_distance = 2;
                            let Biopolymer = await exec('baja/chem/biopolymer.js')
                            let chemistryObject = graph.props.selected_chemistry;
                            if (graph.props.selected_chemistry === undefined) {
                                graph.setMessage(" No chemistry selected ")
                                return;
                            }
                            let base_count = 10;
                            base_count = Biopolymer.countBases(chemistryObject);
                            if (chemistryObject['length'] != null || chemistryObject['length'] > 0) {
                                base_count = chemistryObject['length']
                            }
                            let yy = selectedTrack.tgraph.ymin;
                            for (let i = xcoord - base_count - 1; i < xcoord + 1; i += 3) {
                                yy += 0.05;
                                let sequence = selectedTrack.getSequenceRange(i, i + base_count);
                                let targets = {}
                                for ( let track of graph.track ){
                                    if ( track != selectedTrack ){
                                        let sequence = track.sequence;
                                        targets[track.name] =  sequence;
                                    }
                                }

                                let em = new EngineMonitor((v) => {
                                })
                                let r = await exec(`py/bio/track-match.py`, '/bd' + f.path + '.gz', 'chr'+chr, start, end, selectedTrack.strand);
                                showModal({
                                    wid: 'json',
                                    data: JSON.stringify(r)
                                })

                                let hits = exec ( '')

                            }
                        }
                    }
                });

            menuList.push(
                {
                    label: 'Tile phase 0',
                    click: async (x, y) => {
                        if (y > 0) {
                            console.log('Selected positive variant')
                        } else {
                            console.log('Selected negative variant')
                        }

                        let xwc = selectedTrack.tgraph.Xwc(x);
                        let range = 500;

                        let variant = await selectedTrack.fetchSnpindel(xwc, -1, range);

                        if (variant != null) {
                            await exec('baja/screens/annotation/tile-variant.js', variant, selectedTrack, graph, false)
                        } else {
                            graph.setMessage('Click closer to variant...');
                        }
                    },
                    move: () => {
                    },
                },
                {
                    label: 'Tile phase opposite (1)',
                    click: async (x, y) => {
                        if (y > 0) {
                            console.log('Selected positive variant')
                        } else {
                            console.log('Selected negative variant')
                        }

                        let xwc = selectedTrack.tgraph.Xwc(x);
                        let range = 500;
                        let variant = await selectedTrack.fetchSnpindel(xwc, 1, range);
                        console.log('debubg');
                        if (variant != null) {
                            await exec('baja/screens/annotation/tile-variant.js', variant, selectedTrack, graph, true)
                        } else {
                            graph.setMessage('Click closer to variant');
                        }
                    },
                    move: () => {
                    },
                },
                {
                    label: 'Tile all variants',
                    click: async (x, y) => {
                        if (y > 0) {
                            console.log('Selected positive variant')
                        } else {
                            console.log('Selected negative variant')
                        }

                        let xwc = selectedTrack.tgraph.Xwc(x);
                        let range = 500;
                        let variant = await selectedTrack.fetchSnpindel(xwc, null, range);
                        if (variant != null) {
                            await exec('baja/screens/annotation/tile-variant.js', variant, selectedTrack, graph, true)
                        } else {
                            graph.setMessage('Click closer to variant');
                        }
                    },
                    move: () => {
                    },
                },
            );
            menuList.push({
                label: `Tile on locus`,
                click: async (x, y) => {

                    if (graph.props === null) {
                        graph.setMessage("Choose a chemistry first. (Tools->Chemistry)")
                        return;
                    }

                    start = -1;
                    end = -1;
                    x = x - selectedTrack.tgraph.xi * 2;
                    let xcoord = Math.floor(selectedTrack.tgraph.Xwc(x));
                    let Biopolymer = await exec('baja/chem/biopolymer.js')

                    let chemistryObject = graph.props.selected_chemistry;
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
                        yy += 0.05;
                        let sequence = selectedTrack.getSequenceRange(i, i + base_count);
                        let bioObject = {
                            'targetSequence': sequence,
                            'trackName': selectedTrack.name,
                            'startIndex': i,
                            'y': (selectedTrack.tgraph.ymin + yy),
                            'endIndex': i + base_count,
                            'strand': selectedTrack.strand,
                        }
                        let compound = await Biopolymer.generateCompound(chemistryObject, bioObject)
                        if (compound)
                            selectedTrack.addOligo(compound)
                    }

                },
                move: () => {
                }
            });

        }
        else {
            graph.setMessage(" No track selected. ")
        }
        graph.showMenu(menuList, x, y, 200)
    });

}
