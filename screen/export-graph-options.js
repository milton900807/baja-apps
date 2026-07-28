function (graph, genegraph_panel_layout) {

    let editor_;
    let selectPanel = createIonFunction((editor) => {
        editor_ = editor;
    })
    let showMainScreen = async () => {
        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

    }
    graph.setMessage("Export options.", 200, 40)
    const ASOS_CHEMISTRY = 'ASOs w/ chemistry';
    const ASO_SEQUENCES = 'ASO sequences';
    const ASOS_IDT_CODES = 'ASOs w/ IDT codes';
    const PRIMER_PROBE_SEQUENCES = 'Primer-probe sequences';
    const JSON_GRAPH = 'JSON graph';
    const TRACKS_BED_FILES = 'Tracks as bed files';

    const designs = [

        ASO_SEQUENCES,
        ASOS_IDT_CODES,
        PRIMER_PROBE_SEQUENCES,
        JSON_GRAPH,
        TRACKS_BED_FILES
    ];

    const checkString = async (inputString) => {
        if (inputString === ASOS_CHEMISTRY) {
            console.log("The input string is 'ASOs w/ chemistry'.");

        } else if (inputString === ASO_SEQUENCES) {

            const columns = ['ID', 'Name', 'Xi', 'Xf', 'Synthesis_Sequence', 'Sequence', 'Structure'];

            let oligos = []
            for (let t of graph.track) {
                if (t.oligos && t.oligos.length)
                    oligos = oligos.concat(t.oligos);
            }
            const data = oligos.map(oligo => [
                oligo.id,
                oligo.name,
                oligo.xi,
                oligo.xf,
                oligo.synthesisSequence,
                oligo.sequence,
                oligo.structure
            ]);

            const csvContent = [
                columns.join(','),
                ...data.map(row => row.join(','))
            ].join('\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = graph.file + '_asos_.csv';
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            console.log("The input string is 'ASO sequences'.");

            console.log("The input string is 'ASO sequences'.");
        } else if (inputString === ASOS_IDT_CODES) {

        } else if (inputString === PRIMER_PROBE_SEQUENCES) {
            console.log("The input string is 'Primer-probe sequences'.");

            let ampliconList = [];

            for (let t of graph.track) {
                for (let o of t.oligos) {
                    console.log(" oligo type " + o.type);
                    if (o.type === 'amplicon') {

                        if (o.left && o.mid && o.right) {

                            ampliconList.push({
                                'left': o.left.synthesisSequence,
                                'probe': o.mid.synthesisSequence,
                                'right': o.right.synthesisSequence
                            });

                        } else if (o.left && o.right) {

                            ampliconList.push({
                                'left': o.left.synthesisSequence,
                                'probe': 'No probe',
                                'right': o.right.synthesisSequence
                            });

                        }
                    }
                }
            }

            if (ampliconList.length <= 0) {
                alert('No Amplicon oligos to export');
                return;
            }

            let csvContent = 'left,probe,right\n';

            for (let amplicon of ampliconList) {
                csvContent += `${amplicon.left},${amplicon.mid},${amplicon.right}\n`;
            }

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = graph.file + '_ppsets_.csv';
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            console.log("The input string is 'ASO sequences'.");

        } else if (inputString === JSON_GRAPH) {

            console.log("The input string is 'JSON graph'.");
        } else if (inputString === TRACKS_BED_FILES) {

            console.log("The input string is 'Tracks as bed files'.");
        } else {

            console.log("The input string does not match any of the specified strings.");
        }
    };

    let content = {
        'Tracks as bed files': ''

    }

    let c1 = {
        wid: 'card',
        data: {

            'style.padding-left': '12px',
            cards: [
                [
                    {
                        'title': '',
                        width: '100%',

                        'body': `  `, 'component':
                        {
                            wid: 'selection-list',
                            width: '100%',
                            refCallback: selectPanel,
                            data: {
                                listItems: designs,
                                contentItems: content,
                                single_selection: true,
                                show_button: false,
                                singleSelect: true,
                                button_function: createIonFunction(async (items) => {
                                    let name = items[0]
                                    checkString(name)

                                })
                            }
                        }
                    },

                ], [

                    {
                        'title': '',
                        'width': '100%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Close', ionFunction: createIonFunction(async () => {
                                            graph.runfun(() => {

                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                            })

                                        })
                                    },
                                ]
                            }
                        }
                    }

                ]
            ]
        }
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
                                        'label': 'Export primer/probe sequences', 'items': [
                                            {
                                                'label': 'Draw compound on track', 'ionfunction': createIonFunction(async () => {
                                                    if (!graph.props.selected_chemistry) {
                                                        infoPrompt(" Please select a chemistry... [Tools][Chemistry]")
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
                                                        infoPrompt(" Please select a chemistry... [Tools][Chemistry]")
                                                        return;
                                                    }

                                                    graph.pushOntoHistory()

                                                    graph.clearMouseListeners();
                                                    graph.setMessage('Select a point on a track')
                                                    exec('baja/screens/menu/paint-oligos.js', graph)
                                                }),
                                            }, {

                                                'label': 'Tile across selected sequence...', 'ionfunction': createIonFunction(async () => {

                                                    if (!graph.props.selected_chemistry) {
                                                        infoPrompt(" Please select a chemistry.")
                                                        return;
                                                    }
                                                    graph.pushOntoHistory()
                                                    setTimeout(async () => {

                                                        exec('baja/screens/menu/sequence.js', graph, genegraph_panel_layout, true)
                                                        for (let track of graph.track) {
                                                            if (track.markend > track.markstart) {
                                                                let currentSequence = track.getHighlightedSequence();
                                                                if (graph.props.selected_chemistry === undefined) {
                                                                    graph.setMessage(" No chemistry selected ")
                                                                    return;
                                                                }
                                                                if (currentSequence != null && currentSequence.length > 0) {

                                                                    let menuList = await exec('baja/screens/menu/compound-menu-list.js', track, graph, genegraph_panel_layout)
                                                                    await graph.showWindowMenu(menuList, 10, 10, 200);
                                                                }
                                                            }
                                                        }

                                                    }, 100)
                                                })

                                            }, {

                                                'label': 'Tile on annotations', 'ionfunction': createIonFunction(async () => {

                                                    graph.setMessage(" Select a track for compound tiling operation.")
                                                    graph.deselectAllTracks();
                                                    graph.pushOntoHistory()
                                                    graph.clearMouseListeners();
                                                    graph.addMouseMoveListener(async (x, y) => {
                                                        let trackIndex = graph.getTrack(x, y);
                                                        if (trackIndex >= 0) {
                                                            let selectedTrack = graph.track[trackIndex]
                                                            if (selectedTrack) {
                                                                selectedTrack.select();
                                                                graph.clearMouseListeners();

                                                                exec('baja/screens/menu/tile-on-annotation.js', graph, genegraph_panel_layout, selectedTrack)
                                                            }
                                                        }
                                                    });
                                                })

                                            },
                                            {

                                                'label': 'Tile on secondary structure', 'ionfunction': createIonFunction(async () => {

                                                    if (!graph.props.selected_chemistry) {
                                                        infoPrompt(" Please select a chemistry... [Tools][Chemistry]")
                                                        return;
                                                    }
                                                    graph.pushOntoHistory()

                                                    graph.clearMouseListeners();

                                                    graph.addMouseDownListener(async (x, y) => {

                                                        let trackIndex = graph.getTrack(x, y);
                                                        if (trackIndex >= 0) {
                                                            selectedTrack = graph.track[trackIndex]
                                                            if (selectedTrack) {
                                                                selectedTrack.select();
                                                                selectedTrack.markstart = selectedTrack.tgraph.xmin;
                                                                selectedTrack.markend = selectedTrack.tgraph.xmax;
                                                            }
                                                        }

                                                        if (!graph.props.selected_chemistry) {
                                                            infoPrompt(" Please select a chemistry... [Tools][Chemistry]")
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

                                                            graph.setMessage("Select a sequence")
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

                                                                let engineMonitor = new EngineMonitor((msg) => {

                                                                })
                                                                let t = await selectedTrack.createSecondaryStructure(xi, sequence, selectedTrack.name, engineMonitor)
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
                                                })
                                            },
                                            {

                                                'label': 'Selected sequence secondary structure', 'ionfunction': createIonFunction(async () => {

                                                    if (!graph.props.selected_chemistry) {
                                                        infoPrompt(" Please select a chemistry... [Tools][Chemistry]")
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
                                                        graph.setMessage(">Select a sequence on a track first.")
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

                                                            let engineMonitor = new EngineMonitor((msg) => {

                                                            })
                                                            let t = await selectedTrack.createSecondaryStructure(xi, sequence, selectedTrack.name, engineMonitor)
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
                                        'label': 'Database', 'items': [
                                            {
                                                'label': 'Register...', 'ionfunction': createIonFunction(async () => {
                                                    let confirm = await exec('baja/lib/confirm-widget.js', async () => {
                                                        const dbhost = window["env"]["db"];
                                                        if (!dbhost) {
                                                            infoPrompt("Registration database is not connected.... ")
                                                            return;
                                                        }
                                                        let results = [];
                                                        for (let t of graph.track) {
                                                            let oligos = t.oligos;
                                                            if (oligos && oligos.length > 0) {
                                                                for (let i = 0; i < oligos.length; i += 20) {
                                                                    let batch = oligos.slice(i, i + 20).map(o => ({
                                                                        id: o.id,
                                                                        synthesisSequence: o.synthesisSequence,
                                                                        sequence: o.sequence,
                                                                        structure: o.structure
                                                                    }));

                                                                    if (batch != null && batch.length > 0) {

                                                                        let _r = await POSTJSON(batch, `${dbhost}/register`);
                                                                        let r = Object.keys(_r);
                                                                        for (let rk of r) {
                                                                            let res = _r[rk];
                                                                            for (let o of batch) {
                                                                                let k = `${o.synthesisSequence}-${o.structure}`;
                                                                                if (rk == k) {
                                                                                    o.id = res['id'];
                                                                                    results.push(res);
                                                                                }
                                                                                o.showId = true;
                                                                            }
                                                                        }
                                                                        showModal({
                                                                            wid: 'json',
                                                                            data: JSON.stringify(_r)
                                                                        });
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }, "Register all compounds?")
                                                    showModal(confirm)
                                                })

                                            },
                                            {
                                                'label': 'Order oligos...', 'ionfunction': createIonFunction(async () => {
                                                    infoPrompt(" This feature is coming soon...")
                                                }),
                                            }, {

                                                'label': 'Order primer probes...', 'ionfunction': createIonFunction(async () => {
                                                    infoPrompt(" This feature is coming soon...")

                                                })

                                            }
                                        ]

                                    },

                                    {
                                        'label': 'Synthesis', 'items': [
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
                                    },
                                    {
                                        'label': 'Edit', 'items': [
                                            {

                                                'label': 'Select Group', 'ionfunction': createIonFunction(async () => {
                                                    graph.setMouseMode(null)
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
                                                'label': 'Modify all compounds (advanced)', 'ionfunction': createIonFunction(async () => {
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

                                                        },
                                                        {
                                                            label: 'Modify chemistry',
                                                            click: async (xwc, ywc) => {
                                                                exec('baja/chem/ui/modify-chemistry-panel', graph, genegraph_panel_layout)
                                                            }
                                                        }, {
                                                            label: 'Re-index ids',
                                                            click: async (xwc, ywc) => {

                                                                graph.setMessage('Re-id the oligos.')
                                                                let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to re-number all the oligos.  Continue?', async () => {
                                                                    let index = 1;
                                                                    for (let t of graph.track) {
                                                                        for (let o of t.oligos) {
                                                                            o.id = index++
                                                                        }
                                                                    }
                                                                    CurrentLayout.setComponent('mainPanel', review_panel);
                                                                })

                                                                showModal(confirm)

                                                            }
                                                        },

                                                        {
                                                            label: 'Modify properties',
                                                            click: async (xwc, ywc) => {

                                                                exec('baja/chem/ui/modify-properties-panel', graph, genegraph_panel_layout)
                                                            }
                                                        },
                                                    ]
                                                    graph.showWindowMenu(menuList, 10, 10, 200);

                                                })
                                            },

                                        ]
                                    },
                                    {
                                        'label': 'Show/hide', 'items': [
                                            {

                                                'label': 'Show IDs', 'ionfunction': createIonFunction(async () => {
                                                    for (let t of graph.track) {
                                                        let oligos = t.oligos;
                                                        if (oligos && oligos.length > 0) {
                                                            for (let o of oligos) {
                                                                o.showId = true;
                                                            }
                                                        }
                                                    }
                                                })
                                            },
                                            {

                                                'label': 'Hide IDs', 'ionfunction': createIonFunction(async () => {
                                                    for (let t of graph.track) {
                                                        let oligos = t.oligos;
                                                        if (oligos && oligos.length > 0) {
                                                            for (let o of oligos) {
                                                                o.showId = false;
                                                            }
                                                        }
                                                    }
                                                })
                                            },
                                            {

                                                'label': 'Off-targets', 'ionfunction': createIonFunction(async () => {
                                                    for (let t of graph.track) {
                                                        let oligos = t.oligos;
                                                        if (oligos && oligos.length > 0) {
                                                            for (let o of oligos) {
                                                                o.showOfftargets = !o.showOfftargets;
                                                            }
                                                        }
                                                    }

                                                })
                                            }

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
    CurrentLayout.clearComponent('mainPanel')
    CurrentLayout.setComponent('mainPanel', c1);

}
