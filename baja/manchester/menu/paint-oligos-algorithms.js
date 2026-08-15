function (graph, genegraph_panel_layout) {

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
            let seqLength = selectedTrack.sequence.length;
            let seq = selectedTrack.sequence;
            let seqName = selectedTrack.name;
            let selectedTrackstrand = selectedTrack.strand;
            let tgraph = selectedTrack.tgraph;
            menuList.push(
                {
                    label: 'Opt Secondary Structure', click: async (x, y) => {
                        let Biopolymer = await exec('baja/chem/biopolymer.js')
                        let progressBar;
                        let w = {
                            wid: 'progress',
                            componentRef: 'progressBar',
                            data: {
                                'progress': 10,
                                'progressBar': createIonFunction((progessBar) => {
                                    progressBar = progessBar;
                                })
                            }
                        }

                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                        setTimeout(async () => {
                            let chemistryObject = graph.props.selected_chemistry;
                            let base_count = Biopolymer.countBases(chemistryObject);
                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                            CurrentLayout.setComponent('buttonMenuPanel', w);
                            console.log(' sequence length ' + seq.length)
                            let engineMonitor = new EngineMonitor((msg) => {
                            });
                            engineMonitor.addProgressListener(async (v) => {
                                progressBar(v);
                            })

                            function pause(milliseconds) {
                                return new Promise(resolve => setTimeout(resolve, milliseconds));
                              }

                            let r = await exec('py/baja/secondary-structure/energy-window.py', engineMonitor, seq, base_count);
                            for (let oligo of r['results']) {
                                let bioObject = {
                                    'targetSequence': oligo.seq,
                                    'trackName': seqName,
                                    'startIndex': oligo.pos,
                                    'y': (tgraph.ymin),
                                    'endIndex': oligo.pos + seqLength,
                                    'strand': selectedTrackstrand,
                                }
                                let anno = await Biopolymer.generateCompound(chemistryObject, bioObject)
                                selectedTrack.addOligo(anno)
                                await pause(100);

                            }

                            let w2 = {
                                wid: 'html',
                                data: ` <b> secondary structure opt complete </b>`
                                }

                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                            CurrentLayout.setComponent('buttonMenuPanel', w2);

                        }, 1000)
                    }
                });

            menuList.push(
                {
                    label: 'microRNA', click: async (x, y) => {
                        let Biopolymer = await exec('baja/chem/biopolymer.js')
                        let progressBar;
                        let w = {
                            wid: 'progress',
                            componentRef: 'progressBar',
                            data: {
                                'progress': 10,
                                'progressBar': createIonFunction((progessBar) => {
                                    progressBar = progessBar;
                                })
                            }
                        }

                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                        setTimeout(async () => {
                            let chemistryObject = graph.props.selected_chemistry;
                            let base_count = Biopolymer.countBases(chemistryObject);
                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                            CurrentLayout.setComponent('buttonMenuPanel', w);
                            console.log(' sequence length ' + seq.length)
                            let engineMonitor = new EngineMonitor((msg) => {
                            });
                            engineMonitor.addProgressListener(async (v) => {
                                progressBar(v);
                            })
                            let r = await exec('py/baja/secondary-structure/energy-window.py', engineMonitor, seq, base_count);
                            for (let oligo of r['results']) {

                                let bioObject = {
                                    'targetSequence': oligo.seq,
                                    'trackName': seqName,
                                    'startIndex': oligo.pos,
                                    'y': (tgraph.ymin),
                                    'endIndex': oligo.pos + seqLength,
                                    'strand': selectedTrackstrand,
                                }
                                let anno = await Biopolymer.generateCompound(chemistryObject, bioObject)
                                selectedTrack.addOligo(anno)

                            }

                        }, 1000)
                    }
                });

                menuList.push(
                    {
                        label: 'NMD finder...', click: async (x, y) => {
                    let Biopolymer = await exec('baja/chem/biopolymer.js')
                            let progressBar;
                            let w = {
                                wid: 'progress',
                                componentRef: 'progressBar',
                                data: {
                                    'progress': 10,
                                    'progressBar': createIonFunction((progessBar) => {
                                        progressBar = progessBar;
                                    })
                                }
                            }

                CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                setTimeout ( async () => {
                let chemistryObject = graph.props.selected_chemistry;
                          let base_count = Biopolymer.countBases(chemistryObject);
                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                            CurrentLayout.setComponent('buttonMenuPanel', w);
                console.log ( ' sequence length ' + seq.length)
                            let engineMonitor = new EngineMonitor((msg) => {
                            });
                            engineMonitor.addProgressListener(async (v) => {
                                progressBar(v);
                            })
                            let r = await exec('py/baja/secondary-structure/energy-window.py', engineMonitor, seq, base_count);
                            for (let oligo of r['results']) {

                                let bioObject = {
                                    'targetSequence': oligo.seq,
                                    'trackName': seqName,
                                    'startIndex': oligo.pos,
                                    'y': (tgraph.ymin ),
                                    'endIndex': oligo.pos + seqLength,
                                    'strand': selectedTrackstrand,
                                }
                                let anno = await Biopolymer.generateCompound(chemistryObject, bioObject)
                                selectedTrack.addOligo ( anno )

                            }

                }, 1000)
                        }
                    });
                    menuList.push(
                        {
                            label: 'Opt Secondary Structure', click: async (x, y) => {
                        let Biopolymer = await exec('baja/chem/biopolymer.js')
                                let progressBar;
                                let w = {
                                    wid: 'progress',
                                    componentRef: 'progressBar',
                                    data: {
                                        'progress': 10,
                                        'progressBar': createIonFunction((progessBar) => {
                                            progressBar = progessBar;
                                        })
                                    }
                                }

                    CurrentLayout.clearComponent('mainPanel')
                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                    setTimeout ( async () => {
                    let chemistryObject = graph.props.selected_chemistry;
                              let base_count = Biopolymer.countBases(chemistryObject);
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                CurrentLayout.setComponent('buttonMenuPanel', w);
                    console.log ( ' sequence length ' + seq.length)
                                let engineMonitor = new EngineMonitor((msg) => {
                                });
                                engineMonitor.addProgressListener(async (v) => {
                                    progressBar(v);
                                })
                                let r = await exec('py/baja/secondary-structure/energy-window.py', engineMonitor, seq, base_count);
                                for (let oligo of r['results']) {

                                    let bioObject = {
                                        'targetSequence': oligo.seq,
                                        'trackName': seqName,
                                        'startIndex': oligo.pos,
                                        'y': (tgraph.ymin ),
                                        'endIndex': oligo.pos + seqLength,
                                        'strand': selectedTrackstrand,
                                    }
                                    let anno = await Biopolymer.generateCompound(chemistryObject, bioObject)
                                    selectedTrack.addOligo ( anno )

                                }

                    }, 1000)
                            }
                        });
                        menuList.push(
                            {
                                label: 'Riboseq', click: async (x, y) => {
                            let Biopolymer = await exec('baja/chem/biopolymer.js')
                                    let progressBar;
                                    let w = {
                                        wid: 'progress',
                                        componentRef: 'progressBar',
                                        data: {
                                            'progress': 10,
                                            'progressBar': createIonFunction((progessBar) => {
                                                progressBar = progessBar;
                                            })
                                        }
                                    }

                        CurrentLayout.clearComponent('mainPanel')
                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                        setTimeout ( async () => {
                        let chemistryObject = graph.props.selected_chemistry;
                                  let base_count = Biopolymer.countBases(chemistryObject);
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                    CurrentLayout.setComponent('buttonMenuPanel', w);
                        console.log ( ' sequence length ' + seq.length)
                                    let engineMonitor = new EngineMonitor((msg) => {
                                    });
                                    engineMonitor.addProgressListener(async (v) => {
                                        progressBar(v);
                                    })
                                    let r = await exec('py/baja/secondary-structure/energy-window.py', engineMonitor, seq, base_count);
                                    for (let oligo of r['results']) {

                                        let bioObject = {
                                            'targetSequence': oligo.seq,
                                            'trackName': seqName,
                                            'startIndex': oligo.pos,
                                            'y': (tgraph.ymin ),
                                            'endIndex': oligo.pos + seqLength,
                                            'strand': selectedTrackstrand,
                                        }
                                        let anno = await Biopolymer.generateCompound(chemistryObject, bioObject)
                                        selectedTrack.addOligo ( anno )

                                    }

                        }, 1000)
                                }
                            });

                            menuList.push(
                                {
                                    label: 'Cryptic exon finder...', click: async (x, y) => {
                                let Biopolymer = await exec('baja/chem/biopolymer.js')
                                        let progressBar;
                                        let w = {
                                            wid: 'progress',
                                            componentRef: 'progressBar',
                                            data: {
                                                'progress': 10,
                                                'progressBar': createIonFunction((progessBar) => {
                                                    progressBar = progessBar;
                                                })
                                            }
                                        }

                            CurrentLayout.clearComponent('mainPanel')
                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                            setTimeout ( async () => {
                            let chemistryObject = graph.props.selected_chemistry;
                                      let base_count = Biopolymer.countBases(chemistryObject);
                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                        CurrentLayout.setComponent('buttonMenuPanel', w);
                            console.log ( ' sequence length ' + seq.length)
                                        let engineMonitor = new EngineMonitor((msg) => {
                                        });
                                        engineMonitor.addProgressListener(async (v) => {
                                            progressBar(v);
                                        })
                                        let r = await exec('py/baja/secondary-structure/energy-window.py', engineMonitor, seq, base_count);
                                        for (let oligo of r['results']) {

                                            let bioObject = {
                                                'targetSequence': oligo.seq,
                                                'trackName': seqName,
                                                'startIndex': oligo.pos,
                                                'y': (tgraph.ymin ),
                                                'endIndex': oligo.pos + seqLength,
                                                'strand': selectedTrackstrand,
                                            }
                                            let anno = await Biopolymer.generateCompound(chemistryObject, bioObject)
                                            selectedTrack.addOligo ( anno )

                                        }

                            }, 1000)
                                    }
                                });

        }

        else {
            graph.setMessage(" No track selected. ")
        }
        graph.showWindowMenu(menuList, x, y)
    });

}
