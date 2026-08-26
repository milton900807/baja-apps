function (graph, genegraph_panel_layout, oligos, options) {

    // Seed-sequence mode: for siRNA, query the off-target index with just the
    // guide seed region (positions 2-9, an 8-mer that meets the index minimum)
    // instead of the full strand.
    const __seedMode = !!(options && options.seed);
    const __seedOf = (o) => {
        const norm = (x) => ('' + (x || '')).toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');
        let g = norm(o && (o.guide || o.antisense));
        if (g.length < 9) g = norm(o && (o.synthesisSequence || o.sequence));
        return g.length >= 9 ? g.slice(1, 9) : '';
    };
    // The off-target index is DNA (2-bit), so every query MUST be a DNA sequence:
    // uppercase, U->T, only A/C/G/T. Never send RNA (siRNA) sequences with U.
    const __toDNA = (s) => ('' + (s || '')).toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');
    // The off-target search queries with the GUIDE (target) sequence: for siRNA the
    // guide/antisense strand, for single-stranded oligos the synthesis sequence —
    // always converted to DNA.
    // Loaded once inside the Promise; used to derive an ASO synthesis strand when a
    // compound did not carry one.
    let Biopolymer = null;
    // Strand of the oligo (from the oligo itself, else the track that spans it):
    // >= 0 forward (+), < 0 reverse (-).
    const __oligoStrand = (o) => {
        if (o && o.strand != null) return o.strand;
        let t = o && (o.track || o.__track);
        if (!t) { try { for (const tr of (graph.track || [])) { if (tr && o && o.xi >= Math.min(tr.xi, tr.xf) && o.xi <= Math.max(tr.xi, tr.xf)) { t = tr; break; } } } catch (e) { } }
        return (t && t.strand != null) ? t.strand : 1;
    };
    const __querySeq = (o) => {
        if (!o) return '';
        // The off-target index is DNA searched on BOTH strands, so the query MUST be a real
        // strand of the target duplex. Use the REVERSE-COMPLEMENT of the target region — the
        // true antisense (ASO) strand — which finds the target on either genome strand.
        // IMPORTANT: do NOT use synthesisSequence directly: generateCompound stores a plain
        // COMPLEMENT (not reversed) for reverse-strand oligos, and a plain complement is not
        // a real strand — it matches nothing, so reverse-strand ASOs would find no hits
        // (not even their own gene). reverseComp(target) works for both strands.
        let g = '';
        if (o.sequence && Biopolymer) g = __toDNA(Biopolymer.reverseComp(o.sequence));
        if (!g || g.length < 8) g = __toDNA(o.guide || o.antisense);
        if (!g || g.length < 8) g = __toDNA(o.synthesisSequence);   // last-resort fallback
        // Strip a 3' overhang (e.g. dTdT) if the chosen field carries one — it does
        // not target the transcript.
        const oh = __toDNA(o.antisenseOverhang || o.overhang);
        if (oh && g.length > oh.length && g.slice(-oh.length) === oh) g = g.slice(0, g.length - oh.length);
        return g;
    };
    editDistance = 0;

    return new Promise(async (resolve, reject) => {
        let returnMode = 'editdistance'

        // Run oligos in reading order — LEFT to RIGHT (genomic x), then TOP to BOTTOM
        // (higher world-y is toward the top of the screen) — and cap each run at 200
        // oligos so a single user can't queue an unbounded search.
        const OFF_MAX = 200;
        try {
            oligos = (oligos || []).filter(Boolean).slice();
            oligos.sort((a, b) => {
                const ax = Math.min(a.xi, a.xf), bx = Math.min(b.xi, b.xf);
                if (ax !== bx) return ax - bx;              // left -> right
                return (b.y || 0) - (a.y || 0);             // top -> bottom
            });
            if (oligos.length > OFF_MAX) {
                graph.setMessage(' Off-targets run ' + OFF_MAX + ' oligos at a time — running the first ' + OFF_MAX + ' (left→right, top→bottom). ');
                oligos = oligos.slice(0, OFF_MAX);
            }
        } catch (e) { }

        // For deriving an ASO synthesis strand when a compound lacks one (comp on reverse,
        // reverseComp on forward — see __querySeq).
        try { Biopolymer = await exec('baja/chem/biopolymer.js'); } catch (e) { }

        graph.setMessage("Loading indexed genomes from the server... ")
        // The indexed genomes and the off-target search are served by the baja app
        // server itself (apiUrl) — GET {apiUrl}/genomes and POST {apiUrl}/off-targets-file.
        // Do NOT reach out to a separate off-target API.
        const server = window["env"]["apiUrl"] || window["env"]["offtarget"] || '';

        // Fetch the server's indexed genomes. Normalizes an object ({name:...}) or
        // an array response into {name: info}.
        const fetchGenomes = async (base) => {
            if (!base) return {};
            try {
                const r = await GETJSON(`${base}/genomes`);
                const out = {};
                if (Array.isArray(r)) {
                    for (const g of r) { if (g) out['' + g] = { name: '' + g }; }
                } else if (r && typeof r === 'object') {
                    for (const k of Object.keys(r)) out[k] = r[k];
                }
                return out;
            } catch (e) {
                console.warn('off-target: /genomes fetch failed for', base, e);
                return {};
            }
        };

        let available_genomes = await fetchGenomes(server);
        if (Object.keys(available_genomes).length === 0) {
            graph.setMessage(" No indexed genomes found on the server. ");
        }
        let splitArray = (array) => {
            const result = [];
            // One oligo per request so the gunsight advances one-at-a-time, left→right.
            const chunkSize = 1;
            for (let i = 0; i < array.length; i += chunkSize) {
                const chunk = array.slice(i, i + chunkSize);
                result.push(chunk);
            }
            return result;
        }

        let runOffTargets = async (oligos, seqList, __editDistance, genomes) => {
            const __t0 = Date.now();
            let rr = []
            // Map every queried id (oligo id, and amplicon left/right/mid ids) back to
            // the drawable oligo, so the one currently being searched can glow purple.
            const __idToOligo = new Map();
            for (let o of oligos) {
                if (o == null) continue;
                if (o.id != null) __idToOligo.set(String(o.id), o);
                if (o.type === 'amplicon') {
                    for (const part of [o.left, o.right, o.mid]) {
                        if (part && part.id != null) __idToOligo.set(String(part.id), o);
                    }
                }
            }

            // Zoom/center the view on the oligo currently being searched (instant, so the
            // scan can move quickly through up to 200 oligos).
            const centerOnOligo = (o) => {
                try {
                    if (!o) return;
                    let t = o.track || o.__track || null;
                    if (!t) { for (const tr of (graph.track || [])) { if (tr && o.xi >= Math.min(tr.xi, tr.xf) && o.xi <= Math.max(tr.xi, tr.xf)) { t = tr; break; } } }
                    if (!t || !t.tgraph) return;
                    const gg = (typeof graph.setxmin === 'function') ? graph : graph.graph;
                    const grid = (gg && gg.grid) ? gg.grid : gg;
                    if (!grid || !grid.setxmin) return;
                    const HALF = 45;   // bases of context on each side of the oligo
                    const a = t.tgraph.X(Math.min(o.xi, o.xf) - HALF), b = t.tgraph.X(Math.max(o.xi, o.xf) + HALF);
                    grid.setxmin(Math.min(a, b)); grid.setxmax(Math.max(a, b));
                    const ht = -1 * t.tgraph.height, yi = t.tgraph.yi - ht, band = 0.5 * 0.9;
                    grid.setymin(yi - band); grid.setymax(yi + band);
                    if (grid.rescale) grid.rescale();
                } catch (e) { }
            };
            let progressBar;
            let w = {
                wid: 'progress',
                componentRef: 'progressBar',
                data: {
                    'progress': 0,
                    'progressBar': createIonFunction((progessBar) => {
                        progressBar = progessBar;
                    })
                }
            }
            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
            CurrentLayout.setComponent('buttonMenuPanel', w);

            // Block the app while the run is in progress: disable canvas interaction and
            // show a modal whose ONLY actionable control is Cancel. Cancel stops the run.
            let __cancelled = false;
            let __modalPB = null;
            try { graph.setMouseMode('none'); graph.clearMouseListeners(); } catch (e) { }
            const __runModal = {
                wid: 'card',
                data: {
                    cards: [
                        [{ 'width': '100%', 'component': { wid: 'html', data: `<div style="padding:14px 20px;font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#eaf6f9;background:rgba(10,37,64,0.98);border:1px solid #1aa3bd;border-radius:10px;"><div style="font-size:15px;font-weight:700;">Running off-targets…</div><div style="font-size:12.5px;color:#8fb8c8;margin-top:4px;">Scanning oligos one at a time, left→right — the app is locked until this finishes.</div></div>` } }],
                        [{ 'width': '100%', 'component': { wid: 'progress', data: { 'progress': 0, 'progressBar': createIonFunction((pb) => { __modalPB = pb; }) } } }],
                        [{ 'width': '100%', 'component': { wid: 'mt-button', data: { buttons: [{ label: 'Cancel', ionFunction: createIonFunction(() => { __cancelled = true; }) }] } } }]
                    ]
                }
            };
            try { showModal(__runModal, 460, 210); } catch (e) { }
            const __finishRun = () => {
                try { for (const o of oligos) { if (o) o.__gunsight = false; } } catch (e) { }
                try { hideAllModal(); } catch (e) { }
                try { graph.setMouseMode('navigate'); graph.clearMouseListeners(); exec('baja/manchester/menu/mouse-over-highlight.js', graph, graph.genegraph_panel_layout); } catch (e) { }
            };

            let sp = splitArray(seqList);
            let index = 0;
            for (let s of sp) {
                if (__cancelled) break;
                // Glow the oligos in THIS chunk purple while their off-targets are
                // computed, so progress is visible in real time. Cleared once the
                // chunk's result returns.
                const __chunkOligos = [];
                for (const item of s) {
                    const o = __idToOligo.get(String(item && item.id));
                    if (o && __chunkOligos.indexOf(o) < 0) __chunkOligos.push(o);
                }
                // Put the targeting gunsight (+ a red glow) on the oligo(s) being searched,
                // and zoom/center the view on it.
                for (const o of __chunkOligos) { try { o.__gunsight = true; o.highlight(0, 'red'); } catch (e) { } }
                try { if (__chunkOligos[0]) centerOnOligo(__chunkOligos[0]); } catch (e) { }
                try { if (graph.wake) graph.wake(); } catch (e) { }

                let r = null;
                try {
                    let obj = {
                        "editDistance": __editDistance,
                        "strand": "+-",
                        "genomes": genomes,
                        "sequences": s,
                        "runMode": returnMode
                    }
                    // Same baja app server that served /genomes.
                    const oep = window["env"]["apiUrl"] || window["env"]["offtarget"] || '';
                    let uri = `${oep}/off-targets-file`;
                    r = await POSTJSON(obj, uri)
                    rr.push(r)
                } finally {
                    // This oligo finished (or errored) — clear its gunsight + glow.
                    for (const o of __chunkOligos) { try { o.__gunsight = false; o.highlight__ = false; } catch (e) { } }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                }

                if (r != null && r['oligoQuery'] != null) {
                    let oq = r['oligoQuery'];
                    console.log(" setting the asos with offtargets ")
                    for (let o of oligos) {
                        for (let off of oq) {
                            if (String(o.id) == String(off.id)) {
                                if (off.offtarget.length > 1000) {
                                    o.offtarget = off.offtarget.length + ''
                                } else {
                                    o.offtarget = off.offtarget;
                                    if (o.offtarget.length === 0) {
                                        o.offtarget = null;
                                    }
                                }
                                // Gene symbols of the off-target hits come straight from
                                // the search result (each index carries per-transcript
                                // gene_symbol). Distinct list, capped for the on-canvas arc.
                                if (Array.isArray(off.offtargetsymbols) && off.offtargetsymbols.length) {
                                    o.offtargetsymbols = off.offtargetsymbols.slice(0, 30);
                                }
                                o.showOfftargets = true;
                            }
                        }
                    }
                }

                // Live filter: after each chunk's results are applied, let the caller
                // remove oligos in real time (e.g. those exceeding an off-target max).
                if (options && typeof options.liveFilter === 'function') {
                    try { options.liveFilter(oligos); } catch (e) { }
                }

                index++;
                progressBar((index / sp.length) * 100)
                try { if (__modalPB) __modalPB((index / sp.length) * 100); } catch (e) { }
            }

            // Run finished (or was cancelled) — unblock the app.
            __finishRun();
            if (__cancelled) { graph.setMessage(' Off-target run cancelled. '); return; }

            // Live-filter mode: everything was removed in real time as chunks
            // completed. Skip the single-oligo menu and the summary modal — just
            // finish up and re-arm the hover highlight.
            if (options && typeof options.liveFilter === 'function') {
                try { options.liveFilter(oligos); } catch (e) { }
                try { if (typeof options.onDone === 'function') options.onDone(); } catch (e) { }
                try { graph.setMouseMode('navigate'); } catch (e) { }
                try { graph.clearMouseListeners(); exec('baja/manchester/menu/mouse-over-highlight.js', graph, graph.genegraph_panel_layout); } catch (e) { }
                return;
            }

            graph.setMessage("loading off-targets...")

            await exec('baja/manchester/menu/menu-for-single-aso.js', graph, current, graph.genegraph_panel_layout)

            // Off-target run is done — return the canvas to mouse-over-highlight mode.
            try { graph.setMouseMode('navigate'); } catch (e) { }

            // Show a SUMMARY + STATISTICS panel for the run.
            try {
                const __offCount = (o) => { const v = o && o.offtarget; if (v == null) return 0; if (Array.isArray(v)) return v.length; const n = parseInt(v, 10); return isNaN(n) ? 0 : n; };
                let totalHits = 0, withHits = 0;
                for (const o of oligos) { const c = __offCount(o); totalHits += c; if (c > 0) withHits++; }
                const distinctSymbols = new Set();
                for (const o of oligos) { for (const s of (o.offtargetsymbols || [])) distinctSymbols.add('' + s); }
                const __anyOff = withHits > 0;

                const elapsedS = ((Date.now() - __t0) / 1000);
                const dataset = (Array.isArray(genomes) ? genomes : [genomes]).filter(Boolean).join(', ') || '—';
                const queriesRun = seqList.length;
                // Tropical "info window" look: navy card, cyan accents, light text.
                const row = (k, v) => `<tr><td style="padding:4px 18px 4px 0;color:#8fb8c8;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:4px 0;font-weight:600;color:#ffffff;">${v}</td></tr>`;
                const cardOpen = `<div style="padding:18px 22px;border-radius:10px;background:rgba(10,37,64,0.98);border:1px solid #1aa3bd;box-shadow:0 8px 26px rgba(8,22,38,0.5);font-family:'Segoe UI',system-ui,-apple-system,Arial,sans-serif;color:#eaf6f9;">`;
                const accent = `<div style="height:2px;background:#4fd0e6;width:52px;border-radius:2px;margin-bottom:12px;"></div>`;

                const single = (oligos.length === 1 && oligos[0] && oligos[0].type !== 'amplicon') ? oligos[0] : null;
                let html;
                if (single) {
                    // Comprehensive report for the single oligo that was run.
                    const o = single;
                    const hits = Array.isArray(o.offtarget) ? o.offtarget : [];
                    const hitCount = Array.isArray(o.offtarget) ? o.offtarget.length : __offCount(o);
                    const q = __querySeq(o);
                    const syms = (o.offtargetsymbols || []);
                    // Collapse hits by GENE symbol — the same gene appears once per
                    // transcript isoform in an all-transcripts index, so 11 FGFR1
                    // isoform hits are ONE off-target gene, not 11.
                    const bySym = new Map();
                    for (const h of hits) {
                        const k = h.symbol || '—';
                        let g = bySym.get(k);
                        if (!g) { g = { count: 0, minEd: Infinity, examples: [] }; bySym.set(k, g); }
                        g.count++;
                        const ed = (h.editdistance != null ? +h.editdistance : null);
                        if (ed != null && ed < g.minEd) g.minEd = ed;
                        if (g.examples.length < 3) g.examples.push((h.chr || '') + (h.start != null ? (':' + h.start) : '') + (h.strand ? (' ' + h.strand) : ''));
                    }
                    const symKeys = Array.from(bySym.keys()).sort((a, b) => bySym.get(b).count - bySym.get(a).count || a.localeCompare(b));
                    const geneCount = symKeys.length;
                    const shownSyms = symKeys.slice(0, 300);
                    const cell = (v) => `<td style="padding:3px 12px 3px 0;color:#eaf6f9;white-space:nowrap;">${v == null ? '' : v}</td>`;
                    let hitRows = '';
                    for (const k of shownSyms) {
                        const g = bySym.get(k);
                        const ed = isFinite(g.minEd) ? g.minEd : '';
                        hitRows += `<tr>${cell('<b>' + k + '</b>')}${cell(g.count + ' transcript' + (g.count === 1 ? '' : 's'))}${cell('ed ' + ed)}${cell('<span style="color:#8fb8c8;">' + g.examples.join('; ') + '</span>')}</tr>`;
                    }
                    const more = symKeys.length > shownSyms.length ? `<div style="color:#8fb8c8;font-size:12px;margin-top:6px;">… and ${(symKeys.length - shownSyms.length).toLocaleString()} more gene(s)</div>` : '';
                    const hitsTable = hits.length
                        ? `<div style="max-height:220px;overflow:auto;margin-top:8px;border-top:1px solid rgba(26,163,189,0.35);">
                             <table style="border-collapse:collapse;font-size:12px;width:100%;">
                               <tr style="color:#8fb8c8;text-align:left;position:sticky;top:0;background:#0a2540;"><th style="padding:5px 12px 5px 0;">Gene</th><th style="padding-right:12px;">Transcripts</th><th style="padding-right:12px;">Best edit</th><th>Example loci</th></tr>
                               ${hitRows}
                             </table></div>${more}`
                        : `<div style="color:#8fb8c8;margin-top:8px;">No off-target hits found.</div>`;
                    html = `${cardOpen}
                      <div style="font-size:16px;font-weight:700;color:#ffffff;margin-bottom:4px;">Off-target report — ${o.name || o.id || 'oligo'}</div>
                      ${accent}
                      <table style="border-collapse:collapse;font-size:13px;">
                        ${row('Dataset (index)', dataset)}
                        ${row('Edit distance', __editDistance)}
                        ${row('Search mode', (returnMode || 'editdistance'))}
                        ${row('Query sequence', '<span style="font-family:monospace;letter-spacing:0.5px;">' + (q || '—') + '</span>')}
                        ${row('Off-target genes', geneCount.toLocaleString())}
                        ${row('Transcript hits (all isoforms)', hitCount.toLocaleString())}
                        ${row('Elapsed time', elapsedS.toFixed(1) + ' s')}
                      </table>
                      ${syms.length ? `<div style="margin-top:8px;color:#8fb8c8;font-size:12px;">Genes: <span style="color:#eaf6f9;">${syms.slice(0, 60).join(', ')}</span></div>` : ''}
                      ${hitsTable}
                    </div>`;
                } else {
                    html = `${cardOpen}
                      <div style="font-size:16px;font-weight:700;color:#ffffff;margin-bottom:4px;">Off-target run complete</div>
                      ${accent}
                      <table style="border-collapse:collapse;font-size:13px;">
                        ${row('Dataset (index)', dataset)}
                        ${row('Edit distance', __editDistance)}
                        ${row('Search mode', (returnMode || 'editdistance'))}
                        ${row('Oligos run', oligos.length)}
                        ${row('Queries run', queriesRun)}
                        ${row('Oligos with off-targets', withHits + ' / ' + oligos.length)}
                        ${row('Total off-target hits', totalHits.toLocaleString())}
                        ${row('Distinct gene symbols', distinctSymbols.size.toLocaleString())}
                        ${row('Elapsed time', elapsedS.toFixed(1) + ' s')}
                      </table>
                    </div>`;
                }

                const buttons = [];
                if (__anyOff) {
                    buttons.push({
                        label: 'Filter by off-targets', ionFunction: createIonFunction(() => {
                            try { hideAllModal(); } catch (e) { }
                            exec('baja/manchester/menu/annotation/filter-compounds-panel.js', graph, genegraph_panel_layout);
                        })
                    });
                }
                buttons.push({
                    label: 'Continue designing', ionFunction: createIonFunction(() => {
                        try { hideAllModal(); } catch (e) { }
                        exec('baja/manchester/menu/compound-editor.js', graph, genegraph_panel_layout);
                    })
                });
                buttons.push({
                    label: 'Close', ionFunction: createIonFunction(() => { try { hideAllModal(); } catch (e) { } })
                });

                // Centered modal window (like the info window) rather than a docked panel.
                const panel = {
                    wid: 'card',
                    data: {
                        cards: [
                            [{ 'width': '100%', 'component': { wid: 'html', data: html } }],
                            [{ 'title': '', 'width': '100%', 'component': { wid: 'mt-button', data: { buttons: buttons } } }]
                        ]
                    }
                };
                showModal(panel, single ? 600 : 460, single ? 620 : 420);
                graph.setMessage(' Off-target run: ' + withHits + '/' + oligos.length + ' oligo(s) with hits, ' + totalHits.toLocaleString() + ' total, ' + elapsedS.toFixed(1) + 's. ');
            } catch (e) { console.warn('off-target summary panel failed', e); }

        }

        // Build the sequence list (handles amplicon left/right/mid) and flag repeats.
        const buildSeqList = () => {
            const pattern = /(\w)\1{3,}/g;
            let warn = false;
            const seqList = [];
            if (__seedMode) {
                // Only siRNA-style oligos (with a guide/seed) are queried by seed.
                for (let o of oligos) {
                    const seed = __seedOf(o);
                    if (seed) { o.offtarget = null; seqList.push({ "id": o.id, "synthesisSequence": seed }); }
                }
                return { seqList, warn };
            }
            for (let o of oligos) {
                if (o.type === 'amplicon') {
                    for (const part of [o.right, o.left, o.mid]) {
                        const pq = __toDNA(part && part.synthesisSequence);
                        if (part && pq && pq.length > 0) {
                            part.offtarget = null;
                            if (pq.match(pattern)) { warn = true; graph.setMessage("Found potential high hit pattern."); }
                            seqList.push({ "id": part.id, "synthesisSequence": pq });
                        }
                    }
                } else {
                    const q = __querySeq(o);   // guide seq for siRNA, synthesis seq otherwise
                    if (!q || q.length <= 0) o.offtarget = null;
                    if (q && q.length > 0) {
                        if (q.match(pattern)) { warn = true; graph.setMessage("Found potential high hit pattern."); }
                        seqList.push({ "id": o.id, "synthesisSequence": q });
                    }
                }
            }
            return { seqList, warn };
        };

        // Run off-targets for a chosen genome + edit distance (confirm on repeats).
        const runWith = async (genome, editDistance) => {
            graph.showSideMenu(null);
            returnMode = 'editdistance';
            // Seed searches never allow more than 1 edit distance.
            if (__seedMode && +editDistance > 1) editDistance = 1;
            graph.setMessage("Checking sequences...");
            const genomes = [genome];
            // Clear ALL off-target attributes on every oligo (and amplicon sub-oligos)
            // before each run so stale results from a previous run are never shown.
            const clearOff = (x) => {
                if (!x) return;
                x.offtarget = null;
                x.offtargetsymbols = null;
                x._offtarget = null;
                x.showOfftargets = false;
            };
            for (const o of oligos) {
                if (o && o.type === 'amplicon') { clearOff(o.left); clearOff(o.right); clearOff(o.mid); clearOff(o); }
                else clearOff(o);
            }
            const { seqList, warn } = buildSeqList();
            const doRun = () => { graph.setMessage(" Edit distance : " + editDistance); runOffTargets(oligos, seqList, editDistance, genomes); };
            if (warn) {
                const confirm = await exec('baja/lib/confirm.js',
                    'Repeat sequences were found.  This could cause a problem with the off-target analysis.  Continue?',
                    async () => { doRun(); });
                showModal(confirm);
            } else {
                doRun();
            }
        };

        // Menu flow: pick a species, then a genome index, then an edit distance, then run.
        const genomeNames = Object.keys(available_genomes);
        const speciesOf = (name) => {
            const s = ('' + name).toLowerCase();
            if (s.includes('human') || s.includes('homo_sapiens') || s.includes('grch38') || /^hg\d/.test(s)) return 'Human';
            if (s.includes('mouse') || s.includes('mus_musculus') || s.includes('grcm') || /^mm\d/.test(s)) return 'Mouse';
            if (s.includes('rat') || s.includes('rattus')) return 'Rat';
            if (s.includes('yeast') || s.includes('cerevisiae')) return 'Yeast';
            if (s.includes('dog') || s.includes('canis')) return 'Dog';
            const pre = ('' + name).split(/[_.]/)[0] || 'Other';
            return pre.charAt(0).toUpperCase() + pre.slice(1);
        };
        const speciesMap = {};
        for (const g of genomeNames) { const sp = speciesOf(g); (speciesMap[sp] = speciesMap[sp] || []).push(g); }
        const speciesList = Object.keys(speciesMap).sort();

        const showEditDistanceMenu = (genome, species) => {
            // Seed searches use a short 8-mer, where edit distance > 1 matches almost
            // everything — so only 0 and 1 are offered in seed mode.
            const allowed = __seedMode ? [0, 1] : [0, 1, 2, 3];
            const m = allowed.map((d) => ({
                label: 'Edit distance ' + d, click: () => { runWith(genome, Math.min(d, __seedMode ? 1 : 3)); }, move: () => { }
            }));
            m.push({ label: '‹ Back to genomes', click: () => { showGenomeMenu(species); }, move: () => { } });
            m.push({ label: 'Cancel', click: () => { graph.showSideMenu(null); }, move: () => { } });
            graph.setMessage(' ' + genome + ' — choose edit distance ' + (__seedMode ? '(seed: max 1) ' : ''));
            graph.showSideMenu(m);
        };
        const showGenomeMenu = (species) => {
            const names = speciesMap[species] || [];
            if (!names.length) { graph.setMessage(' No indexed genomes for ' + species + '. '); return; }
            const m = names.map((g) => ({ label: g, click: () => { showEditDistanceMenu(g, species); }, move: () => { } }));
            m.push({ label: '‹ Back to species', click: () => { showSpeciesMenu(); }, move: () => { } });
            m.push({ label: 'Cancel', click: () => { graph.showSideMenu(null); }, move: () => { } });
            graph.setMessage(' ' + species + ' — select a genome index ');
            graph.showSideMenu(m);
        };
        const showSpeciesMenu = () => {
            if (!speciesList.length) { graph.setMessage(' No indexed genomes found on the server. '); return; }
            if (speciesList.length === 1) { showGenomeMenu(speciesList[0]); return; }   // skip if only one
            const m = speciesList.map((sp) => ({ label: sp + ' (' + speciesMap[sp].length + ')', click: () => { showGenomeMenu(sp); }, move: () => { } }));
            m.push({ label: 'Cancel', click: () => { graph.showSideMenu(null); }, move: () => { } });
            graph.setMessage(' Select a species ');
            graph.showSideMenu(m);
        };
        showSpeciesMenu();
        resolve();

    })

}
