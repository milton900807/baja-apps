
function (graph, genegraph_panel_layout, presetRuleset, presetTrack) {

    return new Promise(async (resolve, reject) => {
        // Optional preset design ruleset ('sirna' | 'gapmer' | 'steric'). When a
        // modality is chosen from the Create menu it is passed in here so we skip
        // the ruleset picker and go straight to designing after the track click.
        const preset = (presetRuleset && ['sirna', 'gapmer', 'steric'].indexOf(('' + presetRuleset).toLowerCase()) >= 0)
            ? ('' + presetRuleset).toLowerCase() : null;
        const Biopolymer = await exec('baja/chem/biopolymer.js');
        const Rules = await exec('baja/manchester/design/oligo-design-rules.js');

        // Progress bar (Angular CanvasProgressComponent) shown while designing and
        // dropping oligos onto the track. Returns { set(pct), done() }; the bar
        // auto-removes itself ~10s after it reaches 100%.
        const makeProgress = () => {
            let bar = null;
            const w = {
                wid: 'progress',
                componentRef: 'progressBar',
                data: { progress: 0, progressBar: createIonFunction((pb) => { bar = pb; }) }
            };
            try { CurrentLayout.clearComponent('buttonMenuPanel|labelPanel'); CurrentLayout.setComponent('buttonMenuPanel', w); } catch (e) { }
            return {
                set: (pct) => { try { if (bar) bar(Math.max(0, Math.min(100, pct))); } catch (e) { } },
                done: () => { try { if (bar) bar(100); } catch (e) { } }
            };
        };

        // We need a chemistry to actually build the oligo — ensured AFTER the modality pick.
        const hasChem = () => !!(graph.props && graph.props.selected_chemistry);
        const ensureChem = async () => {
            if (hasChem()) return true;
            graph.setMessage(' Select a chemistry, then the design will run. ');
            await exec('manchester/choose-chemistry.js', graph, genegraph_panel_layout);
            for (let i = 0; i < 600 && !hasChem(); i++) { await new Promise((r) => setTimeout(r, 250)); }
            if (!hasChem()) { graph.setMessage(' No chemistry selected — design cancelled. '); return false; }
            return true;
        };

        // Derive the design ruleset from the chemistry. A TWO-STRANDED chemistry
        // (one that carries a sense strand) is an siRNA and follows the siRNA
        // rules, regardless of how it is named.
        const chemTypeToRuleset = (chem) => {
            if (!chem) return 'steric';
            const twoStrand = !!(chem.sense || (chem.structure && chem.structure.sense) || (chem.guide && chem.passenger));
            if (twoStrand) return 'sirna';
            const s = ('' + (chem.type || chem.name || '')).toLowerCase();
            if (s.indexOf('sirna') >= 0 || s.indexOf('si-rna') >= 0) return 'sirna';
            if (s.indexOf('gapmer') >= 0) return 'gapmer';
            return 'steric';
        };

        let selectedTrack = null;
        // Sequence-index offset when designing only across a marked selection.
        let __designOffset = 0;

        // ---- step 1: choose the therapeutic modality (siRNA / Gapmer / Steric) ----
        const pickModality = () => new Promise((res) => {
            const choose = (key) => { try { graph.showSideMenu(null); } catch (e) { } res(key); };
            const menu = [
                { label: 'siRNA (double-stranded RISC)', move: () => { }, click: () => choose('sirna') },
                { label: 'Gapmer (RNase-H) ASO', move: () => { }, click: () => choose('gapmer') },
                { label: 'Steric-blocking ASO', move: () => { }, click: () => choose('steric') },
                { label: 'Cancel', move: () => { }, click: () => choose(null) },
            ];
            try { graph.setMessage(' Choose the therapeutic modality to design. '); } catch (e) { }
            try { graph.showSideMenu(menu); } catch (e) { res(null); }
        });

        // ---- step 2: Default / Advanced dialog (mirrors the other designers) -------
        // Returns { top_n, lengths? } or null if cancelled.
        const showTileDesignDialog = (modality) => new Promise((res) => {
            try {
                const isSirna = modality === 'sirna';
                const isGapmer = modality === 'gapmer';
                const title = isSirna ? 'siRNA Design' : (isGapmer ? 'Gapmer ASO Design' : 'Steric-blocking ASO Design');
                const defLens = isSirna ? '21,22,23' : (isGapmer ? '16,17,18,19,20' : '18,19,20');
                const old = document.getElementById('baja-tile-design'); if (old && old.parentNode) old.parentNode.removeChild(old);
                const lbl = 'display:block;font:600 12px Arial;color:#9fb3c8;margin:12px 0 4px;';
                const inp = 'width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:8px 10px;font:13px Arial;';
                const panel = document.createElement('div');
                panel.id = 'baja-tile-design';
                panel.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:2147483000;width:min(560px,94vw);max-height:86vh;overflow:auto;background:#0b2545;color:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.14);font-family:Arial,Helvetica,sans-serif;padding:18px;';
                panel.innerHTML = ''
                    + '<div style="font:700 17px Arial;margin-bottom:2px;">' + title + '</div>'
                    + '<div style="font:13px Arial;color:#9fb3c8;margin-bottom:12px;">Choose Default, or Advanced to tune the design.</div>'
                    + '<div style="display:inline-flex;background:#0a1e3a;border:1px solid rgba(255,255,255,0.16);border-radius:999px;padding:3px;">'
                    + '<button id="td-default" style="cursor:pointer;border:0;border-radius:999px;padding:6px 16px;font:700 12px Arial;background:#22c55e;color:#04210f;">Default</button>'
                    + '<button id="td-advanced" style="cursor:pointer;border:0;border-radius:999px;padding:6px 16px;font:700 12px Arial;background:transparent;color:#fff;">Advanced</button>'
                    + '</div>'
                    + '<label style="' + lbl + '">Maximum candidates</label>'
                    + '<input id="td-topn" type="number" min="1" max="100000" value="500" style="' + inp + '"/>'
                    + '<div id="td-adv" style="display:none;">'
                    + '<label style="' + lbl + '">Oligo lengths (nt, comma-separated)</label>'
                    + '<input id="td-lengths" value="' + defLens + '" style="' + inp + '"/>'
                    + '</div>'
                    + '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;">'
                    + '<button id="td-cancel" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 13px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Cancel</button>'
                    + '<button id="td-run" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 13px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">Run design</button>'
                    + '</div>';
                document.body.appendChild(panel);
                const q = (id) => panel.querySelector(id);
                const parseList = (s, d) => { try { const a = ('' + s).split(/[,\s]+/).map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0); return a.length ? a : d; } catch (e) { return d; } };
                let mode = 'default';
                const setMode = (m) => {
                    mode = m;
                    q('#td-adv').style.display = (m === 'advanced') ? 'block' : 'none';
                    q('#td-default').style.background = (m === 'default') ? '#22c55e' : 'transparent';
                    q('#td-default').style.color = (m === 'default') ? '#04210f' : '#fff';
                    q('#td-advanced').style.background = (m === 'advanced') ? '#22c55e' : 'transparent';
                    q('#td-advanced').style.color = (m === 'advanced') ? '#04210f' : '#fff';
                };
                q('#td-default').onclick = () => setMode('default');
                q('#td-advanced').onclick = () => setMode('advanced');
                const close = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
                q('#td-cancel').onclick = () => { close(); res(null); };
                q('#td-run').onclick = () => {
                    const topn = Math.max(1, Math.min(100000, parseInt(q('#td-topn').value, 10) || 500));
                    const params = { top_n: topn };
                    if (mode === 'advanced') { const ls = parseList(q('#td-lengths').value, null); if (ls) params.lengths = ls; }
                    close(); res(params);
                };
            } catch (e) { res(null); }
        });

        // REQUIRE a selected sequence. Design by rules runs ONLY across a marked selection
        // (markstart..markend) on a track — never the whole track, and never via an interactive
        // whole-track pick. A supplied presetTrack is used only if it carries a selection. Find a
        // track that currently has one; if none, tell the user to select a region first and stop.
        let __target = null;
        if (presetTrack && presetTrack.markend > presetTrack.markstart
            && presetTrack.sequence && presetTrack.sequence.length >= 8) {
            __target = presetTrack;
        }
        if (!__target) {
            __target = (graph.track || []).find((t) => t && t.markend > t.markstart
                && t.sequence && t.sequence.length >= 8) || null;
        }
        if (!__target) {
            graph.setMessage(' Select a sequence first: highlight a region on a track, then choose Design by rules — it designs only across the selected sequence. ');
            resolve();
            return;
        }

        // ---- step 1: choose the ruleset (molecule type) ----------------------
        function showRulesetMenu(x, y) {
            const chemObj = graph.props.selected_chemistry;
            const recommended = chemTypeToRuleset(chemObj);
            const items = [
                { key: 'sirna', label: 'siRNA rules (double-stranded RISC)' },
                { key: 'gapmer', label: 'Gapmer (RNase-H) ASO rules' },
                { key: 'steric', label: 'Steric / splice-switching ASO rules' }
            ];
            // recommended ruleset first, tagged
            items.sort((a, b) => (a.key === recommended ? -1 : b.key === recommended ? 1 : 0));
            const menu = items.map((it) => ({
                label: it.label + (it.key === recommended ? '   ✓ matches chemistry' : ''),
                move: () => { },
                click: () => { graph.showSideMenu(null); showTileDesignDialog(it.key).then((p) => { if (p) runDesign(it.key, p); else graph.setMessage(' Design cancelled. '); }); }
            }));
            menu.push({ label: 'Cancel', move: () => { }, click: () => { graph.showSideMenu(null); } });
            graph.setMessage(' Choose the design ruleset for ' + (selectedTrack.name || 'this track') + ' ');
            graph.showSideMenu(menu);
        }

        // Reason the most recent drop failed — used to explain a zero result.
        let __lastDropError = null;

        // ---- step 2: tile + score + drop all designed oligos onto the track --
        async function runDesign(ruleset, params) {
            // Maximum candidates + optional lengths come from the Default/Advanced dialog.
            const maxOligos = Math.max(1, Math.min(100000, (params && params.top_n) ? Math.floor(params.top_n) : 500));

            const chemObj = graph.props.selected_chemistry;
            let L = 0;
            try { L = Biopolymer.countBases(chemObj); } catch (e) { L = 0; }
            if (!L || L < 8) L = Rules.DEFAULT_LEN[ruleset] || 20;
            // Advanced mode can request several lengths; Default uses the single derived length L.
            const lengths = (params && Array.isArray(params.lengths) && params.lengths.length) ? params.lengths.slice() : [L];
            const minLen = Math.min.apply(null, lengths);

            let seq = String(selectedTrack.sequence);
            // Design ONLY across the SELECTED sequence (the marked region). Never the whole track.
            __designOffset = 0;
            if (!(selectedTrack.markend > selectedTrack.markstart)) {
                graph.setMessage(' No sequence selected on ' + (selectedTrack.name || 'the track') + ' — highlight a region first. Design by rules runs only on the selection. ');
                return;
            }
            // markstart/markend may be stored as WORLD coordinates (>= the track's xi, e.g. genomic
            // coords) OR as 0-based offsets from the track start (< xi). Normalize both to 0-based
            // SEQUENCE indices. __designOffset stays a 0-based index, so the world coord below
            // (xi + __designOffset + cand.start) starts exactly at track start + selection offset.
            {
                const xi = selectedTrack.xi || 0;
                const toIdx = (m) => { m = Math.floor(m); return (m >= xi) ? (m - xi) : m; };
                const ms = Math.max(0, toIdx(selectedTrack.markstart));
                const me = Math.min(seq.length, toIdx(selectedTrack.markend));
                if (me - ms < minLen) {
                    graph.setMessage(' The selected region is shorter than the oligo length (' + minLen + ' nt) — select a longer sequence. ');
                    return;
                }
                seq = seq.substring(ms, me);
                __designOffset = ms;
            }

            graph.setMessage(' Scoring ' + ruleset + ' candidates over ' + seq.length + ' nt… ');
            // Design the top-N candidates by rule score across every requested length; each
            // candidate carries its own length, so the tiling below handles mixed lengths.
            let ranked = [];
            for (const len of lengths) {
                if (seq.length < len) continue;   // selection shorter than this length → skip it
                const span = Math.max(0, seq.length - len);
                const step = Math.max(1, Math.floor(span / 100000000));
                const sub = Rules.designOligos(seq, { type: ruleset, length: len, step, top: maxOligos });
                if (sub && sub.length) ranked = ranked.concat(sub);
            }
            ranked.sort((a, b) => (b.score || 0) - (a.score || 0));
            if (ranked.length > maxOligos) ranked = ranked.slice(0, maxOligos);
            if (!ranked.length) { graph.setMessage(' No candidates (track sequence shorter than oligo length). '); return; }

            // Design has started: hand the mouse back to hover/highlight mode so the user
            // can interact while the oligos tile in real time.
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { graph.clearMouseListeners(); exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }

            // Real-time tiling: place each candidate immediately, with live status +
            // estimated time remaining. No off-target filtering here — this is tile & score
            // only (run off-targets separately from the off-target tools if needed).
            const prog = makeProgress();
            const _t0 = Date.now();
            let placed = 0, done = 0;
            const _fmt = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? s + 's' : (Math.floor(s / 60) + 'm ' + (s % 60) + 's'); };
            const __sleep = (ms) => new Promise((r) => setTimeout(r, ms));
            // Is this oligo so small on-screen (zoomed out) that a magenta glow is needed to
            // show the user it was just added? Compares its on-screen pixel width to a threshold.
            const __isTiny = (o) => {
                try {
                    const tg = selectedTrack.tgraph, gg = graph.graph;
                    if (!tg || !gg) return true;
                    const px = Math.abs(gg.X(tg.X(o.xf)) - gg.X(tg.X(o.xi)));
                    return px < 30;   // < 30px wide → hard to see → glow it
                } catch (e) { return true; }
            };
            for (let i = 0; i < ranked.length; i++) {
                done++;
                const _oligo = await dropCandidate(ranked[i], ruleset, chemObj, true);
                if (_oligo) placed++;
                prog.set((done / ranked.length) * 100);
                const _el = Date.now() - _t0;
                const _eta = done > 0 ? (_el / done) * (ranked.length - done) : 0;
                graph.setMessage(' Tiling ' + ruleset + '… placed ' + placed +
                    ' — ' + done + '/' + ranked.length + ' (' + Math.round(done / ranked.length * 100) + '%), ETA ' + _fmt(_eta));
                // When zoomed out, glow each newly placed oligo magenta for 2s and redraw
                // immediately so the user can watch them appear one at a time. When zoomed
                // in (oligo clearly visible), fall back to the fast batched redraw.
                if (_oligo && __isTiny(_oligo)) {
                    try { if (_oligo.highlight) _oligo.highlight(2000, 'magenta'); } catch (e) { }
                    try { if (selectedTrack.fitYAxis) selectedTrack.fitYAxis(); } catch (e) { }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    await __sleep(30);   // brief pause so the glows appear sequentially
                } else if (done % 10 === 0) {
                    // Batch the redraw every 10 placements (counter/status stays live).
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    try { if (selectedTrack.fitYAxis) selectedTrack.fitYAxis(); } catch (e) { }
                }
            }
            prog.done();
            try { if (graph.wake) graph.wake(); } catch (e) { }   // final redraw for the remainder
            try { if (graph.fitAllTrackYAxes) graph.fitAllTrackYAxes(); else if (selectedTrack.fitYAxis) selectedTrack.fitYAxis(); } catch (e) { }
            // The last oligos' 2s magenta glow clears itself internally but leaves no redraw
            // behind — schedule one so the final glows fade on their own.
            try { setTimeout(() => { try { if (graph.wake) graph.wake(); } catch (e) { } }, 2100); } catch (e) { }
            if (placed === 0) {
                // Explain why nothing was added.
                const chemName = (chemObj && (chemObj.name || chemObj.type)) || 'the selected chemistry';
                let why = __lastDropError;
                if (!why) {
                    const twoStrand = !!(chemObj && (chemObj.sense || (chemObj.structure && chemObj.structure.sense)));
                    if (ruleset === 'sirna' && !twoStrand) {
                        why = 'ruleset is siRNA but "' + chemName + '" is not a two-stranded (siRNA) chemistry';
                    } else {
                        why = '"' + chemName + '" could not build a ' + ruleset + ' compound for any candidate';
                    }
                }
                if (graph.setError) graph.setError(' Added 0 oligos — ' + why + '. ', 6);
                else graph.setMessage(' Added 0 oligos — ' + why + '. ');
            } else {
                graph.setMessage(' Added ' + placed + ' ' + ruleset + ' oligo(s) to ' + selectedTrack.name + '. ');
            }
            try { graph.setMouseMode('navigate'); } catch (e) { }
            // After the design completes, hand the mouse back to hover behavior.
            try { graph.clearMouseListeners(); exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        }

        // ---- step 3: build the compound with the selected chemistry + drop ----
        async function dropCandidate(cand, ruleset, chemObj, quiet) {
            try {
                const startIndex = selectedTrack.xi + __designOffset + cand.start;   // world coord
                const endIndex = startIndex + cand.length;
                const targetWindow = Rules.clean(cand.targetWindow); // DNA sense of the window
                // Spread designed oligos randomly in Y so they don't all land on the
                // baseline (y≈0) and stack on top of each other. Pick a random lane
                // within the track's vertical band.
                const tg = selectedTrack.tgraph;
                const yBase = tg ? tg.ymin : 0;
                const yTop = tg ? Math.max(tg.ymax, yBase + 1) : 1;
                const randY = yBase + Math.random() * (yTop - yBase);
                const bioObject = {
                    targetSequence: targetWindow,
                    trackName: selectedTrack.name,
                    startIndex: startIndex,
                    endIndex: endIndex,
                    strand: selectedTrack.strand,
                    y: randY
                };
                const compound = await Biopolymer.generateCompound(chemObj, bioObject);
                if (!compound) {
                    __lastDropError = 'Biopolymer.generateCompound returned null for chemistry type "' + (chemObj && chemObj.type || '?') + '" — the chemistry template cannot build this compound';
                    if (!quiet) graph.setMessage(' Could not build the compound. ');
                    return false;
                }

                // Stamp the design analysis onto the oligo so it travels with it and
                // can be shown on-canvas / in menus / in reports.
                compound.designScore = cand.score;
                compound.designType = ruleset;
                compound.designDetail = cand.detail;
                if (ruleset === 'sirna') { compound.guide = cand.guide; compound.sense = cand.sense; }
                // approximate GC/Tm for display (server primer3 can refine later)
                const strandSeq = ruleset === 'sirna' ? cand.sense : Rules.revComp(targetWindow);
                if (compound.gc == null) compound.gc = Rules.gcPercent(strandSeq);
                if (compound.tm == null) compound.tm = Rules.meltingTemp(strandSeq);
                // surface the score as the on-canvas label
                compound.showLabel = true;
                compound.labelAttribute = 'designScore';
                compound.labelPrefix = 'score ';
                if (compound.y == null || compound.y === 0) compound.y = randY;   // keep the random lane

                selectedTrack.addOligo(compound);
                if (!quiet) graph.setMessage(' Dropped ' + ruleset + ' oligo (score ' + cand.score + ') at ' + cand.start + '. ');
                return compound;   // the placed oligo (so the caller can glow it)
            } catch (e) {
                console.warn('tile-oligos-design: drop failed', e);
                __lastDropError = 'build error: ' + (e && e.message ? e.message : ('' + e));
                if (!quiet) graph.setMessage(' Drop failed: ' + (e && e.message ? e.message : e));
                return false;
            }
        }

        // A direct target (supplied track, or an already-selected sequence): FIRST ask the user to
        // choose the modality (siRNA / Gapmer / Steric), THEN show the Default/Advanced dialog — the
        // same process as the other designers — and finally tile across the marked region.
        if (__target) {
            selectedTrack = __target;

            // Step 1 — modality (skip the picker only if a preset was passed in from the Create menu).
            const modality = preset || (await pickModality());
            if (!modality) { graph.setMessage(' Design cancelled. '); resolve(); return; }

            // Step 2 — hand off to the PY-BASED designer for that modality (track-design-menu.js),
            // which runs its own Default/Advanced dialog + py design (py/sirna/design.py,
            // py/ssaso/design.py). Select the whole track + sequence first so it operates on it.
            try { if (selectedTrack.selectTrackAndSeq) selectedTrack.selectTrackAndSeq(); } catch (e) { }
            try {
                await exec('baja/manchester/menu/track-design-menu.js', graph, selectedTrack, genegraph_panel_layout, modality);
            } catch (e) {
                try { graph.setMessage(' Could not open the ' + modality + ' designer. '); } catch (e2) { }
            }
        }

        resolve();
    });
}
