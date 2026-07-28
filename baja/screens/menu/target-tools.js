function (graph, library, folder, genegraph_panel_layout) {

    let Barchart = class Barchart {
        name;
        x;
        color = 'gray'
        value;

        constructor(name, x, value) {
            this.x = x;
            this.value = value;
        }
        setColor(color) {
            this.color = color;
        }
        async draw(graph, tgraph) {
            await graph.drawLine(tgraph.X(this.x), tgraph.Y(0), tgraph.X(this.x), tgraph.Y(this.value), 'lightBlue', 2, 'round')

        }
    }

    let editDistance = 0;

    let button_canvas = {
        wid: 'button-canvas',
        data: {
            'title': 'controls',
            'height': 30,
            'width': 1200,
            'grid': {
                xmin: 0,
                xmax: 8,
                ymin: -0.01,
                ymax: 1,
                xinset: 0,
                yinset: 0
            },
            'buttons': [
                {
                    x: 0, y: 0, label: 'Run Off-target', ionFunction: createIonFunction(async () => {

                        await exec ( 'baja/screens/menu/run-off-target-tool.js', graph, genegraph_panel_layout)

                    })
                },
                {
                    x: 1, y: 0, label: 'Haplotype tiling', ionFunction: createIonFunction(async () => {
                        if (graph.track.length > 0) {
                            let hasSnpindel = 0;
                            for (let t of graph.track) {
                                if (t.snpindels.length > 0) {
                                    hasSnpindel = 1;
                                }
                            }
                            if (graph.props.selected_chemistry) {
                                if (hasSnpindel == 1) {
                                    graph.setMessage('Select a phase')
                                    await exec('baja/screens/annotation/paint-oligos-snps.js', graph, true);
                                } else {
                                    graph.setMessage('No variants found.')
                                }
                            } else {
                                graph.setMessage('Select chemistry before tiling.')
                            }
                        }
                        hideAllModal();

                    })
                },
                {
                    x: 2, y: 0, label: 'Phase Sequence', ionFunction: createIonFunction(async () => {
                        if (graph.track.length > 0) {
                            let hasSnpindel = 0;
                            for (let t of graph.track) {
                                if (t.snpindels.length > 0) {
                                    hasSnpindel = 1;
                                }
                            }
                            if (hasSnpindel == 1) {
                                graph.setMessage('Select a track')
                                await exec('baja/screens/annotation/variant-primer-probe-actions.js', graph, genegraph_panel_layout, true);
                            } else {
                                graph.setMessage('No variants found.')
                            }
                        }
                        hideAllModal();

                    })
                },

                {
                    x: 3, y: 0, label: 'Add VCF', ionFunction: createIonFunction(async () => {
                        return new Promise(async (resolve, reject) => {
                            let phase = null;
                            let label_phase = {
                                wid: 'card',
                                componentRef: 'bottomPanel',

                                data: {
                                    height: '800px',
                                    cards: [
                                        [
                                            {
                                                'title': 'Input phased VCF and choose phase?',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Yes', ionFunction: createIonFunction(() => {
                                                                    resolve(true);
                                                                    hideAllModal();
                                                                })
                                                            },
                                                            {
                                                                label: 'No', ionFunction: createIonFunction(() => {
                                                                    resolve(false);
                                                                    hideAllModal();
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
                            showModal(label_phase);
                        }).then(async (phasetarget) => {
                            await exec('baja/screens/annotation/vcf-load.js', graph, library, folder, phasetarget);
                        });

                    })
                },
                {
                    x: 6, y: 0, label: 'Prepare Oligos', ionFunction: createIonFunction(async () => {
                        if (graph.track.length > 0) {
                            let hasSnpindel = 0;
                            let hasOligos = 0;
                            for (let t of graph.track) {
                                if (t.snpindels.length > 0) {
                                    hasSnpindel = 1;
                                }
                                if (t.oligos.length > 0) {
                                    hasOligos = 1;
                                }
                            }
                            if (hasOligos == 1) {
                                await exec('baja/screens/annotation/send-oligos.js', graph).then(async (oligos) => {
                                    let db = await exec('baja/lib/db.js', library);
                                    let ds = JSON.parse(oligos);
                                    let fh = folder.name + '-oligos-send-for-offtarget.json'
                                    db.saveScreen(library.id, folder.id, ds, fh).then(() => {
                                        graph.setMessage('Wrote oligos to offtarget file.')
                                    });
                                });
                            } else {
                                graph.setMessage('No oligos and/or variants found')
                            }
                        }
                        hideAllModal();

                    })
                },
                {
                    x: 4, y: 0, label: 'Filter', ionFunction: createIonFunction(async () => {
                        if (graph.track.length > 0) {
                            let hasSnpindel = 0;
                            let hasOligos = 0;
                            for (let t of graph.track) {
                                if (t.snpindels.length > 0) {
                                    hasSnpindel = 1;
                                }
                                if (t.oligos.length > 0) {
                                    hasOligos = 1;
                                }
                            }
                            if (hasOligos == 1) {
                                let needsOfftarget = null;
                                let needssynthesisSequence = null;
                                for (let t of graph.track) {
                                    for (let o of t.oligos) {
                                        if (!o.offtarget) {
                                            needsOfftarget = 1;
                                            o.highlight__ = true;
                                        }
                                        if (!o.synthesisSequence) {
                                            needssynthesisSequence = 1;
                                        }
                                    }
                                }
                                if (needssynthesisSequence) {
                                    graph.setMessage('Define synthesis sequence for oligos.')
                                    return;
                                }
                                if (needsOfftarget) {
                                    graph.setMessage('Some oligos need offtarget information.');
                                    let confirm = await exec('baja/lib/confirm.js', 'Some oligos do not have offtargets.  Continue?', async () => {
                                        await exec('baja/screens/annotation/rule-application-wizard.js', library, folder, graph)
                                    })
                                    showModal(confirm)
                                } else
                                    await exec('baja/screens/annotation/rule-application-wizard.js', library, folder, graph)
                            } else {
                                graph.setMessage('No oligos and/or variants found')
                            }
                        }

                    })
                },
                {
                    x: 5, y: 0, label: 'Upload Filtered Oligos', ionFunction: createIonFunction(async () => {

                        await exec('baja/screens/annotation/read-filtered-oligos.js', graph, library, folder);
                    })
                },
                {
                    x: 7, y: 0, label: 'Set target variant', ionFunction: createIonFunction(async () => {
                        if (graph.track.length > 0) {
                            let hasSnpindel = 0;
                            for (let t of graph.track) {
                                if (t.snpindels.length > 0) {
                                    hasSnpindel = 1;
                                }
                            }
                            if (hasSnpindel == 1) {
                                return new Promise((resolve, reject) => {
                                    let label_phase = {
                                        wid: 'card',
                                        componentRef: 'bottomPanel',
                                        data: {
                                            height: '800px',
                                            cards: [
                                                [
                                                    {
                                                        'title': 'Do you want to set/reset target variant?',
                                                        'width': '100%',
                                                        'component': {
                                                            wid: 'mt-button', data: {
                                                                buttons: [
                                                                    {
                                                                        label: 'Yes', ionFunction: createIonFunction(() => {
                                                                            resolve(true);
                                                                            hideAllModal();
                                                                        })
                                                                    },
                                                                    {
                                                                        label: 'No', ionFunction: createIonFunction(() => {
                                                                            resolve(false);
                                                                            hideAllModal();
                                                                        })
                                                                    },
                                                                ]
                                                            }
                                                        }
                                                    }
                                                ]]
                                        }
                                    }
                                    showModal(label_phase);
                                }).then(async (reset) => {
                                    if (reset) {
                                        return new Promise(async (resolve, reject) => {
                                            graph.setMessage('Select a track change target variant.')
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
                                            let resizeTrack = false;

                                            graph.addMouseMoveListener((x, y) => {
                                                let trackIndex = graph.getTrack(x, y);

                                                if (trackIndex >= 0) {
                                                    let cselectedTrack = graph.track[trackIndex]
                                                    if (cselectedTrack && selectedTrack != cselectedTrack) {
                                                        if (selectedTrack)
                                                            selectedTrack.showResizeBar = false;
                                                    }
                                                    selectedTrack = cselectedTrack;
                                                    if (selectedTrack)
                                                        selectedTrack.showResizeBar = true;
                                                } else {
                                                    graph.selectOff();
                                                    selectedTrack = null;
                                                }
                                            })

                                            graph.addMouseDownListener((x, y) => {
                                                let trackIndex = graph.getTrack(x, y);
                                                if (trackIndex >= 0) {
                                                    selectedTrack = graph.track[trackIndex]
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

                                                let menuList = [];

                                                if (selectedTrack) {
                                                    menuList.push(
                                                        {
                                                            label: 'Set variant',
                                                            click: async () => {
                                                                exec('baja/screens/annotation/set-targeted-variant.js', selectedTrack)
                                                            },
                                                            move: () => {
                                                            }
                                                        },
                                                    );
                                                }
                                                graph.showMenu(menuList, x, y);
                                            })
                                        })
                                    }
                                })
                            } else {
                                graph.setMessage('No variants found.')
                            }
                        }
                    })
                },

            ]
        }
    }
    return button_canvas

}
