function (track, graph, genegraph_panel_layout) {

    let tile_end_to_end = (graph, track) => {
        return new Promise(async (resolve, reject) => {
            console.log(' executing ... ')
            let Biopolymer = await exec('baja/chem/biopolymer.js')
            console.log('2 executing ... ')

            let chemistryObject = graph.props.selected_chemistry;
            if (!chemistryObject) {
                infoPrompt('No chemistry selected ')
                return resolve(true)
            }

            for (let track of graph.track) {
                if (track.markend > track.markstart) {
                    currentSequence = track.getHighlightedSequence();
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
                    let yy = track.tgraph.ymin + 0.1;
                    for (let i = track.markstart; (i + base_count) < track.markend; i += base_count) {
                        yy += 0.03;

                        if (i % 2 === 0) {
                            await sleep(100)
                        }
                        console.log('v executing ... ')

                        let sequence = track.getSequenceRange(i, i + base_count);
                        let bioObject = {
                            'targetSequence': sequence,
                            'trackName': track.name,
                            'startIndex': i,
                            'y': yy,
                            'endIndex': i + base_count,
                            'strand': track.strand,
                        }
                        if (yy >= 1) {
                            yy = 0.1;
                        }
                        let compound = await Biopolymer.generateCompound(chemistryObject, bioObject)
                        if (compound) {
                            compound.highlight(5000, "magenta")
                            track.addOligo(compound)
                        }
                    }

                }
            }
            resolve('complete')
        }).then(r => {
            graph.setMessage("Tiling is complete...  ")
        })

    }

    let run_3bp = (graph, track) => {
        return new Promise(async (resolve, reject) => {

            let Biopolymer = await exec('baja/chem/biopolymer.js')
            let chemistryObject = graph.props.selected_chemistry;

            if (!chemistryObject) {
                infoPrompt("Chemistry is not selected...")
                return
            }

            for (let track of graph.track) {
                if (track.markend > track.markstart) {
                    currentSequence = track.getHighlightedSequence();
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
                    let yy = track.tgraph.ymin + 0.1;
                    for (let i = track.markstart; (i + base_count) < track.markend; i += 3) {
                        yy += 0.03;
                        let sequence = track.getSequenceRange(i, i + base_count);
                        let bioObject = {
                            'targetSequence': sequence,
                            'trackName': track.name,
                            'startIndex': i,
                            'y': yy,
                            'endIndex': i + base_count,
                            'strand': track.strand,
                        }
                        if (yy >= 1) {
                            yy = 0.1;
                        }
                        let compound = await Biopolymer.generateCompound(chemistryObject, bioObject)
                        if (compound)
                            track.addOligo(compound)
                    }
                }
            }

            resolve()
        })
    }

    let run_one = (graph, track) => {

        return new Promise(async (resolve, reject) => {

            let Biopolymer = await exec('baja/chem/biopolymer.js')
            let chemistryObject = graph.props.selected_chemistry;

            for (let track of graph.track) {
                if (track.markend > track.markstart) {
                    currentSequence = track.getHighlightedSequence();
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
                    let yy = track.tgraph.ymin + 0.1;
                    for (let i = track.markstart; (i + base_count) < track.markend; i += 1) {
                        yy += 0.03;
                        await sleep(10)
                        let sequence = track.getSequenceRange(i, i + base_count);
                        let bioObject = {
                            'targetSequence': sequence,
                            'trackName': track.name,
                            'startIndex': i,
                            'y': yy,
                            'endIndex': i + base_count,
                            'strand': track.strand,
                        }
                        if (yy >= 1) {
                            yy = 0.1;
                        }
                        let compound = await Biopolymer.generateCompound(chemistryObject, bioObject)
                        if (compound) {
                            track.addOligo(compound)
                            compound.highlight(1000, 'purple')
                        }
                    }
                }
            }

            resolve()
        })

    }

    let menuList = [

        {
            label: 'Deletion',
            click: () => {
                let editor_;
                let annotation_editor = createIonFunction((editor) => {
                    editor_ = editor;
                })
                graph.hideMenu();
                if (graph.props === null) {

                    infoPrompt(" Choose a chemistry first: (Tools=>Chemistry) ")
                    graph.setMessage("Choose a chemistry first. (Tools->Chemistry)")
                    return;
                }

                if (!track) {
                    infoPrompt(" A track & sequence are not selected.  ")
                    return
                }

            },
            move: () => {
            }

        },
        {
            label: 'Insertion...',
            click: () => {
                let editor_;
                let annotation_editor = createIonFunction((editor) => {
                    editor_ = editor;
                })
                graph.hideMenu();
                if (graph.props === null) {
                    infoPrompt(" Choose a chemistry first: (Tools=>Chemistry) ")
                    graph.setMessage("Choose a chemistry first. (Tools->Chemistry)")
                    return;
                }

                if (!track) {
                    infoPrompt('No track and sequence selected. ')
                    return;
                }

                for (let t of graph.track) {
                    if (t.markend > t.markstart) {
                        track = t;
                        break
                    }
                }

                let dp = {
                    wid: 'card',
                    componentRef: 'bottomPanel',
                    data: {
                        cards: [
                            [
                                {
                                    'title': '',
                                    'component': {
                                        wid: 'html',
                                        data: `Tile for (${track.markstart} - ${track.markend})`
                                    }
                                },
                                {
                                    'title': '',
                                    'component': {
                                        wid: 'mt-button', data: {
                                            buttons: [
                                                {
                                                    label: 'Apply', ionFunction: createIonFunction(async () => {
                                                        hideAllModal()
                                                        graph.pushOntoHistory();
                                                        CurrentLayout.clearComponent('mainPanel')
                                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout)

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
                showModal(dp, 300, 120)
            },
            move: () => {
            }

        },
        {
            label: 'Phased SNP',
            click: () => {
                alert ( "Not available in this version...")
            },
            move: () => {
            }

        },

    ]
    return menuList;

}
