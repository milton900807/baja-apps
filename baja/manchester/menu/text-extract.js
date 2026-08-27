function (graph, genegraph_panel_layout, presetText, presetEntities) {
    // Read text (pasted) OR a set of pre-extracted entities (from a file upload) with ,
    // extract genes / mutations / ASOs, load the appropriate gene tracks (pre-mRNA), map
    // mutations to their Ensembl-resolved genomic positions, map each ASO to its target
    // location, then TOUR the mutations — zoom into each and dwell 3s until the last.
    return new Promise(async (resolve) => {
        const Annotation = await exec('flexigraph/annotation.js');
        let v = null;   // paste editor widget
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
        let trMap = {};      // geneSymbol(lower) -> real Ensembl transcript id (from step 2)

        const loadGene = async (symbol, species) => {
            const key = ('' + (symbol || '')).toLowerCase().trim();
            if (!key) return null;
            if (loaded[key]) return loaded[key];
            // Prefer the authoritative Ensembl transcript id resolved server-side (step 2);
            // only fall back to the  natural-language resolver if we don't have one.
            let tid = trMap[key] || null;
            if (!tid) {
                const sp = ('' + (species || 'human')).toLowerCase();
                const q = 'canonical ' + symbol + (sp && sp !== 'human' ? ' in ' + sp : '');
                try { window.__workStatus = 'Looking up the ' + symbol + ' gene structure…'; } catch (e) { }
                let em = new EngineMonitor(() => { });
                let res = null;
                try { res = await exec('/py/sequence/prompt-to-transcript.py', em, q); } catch (e) { return null; }
                let list = [];
                try { list = JSON.parse(res.transcripts); } catch (e) { list = []; }
                if (list.length) { const pick = list.find(x => x.canonical) || list[0]; tid = pick && pick.id; }
            }
            if (!tid) return null;
            let track = null;
            try { track = await graph.add(tid, null, null, null); } catch (e) { track = null; }
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

        // Build the spliced transcript from the track's exon annotations (introns removed),
        // reusing the track's own genomic->sequence indexing so junction bases are exact.
        // Returns { S: splicedSeq, segs:[{gLo, sStart, len}] } or null. Cached on the track.
        const buildSpliced = (track) => {
            if (track.__spliced !== undefined) return track.__spliced;
            let exons = [];
            try {
                for (const an of (track.annotations || [])) {
                    if (('' + (an.type || '')) === 'Exon') {
                        const lo = Math.min(an.xi, an.xf), hi = Math.max(an.xi, an.xf);
                        if (isFinite(lo) && isFinite(hi) && hi > lo) exons.push([Math.floor(lo), Math.floor(hi)]);
                    }
                }
            } catch (e) { }
            if (exons.length < 2) { track.__spliced = null; return null; }
            exons.sort((a, b) => a[0] - b[0]);
            // Collapse overlapping exons (multiple transcripts' exons) into a non-overlapping model.
            let merged = [exons[0].slice()];
            for (let i = 1; i < exons.length; i++) {
                const last = merged[merged.length - 1];
                if (exons[i][0] <= last[1]) last[1] = Math.max(last[1], exons[i][1]);
                else merged.push(exons[i].slice());
            }
            if (merged.length < 2) { track.__spliced = null; return null; }
            let S = '', segs = [], cursor = 0;
            for (const seg of merged) {
                let piece = '';
                try { piece = ('' + track.getSequenceRange(seg[0], seg[1])).toUpperCase().replace(/U/g, 'T'); } catch (e) { piece = ''; }
                if (!piece) continue;
                segs.push({ gLo: seg[0], sStart: cursor, len: piece.length });
                S += piece; cursor += piece.length;
            }
            track.__spliced = (segs.length >= 2) ? { S: S, segs: segs } : null;
            return track.__spliced;
        };

        // Map an ASO that spans an exon-exon junction: search the spliced transcript, then
        // project the spliced match back to (1-2+) genomic intervals across the exons.
        const mapAsoSpliced = (track, aso) => {
            const sp = buildSpliced(track);
            if (!sp || !sp.S) return null;
            const a = ('' + (aso.sequence || '')).toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');
            if (a.length < 8) return null;
            const cands = [{ seq: a, orient: 'sense' }, { seq: revcomp(a), orient: 'antisense' }];
            for (const c of cands) {
                const idx = sp.S.indexOf(c.seq);
                if (idx < 0) continue;
                const ss = idx, se = idx + c.seq.length;
                let intervals = [];
                for (const g of sp.segs) {
                    const gsEnd = g.sStart + g.len;
                    const os = Math.max(ss, g.sStart), oe = Math.min(se, gsEnd);
                    if (oe > os) intervals.push([g.gLo + (os - g.sStart), g.gLo + (oe - g.sStart)]);
                }
                if (intervals.length) return { intervals: intervals, orient: c.orient };
            }
            return null;
        };

        // Zoom the view to a genomic window on a specific track (mirrors gene.js goToTrackLocus
        // but takes the track object directly so it doesn't depend on track-name matching).
        const goToLocus = async (track, xi, xf) => {
            try {
                const g = graph.graph;          // FlexiGraph
                const tg = track && track.tgraph;
                if (!g || !tg || !tg.X) return;
                if (g.rescale) g.rescale();
                const gi = tg.X(xi), gf = tg.X(xf);
                const wx = 5;
                g.setxmin(gi - wx); g.setxmax(gf + wx);
                if (tg.yi != null && tg.height != null) {
                    g.setymin(tg.yi + tg.height); g.setymax(tg.yi);
                }
                if (graph.wake) graph.wake();
            } catch (e) { }
        };

        // Shared processing: given the extracted entities, load tracks, map mutations + ASOs,
        // then tour each mapped mutation (zoom in, dwell 3s, until the last one).
        const process = async (ex) => {
            const genes = (ex && ex.genes) || [];
            const muts = (ex && ex.mutations) || [];
            const asos = (ex && ex.asos) || [];
            if (!genes.length && !muts.length && !asos.length) {
                graph.setMessage(' No genes, mutations, or ASOs found' + (ex && ex.error ? ' (' + ex.error + ')' : '') + '. ');
                resolve(null); return;
            }

            // Step 2 result: gene symbol -> real Ensembl transcript id (loaded directly).
            trMap = {};
            for (const t of ((ex && ex.geneTranscripts) || [])) {
                if (t && t.gene && t.id) { const k = ('' + t.gene).toLowerCase(); if (!trMap[k]) trMap[k] = t.id; }
            }

            // Manuscript title -> persistent banner pinned above all the tracks.
            try { if (ex && ex.title && graph.setTitle) graph.setTitle(ex.title); } catch (e) { }

            // Union of genes to load: explicit genes + mutation genes + ASO target genes.
            const toLoad = {};
            for (const g of genes) if (g && g.symbol) toLoad[g.symbol.toLowerCase()] = { symbol: g.symbol, species: g.species || 'human' };
            for (const m of muts) if (m && m.gene && !toLoad[m.gene.toLowerCase()]) toLoad[m.gene.toLowerCase()] = { symbol: m.gene, species: m.species || 'human' };
            for (const a of asos) if (a && a.target_gene && !toLoad[a.target_gene.toLowerCase()]) toLoad[a.target_gene.toLowerCase()] = { symbol: a.target_gene, species: a.species || 'human' };

            const gkeys = Object.keys(toLoad);
            let li = 0;
            for (const k of gkeys) {
                const g = toLoad[k];
                graph.setMessage(' Loading the ' + g.symbol + ' gene (' + (++li) + ' of ' + gkeys.length + ')… ');
                try { window.__workStatus = 'Loading the ' + g.symbol + ' gene…'; } catch (e) { }
                await loadGene(g.symbol, g.species);
            }

            // Hand the mouse to hover / mouse-over-highlight once tracks are in.
            try { graph.setMouseMode('navigate'); graph.clearMouseListeners(); exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }

            // Map mutations onto their gene track (Ensembl-resolved genomic coordinates),
            // collecting each mapped position so we can zoom-tour them afterwards.
            if (muts.length) graph.setMessage(' Marking the variants on the genes… ');
            const mappedMuts = [];
            let mMapped = 0, mUnres = 0;
            for (const m of muts) {
                const track = loaded[('' + (m.gene || '')).toLowerCase()];
                if (!track) { mUnres++; continue; }
                if (m.resolved && +m.start > 0) {
                    let gi = Math.floor(+m.start), gf = Math.floor(+m.end || gi + 1);
                    if (gf <= gi) gf = gi + 1;
                    const label = m.label || m.id || 'Mutation';
                    const note = (m.id ? m.id + ' — ' : '') + (m.comment || '');
                    placePoint(track, gi, gf, label, note, 'rgba(220,38,38,0.9)');
                    mappedMuts.push({ track: track, gi: gi, gf: gf, label: label });
                    mMapped++;
                } else { mUnres++; }
            }

            // Map ASOs onto their target gene track by sequence search.
            let aMapped = 0, aUnmapped = 0;
            for (const a of asos) {
                const track = loaded[('' + (a.target_gene || '')).toLowerCase()];
                if (!track) { aUnmapped++; continue; }
                // 1) Contiguous match against the pre-mRNA (exon-internal / intron targets).
                const hit = mapAso(track, a);
                if (hit) {
                    const label = 'ASO' + (a.name ? ' ' + a.name : '');
                    const note = 'ASO (' + hit.orient + ') target' + (a.comment ? ' — ' + a.comment : '');
                    placePoint(track, hit.gi, hit.gf, label, note, 'rgba(10,120,200,0.9)');
                    aMapped++;
                    continue;
                }
                // 2) Fallback: spliced-mRNA search for exon-exon junction-spanning ASOs.
                const sh = mapAsoSpliced(track, a);
                if (sh) {
                    const parts = sh.intervals.length;
                    let pi = 0;
                    for (const iv of sh.intervals) {
                        pi++;
                        const label = 'ASO' + (a.name ? ' ' + a.name : '') + (parts > 1 ? ' (junction ' + pi + '/' + parts + ')' : '');
                        const note = 'ASO (' + sh.orient + ', spliced junction) target' + (a.comment ? ' — ' + a.comment : '');
                        placePoint(track, iv[0], iv[1], label, note, 'rgba(120,80,200,0.9)');
                    }
                    aMapped++;
                } else { aUnmapped++; }
            }

            for (const k of gkeys) { const tr = loaded[k]; try { if (tr && tr.fitYAxis) tr.fitYAxis(); } catch (e) { } }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            graph.setMessage(' Loaded ' + gkeys.length + ' gene(s); mapped ' + mMapped + ' mutation(s)'
                + (mUnres ? ' (' + mUnres + ' unresolved)' : '') + ' and ' + aMapped + ' ASO(s)'
                + (aUnmapped ? ' (' + aUnmapped + ' unmapped)' : '') + '. ');

            // Tour the mutations: zoom into each and dwell 3 seconds, stopping on the last.
            if (mappedMuts.length) {
                const PAD = 80;   // bp of genomic context on each side of the mutation
                for (let i = 0; i < mappedMuts.length; i++) {
                    const mm = mappedMuts[i];
                    graph.setMessage(' Variant ' + (i + 1) + ' of ' + mappedMuts.length + ': ' + mm.label + ' ');
                    await goToLocus(mm.track, mm.gi - PAD, mm.gf + PAD);
                    if (i < mappedMuts.length - 1) await sleep(3000);
                }
            }

            resolve({ genes: gkeys.length, mutations: mMapped, asos: aMapped });
        };

        const run = async (rawText) => {
            const txt = ('' + (rawText || '')).trim();
            if (!txt) { resolve(null); return; }
            showEditorCanvas();
            graph.setMessage(' Reading text — finding genes & mutations… ');
            try { window.__workStatus = 'Reading text — finding genes & mutations…'; } catch (e) { }
            let em = new EngineMonitor(() => { });
            let ex = null;
            try { ex = await exec('/py/sequence/extract-entities.py', em, txt); }
            catch (e) { graph.setMessage(' Extraction failed: ' + (e && e.message ? e.message : e)); resolve(null); return; }
            await process(ex);
        };

        // A caller can hand us already-extracted entities (e.g. from a file upload) — skip the
        //  text call and the paste modal and go straight to loading + mapping + touring.
        if (presetEntities) { showEditorCanvas(); await process(presetEntities); return; }

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
