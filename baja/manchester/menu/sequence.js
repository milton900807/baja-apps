function (graph, genegraph_panel_layout, showMenuOptions) {

    let start;
    let end;
    let track = null;
    hide_menu = false;
    let md = false;
    graph.menu = null;
    // Close any open side menu: while one is open the engine's move dispatcher
    // returns before calling registered move listeners (gene.js), so the
    // click-and-drag selection below would never receive move events.
    try { graph.showSideMenu(null); } catch (e) { }
    graph.side_menu = null;
    graph.clearMouseListeners();



    graph.setMouseMode("msg:Click and drag on a track")
    for (let t of graph.track) {
        if (t.markend > t.markstart) {
            track = t;
            break
        }
    }

    let menuList2 = [

        {
            label: 'Select genomic range',
            click: async () => {
                graph.hideMenu();
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                graph.runfun(async (graph) => {
                    let va = await prompt("Genomic coords (start-end)", ["Genomic_coords"], { "Genomic_coords": '' }, 300, 300)
                    let m = va['Genomic_coords']

                    if (m === undefined) {
                        graph.setMessage(" No coordinate values were entered ")
                    } else {
                        graph.setMessage(" Parsing... " + m)
                        m = m.trim();
                    }

                    function parseRange(rangeStr) {
                        const rangeRegex = /^(\d+)–(\d+)$/;
                        const match = rangeStr.match(rangeRegex);
                        if (match) {
                            const start = parseInt(match[1], 10);
                            const end = parseInt(match[2], 10);
                            return {
                                start,
                                end
                            };
                        } else {
                            throw new Error('Invalid range format');
                        }
                    }

                    console.log(" parsing m " + m)

                    let range = parseRange(m);
                    for (let t of graph.track) {
                        t.markstart = range.start;
                        t.markend = range.end;
                        console.log(' mark start ' + range.start)
                        console.log(' mark end ' + range.end)
                        console.log(' mark start ' + (range.end - range.start))

                    }

                })
            }
        },
        {
            label: 'Select track sequence',
            click: async () => {
                graph.hideMenu();
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                graph.runfun(async (graph) => {

                    graph.setMessage(" Click on the track to highlight the entire sequence ");
                    graph.clearMouseListeners();
                    graph.deselectAllTracks()

                    graph.addMouseDownListener(async (x, y) => {
                        let trackIndex = graph.getTrack(x, y)
                        if (trackIndex >= 0) {
                            let ttrack = graph.track[trackIndex]
                            if (ttrack) {
                                let track = ttrack;
                                track.select();
                                track.markstart = track.tgraph.xmin;
                                track.markend = track.tgraph.xmax;
                            }
                        }
                    });
                })
            }
        },
        {
            label: 'Edit selected sequence',
            click: async () => {

                graph.setMouseMode('none')
                graph.setMessage("Click on a track to plot attributes")
                for (let selectedTrack of graph.track) {
                    if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) {
                        exec('baja/manchester/menu/edit-track-sequence-panel.js', selectedTrack, graph, genegraph_panel_layout)

                    }
                }
            }
        },
        {
            label: 'Highlight sequence motif',
            click: async () => {

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                setTimeout(async () => {

                    let Annotation = await exec('flexigraph/annotation.js')

                    const buildLPSArray = (pattern) => {
                        let length = 0;
                        let lps = [0];
                        let i = 1;

                        while (i < pattern.length) {
                            if (pattern[i] === pattern[length]) {
                                length++;
                                lps[i] = length;
                                i++;
                            } else {
                                if (length !== 0) {
                                    length = lps[length - 1];
                                } else {
                                    lps[i] = 0;
                                    i++;
                                }
                            }
                        }

                        return lps;
                    }

                    const KMPsearch = (text, pattern) => {
                        let m = pattern.length;
                        let n = text.length;
                        let lps = buildLPSArray(pattern);
                        let i = 0;
                        let j = 0;
                        let results = [];

                        while (i < n) {
                            if (pattern[j] === text[i]) {
                                j++;
                                i++;
                            }

                            if (j === m) {
                                results.push(i - j);
                                j = lps[j - 1];
                            } else if (i < n && pattern[j] !== text[i]) {
                                if (j !== 0) {
                                    j = lps[j - 1];
                                } else {
                                    i = i + 1;
                                }
                            }
                        }

                        return results;
                    }

                    let panel = null;
                    let descHook = createIonFunction((_panel) => {
                        panel = _panel;
                    })

                    let color = 'magenta'

                    let list = [
                        {
                            label: 'Find motif...', click: () => {

                                let sequence_input = {
                                    wid: 'card',
                                    "height": "500px",
                                    data: {
                                        "style.padding-top": '1px',
                                        "style.border": '1px',
                                        "style.height": "500px",
                                        cards: [
                                            [
                                                {
                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'html',
                                                        data: ' Enter a sequence motif'
                                                    }
                                                },
                                                {

                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'card',
                                                        data: {
                                                            cards: [
                                                                [

                                                                    {
                                                                        'width': '100%',
                                                                        'height': "100px",
                                                                        "style.padding-top": '4px',
                                                                        "style.border": '1px',
                                                                        'component':
                                                                        {
                                                                            'wid': 'color-chooser',
                                                                            'width': '100%',

                                                                            "data": {
                                                                                "selectionListener": createIonFunction((_color) => {
                                                                                    color = _color;
                                                                                })
                                                                            }
                                                                        }
                                                                    },
                                                                ]
                                                            ]
                                                        }
                                                    }

                                                },

                                                {
                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'text-editor',
                                                        refCallback: descHook,
                                                        data: {
                                                            height: "250px",
                                                            showButton: false,
                                                            editorOptions: { language: 'text', automaticLayout: true },
                                                            keybinding: {
                                                                'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                                })
                                                            },
                                                        }
                                                    }
                                                },
                                                {
                                                    'component': {
                                                        wid: 'mt-button', data: {
                                                            buttons: [
                                                                {
                                                                    label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                        CurrentLayout.clearComponent('mainPanel')
                                                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                    })
                                                                },
                                                                {
                                                                    label: 'Search all tracks', ionFunction: createIonFunction(async () => {
                                                                        let motif = panel.getActiveTabContent();
                                                                        for (let t of graph.track) {
                                                                            let seq = t.sequence;
                                                                            let result = KMPsearch(seq, motif)
                                                                            for (let r of result) {
                                                                                let annotation = new Annotation("UserAnnotation", r, t.xi + r, t.xi + r + motif.length);
                                                                                annotation.color = color;
                                                                                t.add(annotation)
                                                                            }
                                                                        }
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
                                CurrentLayout.setComponent('mainPanel', sequence_input);

                            }
                        },
                        {
                            label: 'Find triplet repeats', click: () => {

                            }
                        },
                        {
                            label: 'Find quad repeats', click: () => {

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

                }, 1000);

            }
        },

        {
            label: 'Highlight Repeate oligo-seq',
            click: async () => {

                await exec('baja/manchester/menu/annotation/repeate-sequence-finder.js', graph, genegraph_panel_layout)

            }
        },

        {
            label: 'Cut track',
            click: async () => {
                graph.hideMenu();
                if (!track) {
                    infoPrompt("You need to select a track and sequence in order to add a snp. ")
                    return
                }
                let ntr = []
                for (let t of graph.track) {
                    if (t.markend > t.markstart) {
                        let composite = await t.cutTrack()
                        ntr.push(...composite)
                    }
                }
                if (ntr.length > 0)
                    graph.track.push(...ntr)
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

            },
            move: () => {
            }
        },
        {
            label: 'Cut sequence',
            click: async () => {
                graph.hideMenu();
                if (!track) {
                    infoPrompt("You need to select a track and sequence in order to add a snp. ")
                    return
                }
                for (let t of graph.track) {
                    if (t.markend > t.markstart) {
                        t.cutSequence(t.markstart, t.markend)
                    }
                }
                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
            },
            move: () => {
            }
        },
        {
            label: 'Label Donor sites',
            click: async () => {
                for (let selectedTrack of graph.track) {
                    let Annotation = await exec('flexigraph/annotation.js')
                    let rnaSplice = await exec('baja/bio/splicing/splice-motifs.js')
                    function sleep(ms) {
                        return new Promise(resolve => setTimeout(resolve, ms));
                    }

                    if (selectedTrack.markend > selectedTrack.markstart) {
                        let xi = selectedTrack.markstart;
                        let xf = selectedTrack.markend;

                        let seq = selectedTrack.sequence;
                        let initx = selectedTrack.markstart - selectedTrack.tgraph.xmin;
                        let tox = selectedTrack.markend - selectedTrack.tgraph.xmin;
                        let slice = seq.substring(initx + 1, tox + 1);
                        let values = rnaSplice.findDonorSpliceSites(slice, selectedTrack.strand)
                        let splice = values.potentialSites;
                        let csplice = values.canonicalSites;
                        for (let sp of splice) {
                            await sleep(50);

                            if (selectedTrack.strand < 0) {
                                sp.position += 1;

                            } else {
                                sp.position += 1;
                            }

                            let tr = new Annotation("Donor-Splice-Site", 'ss' + sp.site, selectedTrack.markstart + sp.position,
                                selectedTrack.markstart + sp.position + sp.site.length, selectedTrack.strand);
                            selectedTrack.add(tr);
                        }
                        for (let sp of csplice) {
                            await sleep(50);

                            if (selectedTrack.strand < 0) {
                                sp.position += 1;

                            } else {
                                sp.position += 1;
                            }

                            let tr = new Annotation("Canonical-Donor-Splice-Site", 'css' + sp.site, selectedTrack.markstart + sp.position,
                                selectedTrack.markstart + sp.position + sp.site.length, selectedTrack.strand);
                            selectedTrack.add(tr);
                        }
                    }
                }

                setTimeout(async () => {
                    let script_canvas = await exec('baja/manchester/menu/annotation-navigation-tools.js', graph)
                    CurrentLayout.clearComponent('buttonMenuPanel')
                    CurrentLayout.setComponent('buttonMenuPanel', script_canvas);
                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                }, 100)

            }
        },
        {
            label: 'Label Acceptor Sites',
            click: async () => {
                for (let selectedTrack of graph.track) {
                    if (selectedTrack.markend > selectedTrack.markstart) {
                        let Annotation = await exec('flexigraph/annotation.js')
                        let rnaSplice = await exec('baja/bio/splicing/splice-motifs.js')
                        function sleep(ms) {
                            return new Promise(resolve => setTimeout(resolve, ms));
                        }

                        if (selectedTrack) {

                            if (selectedTrack.strand < 0) {
                                let seq = selectedTrack.sequence;
                                let initx = selectedTrack.markstart - selectedTrack.tgraph.xmin;
                                let tox = selectedTrack.markend - selectedTrack.tgraph.xmin;
                                let slice = seq.substring(initx, tox);

                                let splice = rnaSplice.findAcceptorSpliceSites(slice, selectedTrack.strand)
                                for (let sp of splice) {
                                    await sleep(50);
                                    sp.position += 1;

                                    let tr = new Annotation("Acceptor-Splice-Site", 'ss' + sp.site, selectedTrack.markstart + sp.position,
                                        selectedTrack.markstart + sp.position + sp.site.length, selectedTrack.strand);
                                    selectedTrack.add(tr);
                                }
                            } else {
                                let seq = selectedTrack.sequence;
                                let initx = selectedTrack.markstart - selectedTrack.tgraph.xmin;
                                let tox = selectedTrack.markend - selectedTrack.tgraph.xmin;
                                let slice = seq.substring(initx, tox);
                                let splice = rnaSplice.findAcceptorSpliceSites(slice, selectedTrack.strand)
                                for (let sp of splice) {
                                    await sleep(50);
                                    sp.position += 1;
                                    console.log(' sit ' + sp.position + ' length ' + sp.length)

                                    let tr = new Annotation("Acceptor-Splice-Site", 'ss' + sp.site, selectedTrack.markstart + sp.position,
                                        selectedTrack.markstart + sp.position + sp.site.length, selectedTrack.strand);
                                    selectedTrack.add(tr);
                                }
                            }
                        }
                    }
                }

                setTimeout(async () => {
                    let script_canvas = await exec('baja/manchester/menu/annotation-navigation-tools.js', graph)
                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                    CurrentLayout.setComponent('buttonMenuPanel', script_canvas);
                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                }, 100)

            }
        },
    ]
    return new Promise(async (resolve, reject) => {
        graph.hideMenu();
        const Annotation = await exec('flexigraph/annotation')

        function findHit(hitSegments, x, y) {

            for (let i = 0; i < hitSegments.length; i++) {
                const h = hitSegments[i];
                if (x >= h.x1 && x <= h.x2 && y >= h.y1 && y <= h.y2) return h;
            }
            return null;
        }

        let buttons = [
            {
                x: 0, y: 0, label: '← Set',
                ionFunction: createIonFunction(() => {
                    graph.clearMouseListeners();
                    graph.setMouseMode("msg: Click to expand selected sequence in ← direction.")
                    expandLeft();
                }),
                mouseOver: createIonFunction(() => {
                    graph.setMessage("Expand selection left");
                })
            },
            {
                x: 1, y: 0, label: 'Set →',
                ionFunction: createIonFunction(() => {
                    graph.clearMouseListeners();
                    graph.setMouseMode("msg: Click to expand selected sequence in → direction.")

                    expandRight();
                }),
                mouseOver: createIonFunction(() => {
                    graph.setMessage("Expand selection right");
                })
            }, {
                x: 2, y: 0, label: 'Deselect', ionFunction: createIonFunction(() => {
                    graph.clearMouseListeners();
                    graph.deselectAllTracks()
                    ml();
                }), mouseOver: createIonFunction(() => {
                    graph.setMessage(" Clear the highlight and start over ")
                })
            },
            {
                x: 3, y: 0, label: 'Compounds...', ionFunction: createIonFunction(async () => {
                    graph.clearMouseListeners();
                    ml();
                    for (let t of graph.track) {
                        if (t.markend > t.markstart) {
                            track = t
                            break
                        }
                    }
                    if (!track) {
                        infoPrompt("No track with sequence selected... ")
                    } else {

                        let menuList = await exec('baja/manchester/menu/compound-menu-list.js', track, graph, genegraph_panel_layout)

                        graph.showWindowMenu(menuList, 10, 10, 200);
                    }
                }), mouseOver: createIonFunction(() => {
                    graph.setMessage("")
                })
            },
            {
                x: 4, y: 0, label: 'Sequence...', ionFunction: createIonFunction(() => {
                    graph.clearMouseListeners();
                    ml();
                    for (let t of graph.track) {
                        if (t.markend > t.markstart) {
                            track = t
                            break
                        }
                    }





                    graph.showWindowMenu(menuList2, 10, 10, 200);
                }), mouseOver: createIonFunction(() => {
                    graph.setMessage("Click and drag on a track...")
                })
            }, {
                x: 6, y: 0, label: 'Protein...', ionFunction: createIonFunction(() => {
                    graph.clearMouseListeners();
                    ml();
                    for (let t of graph.track) {
                        if (t.markend > t.markstart) {
                            track = t
                            break
                        }
                    }
                    graph.showWindowMenu(menuList2, 10, 10, 200);
                }), mouseOver: createIonFunction(() => {
                    graph.setMessage("Click and drag on a track...")
                })
            },
        ]

        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'height': 25,
                'width': 350,
                'title': 'controls',
                'grid': {
                    xmin: 0,
                    xmax: 5,
                    ymin: 0,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': buttons
            }
        }

        CurrentLayout.clearComponent('labelPanel')
        CurrentLayout.setComponent('labelPanel', button_canvas);

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

        let addIndel = (graph, track) => {
            let editor_;
            let annotation_editor = createIonFunction((editor) => {
                editor_ = editor;
            })
            graph.hideMenu();

            let sequence = track.getHighlightedSequence();
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
                                    data: `Enter annotation for (${track.markstart} - ${track.markend})`
                                }
                            },
                            {
                                'title': '',
                                'component': {
                                    wid: 'text-editor',
                                    refCallback: annotation_editor,
                                    data: {
                                        editorOptions: { language: 'text', automaticLayout: false },
                                        text: sequence,
                                        showButton: false
                                    }
                                }
                            },
                            {
                                'title': '',
                                'component': {
                                    wid: 'mt-button', data: {
                                        buttons: [
                                            {
                                                label: 'Save', ionFunction: createIonFunction(async () => {
                                                    hideAllModal();
                                                    let SnpIndel = await exec('flexigraph/snpindel.js')
                                                    let wv = editor_.getWidgetValue();

                                                    for (let track of graph.track) {
                                                        if (track.markend > track.markstart) {
                                                            if (sequence.length > 0) {
                                                                if (wv.length < sequence.length) {
                                                                    let slnp = new SnpIndel('del', track.markstart, sequence, wv, 0, track.strand);
                                                                    track.addsnpindel(slnp)
                                                                }
                                                                else if (wv.length > sequence.length) {
                                                                    let slnp = new SnpIndel('ins', track.markstart, sequence, wv, 0, track.strand);
                                                                    track.addsnpindel(slnp)
                                                                } else {
                                                                    console.log('debubg');
                                                                    alert(' snp ')
                                                                    let slnp = new SnpIndel('snp', track.markstart, sequence, wv, 0, track.strand);
                                                                    track.addsnpindel(slnp)
                                                                }

                                                            }
                                                        }
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
            showModal(dp, 300, 300)
        }

        let ml = () => {

            // Ensure no side menu is open — otherwise the engine's move dispatcher
            // skips registered listeners and the drag never highlights.
            try { graph.showSideMenu(null); } catch (e) { }
            graph.side_menu = null;
            graph.clearMouseListeners();
            graph.setMouseMode('msg: click and drag on track')
            graph.addMouseDownListener(async (x, y) => {
                md = true;
                graph.mouse_message = null;
                graph.mousex = x;
                graph.mousey = y;
                graph.deselectAllTracks();

                if (track) {
                    start = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                    end = Math.floor(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                    graph.setMessage('Start coordinate: ' + start)
                    return
                } else {

                    let trackIndex = graph.getTrack(x, y)
                    if (trackIndex >= 0) {
                        let ttrack = graph.track[trackIndex]
                        if (ttrack) {
                            track = ttrack;
                            track.select();
                            start = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                            end = Math.floor(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                            graph.setMessage('[Start: ' + start + ']')
                            if (md && track) {

                            }
                        }
                    } else {
                        this.deselectAllTracks();
                    }
                }

            });
            graph.addMouseMoveListener((x, y) => {

                graph.mouse_message = null;
                graph.mousex = x;
                graph.mousey = y;

                try {
                    let trackIndex = graph.getTrack(x, y)
                    if (trackIndex >= 0) {
                        let ttrack = graph.track[trackIndex]
                        if (ttrack) {
                            track = ttrack;
                            const hit = findHit(track.hitSegments, graph.X(x), graph.Y(y));
                            if (hit) {
                                graph.mouse_message = hit.discoveries[0].motif
                                graph.mousex = graph.X(x);
                                graph.mousey = graph.Y(y);
                            }
                            track.select();

                        }
                    }
                } catch (exception) {
                    console.log(" exception " + exception)
                }

                if (!track) {
                    return;
                }

                if (md && track) {
                    end = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                    console.log(" start " + start + " end " + end)
                    track.highlight(start, end);
                    potential_motifds_in_selected_space = null;
                    console.log(' track... ')
                    return
                }

                for (let g of graph.track) {
                    if (g.markend <= g.markstart) {
                        // g.deselect();
                    }
                }
            })
            graph.addMouseUpListener((x, y) => {
                md = false;


                if (track) {
                    const selectedTrack = track;

                    if (track.markstart >= 0 && track.markend > track.markstart) {
                        track.findMotifsFromSelectedSequence();
                        setTimeout(async () => {
                            // On mouse-up over a selection, show a SINGLE side menu of
                            // design options for the chosen chemistry. If no chemistry is
                            // selected yet, prompt with the chemistry list first, then
                            // build the design menu for whatever chemistry is chosen.
                            const __showDesignMenu = () => {
                                const dm = [
                                    {
                                        label: 'Tile across selected sequence', move: () => { },
                                        click: async () => {
                                            graph.showSideMenu(null);
                                            graph.pushOntoHistory();
                                            for (let t of graph.track) {
                                                if (t.markend > t.markstart) {
                                                    let cml = await exec('baja/manchester/menu/compound-menu-list.js', t, graph, genegraph_panel_layout);
                                                    await graph.showWindowMenu(cml, 10, 10, 200);
                                                }
                                            }
                                            __restoreHover();
                                        }
                                    },
                                    // {
                                    //     label: 'Tile on track location', move: () => { },
                                    //     click: () => {
                                    //         graph.showSideMenu(null);
                                    //         graph.pushOntoHistory();
                                    //         graph.clearMouseListeners();
                                    //         graph.setMessage('Select a point on a track');
                                    //         exec('baja/manchester/menu/paint-oligos.js', graph);
                                    //     }
                                    // },
                                    // {
                                    //     label: 'Tile on annotations', move: () => { },
                                    //     click: () => {
                                    //         graph.showSideMenu(null);
                                    //         graph.pushOntoHistory();
                                    //         exec('baja/manchester/menu/tile-on-annotation.js', graph, genegraph_panel_layout, track);
                                    //     }
                                    // },
                                    {
                                        label: 'Design on secondary structure', move: () => { },
                                        click: () => {
                                            graph.showSideMenu(null);
                                            exec('baja/manchester/menu/design-on-secondary-structure.js', graph);
                                        }
                                    },
                                    {
                                        label: 'Design by rules (tile & score)', move: () => { },
                                        click: () => {
                                            // A sequence is already selected, so design directly on it —
                                            // no "all tracks / select the track" scope menu needed.
                                            graph.showSideMenu(null);
                                            exec('baja/manchester/menu/tile-oligos-design.js', graph, genegraph_panel_layout);
                                        }
                                    },
                                ];
                                graph.showSideMenu(dm, null, 'Design ▸');
                            };
                            // Once the sequence is selected, hand the mouse back to the
                            // normal mouse-over-highlight behavior (hover / click oligos).
                            const __restoreHover = () => {
                                try { graph.clearMouseListeners(); } catch (e) { }
                                try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
                            };
                            (async () => {
                                if (!graph.props.selected_chemistry) {
                                    graph.setMessage(' Select a chemistry first... ');
                                    await new Promise((res) => { exec('manchester/choose-chemistry.js', graph, genegraph_panel_layout, () => { res(); }); });
                                    if (!graph.props.selected_chemistry) { __restoreHover(); return; }
                                }
                                __showDesignMenu();
                                __restoreHover();
                            })();
                        }, 1000)
                    }
                    end = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                    currentx = x;
                    currenty = y;
                }
                track = null;
                // On mouse-up, hand the mouse back to the normal mouse-over-highlight
                // behavior (the selection persists on the track, so the design menu
                // shown just above still works). Reset the mouse mode to navigate too.
                try { graph.setMouseMode('navigate'); } catch (e) { }
                try { if (graph.graph) graph.graph.mode = 'navigate'; } catch (e) { }
                try { graph.setMessage(''); } catch (e) { }   // clear the cursor-mode hint
                try { graph.clearMouseListeners(); exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
            });
        }

        let expandLeft = () => {
            graph.addMouseDownListener(async (x, y) => {

                md = true;

                if (track) {
                    start = track.markstart;

                } else {

                    let trackIndex = graph.getTrack(x, y)
                    if (trackIndex >= 0) {
                        let ttrack = graph.track[trackIndex]
                        if (ttrack) {
                            track = ttrack
                            track.select();
                        }

                    } else {
                        track = null
                    }

                }
            });
            graph.addMouseMoveListener((x, y) => {

                console.log('debubg');
                if (md && track) {
                    track.select();
                    end = track.markend;
                    start = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                    track.highlight(start, end);

                } else {

                    for (let g of graph.track) {
                        if (g.markend <= g.markstart) {
                            g.deselect();
                        }
                    }
                    let trackIndex = graph.getTrack(x, y)
                    if (trackIndex >= 0) {
                        let ttrack = graph.track[trackIndex]
                        if (ttrack) {
                            track = ttrack

                            track.select()
                        }
                    }
                }
            })
            graph.addMouseUpListener((x, y) => {
                if (track && !isMobile()) {

                    end = track.markend;
                    start = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                    graph.setMessage('Start: ' + start)
                    track.highlight(start, end);
                }
                track = null;
                md = false;
                currentx = x;
                currenty = y;
            });
        }

        let expandRight = () => {
            graph.addMouseDownListener(async (x, y) => {
                md = true;
                if (track) {
                    track.select();
                    start = track.markstart;
                }
            });
            graph.addMouseMoveListener((x, y) => {
                if (track && md) {
                    track.select();
                    start = track.markstart;
                    end = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                    track.highlight(start, end);
                } else {
                    for (let g of graph.track) {
                        if (g.markend <= g.markstart) {
                            g.deselect();
                        }
                    }
                    let trackIndex = graph.getTrack(x, y)
                    if (trackIndex >= 0) {
                        track = graph.track[trackIndex]
                        let ttrack = graph.track[trackIndex]
                        if (ttrack) {
                            track = ttrack;
                        }
                    }
                }
            })

            graph.addMouseUpListener((x, y) => {
                md = false;
                if (track && !isMobile()) {
                    end = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                    graph.setMessage('Start: ' + start)
                    track.highlight(start, end);
                }

                track = null;
                currentx = x;
                currenty = y;
            });
        }

        sequence_phase = -1;
        let tile = (oligoLength, startCoordinate, endCoordinate) => {
            const tiledSequences = [];
            let currentCoordinate = startCoordinate;

            while (currentCoordinate + oligoLength <= endCoordinate) {
                tiledSequences.push({
                    start: currentCoordinate,
                    end: currentCoordinate + oligoLength - 1
                });
                currentCoordinate += oligoLength;
            }
            return tiledSequences;
        }

        graph.clearMouseListeners();
        ml();
        resolve()
    })

}
