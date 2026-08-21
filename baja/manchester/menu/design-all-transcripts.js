// design-all-transcripts.js
//
// Design → All transcripts.  Opens a CENTER menu (graph.showMenu, which always
// renders centered/blurred) offering the rule-based design options that apply
// across every transcript track. Chemistry is gated first: if no chemistry is
// selected we run choose-chemistry.js, then show the center menu; otherwise we go
// straight to it.
//
// Center-menu items:
//   • siRNA rules / Gapmer ASO rules / Steric ASO rules  → tile + score + drop
//     across ALL transcript tracks (or the selected range, if one is set)
//   • Select sequence range… → let the user select a region, then re-open the
//     center menu (re-gating chemistry if it was cleared)
//
// The ruleset matching the selected chemistry's own type is listed first (✓).

function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve) => {
        const Biopolymer = await exec('baja/chem/biopolymer.js');
        const Rules = await exec('baja/manchester/design/oligo-design-rules.js');

        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const hasChem = () => !!(graph.props && graph.props.selected_chemistry);

        // Progress bar (Angular CanvasProgressComponent) shown while designing and
        // dropping oligos across the transcripts. Auto-removes ~10s after 100%.
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

        // Restrict scope to a user-selected region, or null = all transcripts.
        let selectedRange = null;   // { track, start, end }  (world coords)

        // A TWO-STRANDED chemistry (one that carries a sense strand) is an siRNA
        // and follows the siRNA rules, regardless of how it is named.
        const chemTypeToRuleset = (chem) => {
            if (!chem) return 'steric';
            const twoStrand = !!(chem.sense || (chem.structure && chem.structure.sense) || (chem.guide && chem.passenger));
            if (twoStrand) return 'sirna';
            const s = ('' + (chem.type || chem.name || '')).toLowerCase();
            if (s.indexOf('sirna') >= 0 || s.indexOf('si-rna') >= 0) return 'sirna';
            if (s.indexOf('gapmer') >= 0) return 'gapmer';
            return 'steric';
        };

        // Run `next` once a chemistry is selected; prompt for one first if needed.
        const ensureChemThen = async (next) => {
            if (hasChem()) { next(); return; }
            graph.setMessage(' Select a chemistry first — then the design menu opens. ');
            await exec('manchester/choose-chemistry.js', graph, genegraph_panel_layout);
            for (let i = 0; i < 600 && !hasChem(); i++) await sleep(250);
            if (!hasChem()) { graph.setMessage(' No chemistry selected — cancelled. '); return; }
            next();
        };

        // All tracks that carry a usable transcript sequence.
        const transcriptTracks = (minLen) => (graph.track || [])
            .filter((t) => t && t.sequence && t.sequence.length >= (minLen || 8));

        // ---- the CENTER menu -------------------------------------------------
        const showCenterMenu = () => {
            const chemObj = graph.props.selected_chemistry;
            const recommended = chemTypeToRuleset(chemObj);
            const scopeLabel = selectedRange
                ? ('selected range on ' + (selectedRange.track.name || 'track'))
                : ('all transcripts (' + transcriptTracks(8).length + ' tracks)');

            const rs = [
                { key: 'sirna', label: 'siRNA rules (double-stranded RISC)' },
                { key: 'gapmer', label: 'Gapmer (RNase-H) ASO rules' },
                { key: 'steric', label: 'Steric / splice-switching ASO rules' }
            ];
            rs.sort((a, b) => (a.key === recommended ? -1 : b.key === recommended ? 1 : 0));

            const menu = rs.map((it) => ({
                label: it.label + (it.key === recommended ? '   ✓ chemistry' : ''),
                move: () => { },
                click: () => { runDesignAll(it.key); }
            }));

            menu.push({
                label: 'Select sequence range…',
                move: () => { },
                click: () => { selectRangeThenReopen(); }
            });
            if (selectedRange) {
                menu.push({
                    label: '↺ Clear range (use all transcripts)',
                    move: () => { }, click: () => { selectedRange = null; showCenterMenu(); }
                });
            }
            // showMenu auto-appends its own Cancel (which unblurs + closes).

            graph.setMessage(' Design across ' + scopeLabel + ' — choose a ruleset. ');
            graph.showMenu(menu, 0, 0, 340);
        };

        // ---- Select sequence range, then reopen the center menu --------------
        const selectRangeThenReopen = async () => {
            graph.showMenu(null);
            graph.setMessage(' Select a sequence range, then the design menu re-opens. ');
            try {
                await exec('baja/manchester/menu/sequence.js', graph, genegraph_panel_layout, true);
            } catch (e) { /* selection cancelled */ }
            // Capture whatever region the user marked (a track with mark bounds).
            selectedRange = null;
            for (const t of (graph.track || [])) {
                if (t && t.markstart != null && t.markend != null && t.markend > t.markstart) {
                    selectedRange = { track: t, start: t.markstart, end: t.markend };
                    break;
                }
            }
            // Re-gate chemistry (in case it was cleared) then show the center menu.
            ensureChemThen(showCenterMenu);
        };

        // ---- tile + score + drop across the chosen scope ---------------------
        async function runDesignAll(ruleset) {
            graph.showMenu(null);
            const chemObj = graph.props.selected_chemistry;
            let L = 0;
            try { L = Biopolymer.countBases(chemObj); } catch (e) { L = 0; }
            if (!L || L < 8) L = Rules.DEFAULT_LEN[ruleset] || 20;

            // Build the target list: each entry is {track, seq, offset} where offset
            // is the 0-based index into track.sequence at which `seq` begins.
            const targets = [];
            let perTarget;
            if (selectedRange && selectedRange.track) {
                const t = selectedRange.track;
                const s0 = Math.max(0, Math.floor(selectedRange.start) - t.xi);
                const s1 = Math.min(t.sequence.length, Math.floor(selectedRange.end) - t.xi);
                if (s1 - s0 >= L) targets.push({ track: t, seq: t.sequence.substring(s0, s1), offset: s0 });
                perTarget = 10;   // a focused region → more candidates
            } else {
                for (const t of transcriptTracks(L)) targets.push({ track: t, seq: t.sequence, offset: 0 });
                perTarget = 3;    // all transcripts → a few best per transcript
            }

            if (!targets.length) { graph.setMessage(' No transcript sequence long enough to design against. '); return; }

            // Pass 1: score every target (fast, synchronous) and total the candidates
            // so the progress bar can reflect the whole design+drop operation.
            graph.setMessage(' Scoring ' + ruleset + ' candidates across ' + targets.length + ' transcript(s)… ');
            const plans = [];
            let total = 0;
            for (const tg of targets) {
                const span = Math.max(0, tg.seq.length - L);
                const step = Math.max(1, Math.floor(span / 4000));   // bound long tracks
                const ranked = Rules.designOligos(tg.seq, { type: ruleset, length: L, step, top: perTarget });
                plans.push({ tg, ranked });
                total += ranked.length;
            }
            if (!total) { graph.setMessage(' No candidates found for ' + ruleset + '. '); return; }

            // Pass 2: build + add each oligo, driving the progress bar.
            const prog = makeProgress();
            let placed = 0, done = 0, scanned = 0;
            for (const { tg, ranked } of plans) {
                for (const c of ranked) {
                    if (await dropCandidate(tg.track, c, ruleset, chemObj, tg.offset)) placed++;
                    done++;
                    prog.set((done / total) * 100);
                }
                scanned++;
                graph.setMessage(' Designing… ' + placed + ' oligo(s) across ' + scanned + '/' + plans.length + ' transcript(s) ');
            }
            prog.done();
            try { if (graph.fitAllTrackYAxes) graph.fitAllTrackYAxes(); } catch (e) { }
            graph.setMessage(' Placed ' + placed + ' ' + ruleset + ' oligo(s) across ' + scanned + ' transcript(s). ');
            try { graph.setMouseMode('navigate'); } catch (e) { }
        }

        // Build one compound with the selected chemistry and add it to `track`.
        async function dropCandidate(track, cand, ruleset, chemObj, offset) {
            try {
                const startIndex = track.xi + (offset || 0) + cand.start;   // world coord
                const endIndex = startIndex + cand.length;
                const targetWindow = Rules.clean(cand.targetWindow);
                // Random Y lane so designed oligos don't stack on the baseline.
                const tg = track.tgraph;
                const yBase = tg ? tg.ymin : 0;
                const yTop = tg ? Math.max(tg.ymax, yBase + 1) : 1;
                const randY = yBase + Math.random() * (yTop - yBase);
                const bioObject = {
                    targetSequence: targetWindow,
                    trackName: track.name,
                    startIndex: startIndex,
                    endIndex: endIndex,
                    strand: track.strand,
                    y: randY
                };
                const compound = await Biopolymer.generateCompound(chemObj, bioObject);
                if (!compound) return false;

                compound.designScore = cand.score;
                compound.designType = ruleset;
                compound.designDetail = cand.detail;
                if (ruleset === 'sirna') { compound.guide = cand.guide; compound.sense = cand.sense; }
                const strandSeq = ruleset === 'sirna' ? cand.sense : Rules.revComp(targetWindow);
                if (compound.gc == null) compound.gc = Rules.gcPercent(strandSeq);
                if (compound.tm == null) compound.tm = Rules.meltingTemp(strandSeq);
                compound.showLabel = true;
                compound.labelAttribute = 'designScore';
                compound.labelPrefix = 'score ';
                if (compound.y == null || compound.y === 0) compound.y = randY;   // keep the random lane

                track.addOligo(compound);
                return true;
            } catch (e) {
                console.warn('design-all-transcripts: drop failed on', track && track.name, e);
                return false;
            }
        }

        // ---- entry: gate chemistry, then run ---------------------------------
        // A chemistry is guaranteed after the gate, so derive the design ruleset
        // from it and run across all transcripts directly — no ruleset submenu.
        ensureChemThen(() => {
            const chemObj = graph.props.selected_chemistry;
            runDesignAll(chemTypeToRuleset(chemObj));
        });
        resolve();
    });
}
