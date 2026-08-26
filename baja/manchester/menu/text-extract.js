function (graph, genegraph_panel_layout, presetText) {
    // Read pasted text with Claude, extract genes / mutations / ASOs, load the appropriate
    // gene tracks (pre-mRNA), map mutations to their Ensembl-resolved genomic positions, and
    // map each ASO to its target location by searching the target track's sequence.
    return new Promise(async (resolve) => {
        const Annotation = await exec('flexigraph/annotation.js');
        let v = null;   // paste editor widget

        const showInMainPanel = (comp) => {
            try { CurrentLayout.clearComponent('mainPanel'); CurrentLayout.setComponent('mainPanel', comp); } catch (e) { }
        };
        const showEditorCanvas = () => {
            showInMainPanel((graph && graph.genegraph_panel_layout) || genegraph_panel_layout);
        };

        const revcomp = (s) => {
            const c = { A: 'T', T: 'A', G: 'C', C: 'G' };
            let o = '';
            for (let i = s.length - 1; i >= 0; i--) o += (c[s[i]] || 'N');
            return o;
        };

        const loaded = {};   // geneSymbol(lower) -> track

        const loadGene = async (symbol, species) => {
            const key = ('' + (symbol || '')).toLowerCase().trim();
            if (!key) return null;
            if (loaded[key]) return loaded[key];
            const sp = ('' + (species || 'human')).toLowerCase();
            const q = 'canonical ' + symbol + (sp && sp !== 'human' ? ' in ' + sp : '');
            let em = new EngineMonitor(() => { });
            let res = null;
            try { res = await exec('/py/sequence/prompt-to-transcript.py', em, q); } catch (e) { return null; }
            let list = [];
            try { list = JSON.parse(res.transcripts); } catch (e) { list = []; }
            if (!list.length) return null;
            const pick = list.find(x => x.canonical) || list[0];
            let track = null;
            try { track = await graph.add(pick.id, null, null, null); } catch (e) { track = null; }
            if (track) {
                loaded[key] = track;
                try { if (track.select) track.select(); if (graph.addTrackToSelection) graph.addTrackToSelection(track); } catch (e) { }
            }
            return track;
        };

        const placePoint = (track, gi, gf, label, note, color) => {
            const an = new Annotation('PointOfInterest', label, gi, gf, track.strand);
            an.color = color; an.description = note; an.comment = note;
            an.labelY = 0.45 + Math.random() * 0.5;
            track.add(an);
        };

        // Find where an ASO hybridises on the target track's (pre-mRNA) sequence. An antisense
        // oligo matches the reverse-complement of the sense sequence; try sense too as a fallback.
        const mapAso = (track, aso) => {
            const seq = ('' + (track.sequence || '')).toUpperCase().replace(/U/g, 'T');
            const a = ('' + (aso.sequence || '')).toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');
            if (a.length < 8 || seq.length < a.length) return null;
            let idx = seq.indexOf(revcomp(a)); let orient = 'antisense';
            if (idx < 0) { idx = seq.indexOf(a); orient = 'sense'; }
            if (idx < 0) return null;
            const gi = Math.floor(track.xi) + idx;
            return { gi: gi, gf: gi + a.length, orient: orient };
        };

        const run = async (rawText) => {
            const txt = ('' + (rawText || '')).trim();
            if (!txt) { resolve(null); return; }
            showEditorCanvas();
            graph.setMessage(' Reading text with Claude… ');
            let em = new EngineMonitor(() => { });
            let ex = null;
            try { ex = await exec('/py/sequence/extract-entities.py', em, txt); }
            catch (e) { graph.setMessage(' Extraction failed: ' + (e && e.message ? e.message : e)); resolve(null); return; }

            const genes = (ex && ex.genes) || [];
            const muts = (ex && ex.mutations) || [];
            const asos = (ex && ex.asos) || [];
            if (!genes.length && !muts.length && !asos.length) {
                graph.setMessage(' No genes, mutations, or ASOs found' + (ex && ex.error ? ' (' + ex.error + ')' : '') + '. ');
                resolve(null); return;
            }

            // Union of genes to load: explicit genes + mutation genes + ASO target genes.
            const toLoad = {};
            for (const g of genes) if (g && g.symbol) toLoad[g.symbol.toLowerCase()] = { symbol: g.symbol, species: g.species || 'human' };
            for (const m of muts) if (m && m.gene && !toLoad[m.gene.toLowerCase()]) toLoad[m.gene.toLowerCase()] = { symbol: m.gene, species: m.species || 'human' };
            for (const a of asos) if (a && a.target_gene && !toLoad[a.target_gene.toLowerCase()]) toLoad[a.target_gene.toLowerCase()] = { symbol: a.target_gene, species: a.species || 'human' };

            const gkeys = Object.keys(toLoad);
            let li = 0;
            for (const k of gkeys) {
                const g = toLoad[k];
                graph.setMessage(' Loading ' + g.symbol + ' (' + (++li) + '/' + gkeys.length + ')… ');
                await loadGene(g.symbol, g.species);
            }

            // Hand the mouse to hover / mouse-over-highlight once tracks are in.
            try { graph.setMouseMode('navigate'); graph.clearMouseListeners(); exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }

            // Map mutations onto their gene track (Ensembl-resolved genomic coordinates).
            let mMapped = 0, mUnres = 0;
            for (const m of muts) {
                const track = loaded[('' + (m.gene || '')).toLowerCase()];
                if (!track) { mUnres++; continue; }
                if (m.resolved && +m.start > 0) {
                    let gi = Math.floor(+m.start), gf = Math.floor(+m.end || gi + 1);
                    if (gf <= gi) gf = gi + 1;
                    const note = (m.id ? m.id + ' — ' : '') + (m.comment || '');
                    placePoint(track, gi, gf, m.label || m.id || 'Mutation', note, 'rgba(220,38,38,0.9)');
                    mMapped++;
                } else { mUnres++; }
            }

            // Map ASOs onto their target gene track by sequence search.
            let aMapped = 0, aUnmapped = 0;
            for (const a of asos) {
                const track = loaded[('' + (a.target_gene || '')).toLowerCase()];
                if (!track) { aUnmapped++; continue; }
                const hit = mapAso(track, a);
                if (hit) {
                    const label = 'ASO' + (a.name ? ' ' + a.name : '');
                    const note = 'ASO (' + hit.orient + ') target' + (a.comment ? ' — ' + a.comment : '');
                    placePoint(track, hit.gi, hit.gf, label, note, 'rgba(10,120,200,0.9)');
                    aMapped++;
                } else { aUnmapped++; }
            }

            for (const k of gkeys) { const tr = loaded[k]; try { if (tr && tr.fitYAxis) tr.fitYAxis(); } catch (e) { } }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            graph.setMessage(' Loaded ' + gkeys.length + ' gene(s); mapped ' + mMapped + ' mutation(s)'
                + (mUnres ? ' (' + mUnres + ' unresolved)' : '') + ' and ' + aMapped + ' ASO(s)'
                + (aUnmapped ? ' (' + aUnmapped + ' unmapped)' : '') + '. ');
            resolve({ genes: gkeys.length, mutations: mMapped, asos: aMapped });
        };

        // A preset text (from a caller) skips the modal.
        if (presetText && ('' + presetText).trim()) { await run(presetText); return; }

        // Otherwise show a paste card in the mainPanel.
        const card = {
            wid: 'card',
            componentRef: 'mainPanel',
            data: {
                height: '100%', card_padding: '28px', padding: '10px',
                cards: [[
                    {
                        'title': 'Paste text — genes, mutations (rsIDs) and ASOs will be extracted and mapped',
                        'width': '100%',
                        'component': {
                            wid: 'text-editor',
                            refCallback: createIonFunction((p) => { v = p; }),
                            data: {
                                height: '320px', showButton: false,
                                editorOptions: {
                                    value: '', language: 'text', automaticLayout: true, fontSize: 15,
                                    lineNumbers: 'off', wordWrap: 'on', minimap: { enabled: false },
                                    suggestOnTriggerCharacters: false, quickSuggestions: false,
                                    fontFamily: 'Courier New, monospace',
                                    placeholder: 'Paste an abstract, clinical note, ASO datasheet, or variant list…'
                                }
                            }
                        }
                    },
                    {
                        'title': '', 'width': '100%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Extract & Map', ionFunction: createIonFunction(async () => {
                                            let txt = '';
                                            try {
                                                txt = (v && v.getContent) ? v.getContent()
                                                    : (v && v.getWidgetValue ? v.getWidgetValue() : (v && v.value ? v.value : ''));
                                            } catch (e) { }
                                            await run(txt);
                                        })
                                    },
                                    {
                                        label: 'Cancel', ionFunction: createIonFunction(() => { showEditorCanvas(); resolve(null); })
                                    }
                                ]
                            }
                        }
                    }
                ]]
            }
        };
        card.componentRef = 'mainPanel';
        showInMainPanel(card);
    });
}
