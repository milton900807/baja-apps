
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

        // ---- chemistry gate: we need a chemistry to actually build the oligo ---
        const hasChem = () => !!(graph.props && graph.props.selected_chemistry);
        if (!hasChem()) {
            graph.setMessage(' Select a chemistry first, then click a track to design against. ');
            await exec('manchester/choose-chemistry.js', graph, genegraph_panel_layout);
            // give the user time to pick; poll briefly for a selection
            for (let i = 0; i < 600 && !hasChem(); i++) {
                await new Promise((r) => setTimeout(r, 250));
            }
            if (!hasChem()) { graph.setMessage(' No chemistry selected — design cancelled. '); resolve(); return; }
        }

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

        // Design DIRECTLY (no interactive track pick) when a track was supplied OR a
        // sequence is already selected on a track. Captured BEFORE selectOff() below
        // so the selection isn't wiped.
        let __target = (presetTrack && presetTrack.sequence && presetTrack.sequence.length >= 8) ? presetTrack : null;
        if (!__target) {
            __target = (graph.track || []).find((t) => t && t.markend > t.markstart && t.sequence && t.sequence.length >= 8) || null;
        }

        if (!__target) {
            // Pick the target track by clicking it (mirrors primer-probe-action.js).
            const __pickMsg = preset
                ? ('Click on a track to design ' + preset + ' oligos against its sequence.')
                : 'Click on a track to design oligos against its sequence.';
            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
            graph.selectOff();
            // Mouse-tracking prompt that follows the cursor until a track is clicked.
            try { graph.setMouseMode('msg: ' + __pickMsg); } catch (e) { }
            graph.setMessage(' ' + __pickMsg + ' ');

            graph.addMouseMoveListener((x, y) => {
                const ti = graph.getTrack(x, y);
                if (ti >= 0) {
                    const t = graph.track[ti];
                    if (t && selectedTrack !== t && selectedTrack) selectedTrack.showResizeBar = false;
                    selectedTrack = t;
                    if (selectedTrack) selectedTrack.showResizeBar = true;
                }
            });

            graph.addMouseDownListener((x, y) => {
                const ti = graph.getTrack(x, y);
                if (ti < 0) { graph.selectOff(); return; }
                selectedTrack = graph.track[ti];
                if (!selectedTrack || !selectedTrack.sequence || selectedTrack.sequence.length < 8) {
                    graph.setMessage(' That track has no usable sequence. '); return;
                }
                // A chemistry is always chosen by this point, so derive the design
                // ruleset from it and skip the ruleset picker. (An explicit preset,
                // if supplied, still wins.)
                const chemObj = graph.props.selected_chemistry;
                const ruleset = preset || chemTypeToRuleset(chemObj);
                runDesign(ruleset, x, y);
            });
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
                click: () => { graph.showSideMenu(null); runDesign(it.key, x, y); }
            }));
            menu.push({ label: 'Cancel', move: () => { }, click: () => { graph.showSideMenu(null); } });
            graph.setMessage(' Choose the design ruleset for ' + (selectedTrack.name || 'this track') + ' ');
            graph.showSideMenu(menu);
        }

        // Reason the most recent drop failed — used to explain a zero result.
        let __lastDropError = null;

        // ---- step 2: tile + score + drop all designed oligos onto the track --
        async function runDesign(ruleset, x, y) {
            const chemObj = graph.props.selected_chemistry;
            let L = 0;
            try { L = Biopolymer.countBases(chemObj); } catch (e) { L = 0; }
            if (!L || L < 8) L = Rules.DEFAULT_LEN[ruleset] || 20;

            let seq = String(selectedTrack.sequence);
            // Design ACROSS the selected sequence (the marked region) when one is set;
            // otherwise design across the whole track.
            __designOffset = 0;
            if (selectedTrack.markend > selectedTrack.markstart) {
                const ms = Math.max(0, Math.floor(selectedTrack.markstart));
                const me = Math.min(seq.length, Math.floor(selectedTrack.markend));
                if (me - ms >= L) { seq = seq.substring(ms, me); __designOffset = ms; }
            }
            // Score every position (step 1) up to the 100,000,000 candidate ceiling;
            // only a sequence longer than that gets subsampled.
            const span = Math.max(0, seq.length - L);
            const step = Math.max(1, Math.floor(span / 100000000));

            graph.setMessage(' Scoring ' + ruleset + ' candidates over ' + seq.length + ' nt… ');
            // Design the top 500 candidates by rule score.
            let ranked = Rules.designOligos(seq, { type: ruleset, length: L, step, top: 500 });
            if (!ranked.length) { graph.setMessage(' No candidates (track sequence shorter than oligo length). '); return; }

            // Real-time off-target filter: drop any candidate whose target site is NOT
            // unique — i.e. more than 1 exact (edit distance 0) hit in the species'
            // transcriptome. Uses the same local off-target service as the off-target tool.
            try {
                const _host = window['env']['apiUrl'];
                // Always filter against the human pre-mRNA off-target index.
                let _genome = 'human_premrna';
                try {
                    const _gj = await GETJSON(_host + '/genomes');
                    const _keys = Object.keys(_gj || {});
                    if (!_keys.includes(_genome)) _genome = _keys.find(k => /human.*premrna|premrna.*human/i.test(k)) || null;
                } catch (e) { }
                if (_genome) {
                    const _keep = new Array(ranked.length).fill(true);
                    const _seqs = ranked.map((c, i) => ({ id: String(i), synthesisSequence: Rules.clean(c.targetWindow) }));
                    const _CH = 200;
                    for (let _s = 0; _s < _seqs.length; _s += _CH) {
                        graph.setMessage(' Off-target filtering (edit distance 0) ' + Math.min(_s + _CH, _seqs.length) + '/' + _seqs.length + '… ');
                        const _r = await POSTJSON({ editDistance: 0, strand: '+-', genomes: _genome, sequences: _seqs.slice(_s, _s + _CH), runMode: 'return' }, _host + '/off-targets-file');
                        const _oq = (_r && _r.oligoQuery) || [];
                        for (const _q of _oq) {
                            const _ot = (_q.offtarget || _q.offTargets || []);
                            if (_ot.length > 1) _keep[+_q.id] = false;   // >1 exact hit => not unique
                        }
                    }
                    const _before = ranked.length;
                    ranked = ranked.filter((_, i) => _keep[i]);
                    graph.setMessage(' Off-target filter kept ' + ranked.length + '/' + _before + ' unique candidate(s). ');
                    if (!ranked.length) { graph.setMessage(' No unique candidates left after off-target filtering (edit distance 0). '); return; }
                }
            } catch (e) { console.warn('off-target filter skipped:', e); }

            // Add ALL designed oligos to the track (no menu / list), with a
            // progress bar while they are built and placed.
            const prog = makeProgress();
            let placed = 0;
            for (let i = 0; i < ranked.length; i++) {
                if (await dropCandidate(ranked[i], ruleset, chemObj, true)) placed++;
                prog.set(((i + 1) / ranked.length) * 100);
                graph.setMessage(' Designing… placed ' + placed + '/' + ranked.length + ' ' + ruleset + ' oligo(s) ');
            }
            prog.done();
            try { if (graph.fitAllTrackYAxes) graph.fitAllTrackYAxes(); else if (selectedTrack.fitYAxis) selectedTrack.fitYAxis(); } catch (e) { }
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
                return true;
            } catch (e) {
                console.warn('tile-oligos-design: drop failed', e);
                __lastDropError = 'build error: ' + (e && e.message ? e.message : ('' + e));
                if (!quiet) graph.setMessage(' Drop failed: ' + (e && e.message ? e.message : e));
                return false;
            }
        }

        // A direct target (supplied track, or an already-selected sequence) — design
        // across it now (respecting its marked region) instead of an interactive pick.
        if (__target) {
            selectedTrack = __target;
            const ruleset = preset || chemTypeToRuleset(graph.props.selected_chemistry);
            await runDesign(ruleset, 0, 0);
        }

        resolve();
    });
}
