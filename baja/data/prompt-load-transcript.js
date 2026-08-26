function (server, graph, genegraph_panel_layout, presetQuery) {
    return new Promise(async (resolve, reject) => {
        // The python endpoint (server env forwards ANTHROPIC_API_KEY to it).
        // NOTE: pass a RELATIVE '/py/...' path here, NOT `server + '/py/...'`.
        // exec()/execPyPost prepend window.env.apiUrl + '/py/' themselves; giving it an
        // absolute http URL (with no '/ionworks/' segment) makes execPyPost's URL splitter
        // mangle it (e.g. '/py/ligodesigner.com/py/sequence/...'), so the script path
        // resolves wrong on the server and the exec exits code 2 (no transcript loads).
        const PY = '/py/sequence/prompt-to-transcript.py';
        const host_ = server;
        // Any Ensembl transcript stable id (human ENST, mouse ENSMUST, rat ENSRNOT, ...).
        const TRANSCRIPT_ID_RE = /ENS[A-Z]*T\d+/i;
        // Local copies (these helpers are not global).
        function extractFirstEnsemblId(inputString) {
            const match = ('' + inputString).match(/ENS[A-Z]*[GTPE]\d+/i);
            return match ? match[0] : null;
        }
        // Render the New-track form directly in the mainPanel (not a modal), and put the
        // editor canvas back in the mainPanel after loading / cancel.
        const showInMainPanel = (comp) => {
            try {
                CurrentLayout.clearComponent('mainPanel');
                CurrentLayout.setComponent('mainPanel', comp);
            } catch (e) { console.warn('prompt-load-transcript: mainPanel set failed', e); }
        };
        const showEditorCanvas = () => {
            showInMainPanel((graph && graph.genegraph_panel_layout) || genegraph_panel_layout);
        };
        // Resolve a natural-language query (or a pasted id) into transcript(s)
        // and load them onto the graph.
        const resolveAndLoad = async (rawQuery, source) => {
            const query = ('' + (rawQuery || '')).trim();
            if (!query) { resolve(null); return; }
            const loadOne = async (item) => {
                if (!item || !item.id) return false;
                const label = item.id + (item.gene ? " (" + item.gene + ")" : "");
                // Upon loading a new track, deselect everything first (clear the
                // selection window + any track/oligo highlights).
                try {
                    if (graph.clearSelectionVisuals) graph.clearSelectionVisuals();
                    graph.__lassoSelection = [];
                    if (graph.deselectAllTracks) graph.deselectAllTracks();
                    if (graph.deselectAllCompounds) graph.deselectAllCompounds();
                } catch (e) { }
                graph.setMessage(" Loading " + label + " ...");
                // graph.add loads via the server and emits its own reference-
                // download status messages (see gene.js). It returns null when the
                // data service (local + Ensembl REST) could not supply this
                // transcript — do NOT treat that as loaded.
                let track = null;
                try {
                    track = await graph.add(item.id, null, null, source);
                } catch (e) {
                    console.warn('load failed for ' + item.id, e);
                    track = null;
                }
                if (!track) {
                    graph.setMessage(" Failed to load " + label + " — data service unavailable.");
                    return false;
                }
                // After it is loaded, select the new track and show the selection box.
                try {
                    if (track.select) track.select();
                    if (graph.addTrackToSelection) graph.addTrackToSelection(track);
                    else graph.showDisplay = true;
                    if (graph.wake) graph.wake();
                } catch (e) { console.warn('select loaded track failed', e); }
                return true;
            };

            // If the input already contains a single transcript id, load it directly.
            const idm = query.match(TRANSCRIPT_ID_RE);
            if (idm && query.split(/\s+/).length === 1) {
                const oneId = idm[0].toUpperCase();
                const ok = await loadOne({ id: oneId });
                if (ok) graph.setMouseMode('navigate');
                resolve(ok ? [{ id: oneId }] : null);
                return;
            }

            // Otherwise let Anthropic resolve the description -> transcript ids.
            let em = new EngineMonitor((m) => { log(m); });
            graph.setMessage(" Resolving transcript from prompt... ");

            let res = null;
            try {
                res = await exec(PY, em, query);
            } catch (e) {
                graph.setMessage(" Transcript resolver failed: "
                    + (e && e.message ? e.message : e));
                resolve(null);
                return;
            }

            let list = [];
            try { list = JSON.parse(res.transcripts); } catch (e) { list = []; }
            if (res && res.error) {
                console.warn('prompt-to-transcript note:', res.error);
            }

            if (!list.length) {
                graph.setMessage(" No transcripts found for: " + query
                    + (res && res.error ? " (" + res.error + ")" : ""));
                resolve(null);
                return;
            }

            if (list.length === 1) {
                const ok = await loadOne(list[0]);
                if (ok) graph.setMouseMode('navigate');
                resolve(ok ? list : null);
                return;
            }

            // Multiple transcripts -> let the user pick (or load them all).
            let menu = list.map((item) => ({
                label: (item.gene ? item.gene + ' ' : '') + item.id
                    + (item.canonical ? '  (canonical)' : '')
                    + (item.biotype ? '  · ' + item.biotype : ''),
                click: async () => {
                    graph.showSideMenu(null);
                    const ok = await loadOne(item);
                    if (ok) graph.setMouseMode('navigate');
                },
                move: () => { log(''); }
            }));
            menu.unshift({
                label: 'Load all (' + list.length + ')',
                click: async () => {
                    graph.showSideMenu(null);
                    let ok = 0;
                    let failed = [];
                    for (let it of list) {
                        if (await loadOne(it)) { ok++; } else { failed.push(it.id); }
                    }
                    graph.setMouseMode('navigate');
                    if (failed.length) {
                        graph.setMessage(" Loaded " + ok + "/" + list.length
                            + " — failed: " + failed.join(', '));
                    } else {
                        graph.setMessage(" Loaded " + ok + " transcript"
                            + (ok === 1 ? "" : "s") + ".");
                    }
                },
                move: () => { log(''); }
            });

            graph.setMessage(" " + list.length + " transcripts for "
                + (res.gene || query) + " — choose one:");
            graph.showSideMenu(menu);
            resolve(list);
        };

        // A preset query (e.g. from a menu input box) skips the modal.
        if (presetQuery && ('' + presetQuery).trim()) {
            await resolveAndLoad(presetQuery, null);
            return;
        }

        // Otherwise prompt the user with a modal card.
        let v = null;      // description / id textarea
        let build = null;  // gene-symbol typeahead
        let geneBox = null;         // human gene-symbol field

        // A rotating example is prefilled into the description box and cleared the
        // first time the user clicks in, so they can type their own.
        const __examples = [
            'load human, mouse and rat KRAS',
            'canonical FGFR3 in human',
            'all PTEN isoforms in mouse',
            'human TP53 tumor suppressor',
            'mouse Kras pre-mRNA',
            'EGFR canonical transcript',
            'BRCA1 in human',
            'rat Bdnf',
            'MYH7 cardiac myosin, human',
            'SOD1 in human and mouse',
            'ENST00000311936',
            'load the MANE Select for SMN2',
            'human DMD dystrophin',
            'HTT huntingtin canonical',
            'all APOE transcripts in human'
        ];
        const __ex = __examples[Math.floor(Math.random() * __examples.length)];
        let __exActive = true;   // true until the user focuses/edits the box

        let describe_transcript = {
            wid: 'card',
            componentRef: 'mainPanel',
            data: {
                height: '100%',
                card_padding: '28px',   // breathing room from the canvas edges
                padding: '10px',
                cards: [
                    [
                        {
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                // Tropical header + input styling. Scoped to .card-container and
                                // only present while this form occupies the mainPanel (it is
                                // destroyed when the editor canvas is restored), so it doesn't
                                // bleed into other views.
                                data: `
                                <style>
                                  .card-container { background: linear-gradient(180deg,#f3fbfb 0%,#e9f6f6 100%); border-radius:16px; }
                                  .card-container .card-title { color:#084d54; font-weight:600; letter-spacing:.2px; margin-bottom:6px; }
                                  .card-container mat-form-field, .card-container .mat-mdc-form-field { width:100%; }
                                  .card-container .mat-mdc-text-field-wrapper { border-radius:12px !important; background:#ffffff !important; box-shadow:0 1px 4px rgba(8,77,84,.10); }
                                  .card-container textarea, .card-container input.mat-mdc-input-element { color:#0f2a2e; font-size:14px; line-height:1.5; }
                                  .card-container .mdc-line-ripple::after { border-bottom-color:#0c7c86 !important; }
                                  .card-container .mat-mdc-form-field.mat-focused .mdc-line-ripple::after { border-bottom-color:#ff8c1a !important; }
                                  .card-container .mat-mdc-form-field.mat-focused .mat-mdc-text-field-wrapper { box-shadow:0 0 0 3px rgba(18,194,224,.18); }
                                  .nt-banner { background:linear-gradient(120deg,#0c7c86 0%,#12a3ad 55%,#ff8c1a 130%); border-radius:14px; padding:16px 20px; color:#fff; box-shadow:0 4px 14px rgba(8,77,84,.28); }
                                  .nt-banner .nt-title { font-size:18px; font-weight:700; letter-spacing:.3px; display:flex; align-items:center; gap:8px; }
                                  .nt-banner .nt-sub { opacity:.92; font-size:13px; margin-top:3px; }
                                </style>
                                <div class="nt-banner">
                                </div>`
                            }
                        },
                        {
                            'title': 'Describe the gene or paste an ENSEMBL/NCBI ID',
                            'width': '100%',
                            'component': {
                                wid: 'text-editor',
                                refCallback: createIonFunction((p) => { v = p; }),
                                data: {
                                    height: '120px',
                                    showButton: false,
                                    editorOptions: {
                                        value: '',
                                        language: 'text', automaticLayout: true, fontSize: 20, lineNumbers: 'off',
                                        suggestOnTriggerCharacters: false, quickSuggestions: false,
                                        parameterHints: { enabled: false }, minimap: { enabled: false },
                                        fontFamily: 'Courier New, monospace',
                                        placeholder: 'Describe the gene or paste an ENSEMBL/NCBI ID',
                                        cursorStyle: 'block'
                                    },
                                    // Clear the typed-in example the first time the user clicks in.
                                    onDidFocusEditorWidget: createIon(() => {
                                        if (__exActive && v) { try { v.setContent(''); } catch (e) { } __exActive = false; }
                                    })
                                }
                            }
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: `e.g. "load human, mouse and rat KRAS", "canonical FGFR3 in human", "all PTEN isoforms in mouse", or ENST00000440486`
                            }
                        },
                        {
                            'title': 'Human Gene Symbol',
                            'width': '100%',
                            'component': {
                                wid: 'input-textfield',
                                data: {
                                    'show-button': false,
                                    'title': 'Human gene symbol (e.g. KRAS, PTEN, FGFR3)',
                                    'text': '',
                                    'typeahead_url': `${host_}/gene-lookup`,
                                    'typeahead_fields': ['Ensembl Canonical', 'Gene name', 'Gene Synonym', 'Gene description', 'Transcript stable ID'],
                                    'optionSelected': createIonFunction((value) => {
                                        // If the picked option resolves to a transcript id, drop it
                                        // straight into the description/ID box for a direct load.
                                        try {
                                            let transcript = extractFirstEnsemblId(value.toString());
                                            if (transcript && v && v.setContent) {
                                                v.setContent(transcript); __exActive = false;
                                            }
                                        } catch (e) { }
                                    }),
                                    'ionHookFunction': createIonFunction((input_box) => {
                                        geneBox = input_box;
                                    })
                                }
                            }
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Load', ionFunction: createIonFunction(async () => {
                                                let desc = '';
                                                try {
                                                    desc = (v && v.getContent) ? v.getContent()
                                                        : (v && v.getWidgetValue ? v.getWidgetValue() : (v && v.value ? v.value : ''));
                                                } catch (e) { }
                                                // Ignore the prefilled example if the user never edited it.
                                                if (__exActive && ('' + (desc || '')).trim() === __ex) desc = '';
                                                let gene = '';
                                                try {
                                                    gene = (geneBox && geneBox.getWidgetValue) ? geneBox.getWidgetValue()
                                                        : (geneBox && geneBox.value ? geneBox.value : '');
                                                } catch (e) { }

                                                // Compose the human gene symbol with the free-text
                                                // description into a single query for the resolver. A
                                                // pasted ENSEMBL/NCBI id in the description loads directly.
                                                let query = '';
                                                desc = ('' + (desc || '')).trim();
                                                gene = ('' + (gene || '')).trim();
                                                if (desc && extractFirstEnsemblId(desc) && desc.split(/\s+/).length === 1) {
                                                    query = desc;   // direct id load
                                                } else {
                                                    let terms = [];
                                                    if (gene) terms.push(gene);
                                                    if (desc) terms.push(desc);
                                                    query = terms.join(' ').trim();
                                                }
                                                // Reset to the editor canvas in the mainPanel, then load.
                                                showEditorCanvas();
                                                setTimeout(() => {
                                                    resolveAndLoad(query, null);
                                                }, 200);
                                            })
                                        },
                                        {
                                            label: 'Cancel', ionFunction: createIonFunction(() => {
                                                showEditorCanvas();
                                                resolve(null);
                                            })
                                        }
                                    ]
                                }
                            }
                        }
                    ]
                ]
            }
        };

        // Show the New-track form in the mainPanel instead of a modal.
        describe_transcript.componentRef = 'mainPanel';
        showInMainPanel(describe_transcript);
        // Typewriter: type the random example into the editor (cleared on first focus).
        setTimeout(() => {
            let __i = 0;
            const __iv = setInterval(() => {
                if (!__exActive || !v || !v.setContent) { try { clearInterval(__iv); } catch (e) { } return; }
                try { v.setContent(__ex.slice(0, __i + 1)); } catch (e) { }
                __i++;
                if (__i >= __ex.length) clearInterval(__iv);
            }, 25);
        }, 500);
    });
}
