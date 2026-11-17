function (graph, genegraph_panel_layout, selectedOnly, presetTracks) {

    editDistance = 0;
    // WHAT "VISIBLE" MEANS, in one place, because the number the panel offers and the set the
    // run walks have to be the same set.
    //
    // This used to be getOligosInRange(), which is a CONTAINMENT test: `xstart <= o.xi &&
    // xend >= o.xf`, so a compound with either end outside the window is dropped. On a track
    // carrying 210 compounds the panel offered "All visible compounds - 1", and the run would
    // have screened exactly that one. getVisibleOligos() is the overlap test on the same
    // class and is what "visible" has always meant on screen: a compound half in view is in
    // view. gitVisibleTrackRange also answers the NUMBER -1 when the grid is not laid out
    // yet, which read as {start: undefined, end: undefined} and quietly matched nothing; with
    // no usable range the honest answer is the whole track rather than none of it.
    const __visibleOligosOf = (t, g) => {
        try {
            const r = t && typeof t.gitVisibleTrackRange === 'function' ? t.gitVisibleTrackRange(g) : null;
            if (r && r !== -1 && isFinite(r.start) && isFinite(r.end) && r.end > r.start) {
                if (typeof t.getVisibleOligos === 'function') return (t.getVisibleOligos(r.start, r.end) || []).filter(Boolean);
                return (t.getOligosInRange(r.start, r.end) || []).filter(Boolean);
            }
        } catch (e) { }
        return ((t && t.oligos) || []).filter(Boolean);
    };


    return new Promise(async (resolve, reject) => {

        let SIRNA = await exec('flexigraph/sirna.js')

        let returnMode = 'editdistance'
        // A hit only counts as an off-target when the seed hits the SAME dataset sequence this many
        // times or more (prompted at Run; default 3).
        let hitCountThreshold = 3;
        // The off-target index is DNA (2-bit): every query MUST be DNA — uppercase, U->T, A/C/G/T only.
        const __toDNA = (s) => ('' + (s || '')).toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');
        let splitArray = (array) => {
            const result = [];
            // One oligo per request so the gunsight advances one-at-a-time, left→right.
            // Free tier: a REQUEST is what gets metered, so one oligo per request would spend
            // a month's allowance on ten oligos. Batch to the server's per-search cap.
            // Subscribers keep one-at-a-time, which is nothing to them but the animation.
            let __free = false;
            try { __free = !!window.__bajaFreeTier; } catch (e) { }
            const chunkSize = __free ? 10 : 1;

            for (let i = 0; i < array.length; i += chunkSize) {
                const chunk = array.slice(i, i + chunkSize);
                result.push(chunk);
            }
            return result;
        }

        graph.setMessage("Loading indexed genomes from the server... ")
        // THE SAME SOURCE THE OTHER RUNNER USES, and baja/manchester/menu/run-off-targets.js
        // says why in as many words: the indexed genomes and the off-target search are served
        // by the baja app server itself (apiUrl), and a separate off-target API is not to be
        // reached for. This asked window.env.offtarget and fell back to a bare /levenshtein,
        // which on a deployment that never mounted that service is a 404 -- so the panel had
        // no reference to offer and no screen could be run from here, while the same screen
        // started from the editor runner worked.
        const __otBase = window["env"]["apiUrl"] || window["env"]["offtarget"] || '';
        let url = `${__otBase}/genomes`
        let available_genomes = null;
        try { available_genomes = __otBase ? await GETJSON(url) : null; }
        catch (e) { available_genomes = e; }

        let containsRepeatedSequences = (dnaString) => {
            const regex = /(A{4,}|C{4,}|G{4,}|T{4,})/;
            return regex.test(dnaString);
        }

        let skipo = []

        let runOffTargets = async (graph, genomes, __editDistance) => {
            graph.setMessage("Checking sequences...")
            const pattern = /(\w)\1{3,}/g;
            let ot_oligos = []
            let warn = false;
            let seqList = []
            // The tracks to screen: the ones this run was opened FOR, else the whole canvas.
            // The Design menu passes its own track, so a screen reached by walking Design >
            // <track> > Off-targets covers that track's compounds and no other; the toolbar
            // and the old sub-menu pass nothing and keep sweeping the board.
            const __preset = (Array.isArray(presetTracks) ? presetTracks.filter(Boolean) : (presetTracks ? [presetTracks] : []));
            const __screenTracks = __preset.length ? __preset : ((graph && graph.track) || []);

            for (let t of __screenTracks) {
                if (!t) continue;
                t.showOfftargets = true;
                let oligos = __visibleOligosOf(t, graph);
                // SCOPE, which arrives two ways and must mean the same thing both times.
                //   selectedOnly   from the caller: true / 'selected' for the selected compounds,
                //                  'unscreened' for the ones with no result yet (the Ask box).
                //   onlyMissing    the panel's own "Run on" radio, which means 'unscreened'.
                // Applied independently, so "selected" and "only without" compose: the selected
                // compounds that have no result yet. Filtering happens BEFORE anything is
                // cleared below, so results already on the other compounds are left alone.
                //
                // WHAT COUNTS AS ALREADY HAVING A RESULT IS PER SCREEN, and this is the part
                // that is easy to get wrong: a SEED run records mi_targets_transient_, not
                // offtarget. Testing the full-strand field here would call every compound
                // unscreened and rerun the lot.
                const __scope = (selectedOnly === true) ? 'selected'
                    : ('' + (selectedOnly || '')).toLowerCase();
                const __hasResult = (o) => !!(o && o.mi_targets_transient_ != null);
                if (__scope === 'selected') oligos = oligos.filter((o) => o && (o.selected || o.highlight__));
                if (__scope === 'unscreened' || onlyMissing) oligos = oligos.filter((o) => o && !__hasResult(o));

                for (let o of oligos) {
                    o.mi_targets_transient_ = null;
                    o.show_seed_targets = true;

                }
                for (let o of oligos) {
                    if (o.getSeedSequence) {
                        let s = __toDNA(o.getSeedSequence());   // DNA (U->T), no overhang (seed is positions 2-8)
                        if (containsRepeatedSequences(s)) {
                            skipo.push(o);
                        } else {
                            o.offtarget = null;
                            ot_oligos.push(o)
                            seqList.push(
                                {
                                    "id": String(o.id),
                                    "synthesisSequence": s
                                }
                            )
                        }
                    }
                }
            }

            // Reading order — left→right (genomic x), then top→bottom (world-y desc) —
            // and cap each run at 200 oligos; rebuild the seed query list in that order.
            try {
                ot_oligos.sort((a, b) => { const ax = Math.min(a.xi, a.xf), bx = Math.min(b.xi, b.xf); if (ax !== bx) return ax - bx; return (b.y || 0) - (a.y || 0); });
                if (ot_oligos.length > 200) { graph.setMessage(' Off-targets run 200 oligos at a time — running the first 200 (left→right, top→bottom). '); ot_oligos = ot_oligos.slice(0, 200); }
                seqList = ot_oligos.map((o) => ({ "id": String(o.id), "synthesisSequence": o.getSeedSequence ? __toDNA(o.getSeedSequence()) : '' }));
            } catch (e) { }
            const __idToOligo = new Map();
            for (const o of ot_oligos) { if (o && o.id != null) __idToOligo.set(String(o.id), o); }

            // Smoothly zoom/center the view on an oligo (animated ~320ms ease-out). Resolves
            // when the animation completes.
            const centerOnOligo = (o) => new Promise((res) => {
                try {
                    if (!o) { res(); return; }
                    let t = o.track || o.__track || null;
                    if (!t) { for (const tr of (graph.track || [])) { if (tr && o.xi >= Math.min(tr.xi, tr.xf) && o.xi <= Math.max(tr.xi, tr.xf)) { t = tr; break; } } }
                    if (!t || !t.tgraph) { res(); return; }
                    const gg = (typeof graph.setxmin === 'function') ? graph : graph.graph;
                    const grid = (gg && gg.grid) ? gg.grid : gg;
                    if (!grid || !grid.setxmin) { res(); return; }
                    const HALF = 60;
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
                        { 'width': '100%', 'component': { wid: 'progress', componentRef: 'progressBar', data: { 'progress': 10, 'progressBar': createIonFunction((progessBar) => { progressBar = progessBar; }) } } },
                        { 'width': '100%', 'component': { wid: 'mt-button', data: { buttons: [{ label: 'Cancel', ionFunction: createIonFunction(() => { __cancelled = true; }) }] } } }
                    ]]
                }
            }

            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
            CurrentLayout.setComponent('buttonMenuPanel', w);

            // NO MODAL OVER THE RUN. There was one, and it was covering the only thing worth
            // watching: the camera already walks the track, zooming to each oligo as its turn
            // comes (centerOnOligo, one behind so the one on screen is the one just finished),
            // and a full-screen card with a grey backdrop hid every frame of it. The progress
            // bar and Cancel live in the button panel, which is beside the canvas rather than
            // on top of it, so the run is watchable and still stoppable.
            //
            // Pointer input stays off for the duration. That is not to lock the app for its
            // own sake: the camera is animating to a new oligo every chunk, and a pan fighting
            // it mid-flight leaves the view somewhere neither chose.
            try { graph.setMouseMode('none'); graph.clearMouseListeners(); } catch (e) { }
            const __finishRun = () => {
                try { for (const o of ot_oligos) { if (o) o.__gunsight = false; } } catch (e) { }
                try { graph.setMouseMode('navigate'); graph.clearMouseListeners(); exec('baja/manchester/menu/mouse-over-highlight.js', graph, graph.genegraph_panel_layout); } catch (e) { }
            };

            let sp = splitArray(seqList);
            let rr = [];
            let index = 0;
            let __framePrev = null;   // previously-completed oligo (camera trails one behind)
            for (let s of sp) {
                if (__cancelled) break;
                // Put the targeting gunsight (+ red glow) on the oligo being searched.
                const __chunkOligos = [];
                for (const item of s) { const o = __idToOligo.get(String(item && item.id)); if (o && __chunkOligos.indexOf(o) < 0) __chunkOligos.push(o); }
                for (const o of __chunkOligos) { try { o.__gunsight = true; if (o.highlight) o.highlight(0, 'red'); } catch (e) { } }
                // Stay one oligo BEHIND: smoothly frame the previously-completed oligo (results in).
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

                    let oep = window["env"]["apiUrl"] || window["env"]["offtarget"] || '';   // apiUrl first -- see the genome lookup above

                    let uri = `${oep}/off-targets-file`;
                    r = await POSTJSON(obj, uri)
                } finally {
                    for (const o of __chunkOligos) { try { o.__gunsight = false; o.highlight__ = false; } catch (e) { } }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                }
                // Out of free allowance: the server answers 402 instead of results. Stop the
                // whole run -- carrying on would mark every remaining oligo "not determined".
                __freeLimit = freeLimitInfo(r);
                if (__freeLimit) { __cancelled = true; break; }

                if (r != null && r['oligoQuery'] != null) {
                    let oq = r['oligoQuery'];

                    for (let o of ot_oligos) {

                        for (let off of oq) {
                            console.log('debubg');
                            if (String(o.id) == String(off.id)) {
                                // miRNA-like off-target: group the seed hits BY GENE (symbol) and count
                                // a gene as an off-target only when the seed hits it hitCountThreshold
                                // times or more. Grouping by GENE (not chr/transcript) is essential —
                                // one gene's hits spread across its transcripts must still be summed.
                                // The badge shows the number of qualifying off-target genes.
                                const __hits = Array.isArray(off.offtarget) ? off.offtarget : [];
                                const __geneKey = (h) => {
                                    if (!h) return '?';
                                    const s = ('' + (h.symbol || '')).trim(); if (s) return s;
                                    const g = ('' + (h.gene || h.gene_symbol || '')).trim(); if (g) return g;
                                    const c = ('' + (h.chr || h.seq || h.name || '')).trim(); if (c) return c;
                                    return JSON.stringify(h);
                                };
                                const __byGene = {};
                                for (const __h of __hits) { const __k = __geneKey(__h); __byGene[__k] = (__byGene[__k] || 0) + 1; }
                                let __qualifying = 0;
                                const __qualGenes = [];
                                for (const __k in __byGene) { if (__byGene[__k] >= hitCountThreshold) { __qualifying++; __qualGenes.push(__k + ' (' + __byGene[__k] + ')'); } }
                                o.mi_targets_transient_ = __qualifying;
                                o.__seedOffGenes = __qualGenes;   // for the stats popup
                                o.show_seed_targets = true;
                                o.highlight(1000, 'purple')
                            }
                        }
                    }
                    for (let o of skipo) {
                        o.mi_targets_transient_ = 'NA';
                        o.show_seed_targets = true;
                        o.highlight(1000, 'purple')
                    }
                }
                rr.push(r);
                index++;
                progressBar((index / sp.length) * 100)
                __framePrev = (__chunkOligos && __chunkOligos[0]) || __framePrev;   // now completed
            }

            // Frame the LAST completed oligo (the camera trailed one behind).
            try { if (!__cancelled && __framePrev) await centerOnOligo(__framePrev); } catch (e) { }

            // Run finished (or was cancelled) — unblock the app.
            __finishRun();
            // Spent some of the off-target allowance: update the free-plan bar now
            // rather than leaving it to the next poll.
            try { if (typeof window.__bajaFreeBarRefresh === 'function') window.__bajaFreeBarRefresh(); } catch (e) { }
            if (__freeLimit) { graph.setResultMessage(' No more free GPU time.  ;-) '); return; }
            if (__cancelled) { graph.setMessage(' Off-target run cancelled. '); return; }

            let btns = [
                {
                    label: 'Raw results', ionfunction: createIonFunction(async () => {
                        if (rr.length > 1000) {
                            let report = await exec('baja/manchester/menu/generate-excel-report-for-ott.js', rr)
                            const blob = new Blob([report], { type: 'json' });
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.setAttribute('hidden', '');
                            a.setAttribute('href', url);
                            a.setAttribute('download', 'off-target-report.csv');
                            document.body.appendChild(a);
                            a.click();

                        } else {
                            let backtog = {
                                wid: 'card',
                                data: {
                                    cards: [
                                        [
                                            {
                                                'title': ' ', 'body': ``,
                                                'width': '100%',
                                                'component':
                                                {
                                                    wid: 'mt-button', data: {
                                                        buttons: [

                                                            {
                                                                label: 'Return to design', ionFunction: createIonFunction(async () => {
                                                                    let button_canvas = await exec('manchester/controls/navigation-panel.js', graph)
                                                                    CurrentLayout.clearComponent('mainPanel')
                                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                    CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                                    CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            },
                                            {

                                                'title': ' ', 'body': ``,
                                                'width': '100%',
                                                'component': {
                                                    wid: 'json',
                                                    data: JSON.stringify(rr)
                                                }
                                            },
                                        ]
                                    ]
                                }
                            }
                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', backtog);
                        }
                    })

                }, {
                    label: 'Download ', ionfunction: createIonFunction(async () => {
                        console.log(" downloading... ")
                        let report = await exec('baja/manchester/menu/generate-excel-report-for-ott.js', rr)
                        const blob = new Blob([report], { type: 'text/csv' });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.setAttribute('hidden', '');
                        a.setAttribute('href', url);
                        a.setAttribute('download', 'off-target-report.csv');
                        document.body.appendChild(a);
                        a.click();
                    })
                }
            ]

            if (skipo.length > 0) {
                btns.push(
                    {
                        label: 'View skipped', ionfunction: createIonFunction(async () => {

                            if (rr.length > 1000) {
                                let report = await exec('baja/manchester/menu/generate-excel-report-for-ott.js', rr)
                                const blob = new Blob([report], { type: 'json' });
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.setAttribute('hidden', '');
                                a.setAttribute('href', url);
                                a.setAttribute('download', 'off-target-report.csv');
                                document.body.appendChild(a);
                                a.click();

                            } else {

                                let backtog = {
                                    wid: 'card',
                                    data: {
                                        cards: [
                                            [
                                                {
                                                    'title': ' ', 'body': ``,
                                                    'width': '100%',
                                                    'component':
                                                    {
                                                        wid: 'mt-button', data: {
                                                            buttons: [

                                                                {
                                                                    label: 'Return to design', ionfunction: createIonFunction(async () => {
                                                                        let button_canvas = await exec('manchester/controls/navigation-panel.js', graph)
                                                                        CurrentLayout.clearComponent('mainPanel')
                                                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                                        CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                                                                    })
                                                                }
                                                            ]
                                                        }
                                                    }
                                                },
                                                {

                                                    'title': ' ', 'body': ``,
                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'json',
                                                        data: JSON.stringify(skipo)
                                                    }
                                                },
                                            ]
                                        ]
                                    }
                                }
                                CurrentLayout.clearComponent('mainPanel')
                                CurrentLayout.setComponent('mainPanel', backtog);
                            }
                        })

                    })

            }

            let fbtns = [
                {
                    'label': 'Seed filters', 'ionfunction': createIonFunction(async () => {
                        graph.setMessage('Filter seed sequences that hit the same 3UTR >= 10 times')

                        await exec('baja/manchester/annotation/rule-application-wizard-min.js', graph, genegraph_panel_layout, 'offtarget-seed, Human3utr, 1, 10 | Required')
                    })
                },
                {
                    'label': 'Filter homopolymer seed sequences', 'ionfunction': createIonFunction(async () => {
                        graph.setMessage('Filter seed sequences that hit the same 3UTR >= 10 times')
                        await exec('baja/manchester/annotation/rule-application-wizard-min.js', graph, genegraph_panel_layout, `
seed-pattern, TTT | Required
seed-pattern, AAA | Required
seed-pattern, CCC | Required
seed-pattern, GGG | Required
                        `)
                    })
                },
            ]

            let bpanel = {
                wid: 'card',
                data: {
                    cards: [
                        [
                            {
                                width: '100%',
                                'component': {
                                    wid: 'menu',
                                    data: {
                                        title: '  ',
                                        style: 'sub-container',
                                        menus: [
                                            {
                                                'label': 'Results', 'items': btns
                                            }, {
                                                'label': 'Filter', 'items': fbtns
                                            }

                                        ]
                                    }
                                }
                            },

                        ]
                    ]
                }
            }
            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
            CurrentLayout.setComponent('buttonMenuPanel', bpanel);

        }
        // THE OPTIONS, asked in the editor's own look. The panel this replaced was built
        // from the legacy card/radio widgets and mounted into mainPanel, so it REPLACED the
        // canvas with a full-page grey form -- and it listed whatever /genomes returned,
        // which on a failure is the error envelope, so its fields became the references to
        // choose from. off-target-options.js validates the list and shows a failure as one.
        let onlyMissing = false;
        let selected_genome = '';
        editDistance = 0;

        // What each scope would screen, for the panel's labels. Counted over the same visible
        // compounds the run itself walks, so the number offered is the number screened.
        const __optTracks = (() => {
            const p = (Array.isArray(presetTracks) ? presetTracks.filter(Boolean) : (presetTracks ? [presetTracks] : []));
            return p.length ? p : ((graph && graph.track) || []);
        })();
        const __optHas = (o) => !!(o && o.mi_targets_transient_ != null);
        const __optCounts = (() => {
            const seen = [];
            try {
                for (const t of __optTracks) {
                    for (const o of __visibleOligosOf(t, graph)) seen.push(o);
                }
            } catch (e) { }
            // trackTotal is NOT the scope -- the screen runs on what is in view. It is here so
            // the panel can say why a count is small instead of leaving "1" to look broken on
            // a track the user knows carries hundreds.
            let total = 0;
            try { for (const t of __optTracks) total += ((t && t.oligos) || []).filter(Boolean).length; } catch (e) { }
            return {
                all: seen.length,
                unscreened: seen.filter((o) => !__optHas(o)).length,
                selected: seen.filter((o) => o.selected || o.highlight__).length,
                trackTotal: total
            };
        })();

        const __scopeIn = (selectedOnly === true) ? 'selected' : ('' + (selectedOnly || '')).toLowerCase();
        const __choice = await exec('baja/manchester/menu/off-target-options.js', graph, {
            region: 'seed',
            genomes: available_genomes,
            endpoint: url,
            counts: __optCounts,
            trackLabel: (__optTracks.length === 1 && __optTracks[0]) ? (__optTracks[0].name || '') : '',
            defaults: {
                scope: (__scopeIn === 'selected' || __scopeIn === 'unscreened') ? __scopeIn : 'all',
                editDistance: 0
            }
        });
        // Cancelled: nothing was mounted over the canvas, so there is nothing to put back.
        if (!__choice) { resolve(); return; }
        selected_genome = __choice.genome;
        editDistance = __choice.editDistance;
        onlyMissing = (__choice.scope === 'unscreened');
        selectedOnly = (__choice.scope === 'selected');
        returnMode = 'editdistance';
        graph.setMessage(' Edit distance : ' + editDistance + ' ');
        graph.rungraph((g) => { runOffTargets(g, [selected_genome], editDistance); });

        resolve();

    })

}
