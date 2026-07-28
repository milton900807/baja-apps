function (graph, genegraph_panel_layout) {

    let tools_menu = [

        {
            'label': 'Alphafold', click: (() => {
                if (graph.track && graph.track.length === 0) {
                    infoPrompt(" First load a gene transcript.  (Track -> Add)")
                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    return;
                }
                if (graph.getMarkSelectedTracks()) {
                    if (graph.getMarkSelectedTracks().length < 1) {
                        infoPrompt(" Click and drag on a track to select a sequence to run")
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                        setTimeout(() => {
                            graph.setMessage(" Click and drag on a track to select a peptide sequence ")
                        }, 1000)
                        return;
                    } else if (graph.getMarkSelectedTracks().length >= 1) {
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                        setTimeout(async () => {
                            let ml = await exec('baja/screens/menu/load_seleced_sequence_menulist', graph, genegraph_panel_layout, true)
                        }, 200)
                    }
                }
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },
        {
            'label': 'Phylons(v1)', click: (async () => {
                if (graph.track && graph.track.length === 0) {
                    infoPrompt(" First load a gene transcript.  (Track -> Add)")
                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    return;
                }
                let mll = [
                    {
                        'label': 'Phylon on all tracks', click: (async () => {
                            for (let selectedTrack of graph.track) {
                                if (selectedTrack) {
                                    selectedTrack.select();
                                }
                                if (selectedTrack) {
                                    if (!selectedTrack) {
                                        graph.setMessage(" Click on a track to run..  ");
                                        return;
                                    }
                                    graph.showSideMenu(null)
                                    graph.setMessage(" Running Phylon ")
                                    graph.setMessageCenter(`Running  ${selectedTrack.tgraph.xmin} - ${selectedTrack.tgraph.xmax} `)
                                    let r = await exec('py/splicing/cryptic-exon-finder.py', selectedTrack.getSequenceRange(selectedTrack.tgraph.xmin, selectedTrack.tgraph.xmax),
                                        selectedTrack.chr, selectedTrack.tgraph.xmin, selectedTrack.tgraph.xmax, selectedTrack.strand)
                                    if (r && r.status === "file_downloading") {
                                        infoPrompt("Model building; this only needs to happen once but may take several minutes")
                                        return;
                                    }
                                    let cryptic_exons = await exec('baja/bio/splicing/cryptic-exons')
                                    let g = cryptic_exons.generateCrypticExons(r, { xiAnchor: selectedTrack.tgraph.xmin })
                                    for (let cry of g) {
                                        selectedTrack.add(cry)
                                    }
                                    if (g) {
                                        graph.setMessage('Phylon complete. Hits: ' + g.length)
                                    }
                                }
                                graph.setMouseMode('none')

                            }
                        })
                    },

                ]

                let sub = await exec('baja/screen/menu/phylon-menu', graph, genegraph_panel_layout)
                mll = mll.concat(sub)

                setTimeout(() => {
                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    setTimeout(() => {
                        graph.showSideMenu(mll);

                    }, 1000)

                }, 300)

            })
        },
        {
            'label': 'NMD predictor (bajabio-ORFi v1)', click: (async () => {

                if (graph.track && graph.track.length === 0) {
                    infoPrompt(" First load a gene transcript.  (Track -> Add)")
                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    return;
                }
                setTimeout(async () => {
                    await exec('baja/bio/splicing/nmd-model', graph, genegraph_panel_layout)

                }, 100)
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
            })
        },

        {
            'label': 'Splicing attribution models', click: (() => {
                setTimeout(async () => {
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    await exec('baja/screens/menu/splicing/splicing-tools2.js', graph, genegraph_panel_layout)
                }, 1000)

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },
        {
            'label': 'RNA structure models', click: (async () => {
                setTimeout(async () => {
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    exec('baja/screens/menu/draw-secondary-structure3.js', graph, genegraph_panel_layout);
                }, 1000)

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            })
        },
        {
            'label': 'RBP models', click: (async () => {
                alert(' Currently not available in this build')

            })
        },
    ]

    return tools_menu;
}
