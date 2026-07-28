function (graph, genegraph_panel_layout, showMenuOptions) {

    let start;
    let end;
    let track = null;
    hide_menu = false;
    let md = false;
    graph.menu = null;
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
                        exec('baja/screens/menu/edit-track-sequence-panel.js', selectedTrack, graph, genegraph_panel_layout)

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

                await exec('baja/screens/menu/annotation/repeate-sequence-finder.js', graph, genegraph_panel_layout)

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
                    let script_canvas = await exec('baja/screens/menu/annotation-navigation-tools.js', graph)
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
                    let script_canvas = await exec('baja/screens/menu/annotation-navigation-tools.js', graph)
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

                        let menuList = await exec('baja/screens/menu/compound-menu-list.js', track, graph, genegraph_panel_layout)

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
                        g.deselect();
                    }
                }
            })
            graph.addMouseUpListener((x, y) => {
                md = false;
                console.log(" we still have the sequence object ")
                if (track) {
                    const selectedTrack = track;

                    if (track.markstart >= 0 && track.markend > track.markstart) {
                        track.findMotifsFromSelectedSequence();
                        setTimeout(async () => {
                            let ml = [
                                {
                                    'label': 'Edit sequence', click: (async () => {
                                        setTimeout(async () => {
                                            graph.setMouseMode('none')
                                            for (let selectedTrack of graph.track) {
                                                if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) {
                                                    exec('baja/screens/menu/edit-track-sequence-panel.js', selectedTrack, graph, genegraph_panel_layout)
                                                }
                                            }
                                            graph.showSideMenu(null)

                                        }, 100)

                                    })
                                },
                                {
                                    'label': 'Deselect Sequence', click: (async () => {
                                        setTimeout(async () => {
                                            graph.setMouseMode('none')
                                            for (let selectedTrack of graph.track) {
                                                selectedTrack.deselect();
                                            }

                                            graph.showSideMenu(null)

                                        }, 100)

                                    })
                                },
                                {
                                    'label': 'Download Sequence', click: (async () => {
                                        setTimeout(async () => {
                                            graph.setMouseMode('none')
                                            for (let selectedTrack of graph.track) {
                                                if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) {
                                                    exec('baja/screens/menu/edit-track-sequence-panel.js', selectedTrack, graph, genegraph_panel_layout)
                                                }
                                            }
                                            graph.showSideMenu(null)

                                        }, 100)

                                    })
                                },

                                {
                                    'label': 'Load Data', click: (async () => {
                                        let data_menu = []
                                        let data_items = window['env']['data']
                                        data_menu.push({
                                            label: 'My data', click: async () => {
                                                graph.clearMouseListeners();
                                                graph.setMouseMode('navigate')
                                                await exec('baja/data/my-data.js', graph, genegraph_panel_layout)
                                            }
                                        })
                                        if (data_items) {
                                            for (let d of data_items) {
                                                data_menu.push({
                                                    label: d.label, click: async () => {
                                                        await exec(d.script, d.data, d.server, graph, genegraph_panel_layout)
                                                    }
                                                })
                                            }
                                        }
                                        graph.showSideMenu(data_menu)
                                        return;
                                    })
                                },
                                {
                                    'label': 'Run AI Models', click: (async () => {
                                        setTimeout(async () => {

                                            graph.setMouseMode('none')

                                            const models = [
                                                {
                                                    label: 'Phylon',
                                                    click: async (xwc, ywc) => {
                                                        setTimeout(async () => {
                                                            graph.setMouseMode('none')
                                                            for (let selectedTrack of graph.track) {
                                                                if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) {
                                                                    if (selectedTrack) {

                                                                        let w = {
                                                                            wid: 'working',
                                                                            'message': ' Executing LJSplice...'
                                                                        }
                                                                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                                        CurrentLayout.setComponent('buttonMenuPanel', w);

                                                                        graph.setMessageCenter("Calculating exonic artifacts")
                                                                        let r = await exec('py/splicing/cryptic-exon-finder.py', selectedTrack.getSequenceRange(selectedTrack.markstart, selectedTrack.markend),
                                                                            selectedTrack.chr, selectedTrack.markstart, selectedTrack.markend, selectedTrack.strand)
                                                                        if (r && r.status === "file_downloading") {
                                                                            infoPrompt("Model building; this only needs to happen once but may take several minutes")
                                                                            return;
                                                                        }
                                                                        let cryptic_exons = await exec('baja/bio/splicing/cryptic-exons')
                                                                        let g = cryptic_exons.generateCrypticExons(r, { xiAnchor: selectedTrack.markstart })
                                                                        for (let cry of g) {
                                                                            selectedTrack.add(cry)
                                                                        }

                                                                        w.message = " Results " + g.length

                                                                        let button_canvas_ = await exec('screen/controls/navigation-panel.js', graph)
                                                                        CurrentLayout.clearComponent('buttonMenuPanel,labelPanel')
                                                                        CurrentLayout.setComponent('buttonMenuPanel', button_canvas_);

                                                                        graph.setMessageCenter("Found " + g.length)

                                                                        showModal({
                                                                            wid: 'json',
                                                                            data: JSON.stringify(r)
                                                                        })

                                                                        return;
                                                                    }
                                                                }
                                                            }
                                                        }, 1000)

                                                    }
                                                    ,
                                                    move: () => {
                                                        log('')
                                                    }
                                                },

                                                {
                                                    label: 'LJ-Translation ',
                                                    click: async (xwc, ywc) => {
                                                        setTimeout(async () => {
                                                            graph.setMouseMode('none')
                                                            for (let selectedTrack of graph.track) {
                                                                if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) {
                                                                    if (selectedTrack) {

                                                                        let w = {
                                                                            wid: 'working',
                                                                            'message': ' Executing LJSplice...'
                                                                        }
                                                                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                                        CurrentLayout.setComponent('buttonMenuPanel', w);

                                                                        graph.setMessageCenter("Calculating exonic artifacts")
                                                                        let sequence = selectedTrack.getSequenceRange(selectedTrack.markstart, selectedTrack.markend);
                                                                        let r = await exec('py/translation/predict-tss.py', sequence, 0.35, 10000, selectedTrack.strand)
                                                                        if (r && r.status === "file_downloading") {
                                                                            infoPrompt("Model building; this only needs to happen once but may take several minutes")
                                                                            return;
                                                                        }
                                                                        function generateTranslationStartSites(dataset, options = {}) {
                                                                            const {
                                                                                type = 'LJ-TSS',

                                                                                xiAnchor = 0,
                                                                                toAbsolute = true,

                                                                                intervalFrom = 'codon',

                                                                                namePrefix = 'LJ-TSS',
                                                                                nameFrom = 'index',

                                                                                annotationFrom = 'prob',
                                                                                probDigits = 3,

                                                                                color = 'lightGray',
                                                                                y = 0,
                                                                                labelY = 0.5,

                                                                                minProb = 0.0,
                                                                                sortBy = 'rank_global',
                                                                                maxItems = Infinity,
                                                                            } = options;

                                                                            const results = Array.isArray(dataset?.results) ? dataset.results : [];
                                                                            const out = [];

                                                                            let rows = results.filter(r => typeof r?.prob === 'number' && r.prob >= minProb);

                                                                            rows.sort((a, b) => {
                                                                                if (sortBy === 'prob') return (b.prob ?? 0) - (a.prob ?? 0);
                                                                                if (sortBy === 'pos') return (a.codon_pos0 ?? 0) - (b.codon_pos0 ?? 0);
                                                                                const ra = a.rank_global ?? Infinity;
                                                                                const rb = b.rank_global ?? Infinity;
                                                                                if (ra !== rb) return ra - rb;
                                                                                return (b.prob ?? 0) - (a.prob ?? 0);
                                                                            });

                                                                            if (Number.isFinite(maxItems)) rows = rows.slice(0, maxItems);

                                                                            for (let i = 0; i < rows.length; i++) {
                                                                                const r = rows[i];

                                                                                let relXi, relXf;
                                                                                if (intervalFrom === 'window') {
                                                                                    relXi = r.win_start ?? r.codon_pos0 ?? 0;
                                                                                    relXf = r.win_end ?? ((r.codon_pos0 ?? 0) + 3);
                                                                                } else {
                                                                                    relXi = r.codon_pos0 ?? 0;
                                                                                    relXf = (r.codon_pos0 ?? 0) + 3;
                                                                                }

                                                                                const xi = toAbsolute ? (xiAnchor + relXi) : relXi;
                                                                                const xf = toAbsolute ? (xiAnchor + relXf) : relXf;

                                                                                let name = '';
                                                                                if (nameFrom === 'prob') {
                                                                                    const p = (typeof r.prob === 'number') ? r.prob.toFixed(probDigits) : 'NA';
                                                                                    name = `${namePrefix}:${p}`;
                                                                                } else if (nameFrom === 'coords') {
                                                                                    name = `${namePrefix}:${xi}-${xf}`;
                                                                                } else {
                                                                                    name = `${namePrefix}:${i + 1}`;
                                                                                }

                                                                                let strand = 1;
                                                                                if (r?.strand === -1 || r?.strand === "-") strand = -1;
                                                                                else strand = 1;

                                                                                let ann = '';
                                                                                if (typeof annotationFrom === 'function') {
                                                                                    ann = annotationFrom(r, i);
                                                                                } else if (annotationFrom === 'strand') {
                                                                                    ann = `${strand}`;
                                                                                } else if (annotationFrom === 'both') {
                                                                                    const p = (typeof r.prob === 'number') ? r.prob.toFixed(probDigits) : 'NA';
                                                                                    ann = `${p} ${strand}`;
                                                                                } else {
                                                                                    ann = (typeof r.prob === 'number') ? r.prob.toFixed(probDigits) : '';
                                                                                }

                                                                                const a = new Annotation(type, name, xi, xf, strand, ann);
                                                                                a.setIndex(i);
                                                                                a.setColor(color);
                                                                                a.y = y;
                                                                                a.labelY = labelY;

                                                                                a.description = JSON.stringify({
                                                                                    codon_pos0: r.codon_pos0,
                                                                                    codon: r.codon,
                                                                                    prob: r.prob,
                                                                                    strand,
                                                                                    orientation: r.orientation,
                                                                                    rank_global: r.rank_global,
                                                                                    rank_strand: r.rank_strand,

                                                                                    intervalFrom,
                                                                                    xiAnchor,
                                                                                    mapped_xi: xi,
                                                                                    mapped_xf: xf,

                                                                                    win_start: r.win_start,
                                                                                    win_end: r.win_end,
                                                                                    context_left: r.context_left,
                                                                                    context_right: r.context_right,

                                                                                    codon_pos0_revcomp: r.codon_pos0_revcomp,
                                                                                    win_start_revcomp: r.win_start_revcomp,
                                                                                    win_end_revcomp: r.win_end_revcomp
                                                                                });

                                                                                out.push(a);
                                                                            }

                                                                            return out;
                                                                        }

                                                                        const g = generateTranslationStartSites(r, {
                                                                            xiAnchor: selectedTrack.markstart,
                                                                            toAbsolute: true,
                                                                            intervalFrom: 'codon',
                                                                            annotationFrom: 'prob',
                                                                            nameFrom: 'prob',
                                                                            minProb: 0.022,
                                                                            color: 'lightGray'
                                                                        });

                                                                        for (let cry of g) {
                                                                            selectedTrack.add(cry)
                                                                            console.log(" adding " + cry)
                                                                        }

                                                                        w.message = " Results " + g.length

                                                                        let button_canvas_ = await exec('screen/controls/navigation-panel.js', graph)
                                                                        CurrentLayout.clearComponent('buttonMenuPanel,labelPanel')
                                                                        CurrentLayout.setComponent('buttonMenuPanel', button_canvas_);

                                                                        setTimeout(() => {
                                                                            graph.setMessageCenter("Found " + g.length)

                                                                        }, 1000)

                                                                        return;
                                                                    }
                                                                }
                                                            }
                                                        }, 1000)

                                                    }
                                                    ,
                                                    move: () => {
                                                        log('')
                                                    }
                                                },

                                                {
                                                    label: 'Secondary structure',
                                                    click: async (xwc, ywc) => {
                                                        if (!selectedTrack) {
                                                            infoPrompt(" No track selected ");
                                                            return;
                                                        }

                                                        if (selectedTrack != null) {
                                                            let sequence = selectedTrack.getHighlightedSequence();
                                                            if (sequence.length > 7000) {
                                                                infoPrompt(" Sequence is too long for the prediction tool (>7kb)")
                                                                return;
                                                            }

                                                            let lb = null;
                                                            let engineMonitor = new EngineMonitor((msg) => {
                                                                lb.setHTML(msg)
                                                            });
                                                            CurrentLayout.setComponent('buttonMenuPanel', {
                                                                wid: 'html',
                                                                refCallback: createIon((p) => {
                                                                    lb = p
                                                                }),
                                                                data: '<font color="blue"> Generating secondary structure.... </font>'
                                                            });

                                                            let t = await selectedTrack.createSecondaryStructure(selectedTrack.markstart, selectedTrack.getHighlightedSequence(), selectedTrack.name, engineMonitor)
                                                            t.anchorX = selectedTrack.markstart;
                                                            t.xindex_start = selectedTrack.markstart;
                                                            t.tgraph.yi = selectedTrack.tgraph.yi
                                                            t.anchorY = selectedTrack.tgraph.yi;
                                                            setTimeout(async () => {

                                                                graph.setCenterMessage(" Secondary structure is complete ")

                                                            }, 10000)
                                                        } else {
                                                            infoPrompt(" You need to highlight a sequence on a track first.")

                                                        }

                                                    }
                                                    ,
                                                    move: () => {
                                                        log('')
                                                    }
                                                },

                                            ]
                                            graph.showSideMenu(models)

                                        }, 100)

                                    })
                                },

                                {
                                    'label': 'Design Tx', click: (async () => {
                                        const lll = [
                                            {
                                                label: "siRNA",
                                                click: async (scx, scy) => {
                                                    let progress = new EngineMonitor(async (msg) => {
                                                        graph.setCenterMessage(msg)
                                                    });
                                                    const str = `py/sirna/design.py`


                                                    let vap = await prompt("Maximum number:", ["Count"], { "Count": 100 }, 500, 300)
                                                    let va = vap['Count']
                                                    if (!Number.isInteger(Number(va))) {
                                                        infoPrompt("Please provide an integer value only (1-1000)")
                                                    }
                                                    let senseOverhang_str_p = await prompt("Sense strand overhang:", ["Overhang"], { "Overhang": 'dTdT' }, 500, 300)
                                                    let antisenseOverhang_str_p = await prompt("Antisense strand overhang:", ["Overhang"], { "Overhang": 'nothing' }, 500, 300)

                                                    let antisenseOverhang_str = antisenseOverhang_str_p['Overhang']
                                                    let senseOverhang_str = senseOverhang_str_p['Overhang']

                                                    if (antisenseOverhang_str != null && antisenseOverhang_str === 'nothing') {
                                                        antisenseOverhang_str = '';
                                                    }
                                                    if (senseOverhang_str != null && senseOverhang_str === 'nothing') {
                                                        senseOverhang_str = '';
                                                    }



                                                    let currentSequence = selectedTrack.getHighlightedSequence();

                                                    if (!currentSequence || currentSequence.length < 16) {
                                                        infoPrompt("Highlighted sequence must be at least 16 nt long.");
                                                        return;
                                                    }
                                                    let _sequence = currentSequence;
                                                    let json_input = {
                                                        sequence: _sequence,
                                                        strand: selectedTrack.strand,
                                                        top_n: parseInt(va),
                                                        lengths: [21, 22, 23],
                                                        overhangs: { sense: senseOverhang_str, antisense: antisenseOverhang_str },           // can also be "UU"
                                                        output_alphabet: "DNA"    // "RNA" or "DNA"
                                                    }




                                                    let w = {
                                                        wid: 'working',
                                                        'message': ' Executing ...'
                                                    }
                                                    CurrentLayout.clearComponent('buttonMenuPanel')
                                                    CurrentLayout.setComponent('buttonMenuPanel', w);



                                                    let r = await exec(str, progress, json_input);



                                                    let button_canvas_ = await exec('screen/controls/navigation-panel.js', graph)
                                                    CurrentLayout.clearComponent('buttonMenuPanel,labelPanel')
                                                    CurrentLayout.setComponent('buttonMenuPanel', button_canvas_);


                                                    let SIRNA = await exec('flexigraph/sirna.js')
                                                    let Amplicon = await exec('flexigraph/amplicon.js')
                                                    function scoreToColor(score) {
                                                        if (score >= 40) return "limegreen";
                                                        if (score >= 25) return "gold";
                                                        if (score >= 10) return "orange";
                                                        return "red";
                                                    }
                                                    function buildSirnaArray(resultJson, options = {}) {
                                                        if (!resultJson || !Array.isArray(resultJson.top_candidates)) {
                                                            console.warn("Invalid siRNA result JSON");
                                                            return [];
                                                        }

                                                        const {
                                                            strand = selectedTrack.strand,
                                                            y = 0.3,
                                                            type = "siRNA",
                                                            track = selectedTrack
                                                        } = options;

                                                        const sirnas = [];

                                                        resultJson.top_candidates.forEach((c) => {
                                                            try {
                                                                const xi = c.start;
                                                                const xf = c.end;

                                                                const sequence = c.target_site_input_alphabet || c.sense_strand || "";
                                                                const sense = c.sense_strand || "";
                                                                const antisense = c.antisense_strand || "";

                                                                // These are already constructed by the backend after overhang application.
                                                                // If one side has no overhang, that duplex should just equal the core strand.
                                                                const senseDuplex =
                                                                    c.sense_duplex !== undefined && c.sense_duplex !== null
                                                                        ? c.sense_duplex
                                                                        : sense;

                                                                const antisenseDuplex =
                                                                    c.antisense_duplex !== undefined && c.antisense_duplex !== null
                                                                        ? c.antisense_duplex
                                                                        : antisense;

                                                                const senseOverhang =
                                                                    c.sense_overhang !== undefined && c.sense_overhang !== null
                                                                        ? c.sense_overhang
                                                                        : "";

                                                                const antisenseOverhang =
                                                                    c.antisense_overhang !== undefined && c.antisense_overhang !== null
                                                                        ? c.antisense_overhang
                                                                        : "";

                                                                const structure = `${senseDuplex}|${antisenseDuplex}`;

                                                                const sirna = new SIRNA(
                                                                    type,
                                                                    sequence,
                                                                    sense,
                                                                    antisense,
                                                                    xi,
                                                                    xf,
                                                                    y,
                                                                    strand,
                                                                    structure
                                                                );

                                                                // Core strands
                                                                sirna.sequence = sequence;
                                                                sirna.sense = sense;
                                                                sirna.antisense = antisense;

                                                                // Duplex/display strands
                                                                sirna.senseDuplex = senseDuplex;
                                                                sirna.antisenseDuplex = antisenseDuplex;
                                                                sirna.senseOverhang = senseOverhang;
                                                                sirna.antisenseOverhang = antisenseOverhang;

                                                                // Keep seed logic on the core antisense unless you explicitly want overhangs included
                                                                sirna.synthesisSequence = antisense;
                                                                sirna.synthesisSequenceDuplex = antisenseDuplex;

                                                                sirna.score = c.score;
                                                                sirna.gc_percent = c.gc_percent;
                                                                sirna.rank = c.rank;
                                                                sirna.notes = c.notes || [];
                                                                sirna.target_site = c.target_site_input_alphabet || sequence;
                                                                sirna.targetSiteRna = c.target_site_rna || null;
                                                                sirna.senseCoreRna = c.sense_core_rna || null;
                                                                sirna.antisenseCoreRna = c.antisense_core_rna || null;

                                                                sirna.color = scoreToColor(c.score);

                                                                if (track && typeof track.addOligo === "function") {
                                                                    track.addOligo(sirna);
                                                                }

                                                                sirnas.push(sirna);
                                                            } catch (e) {
                                                                console.error("Failed to build siRNA:", c, e);
                                                            }
                                                        });

                                                        return sirnas;
                                                    }
                                                    const sirnaArray = buildSirnaArray(r, {
                                                        strand: selectedTrack.strand,
                                                        y: 0.3
                                                    });


                                                    for (let i of sirnaArray) {
                                                        const length = Math.abs(i.xf - i.xi)
                                                        i.xi += selectedTrack.markstart;
                                                        i.xf = i.xi + length
                                                        selectedTrack.addOligo(i)
                                                    }


                                                    // showModal({
                                                    //     wid: 'json',
                                                    //     data: JSON.stringify(selectedTrack.oligos)
                                                    // })
                                                }
                                            },
                                            {
                                                label: "Gapmer ASO",
                                                click: async (scx, scy) => {

                                                    let progress = new EngineMonitor(async (msg) => {
                                                        graph.setCenterMessage(msg)
                                                    });

                                                    let Oligo = await exec('flexigraph/oligo.js');
                                                    const str = `py/ssaso/design.py`;
                                                    let vap = await prompt("Maximum number:", ["Count"], { "Count": 100 }, 500, 300);
                                                    let va = 100;
                                                    if (vap && vap["Count"])
                                                        va = vap['Count']
                                                    if (!Number.isInteger(Number(va))) {
                                                        infoPrompt("Please provide an integer value only (1-1000)");
                                                        return;
                                                    }
                                                    let currentSequence = selectedTrack.getHighlightedSequence();

                                                    if (!currentSequence || currentSequence.length < 16) {
                                                        infoPrompt("Highlighted sequence must be at least 16 nt long.");
                                                        return;
                                                    }
                                                    let _sequence = currentSequence;


                                                    va = parseInt(va)



                                                    let json_input = {
                                                        "sequence": _sequence,
                                                        "strand": -1,
                                                        "top_n": va,

                                                        "lengths": [16, 17, 18, 19, 20],
                                                        "gap_sizes": [8, 9, 10],

                                                        "wing_modification": "LNA",
                                                        "default_backbone": "PS",
                                                        "po_link_positions": [],

                                                        "output_alphabet": "DNA",

                                                        "helm_symbols": {
                                                            "DNA": "d",
                                                            "LNA": "lna",
                                                            "2'-OMe": "m",
                                                            "2'-MOE": "moe"
                                                        },

                                                        "enforce_non_overlapping": false,
                                                        "min_separation": 0,

                                                        "endonuclease_motifs": [
                                                            "GAATTC",   // EcoRI
                                                            "GGATCC",   // BamHI
                                                            "AAGCTT",   // HindIII
                                                            "GCGGCCGC", // NotI
                                                            "CTCGAG"    // XhoI
                                                        ],

                                                        "exclude_gap_cleavage_motif_hits": true
                                                    }

                                                    let w = {
                                                        wid: 'working',
                                                        'message': ' Executing ...'
                                                    }
                                                    CurrentLayout.clearComponent('buttonMenuPanel')
                                                    CurrentLayout.setComponent('buttonMenuPanel', w);

                                                    let r = await exec(str, progress, json_input);





                                                    let button_canvas_ = await exec('screen/controls/navigation-panel.js', graph)
                                                    CurrentLayout.clearComponent('buttonMenuPanel,labelPanel')
                                                    CurrentLayout.setComponent('buttonMenuPanel', button_canvas_);

                                                    function normalizedScoreToColor(score) {
                                                        const s = Number(score ?? 0);
                                                        if (s >= 0.80) return "limegreen";
                                                        if (s >= 0.55) return "gold";
                                                        if (s >= 0.30) return "orange";
                                                        return "red";
                                                    }

                                                    function formatScore(score) {
                                                        const s = Number(score);
                                                        return Number.isFinite(s) ? s.toFixed(3) : "0.000";
                                                    }

                                                    function formatRawScore(score) {
                                                        const s = Number(score);
                                                        return Number.isFinite(s) ? s.toFixed(2) : "0.00";
                                                    }

                                                    function buildGapmerArray(resultJson, options = {}) {
                                                        const candidates = Array.isArray(resultJson?.hits)
                                                            ? resultJson.hits
                                                            : Array.isArray(resultJson?.top_candidates)
                                                                ? resultJson.top_candidates
                                                                : [];

                                                        if (!candidates.length) {
                                                            console.warn("Invalid gapmer result JSON");
                                                            return [];
                                                        }

                                                        const {
                                                            strand = selectedTrack.strand,
                                                            y = 0.1,
                                                            type = "gapmer",
                                                            track = selectedTrack
                                                        } = options;

                                                        const oligos = [];

                                                        candidates.forEach((c) => {
                                                            try {
                                                                const xi = c.start;
                                                                const xf = c.end;

                                                                const antisense = c.antisense_display || "";
                                                                const target = c.target_site_input_alphabet || "";
                                                                const name = antisense || target || `gapmer_${xi}_${xf}`;

                                                                const structure =
                                                                    (typeof c.structure === "string" && c.structure.trim().length > 0)
                                                                        ? c.structure
                                                                        : "";

                                                                const oligo = new Oligo(
                                                                    type,
                                                                    name,
                                                                    structure,
                                                                    xi,
                                                                    xf,
                                                                    y
                                                                );

                                                                oligo.setStrand(strand);

                                                                // Core identity
                                                                oligo.name = name;
                                                                oligo.sequence = antisense;
                                                                oligo.synthesisSequence = antisense;
                                                                oligo.targetSequence = target;
                                                                oligo.targetSite = target;
                                                                oligo.targetSiteRna = c.target_site_rna || null;
                                                                oligo.antisense = antisense;
                                                                oligo.antisenseCoreRna = c.antisense_core_rna || null;

                                                                // HELM / chemistry
                                                                oligo.structure = structure;
                                                                oligo.helm = structure;
                                                                oligo.chemistryLayout = Array.isArray(c.chemistry_layout) ? c.chemistry_layout : [];
                                                                oligo.backbonePattern = Array.isArray(c.backbone_pattern) ? c.backbone_pattern : [];
                                                                oligo.wingModification = c.wing_modification || null;

                                                                // Gapmer design metadata
                                                                oligo.designType = "gapmer";
                                                                oligo.rank = c.rank ?? null;

                                                                // Keep both raw and normalized scores
                                                                oligo.score = Number(c.normalized_score ?? 0);
                                                                oligo.normalized_score = Number(c.normalized_score ?? 0);
                                                                oligo.raw_score = Number(c.score ?? 0);

                                                                oligo.gc_percent = c.gc_percent;
                                                                oligo.tm = c.tm_c;
                                                                oligo.tm_c = c.tm_c;
                                                                oligo.tmModificationBonus = c.tm_modification_bonus_c ?? 0;
                                                                oligo.tmMethod = c.tm_method || null;

                                                                oligo.length = c.length;
                                                                oligo.gapSize = c.gap_size;
                                                                oligo.gapStart = c.gap_start_1based;
                                                                oligo.gapEnd = c.gap_end_1based;
                                                                oligo.leftWingSize = c.left_wing_size;
                                                                oligo.rightWingSize = c.right_wing_size;
                                                                oligo.notes = c.notes || [];

                                                                // Label normalized score (0-1)
                                                                oligo.setLabelAttribute("normalized_score", {
                                                                    prefix: "Score: ",
                                                                    offsetY: -18,
                                                                    textColor: "maroon",
                                                                    fillColor: "white",
                                                                    strokeColor: "black",
                                                                    font: "10px Arial",
                                                                    formatter: (v) => formatScore(v)
                                                                });

                                                                // Optional second label for raw score if useful
                                                                oligo.setLabelAttribute("raw_score", {
                                                                    prefix: "Score ",
                                                                    offsetY: -32,
                                                                    textColor: "navy",
                                                                    fillColor: "white",
                                                                    strokeColor: "black",
                                                                    font: "10px Arial",
                                                                    formatter: (v) => formatRawScore(v)
                                                                });

                                                                oligo.color = normalizedScoreToColor(c.normalized_score);

                                                                oligos.push(oligo);
                                                            } catch (e) {
                                                                console.error("Failed to build gapmer:", c, e);
                                                            }
                                                        });

                                                        if (track && typeof track.addOligo === "function") {
                                                            for (const oligo of oligos) {
                                                                const length = Math.abs(oligo.xf - oligo.xi)
                                                                oligo.xi += track.markstart;
                                                                oligo.xf = oligo.xi + length
                                                                track.addOligo(oligo);
                                                            }
                                                        }
                                                        return oligos;
                                                    }
                                                    const gapmerArray = buildGapmerArray(r, {
                                                        strand: selectedTrack.strand,
                                                        y: 0.3,
                                                        track: selectedTrack
                                                    });

                                                    // // Optional:
                                                    // showModal({
                                                    //     wid: 'json',
                                                    //     data: JSON.stringify(gapmerArray, null, 2)
                                                    // });
                                                }
                                            },














                                            {

                                                'label': 'Tile across selected sequence...', click: (async () => {
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

                                            },
                                            {

                                                'label': 'Tile on secondary structure', click: (async () => {

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
                                                                        exec('baja/screens/menu/simple-info-panel.js', graph, genegraph_panel_layout, '')

                                                                    }, 1000)

                                                                }, 1000)
                                                            }
                                                        }
                                                    })
                                                })
                                            }]
                                        graph.showSideMenu(lll)
                                    })
                                },

                            ]

                            for (let selectedTrack of graph.track) {
                                let annotations = selectedTrack.getAnnotationsInRange(
                                    selectedTrack.markstart,
                                    selectedTrack.markend
                                )
                                if (annotations && annotations.length > 0) {
                                    let edit_annotations = {
                                        label: 'Annotations',
                                        click: () => {

                                            const types = [...new Set(
                                                annotations
                                                    .map(a => a.type)
                                                    .filter(t => t != null)
                                            )]

                                            let mml = [
                                                {
                                                    'label': 'Edit annotations', click: (async () => {
                                                        setTimeout(async () => {
                                                            graph.setMouseMode('none')
                                                            for (let selectedTrack of graph.track) {
                                                                if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) {

                                                                    const submml = []

                                                                    for (let selectedTrack of graph.track) {
                                                                        let annotations = selectedTrack.getAnnotationsInRange(
                                                                            selectedTrack.markstart,
                                                                            selectedTrack.markend
                                                                        )

                                                                        if (annotations && annotations.length > 0) {

                                                                            if (graph.track && graph.track.length === 1) {
                                                                                const selTrack = graph.track[0]
                                                                                submml.push({
                                                                                    label: selTrack.showLayers ? 'Hide Data Layers' : 'Show Data Layers',
                                                                                    click: async () => {
                                                                                        selTrack.showLayers = !selTrack.showLayers
                                                                                    }
                                                                                })

                                                                                submml.push({
                                                                                    label: 'Edit type',
                                                                                    click: () => {

                                                                                        let ch = []

                                                                                        for (let type of types) {
                                                                                            ch.push({
                                                                                                label: type,
                                                                                                click: () => {

                                                                                                    const annotationsOfType = annotations.filter(a => a?.type === type)

                                                                                                    graph.showSideMenu([
                                                                                                        {
                                                                                                            label: 'View',
                                                                                                            click: () => {
                                                                                                                if (selectedTrack.setSelectedAnnotations) {
                                                                                                                    selectedTrack.setSelectedAnnotations(annotationsOfType)
                                                                                                                }
                                                                                                            }
                                                                                                        },
                                                                                                        {
                                                                                                            label: 'Copy',
                                                                                                            click: async () => {
                                                                                                                const json = JSON.stringify(annotationsOfType, null, 2)
                                                                                                                if (navigator.clipboard?.writeText) {
                                                                                                                    await navigator.clipboard.writeText(json)
                                                                                                                }
                                                                                                            }
                                                                                                        },
                                                                                                        {
                                                                                                            label: 'Remove',
                                                                                                            click: () => {
                                                                                                                if (selectedTrack.removeAnnotations) {
                                                                                                                    selectedTrack.removeAnnotations(annotationsOfType)
                                                                                                                } else if (selectedTrack.removeAnnotation) {
                                                                                                                    for (const a of annotationsOfType) {
                                                                                                                        selectedTrack.removeAnnotation(a)
                                                                                                                    }
                                                                                                                }
                                                                                                                graph.render?.()
                                                                                                            }
                                                                                                        }
                                                                                                    ])
                                                                                                }
                                                                                            })
                                                                                        }
                                                                                        graph.showSideMenu(ch)

                                                                                    }
                                                                                })

                                                                                for (let dl of selTrack.track_layers) {
                                                                                    submml.push({
                                                                                        label: dl.name,
                                                                                        click: async () => {
                                                                                            let mmml = []
                                                                                            mmml.push({
                                                                                                label: 'Edit',
                                                                                                click: async () => {

                                                                                                }
                                                                                            })
                                                                                            mmml.push({
                                                                                                label: 'Delete',
                                                                                                click: async () => {

                                                                                                    const idx = selTrack.track_layers.indexOf(dl)
                                                                                                    if (idx !== -1) {
                                                                                                        selTrack.track_layers.splice(idx, 1)
                                                                                                    }
                                                                                                    graph.showSideMenu(null)

                                                                                                }
                                                                                            })
                                                                                            graph.showSideMenu(mmml)
                                                                                        }
                                                                                    })
                                                                                }

                                                                                submml.push({
                                                                                    label: 'SNPs',
                                                                                    click: () => {
                                                                                        if (graph.track && graph.track.length === 1) {
                                                                                            const mml = []
                                                                                            const selTrack = graph.track[0]
                                                                                            mml.push({
                                                                                                label: selTrack.showSnpIndels ? 'Hide SNPs' : 'Show SNPs',
                                                                                                click: async () => {
                                                                                                    selTrack.showLayers = !selTrack.showLayers
                                                                                                }
                                                                                            })
                                                                                            mml.push({
                                                                                                label: 'Download',
                                                                                                click: () => {

                                                                                                }
                                                                                            })
                                                                                        }
                                                                                    }
                                                                                })
                                                                                submml.push({
                                                                                    label: 'Data Layers',
                                                                                    click: () => {
                                                                                        graph.showSideMenu(mml)
                                                                                    }
                                                                                })
                                                                            }

                                                                        }
                                                                    }
                                                                    graph.showSideMenu(submml)
                                                                }
                                                            }
                                                        }, 100)

                                                    })
                                                },

                                            ]
                                            graph.showSideMenu(mml)
                                        }
                                    }

                                    ml.push(edit_annotations)

                                    if (graph.track && graph.track.length === 1) {

                                        const mml = []
                                        const selTrack = graph.track[0]
                                        mml.push({
                                            label: selTrack.showLayers ? 'Hide Data Layers' : 'Show Data Layers',
                                            click: async () => {
                                                selTrack.showLayers = !selTrack.showLayers
                                            }
                                        })

                                        for (let dl of selTrack.track_layers) {
                                            mml.push({
                                                label: dl.name,
                                                click: async () => {
                                                    let mmml = []
                                                    mmml.push({
                                                        label: 'Edit',
                                                        click: async () => {

                                                        }
                                                    })
                                                    mmml.push({
                                                        label: 'Delete',
                                                        click: async () => {

                                                            const idx = selTrack.track_layers.indexOf(dl)
                                                            if (idx !== -1) {
                                                                selTrack.track_layers.splice(idx, 1)
                                                            }
                                                            graph.showSideMenu(null)

                                                        }
                                                    })
                                                    graph.showSideMenu(mmml)
                                                }
                                            })
                                        }

                                        ml.push({
                                            label: 'SNPs',
                                            click: () => {
                                                if (graph.track && graph.track.length === 1) {
                                                    const mml = []
                                                    const selTrack = graph.track[0]
                                                    mml.push({
                                                        label: selTrack.showSnpIndels ? 'Hide SNPs' : 'Show SNPs',
                                                        click: async () => {
                                                            selTrack.showLayers = !selTrack.showLayers
                                                        }
                                                    })
                                                    mml.push({
                                                        label: 'Download',
                                                        click: () => {

                                                        }
                                                    })
                                                    graph.showSideMenu(mml)
                                                }
                                            }
                                        })
                                        ml.push({
                                            label: 'Data Layers',
                                            click: () => {
                                                graph.showSideMenu(mml)
                                            }
                                        })
                                    }

                                }
                            }

                            for (let selectedTrack of graph.track) {
                                if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) {
                                    let peptide = selectedTrack.getPeptideFromORF(selectedTrack.markstart, selectedTrack.markend)
                                    if (peptide && peptide.length > 0) {

                                        ml.push(
                                            {
                                                'label': 'Deselect', click: (async () => {
                                                    setTimeout(async () => {
                                                        graph.setMouseMode('none')
                                                        for (let selectedTrack of graph.track) {
                                                            selectedTrack.deselect();
                                                        }
                                                    }, 100)

                                                })
                                            },
                                            {
                                                'label': 'Sequence Details', click: (async () => {
                                                    setTimeout(async () => {
                                                        graph.setMouseMode('none')
                                                        for (let selectedTrack of graph.track) {
                                                            if (selectedTrack && selectedTrack.markend > selectedTrack.markstart) {
                                                                exec('baja/screens/menu/show-selected-sequence-details.js', selectedTrack, graph, genegraph_panel_layout)
                                                            }
                                                        }
                                                    }, 100)
                                                })
                                            },
                                            {
                                                'label': 'Design Tx', click: (async () => {
                                                    const mml = [
                                                        {

                                                            'label': 'Tile across selected sequence...', click: (async () => {
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
                                                        }]
                                                    graph.showSideMenu(mml, x, y)

                                                })
                                            },

                                            {
                                                'label': 'Show Peptide sequence', click: (async () => {
                                                    setTimeout(async () => {
                                                        showModal({
                                                            wid: 'text-editor',
                                                            data: {
                                                                text: peptide
                                                            }
                                                        })
                                                        return;
                                                    }, 100)

                                                })
                                            })
                                        ml.push({
                                            'label': 'Run alphafold (beta)', click: (async () => {
                                                setTimeout(async () => {
                                                    let ml = await exec('baja/screens/menu/load_seleced_sequence_menulist', graph, genegraph_panel_layout, true)

                                                }, 100)

                                            })
                                        })

                                    }

                                }

                            }

                            graph.showSideMenu(ml)
                        }, 1000)
                    }
                    end = Math.ceil(track.tgraph.Xwc(x) - track.tgraph.xi * 2);
                    currentx = x;
                    currenty = y;
                }
                track = null;
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
