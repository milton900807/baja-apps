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
                    let yy = track.tgraph.ymin + 0.2;
                    for (let i = track.markstart; (i + base_count) < track.markend; i += base_count) {
                        yy += 0.1;
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
                            yy = 0.2;
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
            label: 'Use Design Rules',
            click: () => {
                graph.hideMenu();
                if (!graph.props || !graph.props.selected_chemistry) {
                    infoPrompt(" Choose a chemistry first: (Tools=>Chemistry) ");
                    graph.setMessage("Choose a chemistry first. (Tools->Chemistry)");
                    return;
                }
                // Apply the chemistry's design rules across the selected sequence,
                // designing directly on this track (no interactive track pick).
                exec('baja/manchester/menu/tile-oligos-design.js', graph, genegraph_panel_layout, null, track);
            },
            move: () => { }
        },
        {
            label: 'Tile compounds end-to-end',
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
                                                    label: 'Tile', ionFunction: createIonFunction(async () => {
                                                        if (track) {
                                                            if (graph.props === null) {
                                                                graph.setMessage("Choose a chemistry first. (Tools->Chemistry)")
                                                                hideAllModal();
                                                                alert(' Choose chemistry first ')
                                                                return;
                                                            }
                                                            graph.hideMenu();
                                                            hideAllModal();

                                                            CurrentLayout.clearComponent('mainPanel')
                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                            graph.pushOntoHistory();

                                                            graph.runfun(tile_end_to_end, track)
                                                        }
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
            label: 'Tile compounds every 1bp',
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
                                                    label: 'Tile', ionFunction: createIonFunction(async () => {
                                                        if (track) {
                                                            if (graph.props === null) {
                                                                graph.setMessage("Choose a chemistry first. (Tools->Chemistry)")
                                                                hideAllModal();
                                                                alert(' Choose chemistry first ')
                                                                return;
                                                            }

                                                            hideAllModal()
                                                            graph.pushOntoHistory();

                                                            CurrentLayout.clearComponent('mainPanel')
                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout)

                                                            graph.runfun(run_one, track)
                                                        }

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
            label: 'Tile compounds every 3bp',
            click: () => {
                let editor_;
                let annotation_editor = createIonFunction((editor) => {
                    editor_ = editor;
                })
                graph.hideMenu();
                if (graph.props === null) {
                    graph.setMessage("Choose a chemistry first. (Tools->Chemistry)")
                    return;
                }

                if (graph.props === null) {

                    infoPrompt(" Choose a chemistry first: (Tools=>Chemistry) ")
                    graph.setMessage("Choose a chemistry first. (Tools->Chemistry)")
                    return;
                }

                for (let t of graph.track) {
                    if (t.markend > t.markstart) {
                        track = t;
                        break
                    }
                }

                if (!track) {
                    infoPrompt("Please select a track & sequence.")
                    return
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
                                                    label: 'Tile', ionFunction: createIonFunction(async () => {
                                                        if (track) {
                                                            if (graph.props === null) {
                                                                graph.setMessage("Choose a chemistry first. (Tools->Chemistry)")
                                                                hideAllModal();
                                                                alert(' Choose chemistry first ')
                                                                return;
                                                            }

                                                            if (!track) {
                                                                infoPrompt('Track and sequence are not selected.')
                                                                return
                                                            }

                                                            graph.pushOntoHistory();

                                                            hideAllModal()

                                                            CurrentLayout.clearComponent('mainPanel')
                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout)
                                                            graph.runfun(run_3bp, track)

                                                        }
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
            label: 'Tile compounds...',
            click: async (xwc, ywc) => {
                graph.pushOntoHistory();

                exec('baja/manchester/menu/tile-more-panel.js', track, graph, genegraph_panel_layout)
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            },
            move: () => {

            }
        },

    ]
    return menuList;

}
