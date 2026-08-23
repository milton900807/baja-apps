function (server, graph, genegraph_panel_layout, presetQuery) {
    return new Promise(async (resolve, reject) => {
        // The python endpoint (server env forwards ANTHROPIC_API_KEY to it).
        const PY = server + '/py/sequence/prompt-to-transcript.py';
        const host_ = server;
        // Any Ensembl transcript stable id (human ENST, mouse ENSMUST, rat ENSRNOT, ...).
        const TRANSCRIPT_ID_RE = /ENS[A-Z]*T\d+/i;
        // Local copies (these helpers are not global).
        function extractFirstEnsemblId(inputString) {
            const match = ('' + inputString).match(/ENS[A-Z]*[GTPE]\d+/i);
            return match ? match[0] : null;
        }
        // Resolve a natural-language query (or a pasted id) into transcript(s)
        // and load them onto the graph.
        const resolveAndLoad = async (rawQuery, source) => {
            const query = ('' + (rawQuery || '')).trim();
            if (!query) { resolve(null); return; }
            const loadOne = async (item) => {
                if (!item || !item.id) return false;
                const label = item.id + (item.gene ? " (" + item.gene + ")" : "");
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

        let describe_transcript = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '800px',
                cards: [
                    [
                        {
                            'title': 'Describe the gene or paste an ENSEMBL/NCBI ID',
                            'width': '100%',
                            'component': {
                                wid: 'input-textarea-editor',
                                data: {
                                    'showButton': false,
                                    'title': 'Prompt / ID',
                                    'ionHookFunction': createIonFunction((input_box) => {
                                        v = input_box;
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
                                            if (transcript && v && v.updateValue) {
                                                v.updateValue(transcript);
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
                                                    desc = (v && v.getWidgetValue) ? v.getWidgetValue()
                                                        : (v && v.value ? v.value : '');
                                                } catch (e) { }
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
                                                hideAllModal();
                                                setTimeout(() => {
                                                    resolveAndLoad(query, null);
                                                }, 200);
                                            })
                                        },
                                        {
                                            label: 'Cancel', ionFunction: createIonFunction(() => {
                                                hideAllModal();
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

        showModal(describe_transcript);
    });
}
