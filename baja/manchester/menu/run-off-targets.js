function (graph, genegraph_panel_layout, oligos, options) {

    // Off-targets are an EDITOR-only capability. The read-only VIEWER (manchester/viewer.js sets
    // graph.viewer = true) must NOT run off-targets — block every entry point here in one place.
    if (graph && graph.viewer) {
        try { graph.setMessage(' Off-target scanning is only available in the editor, not in the viewer. '); } catch (e) { }
        try { if (options && typeof options.onDone === 'function') options.onDone(); } catch (e) { }
        return;
    }

    // Seed-sequence mode: for siRNA, query the off-target index with just the
    // guide seed region (positions 2-9, an 8-mer that meets the index minimum)
    // instead of the full strand.
    const __seedMode = !!(options && options.seed);
    // Per-sequence hit-count threshold for UTR datasets (1 = no filtering; set in runWith).
    let hitCountThreshold = 1;
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
        const isSiRNA = (o.type === 'siRNA' || (o.sense && o.antisense));
        // Query from the oligo's OWN strand — reliable and INDEPENDENT of any track lookup. Guessing
        // the oligo's track by xi-overlap grabbed the WRONG track when several compounds share xi=0
        // (e.g. two clinical-compound tracks), producing a query derived from a different compound.
        // siRNA → the guide (antisense); single-stranded ASO → the synthesis sequence. The DNA index
        // is searched on BOTH strands, so the compound's antisense target sites are found either way.
        let g = isSiRNA
            ? __toDNA(o.antisense || o.guide || o.synthesisSequence || o.sequence)
            : __toDNA(o.synthesisSequence || o.sequence);
        // Exclude a 3' overhang: the recorded one, or a common dTdT (TT) the fields didn't capture.
        let oh = __toDNA(o.antisenseOverhang || o.senseOverhang || o.overhang);
        if (!oh && isSiRNA && /TT$/.test(g) && g.length > 12) oh = 'TT';
        if (oh && g.length > oh.length && g.slice(-oh.length) === oh) g = g.slice(0, g.length - oh.length);
        if (g && g.length >= 8) return g;
        // Fallback ONLY if the oligo carried no usable sequence: derive from the oligo's OWN track's
        // target region (prefer o.__track; never guess a track by xi overlap that isn't the oligo's).
        try {
            const t = o.track || o.__track || null;
            if (t && t.getSequenceRange && Biopolymer) {
                const lo = Math.min(o.xi, o.xf), hi = Math.max(o.xi, o.xf);
                const tgt = __toDNA(t.getSequenceRange(lo, hi));
                if (tgt && tgt.length >= 8) return __toDNA(Biopolymer.reverseComp(tgt));
            }
        } catch (e) { }
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
            //
            // EXCEPT on the free tier, where a request is what gets metered. At one oligo per
            // request a free user spends a whole month's allowance on ten oligos, which is not
            // what "ten searches a month" is meant to buy. Batching to the server's per-search
            // cap makes an allowance of ten searches cover up to a hundred compounds.
            //
            // Subscribers keep the one-at-a-time gunsight: nothing is metered for them, so
            // there is nothing to trade the animation for.
            let __free = false;
            try { __free = !!window.__bajaFreeTier; } catch (e) { }
            const chunkSize = __free ? 10 : 1;
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

            // Smoothly zoom/center the view on an oligo (animated ~320ms ease-out). Returns a
            // Promise that resolves when the animation completes.
            const centerOnOligo = (o) => new Promise((res) => {
                try {
                    if (!o) { res(); return; }
                    let t = o.track || o.__track || null;
                    // Find the oligo's OWN track by membership (never guess by xi-overlap, which picks
                    // the wrong track when several compounds share xi=0).
                    if (!t) { for (const tr of (graph.track || [])) { if (tr && tr.oligos && tr.oligos.indexOf(o) >= 0) { t = tr; break; } } }
                    if (!t) { for (const tr of (graph.track || [])) { if (tr && o.xi >= Math.min(tr.xi, tr.xf) && o.xi <= Math.max(tr.xi, tr.xf)) { t = tr; break; } } }
                    if (!t || !t.tgraph) { res(); return; }
                    const gg = (typeof graph.setxmin === 'function') ? graph : graph.graph;
                    const grid = (gg && gg.grid) ? gg.grid : gg;
                    if (!grid || !grid.setxmin) { res(); return; }
                    const HALF = 60;   // bases of context on each side (shows the trailing + leading oligo)
                    const a = t.tgraph.X(Math.min(o.xi, o.xf) - HALF), b = t.tgraph.X(Math.max(o.xi, o.xf) + HALF);
                    const txMin = Math.min(a, b), txMax = Math.max(a, b);
                    // Center vertically on the OLIGO itself (it's drawn in a lane above the track baseline),
                    // not on the track baseline — otherwise the oligo lands off the bottom of the
                    // view. The oligo's world y is t.tgraph.Y(o.y); fall back to the track baseline.
                    // Vertical framing: use gene.js's proven track-centering (the y-axis is INVERTED, so
                    // ymin = yi+height and ymax = yi). A symmetric band around the oligo's world y
                    // produced a non-inverted range that silently broke the y pan. The track band
                    // includes the oligo's lane, so it stays in view. Pad ~15% of the height so
                    // oligos in the top lanes aren't clipped at the edge.
                    const __h = t.tgraph.height;
                    const __pad = 0.15 * Math.abs(__h || 1);
                    const tyMin = t.tgraph.yi + __h + (__h >= 0 ? __pad : -__pad);
                    const tyMax = t.tgraph.yi - (__h >= 0 ? __pad : -__pad);
                    const sxMin = grid.getxmin(), sxMax = grid.getxmax(), syMin = grid.getymin(), syMax = grid.getymax();
                    const DUR = 320, ease = (p) => 1 - Math.pow(1 - p, 3), t0 = Date.now();
                    const step = () => {
                        const p = Math.min(1, (Date.now() - t0) / DUR), e = ease(p);
                        grid.setxmin(sxMin + (txMin - sxMin) * e); grid.setxmax(sxMax + (txMax - sxMax) * e);
                        grid.setymin(syMin + (tyMin - syMin) * e); grid.setymax(syMax + (tyMax - syMax) * e);
                        if (grid.rescale) grid.rescale();
                        if (graph.wake) graph.wake();
                        if (p < 1) setTimeout(step, 16); else res();
                    };
                    step();
                } catch (e) { res(); }
            });
            let progressBar;
            let __cancelled = false;
            let __freeLimit = null;   // set when the server refuses for free-tier allowance
            // Progress bar + a Cancel button right beside it (stops the calculation).
            let w = {
                wid: 'card',
                data: {
                    cards: [[
                        { 'width': '100%', 'component': { wid: 'progress', componentRef: 'progressBar', data: { 'progress': 0, 'progressBar': createIonFunction((progessBar) => { progressBar = progessBar; }) } } },
                        { 'width': '100%', 'component': { wid: 'mt-button', data: { buttons: [{ label: 'Cancel', ionFunction: createIonFunction(() => { __cancelled = true; }) }] } } }
                    ]]
                }
            }
            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
            CurrentLayout.setComponent('buttonMenuPanel', w);

            // Lock canvas interaction while the run is in progress (it auto-frames each oligo as it
            // goes). Progress + Cancel live in the buttonMenuPanel — no modal window.
            try { graph.setMouseMode('none'); graph.clearMouseListeners(); } catch (e) { }
            const __finishRun = () => {
                try { for (const o of oligos) { if (o) o.__gunsight = false; } } catch (e) { }
                try { hideAllModal(); } catch (e) { }
                try { graph.setMouseMode('navigate'); graph.clearMouseListeners(); exec('baja/manchester/menu/mouse-over-highlight.js', graph, graph.genegraph_panel_layout); } catch (e) { }
            };

            let sp = splitArray(seqList);
            let index = 0;
            // Progress in the shared status indicator (centred under the canvas buttons), not
            // just a transient canvas message. An off-target run is the longest thing in the
            // app: it walks every selected oligo against every chosen index, and without this
            // the only sign it was working was oligos glowing one at a time.
            //
            // The index NAMES are in the message because they are what makes the wait long --
            // human_premrna is an 8 GB index and takes far longer than a cDNA one -- and the
            // count/total says how much of the run is left.
            const __idxLabel = (Array.isArray(genomes) ? genomes : []).join(', ') || 'the selected index';
            const __total = sp.length;
            let __done = 0;
            const __say = (phase) => {
                try {
                    window.__workStatus = 'Off-targets · ' + __idxLabel
                        + ' · ' + Math.min(__done + 1, __total) + ' of ' + __total
                        + (phase ? ('  ·  ' + phase) : '');
                    if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                } catch (e) { }
            };
            const __sayDone = () => {
                try {
                    window.__workStatus = '';
                    if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
                } catch (e) { }
            };

            let __framePrev = null;   // previously-completed oligo (camera trails one behind)
            for (let s of sp) {
                if (__cancelled) break;
                // Name the oligo being searched, so the message tracks the glowing one.
                try {
                    const __first = __idToOligo.get(String((s && s[0] && s[0].id)));
                    __say(__first ? ('' + (__first.name || __first.id || 'oligo')) : '');
                } catch (e) { __say(''); }
                // Glow the oligos in THIS chunk purple while their off-targets are
                // computed, so progress is visible in real time. Cleared once the
                // chunk's result returns.
                const __chunkOligos = [];
                for (const item of s) {
                    const o = __idToOligo.get(String(item && item.id));
                    if (o && __chunkOligos.indexOf(o) < 0) __chunkOligos.push(o);
                }
                // Put the targeting gunsight (+ a red glow) on the oligo being searched.
                for (const o of __chunkOligos) { try { o.__gunsight = true; o.highlight(0, 'red'); } catch (e) { } }
                // Stay one oligo BEHIND the calculation: smoothly frame the PREVIOUS oligo —
                // whose off-target results are already in — while THIS one is computed.
                try { if (__framePrev) await centerOnOligo(__framePrev); } catch (e) { }
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
                    __done++;
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                }

                // Out of free allowance: the server answers 402 instead of results. Stop the
                // whole run here -- carrying on would mark every remaining oligo "not
                // determined", which reads as a search that found nothing.
                __freeLimit = freeLimitInfo(r);
                if (__freeLimit) { __cancelled = true; break; }

                if (r != null && r['oligoQuery'] != null) {
                    let oq = r['oligoQuery'];
                    console.log(" setting the asos with offtargets ")
                    for (let o of oligos) {
                        for (let off of oq) {
                            if (String(o.id) == String(off.id)) {
                                // miRNA-like off-target (UTR datasets): group the seed hits BY GENE and
                                // keep only genes hit >= hitCountThreshold times — a single hit on a gene
                                // is NOT an off-target. Grouping by GENE (symbol), not chr/transcript, so
                                // a gene's hits across its transcripts are summed.
                                if (hitCountThreshold > 1 && Array.isArray(off.offtarget) && off.offtarget.length) {
                                    const __geneKey = (h) => {
                                        if (!h) return '?';
                                        const s = ('' + (h.symbol || '')).trim(); if (s) return s;
                                        const g = ('' + (h.gene || h.gene_symbol || '')).trim(); if (g) return g;
                                        const c = ('' + (h.chr || h.seq || h.name || '')).trim(); if (c) return c;
                                        return JSON.stringify(h);
                                    };
                                    const __byGene = {};
                                    for (const __h of off.offtarget) { const __k = __geneKey(__h); (__byGene[__k] = __byGene[__k] || []).push(__h); }
                                    let __kept = [];
                                    for (const __k in __byGene) { if (__byGene[__k].length >= hitCountThreshold) __kept = __kept.concat(__byGene[__k]); }
                                    off.offtarget = __kept;
                                    // Recompute the gene list from the kept (qualifying) hits.
                                    const __symSet = new Set(__kept.map((h) => h && h.symbol).filter(Boolean).map((s) => ('' + s).trim()));
                                    if (__symSet.size) off.offtargetsymbols = Array.from(__symSet);
                                }
                                if (off.offtarget == null) {
                                    // The server returned NO off-target result for this oligo — it could
                                    // not be searched (e.g. its genome/strand isn't indexed, or a
                                    // per-oligo search failure). This is "not determined", NOT a genuine
                                    // zero; the badge shows N/A for it (null + offtargetsRun → see oligo.js).
                                    o.offtarget = null;
                                } else if (off.offtarget.length > 1000) {
                                    o.offtarget = off.offtarget.length + ''
                                } else if (off.offtarget.length === 0) {
                                    o.offtarget = "0";   // genuinely zero off-targets → show "0", not N/A
                                } else {
                                    o.offtarget = off.offtarget;
                                }
                                // Gene symbols of the off-target hits come straight from
                                // the search result (each index carries per-transcript
                                // gene_symbol). Distinct list, capped for the on-canvas arc.
                                if (Array.isArray(off.offtargetsymbols) && off.offtargetsymbols.length) {
                                    // Keep the TRUE distinct-gene count before capping the display list —
                                    // the badge shows this, so it stays accurate even past 30 genes.
                                    o.offtargetGeneCount = new Set(off.offtargetsymbols.map((s) => ('' + s).trim()).filter(Boolean)).size;
                                    o.offtargetsymbols = off.offtargetsymbols.slice(0, 30);
                                }
                                o.showOfftargets = true;
                                o.offtargetsRun = true;   // searched (incl. zero-hit) → allow the "0" badge
                                o.offtargetEditDistance = __editDistance;   // the edit distance this run used
                                o.offtargetDataset = (Array.isArray(genomes) ? genomes[0] : genomes) || null;
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
                try { if (typeof progressBar === 'function') progressBar((index / sp.length) * 100); } catch (e) { }
                __framePrev = (__chunkOligos && __chunkOligos[0]) || __framePrev;   // now completed
            }

            // Frame the LAST completed oligo so its results are shown (the camera trailed by one).
            try { if (!__cancelled && __framePrev) await centerOnOligo(__framePrev); } catch (e) { }

            // Run finished (or was cancelled) — unblock the app and drop the status, whichever
            // way it ended. Every return below this point is after the run is over.
            __finishRun();
            __sayDone();
            if (__freeLimit) { graph.setResultMessage(' No more free GPU time.  ;-) '); return; }
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
                const __dsList = (Array.isArray(genomes) ? genomes : [genomes]).filter(Boolean);
                const dataset = __dsList.join(', ') || '—';
                const queriesRun = seqList.length;
                // A one-paragraph plain-language description of the reference dataset(s) that were
                // searched — so the reader knows exactly what an off-target hit means for each index.
                const __datasetDesc = (nm) => {
                    const s = ('' + nm).toLowerCase();
                    const sp = (s.includes('mouse') || s.includes('mus_')) ? 'Mouse'
                        : (s.includes('rat') || s.includes('rattus')) ? 'Rat' : 'Human';
                    if (s.includes('virus') || s.includes('viral')) return 'NCBI RefSeq viral reference genomes — complete genome sequences spanning human and non-human viruses (~19,600 viral genomes, ~580 Mbp). A hit flags unintended complementarity to a viral genome, useful when screening an oligo against viral sequence space or checking for adventitious-agent / vector cross-reactivity.';
                    if (s.includes('3utr') || s.includes('3_utr')) return sp + ' 3′UTR sequences — the 3′ untranslated regions of protein-coding transcripts. This is the dominant site of miRNA-like, seed-mediated off-targeting: a guide/antisense strand whose seed matches many 3′UTRs can silence unintended genes.';
                    if (s.includes('5utr') || s.includes('5_utr')) return sp + ' 5′UTR sequences — the 5′ untranslated regions of protein-coding transcripts, a secondary site of seed-mediated and structural off-targeting.';
                    if (s.includes('premrna') || s.includes('pre-mrna') || s.includes('pre_mrna')) return sp + ' pre-mRNA (Ensembl) — unspliced primary transcripts including introns. Captures intronic and splice-junction off-targets that a mature-mRNA index cannot see; relevant for nuclear-acting gapmer ASOs.';
                    if (s.includes('ncrna')) return sp + ' non-coding RNA (Ensembl) — lncRNAs, snRNAs, snoRNAs, miRNA precursors and other ncRNAs. Hits indicate potential hybridization to regulatory or structural non-coding transcripts.';
                    if (s.includes('all_transcripts')) return sp + ' transcriptome (Ensembl) — every annotated transcript: protein-coding mRNAs and non-coding RNAs, all isoforms. The broadest ' + sp.toLowerCase() + ' off-target reference; a hit means the oligo can base-pair with an expressed transcript.';
                    if (s.includes('cdna')) return sp + ' cDNA (Ensembl) — spliced, mature protein-coding transcript sequences (all isoforms). Off-targets here are mature mRNAs the oligo could hybridize to.';
                    return sp + ' reference (Ensembl) — searched for complementary sites in the ' + sp.toLowerCase() + ' transcriptome.';
                };
                const __dsPara = __dsList.length ? __dsList.map(__datasetDesc).join(' ') : 'The reference index searched for Levenshtein off-target sites.';
                const __dsBlock = `<div style="margin:0 0 12px;padding:10px 12px;background:rgba(79,208,230,0.08);border-left:3px solid #4fd0e6;border-radius:6px;font-size:12.5px;line-height:1.55;color:#cfe6ee;"><span style="color:#4fd0e6;font-weight:700;">Dataset — ${__dsList.join(', ') || '—'}.</span> ${__dsPara} <span style="color:#8fb8c8;">Search: Levenshtein edit distance ≤ ${__editDistance}, both strands.</span></div>`;
                // Tropical "info window" look: navy card, cyan accents, light text.
                const row = (k, v) => `<tr><td style="padding:4px 18px 4px 0;color:#8fb8c8;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:4px 0;font-weight:600;color:#ffffff;">${v}</td></tr>`;
                // The navy demo-style overlay (below) supplies the panel frame; this inner wrapper
                // only carries the font/text color so the content sits cleanly inside it.
                const cardOpen = `<div style="font-family:'Segoe UI',system-ui,-apple-system,Arial,sans-serif;color:#eaf6f9;">`;
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
                        // ↗ Map opens the off-target mapper: load this gene's transcript and map the
                        // compound onto it at the same edit distance (map-compound-to-offtarget.js).
                        const mapCell = (k && k !== '—')
                            ? `<td style="padding:3px 0;"><button class="ott-rpt-map" data-gene="${k}" title="Load ${k} and map the compound onto it" style="cursor:pointer;border-radius:6px;padding:3px 9px;font:700 11px Arial;border:1px solid #1aa3bd;background:transparent;color:#4fd0e6;white-space:nowrap;">↗ Map</button></td>`
                            : `<td></td>`;
                        hitRows += `<tr>${cell('<b>' + k + '</b>')}${cell(g.count + ' transcript' + (g.count === 1 ? '' : 's'))}${cell('ed ' + ed)}${cell('<span style="color:#8fb8c8;">' + g.examples.join('; ') + '</span>')}${mapCell}</tr>`;
                    }
                    const more = symKeys.length > shownSyms.length ? `<div style="color:#8fb8c8;font-size:12px;margin-top:6px;">… and ${(symKeys.length - shownSyms.length).toLocaleString()} more gene(s)</div>` : '';
                    const hitsTable = hits.length
                        ? `<div style="max-height:220px;overflow:auto;margin-top:8px;border-top:1px solid rgba(26,163,189,0.35);">
                             <table style="border-collapse:collapse;font-size:12px;width:100%;">
                               <tr style="color:#8fb8c8;text-align:left;position:sticky;top:0;background:#0a2540;"><th style="padding:5px 12px 5px 0;">Gene</th><th style="padding-right:12px;">Transcripts</th><th style="padding-right:12px;">Best edit</th><th>Example loci</th><th style="padding-right:0;">Map</th></tr>
                               ${hitRows}
                             </table></div>${more}`
                        : `<div style="color:#8fb8c8;margin-top:8px;">No off-target hits found.</div>`;
                    html = `${cardOpen}
                      <div style="font-size:16px;font-weight:700;color:#ffffff;margin-bottom:4px;">Off-target report — ${o.name || o.id || 'oligo'}</div>
                      ${accent}
                      ${__dsBlock}
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
                      ${__dsBlock}
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

                // Navy DOM overlay matching the demo.js popup look-and-feel (instead of a wid modal).
                const __closeReport = () => { try { const p = document.getElementById('baja-ott-report'); if (p && p.parentNode) p.parentNode.removeChild(p); } catch (e) { } };
                __closeReport();
                const panelEl = document.createElement('div');
                panelEl.id = 'baja-ott-report';
                panelEl.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:2147483000;width:min(' + (single ? 640 : 520) + 'px,92vw);'
                    + 'max-height:82vh;overflow:auto;background:#0b2545;color:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.45);'
                    + 'border:1px solid rgba(255,255,255,0.14);font-family:Arial,Helvetica,sans-serif;padding:16px;';
                panelEl.innerHTML = html;
                const rowEl = document.createElement('div');
                rowEl.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:14px;';
                const mkBtn = (label, primary, onClick) => {
                    const b = document.createElement('button');
                    b.textContent = label;
                    b.style.cssText = 'cursor:pointer;border-radius:8px;padding:9px 16px;font:700 13px Arial;border:1px solid '
                        + (primary ? '#22c55e' : 'rgba(255,255,255,0.22)') + ';background:' + (primary ? '#22c55e' : 'transparent')
                        + ';color:' + (primary ? '#04210f' : '#fff') + ';';
                    b.onmouseenter = () => { try { b.style.filter = 'brightness(1.1)'; } catch (e) { } };
                    b.onmouseleave = () => { try { b.style.filter = ''; } catch (e) { } };
                    b.onclick = onClick;
                    return b;
                };
                // Link to the off-target MAPPING panel (load & map onto any off-target transcript/
                // gene) — shown for a single-oligo report whenever it actually has off-targets.
                if (single && __anyOff) rowEl.appendChild(mkBtn('↗ Off-target mapper', false, () => { __closeReport(); try { exec('baja/manchester/menu/off-target-summary.js', graph, single, genegraph_panel_layout); } catch (e) { try { graph.setMessage(' Mapper failed: ' + (e && e.message ? e.message : e)); } catch (e2) { } } }));
                if (__anyOff) rowEl.appendChild(mkBtn('Filter by off-targets', false, () => { __closeReport(); exec('baja/manchester/menu/annotation/filter-compounds-panel.js', graph, genegraph_panel_layout); }));
                rowEl.appendChild(mkBtn('Continue designing', false, () => { __closeReport(); exec('baja/manchester/menu/compound-editor.js', graph, genegraph_panel_layout); }));
                rowEl.appendChild(mkBtn('Close', true, () => { __closeReport(); }));
                panelEl.appendChild(rowEl);
                document.body.appendChild(panelEl);
                // Wire the ↗ Map buttons (single-oligo report) to the off-target mapper.
                if (single) {
                    try {
                        panelEl.querySelectorAll('.ott-rpt-map').forEach((btn) => {
                            btn.onclick = () => {
                                const gsym = btn.getAttribute('data-gene');
                                __closeReport();
                                try { exec('baja/manchester/menu/map-compound-to-offtarget.js', graph, single, { symbol: gsym }, __editDistance); }
                                catch (e) { try { graph.setMessage(' Map failed: ' + (e && e.message ? e.message : e)); } catch (e2) { } }
                            };
                        });
                    } catch (e) { }
                }
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
                        let pq = __toDNA(part && part.synthesisSequence);
                        const poh = __toDNA(part && (part.antisenseOverhang || part.overhang));
                        if (poh && pq.length > poh.length && pq.slice(-poh.length) === poh) pq = pq.slice(0, pq.length - poh.length);
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
            // UTR datasets (name ends in 3utr / 5utr): a hit only counts as an off-target when the
            // seed hits the SAME dataset sequence >= threshold times. Prompt for it (default 3).
            hitCountThreshold = 1;
            if (/3utr|5utr/i.test('' + genome)) {
                try {
                    const __tp = await prompt("Hit count threshold:", ["Threshold"], { "Threshold": 3 }, 500, 300);
                    if (__tp && __tp["Threshold"] != null) {
                        const __v = parseInt(__tp["Threshold"], 10);
                        if (Number.isFinite(__v) && __v >= 1) hitCountThreshold = __v;
                    }
                } catch (e) { }
            }
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
                x.offtargetsRun = false;   // reset "was run" — set true again only on completion
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
            if (s.includes('virus') || s.includes('viral')) return 'Viruses';
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
