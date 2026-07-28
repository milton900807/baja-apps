function (graph, genegraph_panel_layout, selectedTrack) {

    return new Promise(async (resolve, reject) => {
        let panel = null;
        let descHook = createIonFunction((_panel) => {
            panel = _panel;
        })
        let list = [
            'Tile compounds on all user-defined annotations.',
            'Tile on specific user-defined annotation.'
        ]

        let tile_end_to_end = (graph, track, an) => {
            return new Promise(async (resolve, reject) => {
                console.log(' executing ... ')
                let Biopolymer = await exec('baja/chem/biopolymer.js')
                console.log('2 executing ... ')

                let chemistryObject = graph.props.selected_chemistry;
                if (!chemistryObject) {
                    infoPrompt('No chemistry selected ')
                    return resolve(true)
                }

                let base_count = Biopolymer.countBases(chemistryObject);
                if (chemistryObject['length'] != null || chemistryObject['length'] > 0) {
                    base_count = chemistryObject['length']
                }
                let yy = track.tgraph.ymin + 0.1;
                for (let i = an.xi; (i + base_count) < an.xf; i += base_count) {
                    yy += 0.03;
                    if (i % 2 === 0) {
                        await sleep(100)
                    }

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

                resolve('complete')
            }).then(r => {
                graph.setMessage("Tiling is complete...  ")
            })
        }

        let t = {
            wid: 'selection-list',
            data: {
                single_selection: true,
                show_button: false,
                singleSelect: true,
                listItems: list,
                button_function: createIonFunction(async (items) => {

                    let name = items[0]
                    if (name === 'Tile compounds on all user-defined annotations.') {

                        let an = selectedTrack.annotations;
                        for (let a of an) {
                            if (a.type === "UserAnnotation") {
                                tile_end_to_end(graph, selectedTrack, a)
                            }
                        }

                    } else if (name === 'Tile on specific user-defined annotation.') {

                        let attr_window = ''
                        let va = await prompt("Name of User-defined annotation", ["Name"], { "Name": attr_window }, 300, 300)
                        let m = va['Name']
                        if (m === null) {
                            attr_window = ''
                        } else {
                            attr_window = (m);
                        }

                        let an = selectedTrack.annotations;
                        for (let a of an) {
                            if (a.type === "UserAnnotation" && a.name.equalsIgnoreCase(attr_window)) {
                                tile_end_to_end(graph, selectedTrack, a)
                            }
                        }

                    }

                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                })
            }
        }

        let design_params_panel_layout = {
            wid: 'card',
            data: {
                cards: [
                    [
                        {
                            'width': '100%',
                            'component': t
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        }
                                    ]
                                }
                            }
                        }

                    ]
                ]
            }
        }
        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', design_params_panel_layout);
        resolve();
    });
}
