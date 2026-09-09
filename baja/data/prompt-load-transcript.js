function (server, graph, genegraph_panel_layout, presetQuery) {
    return new Promise(async (resolve, reject) => {
        const PY = '/py/sequence/prompt-to-transcript.py';
        const host_ = server;
        // Any Ensembl transcript stable id (human ENST, mouse ENSMUST, rat ENSRNOT, ...).
        const TRANSCRIPT_ID_RE = /ENS[A-Z]*T\d+/i;
        // A yeast one has no such prefix (YAL069W_mRNA, snR19_snRNA): lib/core.js knows the shape.
        const isYeastId = (w) => { try { return isYeastTranscriptId(w); } catch (e) { return false; } };
        // Local copies (these helpers are not global).
        function extractFirstEnsemblId(inputString) {
            const match = ('' + inputString).match(/ENS[A-Z]*[GTPE]\d+/i);
            if (match) return match[0];
            const w = ('' + inputString).trim().split(/\s+/)[0] || '';
            return isYeastId(w) ? w : null;
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
        // Did we come from the New-track form? Only then is there a form to go back TO -- a
        // preset query (from a menu, or from the variant designer) has no form behind it, and
        // its caller reports the failure itself.
        let formShown = false;
        // NOTHING FOUND IS NOT THE END OF THE INTERACTION. A query that resolves to no
        // transcript is usually a query worth editing -- a gene the model did not recognise, a
        // typo, a disease term it could not map -- and dropping the user back on the canvas
        // with a toast makes them reopen the window and retype it. Put the form back with what
        // they wrote still in it, so the next attempt is an edit rather than a fresh start.
        const backToPrompt = (msg) => {
            try { graph.setMessage(msg); } catch (e) { }
            if (!formShown) return;
            try {
                showInMainPanel(describe_transcript);
                setTimeout(() => { try { if (v && v.setContent) v.setContent(lastQuery || ''); } catch (e) { } }, 80);
            } catch (e) { }
        };
        let lastQuery = '';
        // Set when the query turned out to name a disease rather than a gene. The
        // transcripts then are not the answer, they are where the answer goes.
        let diseaseContext = '';
        let diseaseIsSample = false;

        // Resolve a natural-language query (or a pasted id) into transcript(s)
        // and load them onto the graph.
        const resolveAndLoad = async (rawQuery, source) => {
            const query = ('' + (rawQuery || '')).trim();
            lastQuery = query;
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
                // After a track loads, hand the mouse to hover / mouse-over-highlight mode.
                try {
                    graph.setMouseMode('navigate');
                    graph.clearMouseListeners();
                    exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout);
                } catch (e) { }
                return true;
            };

            // If the input already contains a single transcript id, load it directly.
            const idm = query.match(TRANSCRIPT_ID_RE);
            if (query.split(/\s+/).length === 1 && (idm || isYeastId(query))) {
                // A yeast id keeps its case: tP(UGG)A_tRNA and YAL069W_mRNA are exact keys.
                const oneId = idm ? idm[0].toUpperCase() : query;
                const ok = await loadOne({ id: oneId });
                if (ok) graph.setMouseMode('navigate');
                resolve(ok ? [{ id: oneId }] : null);
                return;
            }

            // Otherwise let the resolver turn the description into transcript ids.
            let em = new EngineMonitor((m) => { log(m); });
            graph.setMessage(" Resolving transcript from prompt... ");

            // A QUERY CAN NAME A DISEASE AND STILL RESOLVE TO A TRANSCRIPT. "SMA spinal
            // muscular atrophy" finds SMN1 perfectly well, and because it found something the
            // disease branch never ran: the transcript loaded and not one of the mutations
            // that cause the disease was placed. Whether the search succeeds says nothing
            // about whether the query named a condition, so ask that question separately --
            // alongside the search rather than after it, so it costs no extra wait.
            //
            // A bare symbol or id is skipped: "TP53" cannot be a disease and the call would
            // be spent on every ordinary track load.
            const bareName = /^[A-Za-z0-9._-]{1,15}$/.test(query);
            const dvPromise = bareName ? Promise.resolve(null)
                : exec('/py/bio/disease-variants.py', em, query, '12').catch(() => null);

            let res = null;
            try {
                res = await exec(PY, em, query);
            } catch (e) {
                backToPrompt(" Transcript resolver failed: "
                    + (e && e.message ? e.message : e) + " — try again. ");
                resolve(null);
                return;
            }

            let list = [];
            try { list = JSON.parse(res.transcripts); } catch (e) { list = []; }
            if (res && res.error) {
                console.warn('prompt-to-transcript note:', res.error);
            }

            const dv = await dvPromise;
            if (dv && (dv.is_context === true || dv.is_context === 'true') && !dv.error) {
                diseaseContext = dv.disease || query;
                diseaseIsSample = (dv.sample === true || dv.sample === 'true');
                let dGenes = [];
                try { dGenes = JSON.parse(dv.genes || '[]'); } catch (e) { dGenes = []; }
                // The genes the condition names, resolved the ordinary way, merged with
                // whatever the plain search already found. Both are wanted: the search may
                // have found the gene the user typed, and the condition names the rest.
                const have = new Set(list.map((x) => ('' + (x && x.id || '')).toUpperCase()));
                for (const g of dGenes) {
                    let r2 = null;
                    try { r2 = await exec(PY, em, 'canonical ' + g + ' in human'); } catch (e) { r2 = null; }
                    let l2 = [];
                    try { l2 = JSON.parse((r2 && r2.transcripts) || '[]'); } catch (e) { l2 = []; }
                    const pick = l2.find((x) => x && x.canonical) || l2[0];
                    if (pick && !have.has(('' + pick.id).toUpperCase())) {
                        have.add(('' + pick.id).toUpperCase());
                        list.push(Object.assign({ gene: g }, pick));
                    }
                }
                graph.setMessage(' ' + diseaseContext + ' — ' + (diseaseIsSample ? 'a SAMPLE of ' : '')
                    + list.length + ' transcript' + (list.length === 1 ? '' : 's')
                    + (diseaseIsSample ? ', drawn across its major subtypes rather than the full set' : '')
                    + '. Loading… ');
            }

            if (!list.length) {
                // Say what the resolver said, not just that nothing came back: "no valid
                // transcript ids returned" and "the reply was prose" are different problems
                // and lead to different edits. A disease that named genes has already added
                // them to the list above, so reaching here means neither found anything.
                backToPrompt(" No transcripts found for \"" + query + "\""
                    + (res && res.error ? " — " + res.error : "")
                    + ". Edit the description and try again. ");
                resolve(null);
                return;
            }

            // A DISEASE ASKED FOR ITS MUTATIONS, NOT FOR A CHOICE OF GENE. Presenting ten
            // canonical transcripts and asking which one was meant answers a question nobody
            // asked: the whole point of naming a condition is that all of them are wanted.
            // Load them all, then put the changes linked to that condition on each -- every
            // one checked against the transcript's own coding sequence before it is drawn.
            if (diseaseContext && list.length) {
                const before = new Set((graph.track || []));
                let okCount = 0, failed = [];
                for (const it of list) {
                    graph.setMessage(' Loading ' + (it.gene ? it.gene + ' ' : '') + it.id
                        + ' — ' + (okCount + failed.length + 1) + ' of ' + list.length + '… ');
                    if (await loadOne(it)) okCount++; else failed.push(it.id);
                }
                const loaded = (graph.track || []).filter((t) => t && !before.has(t));
                graph.setMouseMode('navigate');
                if (!loaded.length) {
                    backToPrompt(' No transcript could be loaded for ' + diseaseContext + '. ');
                    resolve(null);
                    return;
                }
                graph.setMessage(' Loaded ' + loaded.length + ' transcript'
                    + (loaded.length === 1 ? '' : 's') + ' for ' + diseaseContext
                    + '. Placing the mutations linked to it… ');
                // The placement path, pinned to these tracks: for each one it asks what
                // changes THIS gene carries in THIS context and verifies every answer against
                // that transcript's coding sequence. Pinned, so it does not go looking for
                // more genes -- the genes are the ones just loaded.
                try {
                    await exec('baja/data/variant-from-prompt.js', host_, graph,
                        genegraph_panel_layout, loaded, diseaseContext);
                } catch (e) {
                    graph.setMessage(' Loaded ' + loaded.length + ' transcript'
                        + (loaded.length === 1 ? '' : 's') + ', but the mutations for '
                        + diseaseContext + ' could not be placed: ' + (e && e.message ? e.message : e));
                }
                if (failed.length) {
                    graph.setMessage(' ' + diseaseContext + ': loaded ' + loaded.length + ' of '
                        + list.length + ' transcripts (failed: ' + failed.join(', ') + ')'
                        + (diseaseIsSample ? '. This is a SAMPLE across its major subtypes, not the full set' : '') + '. ');
                }
                resolve(list);
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
        let __exActive = true;   // true until the user puts something in the box

        // GHOST TEXT, NOT CONTENT. The example used to be typed INTO the box, a character
        // every 25 ms, and cleared when the box was first focused. A keystroke that landed
        // before that focus was handled -- a fast typist, a paste, a script -- was written
        // into the middle of the example, and what reached the resolver was both strings
        // spliced together ("LO1 yeastload the MANE Select for SMN2F"). Drawn as a Monaco
        // decoration instead, the example is never part of the content: nothing can type
        // over it, the box reads back exactly what was put in it, and it goes on the first
        // character and does not come back. Load with the box untouched still uses it.
        let __ghost = null;                     // the decorations collection, once made
        const ghost = (text) => {
            try {
                const ed = v && v.editor, M = window['monaco'];
                if (!ed || !M || !ed.createDecorationsCollection) return false;
                if (!document.getElementById('baja-prompt-ghost-style')) {
                    const st = document.createElement('style');
                    st.id = 'baja-prompt-ghost-style';
                    st.textContent = '.baja-prompt-ghost{color:#8a94a6 !important;opacity:0.85;pointer-events:none;}';
                    document.head.appendChild(st);
                }
                if (!__ghost) __ghost = ed.createDecorationsCollection([]);
                __ghost.set(text ? [{
                    range: new M.Range(1, 1, 1, 1),
                    // An empty range is not drawn unless it is told to be; this one is
                    // nothing but its "after" text.
                    options: { showIfCollapsed: true, after: { content: text, inlineClassName: 'baja-prompt-ghost' } }
                }] : []);
                return true;
            } catch (e) { return false; }
        };
        const endExample = () => {
            if (!__exActive) return;
            __exActive = false;
            ghost('');
        };

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
                                        theme: 'vs',                 // light theme: dark text + dark cursor
                                        cursorStyle: 'block',
                                        cursorBlinking: 'solid'
                                    },
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
                                                v.setContent(transcript); endExample();
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
                                                // An untouched box means the example: empty under the
                                                // ghost text, or (on a widget with no editor to decorate,
                                                // where the example is typed in) holding a prefix of it.
                                                if (__exActive && (!('' + desc).trim() || __ex.indexOf(('' + desc).trim()) === 0)) desc = __ex;
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
        formShown = true;
        showInMainPanel(describe_transcript);
        // Typewriter: the random example appears a character at a time, as ghost text. It
        // ends the moment the box holds anything, whichever way that got there.
        setTimeout(() => {
            let __i = 0, __wired = false;
            const contentOf = () => {
                try { if (v && v.editor && v.editor.getValue) return '' + v.editor.getValue(); } catch (e) { }
                try { return '' + ((v && v.getContent) ? v.getContent() : ''); } catch (e) { return ''; }
            };
            const __iv = setInterval(() => {
                if (!__exActive || !v) { try { clearInterval(__iv); } catch (e) { } return; }
                if (!__wired && v.editor && v.editor.onDidChangeModelContent) {
                    __wired = true;
                    try { v.editor.onDidChangeModelContent(() => { if (contentOf().length) endExample(); }); } catch (e) { }
                }
                const cur = contentOf();
                if (cur.trim()) { endExample(); clearInterval(__iv); return; }
                if (!ghost(__ex.slice(0, __i + 1))) {
                    // No editor to decorate: the example is typed in, but only while the box
                    // holds exactly what this wrote -- one foreign character and it stops.
                    if (cur !== __ex.slice(0, __i)) { endExample(); clearInterval(__iv); return; }
                    if (v.setContent) { try { v.setContent(__ex.slice(0, __i + 1)); } catch (e) { } }
                }
                __i++;
                if (__i >= __ex.length) clearInterval(__iv);
            }, 25);
        }, 500);
    });
}
