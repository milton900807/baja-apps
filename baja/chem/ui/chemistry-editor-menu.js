function (graph, genegraph_panel_layout) {

    let editor_;
    let editor_function = createIonFunction((editor) => {
        editor_ = editor;
    })
    let showMainScreen = async () => {
        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

    }
    if (!graph.props.selected_chemistry) {

        graph.setMessage("FYI: You do not have a default chemistry choosen.", 200, 40)
    }

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
                                                'label': 'Draw compound on track', 'ionfunction': createIonFunction(async () => {

                                                    if (!graph.props.selected_chemistry) {
                                                        infoPrompt ( " Please select a chemistry... [Tools][Chemistry]")
                                                        return;
                                                    }

                                                    graph.setMouseMode('navigate')
                                                    graph.setMessage('Select location on track')
                                                    await exec('baja/screens/menu/draw-oligos.js', graph)
                                                })
                                            },

                                            {
                                                'label': 'Tile on track location..', 'ionfunction': createIonFunction(async () => {

                                                    if (!graph.props.selected_chemistry) {
                                                        infoPrompt ( " Please select a chemistry... [Tools][Chemistry]")
                                                        return;
                                                    }
                                                    graph.clearMouseListeners();
                                                    graph.setMessage('Select a point on a track')
                                                    exec('baja/screens/menu/paint-oligos.js', graph)
                                                }),
                                            }, {

                                                'label': 'Tile across selected sequence...', 'ionfunction': createIonFunction(async () => {

                                                    if (!graph.props.selected_chemistry) {
                                                        infoPrompt ( " Please select a chemistry... [Tools][Chemistry]")
                                                        return;
                                                    }
                                                    setTimeout(async () => {
                                                        exec('baja/screens/menu/sequence.js', graph, genegraph_panel_layout, true)
                                                    }, 100)
                                                })

                                            },
                                            {

                                                'label': 'Tile on secondary structure', 'ionfunction': createIonFunction(async () => {

                                                    if (!graph.props.selected_chemistry) {
                                                        infoPrompt ( " Please select a chemistry... [Tools][Chemistry]")
                                                        return;
                                                    }
                                                    graph.clearMouseListeners();
                                                    graph.addMouseMoveListener(async (x, y) => {
                                                        let trackIndex = graph.getTrack(x, y);
                                                        graph.deselectAllTracks();

                                                        if (trackIndex >= 0) {
                                                            selectedTrack = graph.track[trackIndex]
                                                            if (selectedTrack)
                                                                selectedTrack.select();
                                                        }
                                                    });

                                                    graph.addMouseDownListener(async (x, y) => {

                                                        let length = selectedTrack.sequence.length
                                                        if (length > 7000) {
                                                            infoPrompt(" The track sequence is too long ( >7KB ).  Use the selection sequence secondary structure option.")
                                                            return;
                                                        }
                                                        sequenceLength = length;

                                                        let confirm = await exec('baja/lib/confirm-widget.js', async () => {
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
                                                            graph.clearMouseListeners();
                                                            for (let selectedTrack of graph.track) {
                                                                if (selectedTrack.isSelected()) {
                                                                    let seqLength = selectedTrack.sequence.length;
                                                                    let seq = selectedTrack.sequence;
                                                                    let seqName = selectedTrack.name;
                                                                    let selectedTrackstrand = selectedTrack.strand;
                                                                    let tgraph = selectedTrack.tgraph;

                                                                    setTimeout(async () => {
                                                                        let chemistryObject = graph.props.selected_chemistry;
                                                                        let base_count = Biopolymer.countBases(chemistryObject);
                                                                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                                        CurrentLayout.setComponent('buttonMenuPanel', w);
                                                                        let engineMonitor = new EngineMonitor((msg) => {
                                                                        });
                                                                        engineMonitor.addProgressListener(async (v) => {
                                                                            progressBar(v);
                                                                        })

                                                                        function pause(milliseconds) {
                                                                            return new Promise(resolve => setTimeout(resolve, milliseconds));
                                                                        }

                                                                        let threshold = 0.70
                                                                        let va = await prompt("Threshold", ["Threshold"], { "Threshold": threshold }, 300, 300)
                                                                        let m = va['Threshold']
                                                                        if (m === null) {
                                                                            threshold = 0.75
                                                                        } else {
                                                                            threshold = parseFloat(m);
                                                                        }
                                                                        let r = await exec('py/baja/secondary-structure/energy-window.py', engineMonitor, seq, base_count, threshold);

                                                                        let sequence = selectedTrack.getSequence();
                                                                        let xi = selectedTrack.tgraph.xi

                                                                        let t = await selectedTrack.createSecondaryStructure(xi, sequence, seqName, engineMonitor)

                                                                        t.tgraph.yi = selectedTrack.tgraph.yi
                                                                        t.anchorY = selectedTrack.tgraph.yi;

                                                                        for (let oligo of r['results']) {
                                                                            let bioObject = {
                                                                                'targetSequence': oligo.seq,
                                                                                'trackName': seqName,
                                                                                'startIndex': oligo.pos,
                                                                                'y': (tgraph.ymin) + 0.1,
                                                                                'endIndex': oligo.pos + oligo.seq.length,
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

                                                                        setTimeout(async () => {
                                                                            await exec('baja/screens/menu/compound-editor.js', graph, genegraph_panel_layout)
                                                                            exec('baja/screens/menu/simple-info-panel.js', graph, genegraph_panel_layout, 'Menus for creating compounds...')
                                                                        }, 1000)

                                                                    }, 1000)
                                                                }
                                                            }
                                                        }, `Generate secondary structure? (${sequenceLength}bp)`)
                                                        showModal(confirm)

                                                    })
                                                })
                                            },
                                            {

                                                'label': 'Selected sequence secondary structure', 'ionfunction': createIonFunction(async () => {

                                                    if (!graph.props.selected_chemistry) {
                                                        infoPrompt ( " Please select a chemistry... [Tools][Chemistry]")
                                                        return;
                                                    }
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
                                                    let selseq = []
                                                    for (let selectedTrack of graph.track) {
                                                        let selected_sequence = selectedTrack.getHighlightedSequence();
                                                        if (selected_sequence != null && selected_sequence.length > 0) {
                                                            selseq.push(selected_sequence);
                                                        }
                                                    }
                                                    if (selseq.length <= 0) {
                                                        console.log('debubg');

                                                        graph.setMessage(" Select a sequence on a track first.")
                                                        await exec('baja/screens/menu/sequence.js', graph, genegraph_panel_layout, false)
                                                        infoPrompt("Please select a sequence on a track first")
                                                        return;
                                                    }

                                                    let threshold = 0.70
                                                    let va = await prompt("Threshold", ["Threshold"], { "Threshold": threshold }, 300, 300)
                                                    let m = va['Threshold']
                                                    if (m === null) {
                                                        threshold = 0.75
                                                    } else {
                                                        threshold = parseFloat(m);
                                                    }

                                                    for (let selectedTrack of graph.track) {

                                                        let sequence = selectedTrack.getHighlightedSequence();
                                                        let xi = selectedTrack.markstart - selectedTrack.tgraph.xi

                                                        let seqLength = selectedTrack.sequence.length;
                                                        let seq = selectedTrack.getHighlightedSequence();
                                                        let seqName = selectedTrack.name;
                                                        let selectedTrackstrand = selectedTrack.strand;
                                                        let tgraph = selectedTrack.tgraph;
                                                        if (sequence != null && sequence.length > 0) {

                                                            let em = new EngineMonitor ( ( msg ) => {

                                                            } )
                                                            let t = await selectedTrack.createSecondaryStructure(xi, sequence, selectedTrack.name, em)
                                                            t.anchorX = selectedTrack.markstart;
                                                            t.xindex_start = selectedTrack.markstart;
                                                            t.tgraph.yi = selectedTrack.tgraph.yi
                                                            t.anchorY = selectedTrack.tgraph.yi;

                                                            setTimeout(async () => {
                                                                let chemistryObject = graph.props.selected_chemistry;
                                                                let base_count = Biopolymer.countBases(chemistryObject);
                                                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                                CurrentLayout.setComponent('buttonMenuPanel', w);
                                                                let engineMonitor = new EngineMonitor((msg) => {
                                                                });
                                                                engineMonitor.addProgressListener(async (v) => {
                                                                    progressBar(v);
                                                                })

                                                                function pause(milliseconds) {
                                                                    return new Promise(resolve => setTimeout(resolve, milliseconds));
                                                                }

                                                                let r = await exec('py/baja/secondary-structure/energy-window.py', engineMonitor, seq, base_count, threshold);

                                                                for (let oligo of r['results']) {
                                                                    let bioObject = {
                                                                        'targetSequence': oligo.seq,
                                                                        'trackName': seqName,
                                                                        'startIndex': (selectedTrack.markstart + oligo.pos),
                                                                        'y': (tgraph.ymin),
                                                                        'endIndex': selectedTrack.markstart + oligo.pos + oligo.seq.length,
                                                                        'strand': selectedTrackstrand,
                                                                    }
                                                                    let anno = await Biopolymer.generateCompound(chemistryObject, bioObject)
                                                                    selectedTrack.addOligo(anno)
                                                                    await pause(50);

                                                                }

                                                                let w2 = {
                                                                    wid: 'html',
                                                                    data: ` <b> secondary structure opt complete </b>`
                                                                }

                                                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                                CurrentLayout.setComponent('buttonMenuPanel', w2);
                                                                setTimeout(() => {

                                                                    exec('baja/screens/menu/compound-editor.js', graph, genegraph_panel_layout)
                                                                    exec('baja/screens/menu/simple-info-panel.js', graph, genegraph_panel_layout, 'Menus for creating compounds...')

                                                                }, 1000)

                                                            }, 1000)
                                                        }
                                                    }
                                                })
                                            }

                                        ]
                                    },
                                    {
                                        'label': 'IDT', 'items': [
                                            {
                                                'label': 'Order oligos...', 'ionfunction': createIonFunction(async () => {
                                                    infoPrompt(" This feature is coming soon...")
                                                }),
                                            }, {

                                                'label': 'Order primer probes...', 'ionfunction': createIonFunction(async () => {
                                                    infoPrompt(" This feature is coming soon...")

                                                })

                                            },
                                            {

                                                'label': 'Download IDT codes', 'ionfunction': createIonFunction(async () => {
                                                    let idt = await exec('baja/chem/structure/idt/idt-format.js');

                                                    graph.setMessage(' Downloading csv... ')

                                                    let explist = []
                                                    for (let t of graph.track) {
                                                        let row = 0;
                                                        let __index = 0;
                                                        for (let o of t.oligos) {
                                                            if (__index > 12) {
                                                                __index = 0;
                                                            }
                                                            let well = String.fromCharCode(65 + 8 - __index) + '' + row
                                                            if (o && o.structure && o.id) {
                                                                explist.push({
                                                                    'well': well,
                                                                    'id': o.id,
                                                                    'idt': idt.format(o.structure)
                                                                })
                                                            }
                                                            __index++;
                                                        }
                                                        row++;
                                                    }
                                                    downloadAsCsv(explist, 'idt-' + graph.file + '.csv')
                                                })
                                            }
                                        ]
                                    }, {
                                        'label': 'Select', 'items': [
                                            {
                                                'label': 'Sequence..', 'ionfunction': createIonFunction(async () => {
                                                    await exec('baja/screens/menu/sequence.js', graph, genegraph_panel_layout, false)
                                                })
                                            },
                                            {
                                                'label': 'Compound...', 'ionfunction': createIonFunction(async () => {

                                                    graph.clearMouseListeners();
                                                    graph.selectOff();

                                                    graph.addMouseMoveListener((x, y) => {

                                                        if (!graph.highlight_features)
                                                            for (let t of graph.track) {
                                                                for (let o of t.oligos) {
                                                                    o.highlight__ = false
                                                                }
                                                            }
                                                        graph.highlightTrackCoords(x, y);
                                                        let oligos = graph.getStructure(x, y);
                                                        if (oligos && oligos.length) {
                                                            for (let oligo of oligos) {
                                                                if (oligo && oligo.length > 0) {
                                                                    for (let o of oligo) {
                                                                        if (o.highlight != null && o.structure != null) {
                                                                            try {
                                                                                console.log(' id ' + o.id)
                                                                                o.highlight(-1, 'orange')
                                                                                if (graph.highlight)
                                                                                    graph.highlight(o.id, -1, 'gray')
                                                                            } catch (ecx) {

                                                                            }
                                                                        }
                                                                    }

                                                                }

                                                            }
                                                        }
                                                    })

                                                    graph.addMouseDownListener((x, y) => {
                                                        let structures = graph.getStructure(x, y)
                                                        let trackIndex = graph.getTrack(x, y);
                                                        if (trackIndex >= 0) {
                                                            selectedTrack = graph.track[trackIndex]
                                                            selectedTrack.select();
                                                        }
                                                        if (!structures || structures.length <= 0) {
                                                            return
                                                        }
                                                        for (let str of structures) {
                                                            if (str && str.length > 0) {
                                                                for (let s of str) {

                                                                    s.setSelected(!s.selected)
                                                                }
                                                            }
                                                        }
                                                    })
                                                })
                                            },
                                            {
                                                'label': 'All compounds', 'ionfunction': createIonFunction(async () => {
                                                    for (let t of graph.track) {
                                                        for (let o of t.oligos) {
                                                            o.select();
                                                        }
                                                    }
                                                })
                                            },
                                        ]
                                    },

                                    {
                                        'label': 'Edit', 'items': [
                                            {
                                                'label': 'Single', 'ionfunction': createIonFunction(async () => {
                                                    await exec('baja/screens/menu/select-structure-simple.js', graph, genegraph_panel_layout)
                                                })

                                            },

                                            {

                                                'label': 'Group', 'ionfunction': createIonFunction(async () => {

                                                    await exec('baja/screens/select-compounds.js', graph, genegraph_panel_layout)

                                                })
                                            },

                                            {
                                                'label': 'Paste', 'ionfunction': createIonFunction(() => {

                                                    graph.setMouseMode('navigate')

                                                    let list = [
                                                        {
                                                            label: 'Sequences onto all tracks', click: async () => {
                                                                graph.setMessage('...')
                                                                let paste_sequences_panel = await exec('baja/chem/paste-sequences-nochem.js', graph, genegraph_panel_layout)
                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', paste_sequences_panel);

                                                            }
                                                        },
                                                        {
                                                            label: 'Compounds onto a track', click: () => {
                                                                graph.setMessage("Click on the track you want to paste onto and type CTR+v")
                                                                graph.setMouseMode('navigate')
                                                                graph.addMouseDownListener((x, y) => {
                                                                    let trackIndex = graph.getTrack(x, y);
                                                                    if (trackIndex >= 0) {
                                                                        let cselectedTrack = graph.track[trackIndex]
                                                                        if (cselectedTrack) {
                                                                            cselectedTrack.highlight()
                                                                            graph.setPasteFunction((e) => {
                                                                                var imgs = e.clipboardData.items;
                                                                                for (var i = 0; i < imgs.length; i++) {
                                                                                    if (imgs[i].type.indexOf("text/plain") >= 0) {
                                                                                        imgs[i].getAsString(async (s) => {
                                                                                            s = s.trim();
                                                                                            console.log('debubg');

                                                                                        })
                                                                                    } else {
                                                                                        console.log(imgs[i].type)
                                                                                    }
                                                                                }
                                                                            })
                                                                        }
                                                                    }
                                                                    setTimeout(() => {
                                                                        graph.setPasteFunction(null)
                                                                    }, 5000)
                                                                })
                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                            }
                                                        },
                                                        {
                                                            label: '% inhibition table onto all tracks', click: () => {
                                                                graph.setMessage(" Currently not implemented ")
                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                            }
                                                        },
                                                    ]
                                                    let names = list.map(obj => obj.label);
                                                    let t = {
                                                        wid: 'selection-list',
                                                        data: {
                                                            single_selection: true,
                                                            show_button: false,
                                                            singleSelect: true,
                                                            listItems: names,
                                                            button_function: createIonFunction(async (items) => {

                                                                let name = items[0]
                                                                for (let l of list) {
                                                                    if (l.label === name) {
                                                                        l.click()
                                                                    }
                                                                }

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

                                                })
                                            },

                                            {
                                                'label': 'Remove duplicates', 'ionfunction': createIonFunction(() => {

                                                    graph.setMouseMode('navigate')
                                                    graph.setMessage(' Removing duplicates on each track ')

                                                    for (let track of graph.track) {
                                                        track.oligos = track.oligos.filter((oligo, index, array) => {
                                                            return array.findIndex(t => t.sequence === oligo.sequence) === index;
                                                        });
                                                    }
                                                })
                                            },
                                            {
                                                'label': 'Remove by...', 'ionfunction': createIonFunction(async () => {

                                                    await exec('baja/screens/menu/annotation/filter-compounds-panel.js', graph, genegraph_panel_layout)

                                                })
                                            },

                                            {
                                                'label': 'Remove All', 'ionfunction': createIonFunction(async () => {

                                                    let confirm = await exec('baja/lib/confirm-widget.js', async () => {
                                                        graph.setMessage("Removing all compounds on the graph. ")

                                                        for (let t of graph.track) {
                                                            t.oligos = []
                                                        }
                                                    })
                                                    showModal(confirm)

                                                })
                                            }, {
                                                'label': 'Modify all...(advanced)', 'ionfunction': createIonFunction(async () => {
                                                    console.log('debubg');
                                                    let Biopolymer = await exec('baja/chem/biopolymer.js');

                                                    let menuList = [
                                                        {
                                                            label: 'Reset default synthesis sequence',
                                                            click: () => {
                                                                let si = {}
                                                                let tracks = graph.track;
                                                                for (let t of tracks) {
                                                                    for (let o of t.oligos) {
                                                                        if (t.strand < 0) {
                                                                            o.synthesisSequence = Biopolymer.comp(o.sequence)
                                                                        } else {
                                                                            o.synthesisSequence = Biopolymer.reverseComp(o.sequence)
                                                                        }

                                                                        si[o.id] = o.synthesisSequence

                                                                    }
                                                                }

                                                                let review_panel = {
                                                                    wid: 'card',
                                                                    componentRef: 'bottomPanel',
                                                                    data: {
                                                                        height: '800px',
                                                                        cards: [
                                                                            [
                                                                                {
                                                                                    'title': ' ', 'body': ``
                                                                                    ,
                                                                                    'width': '90%',
                                                                                    'component':
                                                                                    {
                                                                                        wid: 'html',
                                                                                        data: '<font color=blue> Saved </font>'
                                                                                    }
                                                                                },
                                                                                {
                                                                                    'title': '',
                                                                                    'width': '100%',
                                                                                    'component': {
                                                                                        wid: 'mt-button', data: {
                                                                                            buttons: [
                                                                                                {
                                                                                                    label: 'OK', ionFunction: createIonFunction(async () => {
                                                                                                        CurrentLayout.clearComponent('mainPanel')
                                                                                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                                                    })
                                                                                                },
                                                                                            ]
                                                                                        }
                                                                                    }
                                                                                }
                                                                            ]]
                                                                    }
                                                                }
                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', review_panel);
                                                            },
                                                            move: () => {
                                                            }

                                                        },{
								label: "Re-number compounds", click: async ( xwc, ywc ) => {
									                        graph.setMessage('Edit properties of all compounds')
									                        let editPanel = await exec('baja/screens/menu/compound-editor-panel-all.js', graph, genegraph_panel_layout)
									                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
									                        CurrentLayout.setComponent('buttonMenuPanel', editPanel);

							}},
                                                        {
                                                            label: 'Modify chemistry',
                                                            click: async (xwc, ywc) => {
                                                                exec('baja/chem/ui/modify-chemistry-panel', graph)
                                                            }
                                                        },
                                                        {
                                                            label: 'Modify properties',
                                                            click: async (xwc, ywc) => {
                                                                exec('baja/chem/ui/modify-properties-panel.js', graph, genegraph_panel_layout)
                                                            }
                                                        },
                                                    ]
                                                    graph.showWindowMenu(menuList, 10, 10, 200);

                                                })
                                            },

                                        ]
                                    }
                                ]
                            }
                        }
                    },

                ]
            ]
        }
    }
    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
    CurrentLayout.setComponent('buttonMenuPanel', bpanel);
}
