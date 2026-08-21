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

    // ---- selection helpers for the "Select" menu -------------------------------
    const allOligos = () => {
        const out = [];
        for (const t of graph.track) for (const o of (t.oligos || [])) out.push(o);
        return out;
    };
    // Off-target count: o.offtarget is an array of hits, a string count (when the
    // hit list was too large to enumerate), or null.
    const offCount = (o) => {
        const v = o && o.offtarget;
        if (v == null) return 0;
        if (Array.isArray(v)) return v.length;
        const n = parseInt(v, 10);
        return isNaN(n) ? 0 : n;
    };
    const hasOff = (o) => offCount(o) > 0 || (Array.isArray(o.offtargetsymbols) && o.offtargetsymbols.length > 0);
    // Apply a predicate to every oligo, setting o.selected, then reflect the
    // change in the selection window (true selection, not just a highlight).
    const applySelect = (pred) => {
        for (const o of allOligos()) o.selected = !!pred(o);
        if (graph.syncSelectionWindow) graph.syncSelectionWindow();
        else if (graph.wake) graph.wake();
    };
    // Numeric input via the app's modal prompt; returns null on cancel/invalid.
    const numField = async (title, field, def) => {
        const res = await prompt(title, [field], { [field]: def }, 340, 200);
        if (!res) return null;
        const v = parseFloat(res[field]);
        return isNaN(v) ? null : v;
    };

    // ---- Off-target menu helpers ----------------------------------------------
    const isSiRNA = (o) => !!(o && (o.type === 'siRNA' || o.designType === 'sirna' || o.guide || o.sense));
    // An oligo counts as selected whether it was marked via o.selected or via the
    // highlight path (o.highlight__), so "Off-targets: selected" reliably appears
    // whenever oligos are selected on the canvas.
    const selectedOligos = () => allOligos().filter((o) => o.selected || o.highlight__);
    const runOff = (list, opts) => {
        if (!list || !list.length) { graph.setMessage(' No oligos to run off-targets on. '); return; }
        try { window.current = list[0]; } catch (e) { }
        exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout, list, opts);
    };
    // Normal off-targets for selected / all; plus seed-sequence off-targets when
    // any siRNA-style oligos are present.
    const anySelected = selectedOligos().length > 0;
    const offTargetItems = [];
    // Only offer the "selected" scope when something is actually selected.
    if (anySelected) {
        offTargetItems.push({ 'label': 'Off-targets: selected', 'ionfunction': createIonFunction(() => { runOff(selectedOligos()); }) });
    }
    offTargetItems.push({ 'label': 'Off-targets: all', 'ionfunction': createIonFunction(() => { runOff(allOligos()); }) });
    // Seed-sequence off-targets: offered when the SELECTED compounds contain siRNA
    // (selected scope), and when any compound is siRNA (all scope).
    if (anySelected && selectedOligos().some(isSiRNA)) {
        offTargetItems.push({ 'label': 'Seed-sequence off-targets: selected (siRNA)', 'ionfunction': createIonFunction(() => { runOff(selectedOligos().filter(isSiRNA), { seed: true }); }) });
    }
    if (allOligos().some(isSiRNA)) {
        offTargetItems.push({ 'label': 'Seed-sequence off-targets: all (siRNA)', 'ionfunction': createIonFunction(() => { runOff(allOligos().filter(isSiRNA), { seed: true }); }) });
    }
    // Download oligos + genomic coordinates + off-target hits as CSV. Scope is
    // spelled out in the label — "selected" only when something is selected,
    // "all" always available.
    if (anySelected) {
        offTargetItems.push({ 'label': 'Download off-targets (CSV): selected', 'ionfunction': createIonFunction(() => { exec('baja/manchester/menu/download-off-targets.js', graph, genegraph_panel_layout, selectedOligos()); }) });
    }
    offTargetItems.push({ 'label': 'Download off-targets (CSV): all', 'ionfunction': createIonFunction(() => { exec('baja/manchester/menu/download-off-targets.js', graph, genegraph_panel_layout, allOligos()); }) });
    // Offer filtering once some oligos on the tracks actually have off-targets.
    if (allOligos().some(hasOff)) {
        offTargetItems.push({ 'label': 'Filter by off-targets…', 'ionfunction': createIonFunction(() => { exec('baja/manchester/menu/annotation/filter-compounds-panel.js', graph, genegraph_panel_layout); }) });
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
                                        'label': 'New', 'items': [
                                            {
                                                'label': 'Draw compound on track', 'ionfunction': createIonFunction(async () => {

                                                    if (!graph.props.selected_chemistry) {
                                                        infoPrompt(" Please select a chemistry... [Tools][Chemistry]")
                                                        return;
                                                    }

                                                    graph.setMouseMode('navigate')
                                                    graph.setMessage('Select location on track')
                                                    await exec('baja/manchester/menu/draw-oligos.js', graph)
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
                                                    exec('baja/manchester/menu/paint-oligos.js', graph)
                                                }),
                                            }, {

                                                'label': 'Tile across selected sequence...', 'ionfunction': createIonFunction(async () => {

                                                    if (!graph.props.selected_chemistry) {
                                                        infoPrompt(" Please select a chemistry.")
                                                        return;
                                                    }
                                                    graph.pushOntoHistory()
                                                    setTimeout(async () => {

                                                        exec('baja/manchester/menu/sequence.js', graph, genegraph_panel_layout, true)
                                                        for (let track of graph.track) {
                                                            if (track.markend > track.markstart) {
                                                                let currentSequence = track.getHighlightedSequence();
                                                                if (graph.props.selected_chemistry === undefined) {
                                                                    graph.setMessage(" No chemistry selected ")
                                                                    return;
                                                                }
                                                                if (currentSequence != null && currentSequence.length > 0) {

                                                                    let menuList = await exec('baja/manchester/menu/compound-menu-list.js', track, graph, genegraph_panel_layout)
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

                                                                exec('baja/manchester/menu/tile-on-annotation.js', graph, genegraph_panel_layout, selectedTrack)
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
                                                            console.log('debubg');
                                                            graph.setMessage(" Select a sequence on a track first.")
                                                            await exec('baja/manchester/menu/sequence.js', graph, genegraph_panel_layout, false)
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

                                                                        exec('baja/manchester/menu/compound-editor.js', graph, genegraph_panel_layout)

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
                                                    console.log('debubg');
                                                    if (selseq.length <= 0) {
                                                        graph.setMessage(" Select a sequence on a track first.")
                                                        await exec('baja/manchester/menu/sequence.js', graph, genegraph_panel_layout, false)
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

                                                                    exec('baja/manchester/menu/compound-editor.js', graph, genegraph_panel_layout)

                                                                }, 1000)

                                                            }, 1000)
                                                        }
                                                    }
                                                })
                                            },
                                            {
                                                'label': 'Primer-probe', 'ionfunction': createIonFunction(async () => {
                                                    await exec('baja/manchester/menu/primer-probe-action.js', graph, genegraph_panel_layout)
                                                })
                                            },
                                            {
                                                'label': 'Design by rules (tile & score)', 'ionfunction': createIonFunction(() => {
                                                    // Prompt (center menu) for the scope of the rule-based design.
                                                    graph.showMenu([
                                                        {
                                                            label: 'Design on all tracks', move: () => { },
                                                            click: () => { graph.hideMenu(); exec('baja/manchester/menu/design-all-transcripts.js', graph, genegraph_panel_layout); }
                                                        },
                                                        {
                                                            label: 'Let me select the track', move: () => { },
                                                            click: () => { graph.hideMenu(); exec('baja/manchester/menu/tile-oligos-design.js', graph, genegraph_panel_layout); }
                                                        },
                                                    ], 0, 0, 320);
                                                })
                                            }

                                        ]
                                    },
                                    {
                                        'label': 'Select', 'items': [
                                            {
                                                'label': 'Select all', 'ionfunction': createIonFunction(() => {
                                                    applySelect(() => true); graph.setMessage(' Selected all compounds. ');
                                                })
                                            },
                                            {
                                                'label': 'Deselect all', 'ionfunction': createIonFunction(() => {
                                                    applySelect(() => false); graph.setMessage(' Deselected all compounds. ');
                                                })
                                            },
                                            {
                                                'label': 'Invert selection', 'ionfunction': createIonFunction(() => {
                                                    for (const o of allOligos()) o.selected = !o.selected;
                                                    if (graph.syncSelectionWindow) graph.syncSelectionWindow();
                                                    else if (graph.wake) graph.wake();
                                                    graph.setMessage(' Inverted selection. ');
                                                })
                                            },
                                            {
                                                'label': 'Select with off-targets', 'ionfunction': createIonFunction(() => {
                                                    applySelect(hasOff); graph.setMessage(' Selected compounds with off-targets. ');
                                                })
                                            },
                                            {
                                                'label': 'Select without off-targets', 'ionfunction': createIonFunction(() => {
                                                    applySelect((o) => !hasOff(o)); graph.setMessage(' Selected compounds with no off-targets. ');
                                                })
                                            },
                                            {
                                                'label': 'Select by off-target count ≥…', 'ionfunction': createIonFunction(async () => {
                                                    const n = await numField('Minimum off-target count', 'Min', 1);
                                                    if (n == null) return;
                                                    applySelect((o) => offCount(o) >= n);
                                                    graph.setMessage(' Selected compounds with ≥ ' + n + ' off-targets. ');
                                                })
                                            },
                                            {
                                                'label': 'Select by off-target gene symbol…', 'ionfunction': createIonFunction(async () => {
                                                    const res = await prompt('Off-target gene symbol contains', ['Symbol'], { Symbol: '' }, 340, 200);
                                                    if (!res) return;
                                                    const s = ('' + (res.Symbol || '')).trim().toUpperCase();
                                                    if (!s) return;
                                                    applySelect((o) => Array.isArray(o.offtargetsymbols) && o.offtargetsymbols.some((x) => ('' + x).toUpperCase().indexOf(s) >= 0));
                                                    graph.setMessage(' Selected compounds off-targeting "' + s + '". ');
                                                })
                                            },
                                            {
                                                'label': 'Select by GC% range…', 'ionfunction': createIonFunction(async () => {
                                                    const lo = await numField('Minimum GC%', 'Min', 30);
                                                    if (lo == null) return;
                                                    const hi = await numField('Maximum GC%', 'Max', 60);
                                                    if (hi == null) return;
                                                    applySelect((o) => o.gc != null && +o.gc >= lo && +o.gc <= hi);
                                                    graph.setMessage(' Selected by GC ' + lo + '–' + hi + '%. ');
                                                })
                                            },
                                            {
                                                'label': 'Select by Tm range…', 'ionfunction': createIonFunction(async () => {
                                                    const lo = await numField('Minimum Tm (°C)', 'Min', 55);
                                                    if (lo == null) return;
                                                    const hi = await numField('Maximum Tm (°C)', 'Max', 65);
                                                    if (hi == null) return;
                                                    applySelect((o) => o.tm != null && +o.tm >= lo && +o.tm <= hi);
                                                    graph.setMessage(' Selected by Tm ' + lo + '–' + hi + '°C. ');
                                                })
                                            },
                                            {
                                                'label': 'Select by length…', 'ionfunction': createIonFunction(async () => {
                                                    const n = await numField('Sequence length (nt)', 'Length', 20);
                                                    if (n == null) return;
                                                    applySelect((o) => ('' + (o.sequence || '')).length === n);
                                                    graph.setMessage(' Selected compounds of length ' + n + ' nt. ');
                                                })
                                            },
                                            {
                                                'label': 'Select by name contains…', 'ionfunction': createIonFunction(async () => {
                                                    const res = await prompt('Name contains', ['Text'], { Text: '' }, 340, 200);
                                                    if (!res) return;
                                                    const s = ('' + (res.Text || '')).trim().toLowerCase();
                                                    if (!s) return;
                                                    applySelect((o) => ('' + (o.name || '')).toLowerCase().indexOf(s) >= 0);
                                                    graph.setMessage(' Selected compounds by name. ');
                                                })
                                            },
                                            {
                                                'label': 'Select duplicates (by sequence)', 'ionfunction': createIonFunction(() => {
                                                    const seen = {};
                                                    for (const o of allOligos()) { const k = '' + (o.sequence || ''); seen[k] = (seen[k] || 0) + 1; }
                                                    applySelect((o) => seen['' + (o.sequence || '')] > 1);
                                                    graph.setMessage(' Selected duplicate sequences. ');
                                                })
                                            },
                                        ]
                                    },
                                    {
                                        'label': 'Off-target', 'items': offTargetItems
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
                                                    await exec('baja/manchester/select-compounds.js', graph, genegraph_panel_layout)
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
                                                label: 'Remove selected',
                                                ionfunction: createIonFunction(() => {
                                                    graph.setMouseMode('navigate')
                                                    graph.setMessage('Removing selected compounds on each track')

                                                    for (let track of graph.track) {
                                                        track.oligos = track.oligos.filter(oligo => !oligo.selected)
                                                    }
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

                                                    await exec('baja/manchester/menu/annotation/filter-compounds-panel.js', graph, genegraph_panel_layout)

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
