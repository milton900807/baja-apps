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
    const __querySeq = (o) => {
        if (!o) return '';
        // The off-target query is the ACTUAL synthesized strand, ORIENTED for the
        // transcript's direction: generateCompound builds it with comp() for
        // minus-strand tracks and reverseComp() for plus-strand tracks. For siRNA
        // that synthesized strand is the guide; for single-stranded ASOs it is the
        // ASO itself. (Using cand.guide directly would ignore strand and come out
        // reversed on minus-strand transcripts.)
        let g = __toDNA(o.synthesisSequence || o.sequence);
        if (!g || g.length < 8) g = __toDNA(o.guide || o.antisense);   // fallback
        // Strip a 3' overhang (e.g. dTdT) if the chosen field carries one — it does
        // not target the transcript.
        const oh = __toDNA(o.antisenseOverhang || o.overhang);
        if (oh && g.length > oh.length && g.slice(-oh.length) === oh) g = g.slice(0, g.length - oh.length);
        return g;
    };
    editDistance = 0;

    return new Promise(async (resolve, reject) => {
        let returnMode = 'editdistance'

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
            const chunkSize = 5;
            for (let i = 0; i < array.length; i += chunkSize) {
                const chunk = array.slice(i, i + chunkSize);
                result.push(chunk);
            }
            return result;
        }

        let runOffTargets = async (oligos, seqList, __editDistance, genomes) => {
            const __t0 = Date.now();
            let rr = []
            for (let o of oligos) {
                o.highlight(1000, "magenta")
            }
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
            let sp = splitArray(seqList);
            let index = 0;
            for (let s of sp) {
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
                let r = await POSTJSON(obj, uri)
                rr.push(r)

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

                index++;
                progressBar((index / sp.length) * 100)
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
