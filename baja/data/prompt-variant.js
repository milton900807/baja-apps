function (server, graph, genegraph_panel_layout) {
    return new Promise(async (resolve, reject) => {
        const PY = server + '/py/sequence/prompt-to-variant.py';

        // Render the variant form in the mainPanel (not a modal), and restore the editor
        // canvas afterwards — same pattern as the New-track form.
        const showInMainPanel = (comp) => {
            try {
                CurrentLayout.clearComponent('mainPanel');
                CurrentLayout.setComponent('mainPanel', comp);
            } catch (e) { console.warn('prompt-variant: mainPanel set failed', e); }
        };
        const showEditorCanvas = () => {
            showInMainPanel((graph && graph.genegraph_panel_layout) || genegraph_panel_layout);
        };
        const resolveAndAdd = async (rawText, context) => {
            const text = ('' + (rawText || '')).trim();
            if (!text) { resolve(null); return; }
            graph.setMessage(' Determining variant type & position… ');

            let res = null;
            try {
                let em = new EngineMonitor((m) => { log(m); });
                res = await exec(PY, em, text, context || '');
            } catch (e) {
                graph.setMessage(' Variant resolver failed: ' + (e && e.message ? e.message : e));
                resolve(null); return;
            }

            let variant = null;
            try { variant = JSON.parse(res.variant); } catch (e) { variant = null; }
            if (!variant) {
                graph.setMessage(' Could not resolve the variant' + (res && res.error ? ' (' + res.error + ')' : '') + '.');
                resolve(null); return;
            }

            let SnpIndel = null;
            try { SnpIndel = await exec('flexigraph/snpindel.js'); } catch (e) { }
            if (!SnpIndel) { graph.setMessage(' Variant support unavailable.'); resolve(null); return; }

            const G = variant.genomic;

            // Place the variant on every currently-loaded track that can hold it. `found`
            // counts tracks whose extent SPANS the variant location (added or already there);
            // `added` counts only newly-placed variants.
            const placeOnTracks = () => {
                let added = 0, found = 0, lastIndex = -1, lastXi = null;
                try {
                    for (let i = 0; i < (graph.track ? graph.track.length : 0); i++) {
                        const t = graph.track[i];
                        if (!t || !t.variantWorldX) continue;
                        let xi = t.variantWorldX(variant.chr, G);   // genomic world-coord, or null
                        if (xi == null) continue;
                        // Ensembl/VCF anchor a deletion on the (unchanged) base BEFORE the
                        // deleted run, so on a forward-strand track the deleted bases begin one
                        // nt to the right — shift the marker by +1 to line it up.
                        if ((variant.type === 'del') && (t.strand !== -1)) xi = xi + 1;
                        found++; lastIndex = i; lastXi = xi;
                        // Don't double-add if this exact variant is already on the track.
                        if ((t.snpindels || []).some(s => s && Math.round(s.xi) === Math.round(xi)
                            && (s.name === (variant.rsid || variant.label) || s.reference === (variant.ref || 'N')))) {
                            continue;
                        }
                        const snp = new SnpIndel(
                            variant.type || 'snp', xi,
                            variant.ref || 'N', variant.alt || 'N',
                            0, t.strand,
                            (variant.rsid || variant.label || 'variant'),
                            null, '#ff8c1a'
                        );
                        try { snp.name = variant.label || variant.hgvs_c || variant.hgvs_g || variant.rsid || 'variant'; } catch (e) { }
                        t.addsnpindel(snp);
                        t.showSnpIndels = true;
                        added++;
                    }
                } catch (e) { console.warn('add variant failed', e); }
                return { added, found, lastIndex, lastXi };
            };

            let { added, found, lastIndex, lastXi } = placeOnTracks();

            // Only fetch a new track if NO already-loaded track's extent spans the variant
            // location — use the Ensembl transcript id the resolver returned, then retry.
            if (!found && variant.ensembl && graph.add) {
                graph.setMessage(' No loaded track holds ' + (variant.label || 'the variant')
                    + ' — fetching ' + variant.ensembl + ' …');
                let newTrack = null;
                try { newTrack = await graph.add(variant.ensembl, null, null, null); } catch (e) { newTrack = null; }
                if (newTrack) {
                    try {
                        if (graph.clearSelectionVisuals) graph.clearSelectionVisuals();
                        if (newTrack.select) newTrack.select();
                        if (graph.addTrackToSelection) graph.addTrackToSelection(newTrack);
                        else graph.showDisplay = true;
                    } catch (e) { }
                    ({ added, found, lastIndex, lastXi } = placeOnTracks());
                }
            }

            if (lastIndex < 0) {
                graph.setMessage(' ' + (variant.label || 'Variant') + ' at chr' + variant.chr + ':' + G
                    + ' does not fall on any loaded track'
                    + (variant.ensembl ? ', and ' + variant.ensembl + ' could not be fetched.' : '.'));
                resolve(variant); return;
            }

            try { if (graph.setMouseMode) graph.setMouseMode('navigate'); } catch (e) { }
            if (graph.wake) graph.wake();

            // Wait a second (let the track settle / any fetched sequence arrive), then frame
            // the variant like zoomToTrack does — centered on the variant, zoomed in far
            // enough that the sequence letters are visible, and vertically focused on the
            // track. zoomToTrack routes through animateTo(), which enforces a 10:1 aspect
            // ratio and resets a sub-1 y-band to full-y — that machinery prevents a precise
            // sequence-level zoom, so we set x and y on the grid directly instead. x uses the
            // proven graph.zoom() path; y uses zoomToTrack's own track y-band (expanded ~10%).
            if (lastIndex >= 0 && lastXi != null && graph.track) {
                const HALF = 12;   // bases on each side of the variant (center = variant)
                setTimeout(() => {
                    try {
                        const t = graph.track[lastIndex];
                        if (!t || !t.tgraph) return;
                        graph.animating = false;

                        // Target view: x = tight window centered on the variant (sequence
                        // visible); y = this track's band (zoomToTrack's anchor), 10% taller.
                        const a = t.tgraph.X(lastXi - HALF), b = t.tgraph.X(lastXi + HALF);
                        const txMin = Math.min(a, b), txMax = Math.max(a, b);
                        const ht = -1 * t.tgraph.height;
                        const yi = t.tgraph.yi - ht;
                        const halfBand = 0.5 * 0.90;
                        const tyMin = yi - halfBand, tyMax = yi + halfBand;

                        // x/y bounds live on the inner graph's grid.
                        const gg = (typeof graph.setxmin === 'function') ? graph : graph.graph;
                        const grid = (gg && gg.grid) ? gg.grid : gg;
                        if (!grid || !grid.setxmin) return;

                        const sxMin = grid.getxmin(), sxMax = grid.getxmax();
                        const syMin = grid.getymin(), syMax = grid.getymax();

                        // Animate current -> target with a cubic ease-out (fast, then slows
                        // as it approaches). wake() keeps the render loop drawing each frame.
                        const DURATION = 650;
                        const ease = (p) => 1 - Math.pow(1 - p, 3);
                        const startMs = Date.now();
                        const step = () => {
                            const p = Math.min(1, (Date.now() - startMs) / DURATION);
                            const e = ease(p);
                            grid.setxmin(sxMin + (txMin - sxMin) * e);
                            grid.setxmax(sxMax + (txMax - sxMax) * e);
                            grid.setymin(syMin + (tyMin - syMin) * e);
                            grid.setymax(syMax + (tyMax - syMax) * e);
                            if (grid.rescale) grid.rescale();
                            if (graph.wake) graph.wake();
                            if (p < 1) setTimeout(step, 16);
                            // Animation finished — restore the mouse-over hover highlight
                            // (this custom zoom bypasses animateTo's re-arm).
                            else { try { if (typeof graph.__hoverRearm === 'function') graph.__hoverRearm(); } catch (e) { } }
                        };
                        step();
                    } catch (e) { console.warn('variant zoom failed', e); }
                }, 1000);
            }

            const what = (variant.label || (variant.type + ' ' + variant.ref + '>' + variant.alt))
                + ' (chr' + variant.chr + ':' + G + ')';
            if (added > 0) {
                graph.setMessage(' Added ' + what + ' to ' + added + ' track' + (added === 1 ? '' : 's') + '.');
            } else {
                graph.setMessage(' ' + what + ' is already present — zoomed in.');
            }
            resolve(variant);
        };

        // Add MANY variants: split the text into individual descriptors, resolve each
        // through prompt-to-variant.py, and place them on the loaded tracks (no per-variant
        // zoom). Fetches a covering track only when nothing loaded spans a variant.
        const addManyVariants = async (rawText) => {
            const text = ('' + (rawText || '')).trim();
            if (!text) { resolve(null); return; }
            graph.setMessage(' Finding all variants in the text… ');

            let list = [];
            try {
                let em = new EngineMonitor((m) => { log(m); });
                let sres = await exec(server + '/py/sequence/split-variants.py', em, text);
                try { list = JSON.parse(sres.variants); } catch (e) { list = []; }
            } catch (e) {
                graph.setMessage(' Variant splitter failed: ' + (e && e.message ? e.message : e)); resolve(null); return;
            }
            if (!list.length) { graph.setMessage(' No variants found in the text.'); resolve(null); return; }

            let SnpIndel = null;
            try { SnpIndel = await exec('flexigraph/snpindel.js'); } catch (e) { }
            if (!SnpIndel) { graph.setMessage(' Variant support unavailable.'); resolve(null); return; }

            // Place one resolved variant on every loaded track that spans it (mirrors the
            // single-variant placeOnTracks). Returns {added, found}.
            const place = (variant) => {
                let added = 0, found = 0;
                const G = variant.genomic;
                try {
                    for (let i = 0; i < (graph.track ? graph.track.length : 0); i++) {
                        const t = graph.track[i];
                        if (!t || !t.variantWorldX) continue;
                        let xi = t.variantWorldX(variant.chr, G);
                        if (xi == null) continue;
                        if ((variant.type === 'del') && (t.strand !== -1)) xi = xi + 1;
                        found++;
                        if ((t.snpindels || []).some(s => s && Math.round(s.xi) === Math.round(xi)
                            && (s.name === (variant.rsid || variant.label) || s.reference === (variant.ref || 'N')))) {
                            continue;
                        }
                        const snp = new SnpIndel(
                            variant.type || 'snp', xi,
                            variant.ref || 'N', variant.alt || 'N',
                            0, t.strand,
                            (variant.rsid || variant.label || 'variant'),
                            null, '#ff8c1a'
                        );
                        try { snp.name = variant.label || variant.hgvs_c || variant.hgvs_g || variant.rsid || 'variant'; } catch (e) { }
                        t.addsnpindel(snp);
                        t.showSnpIndels = true;
                        added++;
                    }
                } catch (e) { console.warn('add variant failed', e); }
                return { added, found };
            };

            let totalAdded = 0, resolved = 0, failed = 0, idx = 0;
            for (const item of list) {
                idx++;
                const descr = ('' + (item && item.text ? item.text : item)).trim();
                if (!descr) { continue; }
                graph.setMessage(' Resolving variant ' + idx + '/' + list.length + ': ' + descr + ' …');
                let variant = null;
                try {
                    let em = new EngineMonitor((m) => { });
                    let res = await exec(PY, em, descr, '');
                    variant = JSON.parse(res.variant);
                } catch (e) { variant = null; }
                if (!variant) { failed++; continue; }
                resolved++;
                let r = place(variant);
                if (!r.found && variant.ensembl && graph.add) {
                    let nt = null;
                    try { nt = await graph.add(variant.ensembl, null, null, null); } catch (e) { nt = null; }
                    if (nt) {
                        try { if (nt.select) nt.select(); if (graph.addTrackToSelection) graph.addTrackToSelection(nt); } catch (e) { }
                        r = place(variant);
                    }
                }
                totalAdded += r.added;
            }

            try { if (graph.setMouseMode) graph.setMouseMode('navigate'); } catch (e) { }
            if (graph.wake) graph.wake();
            graph.setMessage(' Added ' + totalAdded + ' variant marker(s) from ' + resolved
                + ' resolved variant(s)' + (failed ? ' (' + failed + ' unresolved)' : '') + '.');
            resolve({ added: totalAdded, resolved: resolved });
        };

        // ---- the form (mainPanel) --------------------------------------------------
        let v = null;        // variant description textarea
        let describe_variant = {
            wid: 'card',
            componentRef: 'mainPanel',
            data: {
                height: '100%',
                card_padding: '28px',
                padding: '10px',
                cards: [[
                    {
                        'width': '100%',
                        'component': {
                            wid: 'html',
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
                        'title': 'Describe or paste a variant',
                        'width': '100%',
                        'component': {
                            wid: 'input-textarea-editor',
                            data: {
                                'showButton': false,
                                'title': 'Variant',
                                'ionHookFunction': createIonFunction((input_box) => { v = input_box; })
                            }
                        }
                    },
                    {
                        'title': '',
                        'width': '100%',
                        'component': {
                            wid: 'html',
                            data: `e.g. "TP53 c.215C>T", "BRAF V600E", "rs113993960", "CFTR delF508", or "chr7:117,559,593 delTTT"`
                        }
                    },
                    {
                        'title': '',
                        'width': '100%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Add best variant', ionFunction: createIonFunction(async () => {
                                            let desc = '';
                                            try { desc = (v && v.getWidgetValue) ? v.getWidgetValue() : (v && v.value ? v.value : ''); } catch (e) { }
                                            showEditorCanvas();
                                            setTimeout(() => { resolveAndAdd(desc, null); }, 200);
                                        })
                                    },
                                    {
                                        label: 'Add variants', ionFunction: createIonFunction(async () => {
                                            let desc = '';
                                            try { desc = (v && v.getWidgetValue) ? v.getWidgetValue() : (v && v.value ? v.value : ''); } catch (e) { }
                                            showEditorCanvas();
                                            setTimeout(() => { addManyVariants(desc); }, 200);
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
                ]]
            }
        };
        showInMainPanel(describe_variant);
    });
}
