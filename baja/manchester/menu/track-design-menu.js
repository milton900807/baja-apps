function (graph, selectedTrack, genegraph_panel_layout, presetModality) {

    // The Design LIBRARY for a single track — Therapeutics, Primer probes, Off-targets,
    // Compounds and the Clinical Library, each a shelf of described strategies rather than a
    // row in a popup. Both entry points (the on-canvas track menu in mouse-over-highlight.js
    // and the info-panel Tracks child menu in gene.js openTracks) open this same file, so they
    // cannot drift apart.
    //   exec('baja/manchester/menu/track-design-menu.js', graph, track, genegraph_panel_layout)
    //
    // It was a cascade of side menus, with its own copies of orderMenu / showSideMenuDelayed
    // carried over from mouse-over-highlight.js to keep the ordering and timing matching. Those
    // are gone with the cascade: baja/lib/shelf.js owns the navigation now -- the breadcrumb,
    // Back, Escape and the walk in and out of each level -- and the designers themselves are
    // untouched. Every leaf still opens its own Default / Advanced dialog and runs the same
    // python it always did.
    // Called BEFORE a design tiles its oligos onto the track: dismiss EVERY on-canvas menu
    // (side + center) so nothing covers the result.
    //
    // It used to ALSO zoom the camera to frame the track, so the oligos could be watched
    // landing on it. That takes the view away from wherever the user put it -- and someone
    // designing is usually looking at something they navigated to deliberately, often the very
    // selection the design is scoped to. Losing that framing costs more than the animation was
    // worth, and it is not recoverable: there is no undo for a camera move.
    //
    // The view is left exactly as it is. The design still announces itself through the status
    // badge and the result toast, and the compounds appear where the track already is.
    const __clearMenusForDesign = () => {
        try { if (graph && graph.showSideMenu) graph.showSideMenu(null); } catch (e) { }
        try { if (graph) { graph.menu = null; if (graph.graph) graph.graph.menu = null; } } catch (e) { }
        try { if (graph && graph.wake) graph.wake(); } catch (e) { }
    };
    // A small working spinner badge in the UPPER-RIGHT (opposite the top button row) shown while
    // a design runs. Returns a handle with .stop(). Non-blocking (pointer-events:none).
    // Design progress goes to the ONE status indicator, centred below the canvas buttons.
    //
    // This used to build its own spinner pinned to the top-right corner, so a design run showed
    // its progress somewhere different from every other long operation in the app -- two
    // spinners, two positions, and two bits of code to keep in step. The shared indicator
    // (io-engine.ts) measures the live button row and centres itself under it, so delegating
    // means this can never drift out of position again.
    //
    // Same contract as before: returns { stop } and the caller does not care how it is drawn.
    // Design progress goes to the ONE status indicator, centred below the canvas buttons.
    //
    // This used to build its own spinner pinned to the top-right corner, so a design run showed
    // its progress somewhere different from every other long operation in the app. The shared
    // indicator (io-engine.ts) measures the live button row and centres itself under it.
    //
    // After a minute it also offers a CANCEL button. Read what that does before relying on it:
    // there is no way to stop the work. EngineMonitor has no cancel, the /py bridge has no
    // per-job kill, and the only thing that stops a python run is the server's own runtime cap.
    // Cancel therefore means "stop waiting": the status clears, the editor is handed back, and
    // the result is DISCARDED if it ever arrives. The job keeps running server-side and the
    // message says so, because a button that silently left work running while implying it had
    // been killed would be worse than no button.
    //
    // Same contract as before, plus `cancelled` for callers to check before applying a result.
    const __showSpinner = (label, script) => {
        const ID = 'baja-design-cancel';
        const handle = { cancelled: false };
        // Ask the server to kill the python job behind this design. The client never receives a
        // job id -- exec rebuilds its URL from new URL(path).pathname, which drops a query
        // string -- so the job is identified by SCRIPT plus the signed-in user, which is what
        // /py-cancel matches on. Without this the button could only stop the browser waiting
        // while the work carried on holding a slot and a CPU.
        const killJob = async () => {
            const sc = ('' + (script || '')).trim();
            if (!sc) return;
            try {
                const host = (window['env'] && window['env']['apiUrl']) || window.location.origin;
                const user = (typeof getUser === 'function' ? (getUser() || '') : '');
                const r = await fetch(host + '/py-cancel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ script: sc, user: user })
                });
                const j = r.ok ? await r.json() : null;
                const n = (j && j.cancelled) || 0;
                graph.setMessage(n
                    ? ' Design cancelled — the job was stopped on the server. '
                    : ' Design cancelled — no running job matched, so it may already have finished. ');
            } catch (e) {
                graph.setMessage(' Design cancelled here, but the server could not be reached to stop the job. ');
            }
        };
        const dropBtn = () => {
            try { const e = document.getElementById(ID); if (e && e.parentNode) e.parentNode.removeChild(e); } catch (er) { }
        };
        const say = (text) => {
            try {
                window.__workStatus = text || '';
                if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
            } catch (e) { }
        };
        // The trailing ellipsis is what marks a message as work-in-progress, which is what the
        // indicator keys off (see setMessage in flexigraph/gene.js).
        let text = ('' + (label || 'Designing')).trim();
        if (!/(…|\.\.\.)$/.test(text)) text += '…';
        say(text);

        const finish = () => { try { clearTimeout(timer); } catch (e) { } dropBtn(); say(''); };

        // Only after a MINUTE. Offering it immediately would invite cancelling runs that were
        // about to finish, and most designs are done well inside that.
        const timer = setTimeout(() => {
            try {
                dropBtn();
                const b = document.createElement('button');
                b.id = ID;
                b.textContent = 'Cancel design';
                b.title = 'Stop this design. The python job is killed on the server.';
                // TOP centre, under the status badge -- not at the foot of the window.
                //
                // It sat at bottom:64px, which is where the free-plan bar lives and, on some
                // devices, off screen entirely: the one control that stops a running job was in
                // the one place a user might never see it. Everything the app says about work in
                // progress is in the top strip now (see __topStripY in flexigraph/gene.js), and
                // this belongs with it.
                //
                // BELOW the messages, not over them. The badge is what says what is running and
                // where it has got to; this button is what you press if the answer is 'too long'.
                // Measured from the badge when it is up (io-engine.ts sizes and positions it
                // from the live button row) so the two never overlap however the toolbar wraps,
                // with a constant only as the fallback.
                let __top = 132;
                try {
                    const w = document.getElementById('baja-working');
                    if (w && w.style.display !== 'none') {
                        const r = w.getBoundingClientRect();
                        if (r && r.height) __top = Math.round(r.bottom + 10);
                    }
                } catch (e) { }
                b.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);top:' + __top + 'px;'
                    + 'z-index:2147483300;cursor:pointer;background:#7f1d1d;color:#fee2e2;'
                    + 'border:1px solid rgba(255,255,255,0.22);border-radius:9px;padding:8px 16px;'
                    + 'font:700 12.5px Arial,Helvetica,sans-serif;box-shadow:0 8px 26px rgba(0,0,0,0.4);';
                b.onclick = () => {
                    handle.cancelled = true;
                    finish();
                    try { Promise.resolve(killJob()).catch(() => { }); } catch (e) { }
                    // Hand the editor back rather than leaving it in whatever mode the design set.
                    try {
                        graph.clearMouseListeners();
                        graph.setMouseMode('navigate');
                        exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout);
                    } catch (e) { }
                };
                (document.body || document.documentElement).appendChild(b);
            } catch (e) { }
        }, 60000);

        handle.stop = finish;
        return handle;
    };

    // Progress for a design run. The python designers report their stages through works.msg
    // Which off-target index the designers screen against. The design scripts take an
    // `offtarget_index` and, given one, weight every returned site by how many OTHER genes
    // its sequence hits (py/ssaso/design.py). They score on sequence terms alone without it,
    // so everything here fails soft: no server, no /genomes, no match -> no index passed, and
    // the design runs exactly as it did before the screen existed.
    //
    // Preference order is a cDNA index for the track's own species, then any cDNA index, then
    // whatever is there. cDNA rather than pre-mRNA because a gapmer's competition is the
    // mature transcript pool, and pre-mRNA indexes are much larger for the same answer.
    const __pickOffTargetIndex = async (track) => {
        try {
            const base = (window['env'] && window['env']['apiUrl']) || '';
            if (!base) return null;
            const r = await GETJSON(base + '/genomes');
            let names = [];
            if (Array.isArray(r)) names = r.map((g) => '' + g);
            else if (r && typeof r === 'object') names = Object.keys(r);
            names = names.filter(Boolean);
            if (!names.length) return null;
            const sp = ('' + ((track && track.species) || '')).toLowerCase().replace(/[^a-z0-9]+/g, '_');
            const cdna = names.filter((n) => n.toLowerCase().indexOf('cdna') >= 0);
            if (sp) {
                const mine = cdna.filter((n) => n.toLowerCase().indexOf(sp) >= 0);
                if (mine.length) return mine[0];
            }
            return cdna.length ? cdna[0] : names[0];
        } catch (e) { return null; }
    };

    // (see py/ssaso/design.py and design-steric-blocking.py); this puts each one in the status
    // badge under the canvas buttons, prefixed with the modality so the line says WHAT is being
    // designed as well as what stage it is at.
    //
    // The badge, not setCenterMessage. Centre messages are drawn large across the canvas, over
    // the very track the design is about to land on, and the app already has one place for
    // work-in-progress -- the indicator beside the spinner. Progress that appears somewhere
    // different from every other progress is progress the user has to learn to look for.
    // What to call a run in the indicator and on the Cancel button, from its script. The
    // spinner was being labelled with the script PATH -- 'py/ssaso/design.py' -- which is the
    // one thing on screen that could not tell the user what was running.
    const __designLabel = (script) => {
        const p = '' + (script || '');
        if (p.indexOf('sirna') >= 0) return 'Designing siRNA';
        if (p.indexOf('steric') >= 0) return 'Designing steric-blocking ASO';
        if (p.indexOf('ssaso') >= 0) return 'Designing gapmer ASO';
        return 'Designing';
    };

    // Modality AND chemistry, in a chemist's words, from the request that is about to be sent.
    // The dialog collects these and then they disappeared into the JSON: the run said
    // "Designing gapmer ASO" whatever wings or backbone had been chosen, so two runs with very
    // different chemistry were reported identically -- and the result toast, which is what
    // survives on screen afterwards, said nothing about what the compounds are made of.
    //
    // Gapmer vs mixmer is read from the GAP, not from a setting: a design with no DNA gap left
    // to cut is a mixmer and works by affinity rather than by recruiting RNase H. Same rule the
    // python uses, so the two cannot describe one run differently.
    const __chemistryOf = (script, req) => {
        try {
            const p = '' + (script || ''), q = req || {};
            const bb = q.default_backbone || 'PS';
            if (p.indexOf('sirna') >= 0) {
                const so = (q.overhangs && q.overhangs.sense) || '';
                const ao = (q.overhangs && q.overhangs.antisense) || '';
                return 'siRNA duplex' + ((so || ao) ? (', ' + (so || 'blunt') + ' / ' + (ao || 'blunt') + ' overhangs') : '');
            }
            if (p.indexOf('steric') >= 0) {
                return 'Steric-blocking ASO, full ' + (q.full_modification || "2'-MOE") + ', ' + bb + ' backbone';
            }
            if (p.indexOf('ssaso') >= 0) {
                const gaps = Array.isArray(q.gap_sizes) ? q.gap_sizes : [];
                const modality = (gaps.length && Math.min.apply(null, gaps) > 0) ? 'Gapmer' : 'Mixmer';
                return modality + ' with ' + (q.wing_modification || 'LNA') + ' wings, ' + bb + ' backbone';
            }
        } catch (e) { }
        return '';
    };
    // ---- Where a designed compound sits on the track -------------------------------------
    //
    // As LOW as it will go, and no lower: compounds start on the bottom row and only climb when
    // that row is already taken at their x. Every design used to place its whole set at a fixed
    // y: 0.3, so a second design landed exactly on top of the first and the track read as one
    // pile of compounds however many runs had produced them.
    //
    // Lowest first because the track's own features -- the gene body, the exons, the sequence
    // and the amino-acid row -- live at the bottom, and a compound is only meaningful next to
    // the bases it binds. Pushing them all up to a fixed row put empty canvas between a
    // compound and the thing it is about.
    // The floor is DERIVED, not guessed. It was set to 0.2, then 0.3 -- and 0.3 is exactly
    // where track.js draws the codon index numbers (GX_AA_INDEX_Y), so compounds landed on top
    // of them. Two guesses were two too many: the track now publishes where both the
    // amino-acid row and its index numbers actually are, and __peptideFloorY takes the highest
    // of them plus a row. A row that moves in track.js moves the compounds with it.
    const OLIGO_FLOOR_Y = 0.2;      // the floor when a track shows no peptide row at all
    const OLIGO_ROW_STEP = 0.12;    // one row up: enough to clear a compound and its labels
    const OLIGO_ROW_MAX = 24;       // a ceiling, so a pathological set cannot climb forever

    // The floor for THIS track: the requested 0.2, unless a peptide row reaches higher.
    // The amino-acid row normally sits below the baseline, so 0.2 already clears it -- but a
    // track that puts it elsewhere should push the compounds above it rather than through it,
    // and track.js publishes where it actually ended up (tgraph.__pepTrackY).
    const __peptideFloorY = (track) => {
        let floor = OLIGO_FLOOR_Y;
        try {
            const tg = track && track.tgraph;
            // Both rows, because the INDEX NUMBERS sit higher than the letters they number --
            // clearing the amino-acid row alone is what put compounds on the numbers.
            for (const v of [tg && tg.__pepTrackY, tg && tg.__pepIndexTrackY]) {
                if (v != null && isFinite(v) && (v + OLIGO_ROW_STEP) > floor) floor = v + OLIGO_ROW_STEP;
            }
        } catch (e) { }
        return floor;
    };

    // Assign each incoming compound the lowest free row. Rows are occupied per x-span, so two
    // compounds at opposite ends of a transcript share the bottom row instead of stacking.
    //
    // Seeded with what is ALREADY on the track, not just this run: designing siRNA and then
    // gapmers should read as two sets side by side, and the second run cannot know where the
    // first one landed unless it looks.
    const __packOligoRows = (track, incoming, xOffset) => {
        const rows = [];   // rows[i] = [{lo, hi}, ...] spans taken on that row
        const floor = __peptideFloorY(track);
        const rowOf = (y) => Math.max(0, Math.round((y - floor) / OLIGO_ROW_STEP));
        const claim = (ri, lo, hi) => {
            while (rows.length <= ri) rows.push([]);
            rows[ri].push({ lo: lo, hi: hi });
        };
        const free = (ri, lo, hi) => {
            const r = rows[ri];
            if (!r) return true;
            // A small gap either side, so two compounds that merely touch still read as two.
            for (const sp of r) { if (lo < sp.hi + 2 && hi + 2 > sp.lo) return false; }
            return true;
        };
        try {
            for (const o of (track && track.oligos) || []) {
                if (!o) continue;
                const lo = Math.min(o.xi, o.xf), hi = Math.max(o.xi, o.xf);
                if (!isFinite(lo) || !isFinite(hi)) continue;
                claim(rowOf(Number(o.y) || floor), lo, hi);
            }
        } catch (e) { }
        const off = Number(xOffset) || 0;
        for (const o of (incoming || [])) {
            if (!o) continue;
            // The caller has not applied the track offset yet, so compare in the same space the
            // compound will finally occupy.
            const lo = Math.min(o.xi, o.xf) + off, hi = Math.max(o.xi, o.xf) + off;
            let ri = 0;
            while (ri < OLIGO_ROW_MAX && !free(ri, lo, hi)) ri++;
            claim(ri, lo, hi);
            o.y = floor + ri * OLIGO_ROW_STEP;
        }
        return incoming;
    };

    // What the run actually produced. Every design reported its stages and then ended in
    // silence, so one that placed three compounds and one that placed forty looked the same,
    // and a design that placed NONE looked like a design that had not finished.
    //
    // setResultMessage, not setMessage: the canvas draws only error and result toasts.
    const __designDone = (modality, oligos, track, chemistry, result, algorithm) => {
        try {
            const n = (oligos && oligos.length) | 0;
            const chem = chemistry ? (' — ' + chemistry) : '';
            const where = (track && track.name) ? (' on ' + track.name) : '';
            let span = '';
            try {
                const r = track && track.selectedRange && track.selectedRange();
                if (r) span = ' over the selected ' + Math.max(0, Math.round(r.end - r.start)) + ' nt';
            } catch (e) { }
            if (!n) {
                graph.setResultMessage(' ' + modality + chem + ': no candidate passed the filters'
                    + span + '. Try a wider length range, or a longer selection. ');
                return;
            }
            let best = null;
            for (const o of oligos) {
                const v = Number(o && (o.normalized_score != null ? o.normalized_score : o.score));
                if (isFinite(v) && (best == null || v > best)) best = v;
            }
            graph.setResultMessage(' ' + modality + chem + ': ' + n + ' compound' + (n === 1 ? '' : 's')
                + ' placed' + where + span
                + (best != null ? (', best score ' + best.toFixed(2)) : '') + '. ');

            // The report. The toast above says how many; this says how, and is where the
            // exports and the off-target run live. Every modality reaches it through this one
            // function, so none of them can end without one.
            try {
                exec('baja/manchester/menu/design-summary.js', graph, genegraph_panel_layout, {
                    modality: modality,
                    algorithm: algorithm,
                    chemistry: chemistry,
                    track: track,
                    oligos: oligos,
                    result: result
                });
            } catch (e) { }
        } catch (e) { }
    };

    const __designProgress = (modality) => new EngineMonitor(async (msg) => {
        try {
            const t = ('' + (msg == null ? '' : msg)).trim();
            if (!t) return;
            // The trailing ellipsis is what marks a line as work-in-progress (see setMessage in
            // flexigraph/gene.js); without it the indicator treats the line as a conclusion and
            // clears itself between stages.
            const line = modality + ' · ' + t + (/(…|\.\.\.)$/.test(t) ? '' : '…');
            window.__workStatus = line;
            if (typeof window.__bajaWorkRefresh === 'function') window.__bajaWorkRefresh();
        } catch (e) { }
    });

    return (async () => {
        const selected = async (v) => {
            graph.props.selected_chemistry = v;
            setTimeout(async () => {
                // await exec('baja/manchester/menu/compound-editor.js', graph, genegraph_panel_layout);
                // graph.setMessage(" Chemistry selected : " + graph.props.selected_chemistry.name);
            }, 1000);
        };
        // Therapeutic oligo designers — grouped under "Therapeutics ▸" below.
        let therapeutics = [
            {
                label: "siRNA",
                click: async (scx, scy) => {
                    let progress = __designProgress('siRNA');
                    const str = `py/sirna/design.py`


                    // Default vs Advanced design dialog (navy demo look-and-feel).
                    // Advanced lets the user tune lengths, overhangs, alphabet and the
                    // per-component scoring weights that drive the ranking algorithm.
                    const showSirnaDesignDialog = () => new Promise((resolve) => {
                        try {
                            const old = document.getElementById('baja-sirna-design'); if (old && old.parentNode) old.parentNode.removeChild(old);
                            const lbl = 'display:block;font:600 12px Arial;color:#9fb3c8;margin:12px 0 4px;';
                            const inp = 'width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:8px 10px;font:13px Arial;';
                            const panel = document.createElement('div');
                            panel.id = 'baja-sirna-design';
                            panel.style.cssText = 'position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:2147483000;width:min(560px,94vw);max-height:86vh;overflow:auto;background:#0b2545;color:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.14);font-family:Arial,Helvetica,sans-serif;padding:18px;';
                            panel.innerHTML = ''
                                + '<div style="font:700 17px Arial;margin-bottom:2px;">siRNA Design</div>'
                                + '<div style="font:13px Arial;color:#9fb3c8;margin-bottom:12px;">Choose Default, or Advanced to tune the design algorithm.</div>'
                                + '<div style="display:inline-flex;background:#0a1e3a;border:1px solid rgba(255,255,255,0.16);border-radius:999px;padding:3px;">'
                                + '<button id="sd-default" style="cursor:pointer;border:0;border-radius:999px;padding:6px 16px;font:700 12px Arial;background:#22c55e;color:#04210f;">Default</button>'
                                + '<button id="sd-advanced" style="cursor:pointer;border:0;border-radius:999px;padding:6px 16px;font:700 12px Arial;background:transparent;color:#fff;">Advanced</button>'
                                + '</div>'
                                + '<label style="' + lbl + '">Maximum candidates</label>'
                                + '<input id="sd-topn" type="number" min="1" max="1000" value="100" style="' + inp + '"/>'
                                + '<label style="' + lbl + '">Template chemistry</label>'
                                + '<select id="sd-chem" style="' + inp + '">'
                                + '<option value="standard">2\'-F / 2\'-OMe (standard)</option>'
                                + '<option value="esc">ESC (Enhanced Stabilization)</option>'
                                + '<option value="esc_plus">Advanced ESC (ESC+)</option>'
                                + '<option value="galnac_esc">GalNAc-conjugated ESC</option>'
                                + '<option value="all_2ome">Fully 2\'-OMe</option>'
                                + '</select>'
                                + '<div id="sd-adv" style="display:none;">'
                                + '<label style="' + lbl + '">siRNA lengths</label>'
                                + '<div style="display:flex;gap:16px;font:13px Arial;"><label><input type="checkbox" id="sd-l21" checked/> 21</label><label><input type="checkbox" id="sd-l22" checked/> 22</label><label><input type="checkbox" id="sd-l23" checked/> 23</label></div>'
                                + '<label style="' + lbl + '">Output alphabet</label>'
                                + '<select id="sd-alpha" style="' + inp + '"><option value="DNA">DNA</option><option value="RNA">RNA</option></select>'
                                + '<div style="display:flex;gap:12px;"><div style="flex:1;"><label style="' + lbl + '">Sense 3\' overhang</label><input id="sd-soh" value="dTdT" style="' + inp + '"/></div><div style="flex:1;"><label style="' + lbl + '">Antisense 3\' overhang</label><input id="sd-aoh" value="" style="' + inp + '"/></div></div>'
                                + '<div style="font:700 12px Arial;color:#4fd0e6;margin:16px 0 2px;">Scoring weights (multipliers)</div>'
                                + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 12px;">'
                                + '<div><label style="' + lbl + '">GC content</label><input id="sd-w-gc" type="number" step="0.1" value="1" style="' + inp + '"/></div>'
                                + '<div><label style="' + lbl + '">Seed A/U (2–8)</label><input id="sd-w-seed" type="number" step="0.1" value="1" style="' + inp + '"/></div>'
                                + '<div><label style="' + lbl + '">Duplex-end ΔΔG</label><input id="sd-w-end" type="number" step="0.1" value="1" style="' + inp + '"/></div>'
                                + '<div><label style="' + lbl + '">Antisense pos 1</label><input id="sd-w-ap1" type="number" step="0.1" value="1" style="' + inp + '"/></div>'
                                + '<div><label style="' + lbl + '">Sense pos 1</label><input id="sd-w-sp1" type="number" step="0.1" value="1" style="' + inp + '"/></div>'
                                + '<div><label style="' + lbl + '">Repeats/runs</label><input id="sd-w-rep" type="number" step="0.1" value="1" style="' + inp + '"/></div>'
                                + '</div></div>'
                                + '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;">'
                                + '<button id="sd-cancel" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 13px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Cancel</button>'
                                + '<button id="sd-run" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 13px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">Run design</button>'
                                + '</div>';
                            document.body.appendChild(panel);
                            const q = (id) => panel.querySelector(id);
                            let mode = 'default';
                            const setMode = (m) => {
                                mode = m;
                                q('#sd-adv').style.display = (m === 'advanced') ? 'block' : 'none';
                                q('#sd-default').style.background = (m === 'default') ? '#22c55e' : 'transparent';
                                q('#sd-default').style.color = (m === 'default') ? '#04210f' : '#fff';
                                q('#sd-advanced').style.background = (m === 'advanced') ? '#22c55e' : 'transparent';
                                q('#sd-advanced').style.color = (m === 'advanced') ? '#04210f' : '#fff';
                            };
                            q('#sd-default').onclick = () => setMode('default');
                            q('#sd-advanced').onclick = () => setMode('advanced');
                            const close = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
                            q('#sd-cancel').onclick = () => { close(); resolve(null); };
                            q('#sd-run').onclick = () => {
                                // Clicking Run design dismisses any on-canvas menus (side + center).
                                try { if (graph && graph.showSideMenu) graph.showSideMenu(null); } catch (e) { }
                                try { if (graph) { graph.menu = null; if (graph.graph) graph.graph.menu = null; if (graph.wake) graph.wake(); } } catch (e) { }
                                const topn = Math.max(1, Math.min(1000, parseInt(q('#sd-topn').value, 10) || 100));
                                let params;
                                if (mode === 'advanced') {
                                    const lengths = [];
                                    if (q('#sd-l21').checked) lengths.push(21);
                                    if (q('#sd-l22').checked) lengths.push(22);
                                    if (q('#sd-l23').checked) lengths.push(23);
                                    const num = (id, d) => { const v = parseFloat(q(id).value); return Number.isFinite(v) ? v : d; };
                                    params = {
                                        top_n: topn,
                                        lengths: lengths.length ? lengths : [21, 22, 23],
                                        output_alphabet: q('#sd-alpha').value || 'DNA',
                                        senseOverhang: q('#sd-soh').value || '',
                                        antisenseOverhang: q('#sd-aoh').value || '',
                                        chemistry_template: (q('#sd-chem') ? q('#sd-chem').value : 'standard'),
                                        weights: {
                                            gc: num('#sd-w-gc', 1), seed_au: num('#sd-w-seed', 1),
                                            end_asymmetry_ddg: num('#sd-w-end', 1), antisense_pos1: num('#sd-w-ap1', 1),
                                            sense_pos1: num('#sd-w-sp1', 1), repeats_and_runs: num('#sd-w-rep', 1)
                                        }
                                    };
                                } else {
                                    params = { top_n: topn, lengths: [21, 22, 23], output_alphabet: 'DNA', senseOverhang: 'dTdT', antisenseOverhang: '', chemistry_template: (q('#sd-chem') ? q('#sd-chem').value : 'standard'), weights: {} };
                                }
                                close(); resolve(params);
                            };
                        } catch (e) { resolve(null); }
                    });
                    const __p = await showSirnaDesignDialog();
                    if (!__p) return;   // cancelled
                    let json_input = {
                        sequence: __wholeTrackSequence(),
                        // The track sequence is the SENSE mRNA (5'->3'), so the guide is ALWAYS its
                        // reverse-complement — independent of the gene's genomic strand. Passing the
                        // track's (possibly -1) strand made the designer emit complement(target) for
                        // minus-strand genes (e.g. KRAS), which is the wrong guide AND matched nothing
                        // in the off-target index. Design on the sense mRNA => strand 1.
                        strand: 1,
                        top_n: __p.top_n,
                        lengths: __p.lengths,
                        overhangs: { sense: __p.senseOverhang, antisense: __p.antisenseOverhang },
                        output_alphabet: __p.output_alphabet,
                        chemistry_template: __p.chemistry_template,
                        weights: __p.weights
                    }







                    const __sp = __showSpinner(__chemistryOf(str, json_input) || __designLabel(str), str); let r = await exec(str, progress, json_input); try { __sp.stop(); } catch (e) { }
                    // Cancelled while it ran: drop the result rather than tiling designs
                    // onto a track the user has already moved on from.
                    if (__sp.cancelled) { return; }

                    // Clear the menus before tiling. No camera move: the view stays where the
                    // user put it, and the 320ms settle that existed only to let a zoom finish
                    // goes with it.
                    __clearMenusForDesign();

                    // siRNA design does NOT touch the buttonMenuPanel — leave it as-is.

                    let SIRNA = await exec('flexigraph/sirna.js')
                    let Amplicon = await exec('flexigraph/amplicon.js')
                    function scoreToColor(score) {
                        if (score >= 40) return "limegreen";
                        if (score >= 25) return "gold";
                        if (score >= 10) return "orange";
                        return "red";
                    }
                    function buildSirnaArray(resultJson, options = {}) {
                        if (!resultJson || !Array.isArray(resultJson.top_candidates)) {
                            console.warn("Invalid siRNA result JSON");
                            return [];
                        }

                        const {
                            strand = selectedTrack.strand,
                            y = 0.3,
                            type = "siRNA",
                            track = selectedTrack
                        } = options;

                        const sirnas = [];

                        resultJson.top_candidates.forEach((c) => {
                            try {
                                // + the design offset: c.start indexes the sequence that was SENT, which is the
                                // selection when there is one, so without this every result lands at the start
                                // of the track instead of on the selection.
                                const xi = c.start + __designOffset();
                                const xf = c.end + __designOffset();

                                const sequence = c.target_site_input_alphabet || c.sense_strand || "";
                                const sense = c.sense_strand || "";
                                const antisense = c.antisense_strand || "";

                                // These are already constructed by the backend after overhang application.
                                // If one side has no overhang, that duplex should just equal the core strand.
                                const senseDuplex =
                                    c.sense_duplex !== undefined && c.sense_duplex !== null
                                        ? c.sense_duplex
                                        : sense;

                                const antisenseDuplex =
                                    c.antisense_duplex !== undefined && c.antisense_duplex !== null
                                        ? c.antisense_duplex
                                        : antisense;

                                const senseOverhang =
                                    c.sense_overhang !== undefined && c.sense_overhang !== null
                                        ? c.sense_overhang
                                        : "";

                                const antisenseOverhang =
                                    c.antisense_overhang !== undefined && c.antisense_overhang !== null
                                        ? c.antisense_overhang
                                        : "";

                                const structure = `${senseDuplex}|${antisenseDuplex}`;

                                const sirna = new SIRNA(
                                    type,
                                    sequence,
                                    sense,
                                    antisense,
                                    xi,
                                    xf,
                                    y,
                                    strand,
                                    structure
                                );

                                // Core strands
                                sirna.sequence = sequence;
                                sirna.sense = sense;
                                sirna.antisense = antisense;

                                // Duplex/display strands
                                sirna.senseDuplex = senseDuplex;
                                sirna.antisenseDuplex = antisenseDuplex;
                                sirna.senseOverhang = senseOverhang;
                                sirna.antisenseOverhang = antisenseOverhang;

                                // Keep seed logic on the core antisense unless you explicitly want overhangs included
                                sirna.synthesisSequence = antisense;
                                sirna.synthesisSequenceDuplex = antisenseDuplex;

                                sirna.score = c.score;
                                sirna.gc_percent = c.gc_percent;
                                sirna.rank = c.rank;
                                sirna.notes = c.notes || [];
                                // Itemized per-candidate scoring + nearest-neighbor thermodynamics
                                // (ΔG°37, ΔH, ΔS, Tm, duplex-end ΔΔG, internal stability profile).
                                sirna.design_scores = c.design_scores || {};
                                sirna.target_site = c.target_site_input_alphabet || sequence;
                                sirna.targetSiteRna = c.target_site_rna || null;
                                sirna.senseCoreRna = c.sense_core_rna || null;
                                sirna.antisenseCoreRna = c.antisense_core_rna || null;

                                sirna.color = scoreToColor(c.score);

                                if (track && typeof track.addOligo === "function") {
                                    track.addOligo(sirna);
                                    // Magenta glow as each siRNA lands — staggered by add order so you can
                                    // see where they fall on the track (like ASO design).
                                    try {
                                        const __gi = sirnas.length;
                                        setTimeout(() => { try { sirna.highlight(1800, 'magenta'); if (graph.wake) graph.wake(); } catch (e) { } }, __gi * 120);
                                    } catch (e) { }
                                }

                                sirnas.push(sirna);
                            } catch (e) {
                                console.error("Failed to build siRNA:", c, e);
                            }
                        });

                        return sirnas;
                    }
                    const sirnaArray = buildSirnaArray(r, {
                        strand: selectedTrack.strand,
                        // The row is decided by __packOligoRows below, not here. This is the
                        // value a compound keeps only if the packer cannot run.
                        y: OLIGO_FLOOR_Y
                    });
                    __packOligoRows(selectedTrack, sirnaArray, selectedTrack.xi);



                    for (let i of sirnaArray) {
                        const length = Math.abs(i.xf - i.xi)
                        i.xi += selectedTrack.xi;
                        i.xf = i.xi + length
                        selectedTrack.addOligo(i)
                    }
                    __designDone('siRNA', sirnaArray, selectedTrack, __chemistryOf(str, json_input), r, str);

                    // showModal({
                    //     wid: 'json',
                    //     data: JSON.stringify(selectedTrack.oligos)
                    // })
                }
            },

            {
                label: "Gapmer ASO",
                click: async (scx, scy) => {


                    let progress = __designProgress('Gapmer ASO');

                    let Oligo = await exec('flexigraph/oligo.js');
                    const str = `py/ssaso/design.py`;
                    // Default / Advanced design dialog — the LAST interface before the design runs.
                    const __p = await exec('baja/manchester/menu/aso-design-dialog.js', 'gapmer');
                    if (!__p) return;   // cancelled
                    let va = parseInt(__p.top_n) || 100;
                    let _sequence = __wholeTrackSequence();

                    let json_input = {
                        "sequence": _sequence,
                        // Sense mRNA — the ASO is the reverse-complement of the target regardless of
                        // the gene's genomic strand (same fix as siRNA; minus-strand genes otherwise
                        // got complement(target), which is wrong and finds no off-targets).
                        "strand": 1,
                        "top_n": va,

                        "lengths": __p.lengths || [16, 17, 18, 19, 20],
                        "gap_sizes": __p.gap_sizes || [8, 9, 10],

                        "wing_modification": __p.wing_modification || "LNA",
                        "default_backbone": __p.default_backbone || "PS",
                        "po_link_positions": [],

                        "output_alphabet": __p.output_alphabet || "DNA",
                        // Default TRUE. Sent as false, this asked design.py for the global top N
                        // with overlaps allowed, which is not the best N ASOs: every start is
                        // generated at five lengths and three gap sizes, so the variants of one
                        // good site fill the top of the list. The dialog's Advanced tab can still
                        // ask for those variants explicitly.
                        "enforce_non_overlapping": (__p.enforce_non_overlapping != null ? __p.enforce_non_overlapping : true),

                        // Off-target screen. Null when no index is reachable, which the script
                        // reads as "score on sequence terms only".
                        "offtarget_index": await __pickOffTargetIndex(selectedTrack),
                        "offtarget_edit_distance": 2,
                        // The track's own gene is the intended target; naming it stops its own
                        // transcripts being counted against every candidate.
                        "on_target_symbols": [selectedTrack && selectedTrack.name].filter(Boolean),

                        "helm_symbols": {
                            "DNA": "d",
                            "LNA": "lna",
                            "2'-OMe": "m",
                            "2'-MOE": "moe"
                        },

                        "min_separation": 0,

                        "endonuclease_motifs": [
                            "GAATTC",   // EcoRI
                            "GGATCC",   // BamHI
                            "AAGCTT",   // HindIII
                            "GCGGCCGC", // NotI
                            "CTCGAG"    // XhoI
                        ],

                        "exclude_gap_cleavage_motif_hits": true
                    }

                    const __sp = __showSpinner(__chemistryOf(str, json_input) || __designLabel(str), str); let r = await exec(str, progress, json_input); try { __sp.stop(); } catch (e) { }
                    // Cancelled while it ran: drop the result rather than tiling designs
                    // onto a track the user has already moved on from.
                    if (__sp.cancelled) { return; }

                    // Clear the menus before tiling. No camera move.
                    __clearMenusForDesign();

                    function normalizedScoreToColor(score) {
                        const s = Number(score ?? 0);
                        if (s >= 0.80) return "limegreen";
                        if (s >= 0.55) return "gold";
                        if (s >= 0.30) return "orange";
                        return "red";
                    }

                    function formatScore(score) {
                        const s = Number(score);
                        return Number.isFinite(s) ? s.toFixed(3) : "0.000";
                    }

                    function formatRawScore(score) {
                        const s = Number(score);
                        return Number.isFinite(s) ? s.toFixed(2) : "0.00";
                    }

                    function buildGapmerArray(resultJson, options = {}) {
                        const candidates = Array.isArray(resultJson?.hits)
                            ? resultJson.hits
                            : Array.isArray(resultJson?.top_candidates)
                                ? resultJson.top_candidates
                                : [];

                        if (!candidates.length) {
                            console.warn("Invalid gapmer result JSON");
                            return [];
                        }

                        const {
                            strand = selectedTrack.strand,
                            y = 0.2,
                            type = "gapmer",
                            track = selectedTrack
                        } = options;

                        const oligos = [];

                        candidates.forEach((c) => {
                            try {
                                // + the design offset: c.start indexes the sequence that was SENT, which is the
                                // selection when there is one, so without this every result lands at the start
                                // of the track instead of on the selection.
                                const xi = c.start + __designOffset();
                                const xf = c.end + __designOffset();

                                const antisense = c.antisense_display || "";
                                const target = c.target_site_input_alphabet || "";
                                const name = antisense || target || `gapmer_${xi}_${xf}`;

                                const structure =
                                    (typeof c.structure === "string" && c.structure.trim().length > 0)
                                        ? c.structure
                                        : "";

                                const oligo = new Oligo(
                                    type,
                                    name,
                                    structure,
                                    xi,
                                    xf,
                                    y
                                );

                                oligo.setStrand(strand);

                                // Core identity
                                oligo.name = name;
                                oligo.sequence = antisense;
                                oligo.synthesisSequence = antisense;
                                oligo.targetSequence = target;
                                oligo.targetSite = target;
                                oligo.targetSiteRna = c.target_site_rna || null;
                                oligo.antisense = antisense;
                                oligo.antisenseCoreRna = c.antisense_core_rna || null;

                                // HELM / chemistry
                                oligo.structure = structure;
                                oligo.helm = structure;
                                oligo.chemistryLayout = Array.isArray(c.chemistry_layout) ? c.chemistry_layout : [];
                                oligo.backbonePattern = Array.isArray(c.backbone_pattern) ? c.backbone_pattern : [];
                                oligo.wingModification = c.wing_modification || null;

                                // Gapmer design metadata
                                oligo.designType = "gapmer";
                                oligo.rank = c.rank ?? null;

                                // Keep both raw and normalized scores
                                oligo.score = Number(c.normalized_score ?? 0);
                                oligo.normalized_score = Number(c.normalized_score ?? 0);
                                oligo.raw_score = Number(c.score ?? 0);

                                oligo.gc_percent = c.gc_percent;
                                oligo.tm = c.tm_c;
                                oligo.tm_c = c.tm_c;
                                oligo.tmModificationBonus = c.tm_modification_bonus_c ?? 0;
                                oligo.tmMethod = c.tm_method || null;

                                oligo.length = c.length;
                                oligo.gapSize = c.gap_size;
                                oligo.gapStart = c.gap_start_1based;
                                oligo.gapEnd = c.gap_end_1based;
                                oligo.leftWingSize = c.left_wing_size;
                                oligo.rightWingSize = c.right_wing_size;
                                oligo.notes = c.notes || [];

                                // Label normalized score (0-1)
                                oligo.setLabelAttribute("normalized_score", {
                                    prefix: "Score: ",
                                    offsetY: -18,
                                    textColor: "maroon",
                                    fillColor: "white",
                                    strokeColor: "black",
                                    font: "10px Arial",
                                    formatter: (v) => formatScore(v)
                                });

                                // Optional second label for raw score if useful
                                oligo.setLabelAttribute("raw_score", {
                                    prefix: "Score ",
                                    offsetY: -32,
                                    textColor: "navy",
                                    fillColor: "white",
                                    strokeColor: "black",
                                    font: "10px Arial",
                                    formatter: (v) => formatRawScore(v)
                                });

                                oligo.color = normalizedScoreToColor(c.normalized_score);

                                oligos.push(oligo);
                            } catch (e) {
                                console.error("Failed to build gapmer:", c, e);
                            }
                        });

                        if (track && typeof track.addOligo === "function") {
                            // Rows BEFORE they land: once added, they would count as occupants
                            // of the rows they are being assigned, and every one after the first
                            // would climb over its own set.
                            try { __packOligoRows(track, oligos, track.xi); } catch (e) { }
                            let __gi = 0;
                            for (const oligo of oligos) {
                                const length = Math.abs(oligo.xf - oligo.xi)
                                oligo.xi += track.xi;
                                oligo.xf = oligo.xi + length
                                track.addOligo(oligo);
                                // Bright landing bling, staggered by add order, so each ASO is seen landing.
                                try {
                                    const __d = (__gi++) * 120;
                                    setTimeout(() => { try { if (oligo.highlight) oligo.highlight(1800, 'magenta'); else if (oligo.landingBurst) oligo.landingBurst('magenta'); if (graph.wake) graph.wake(); } catch (e) { } }, __d);
                                } catch (e) { }
                            }
                        }
                        return oligos;
                    }
                    const gapmerArray = buildGapmerArray(r, {
                        strand: selectedTrack.strand,
                        y: OLIGO_FLOOR_Y,
                        track: selectedTrack
                    });
                    __designDone('ASO', gapmerArray, selectedTrack, __chemistryOf(str, json_input), r, str);

                    // // Optional:
                    // showModal({
                    //     wid: 'json',
                    //     data: JSON.stringify(gapmerArray, null, 2)
                    // });
                }
            },
            {
                label: "Steric-blocking ASO",
                click: async (scx, scy) => {
                    let progress = __designProgress('Steric-blocking ASO');

                    let Oligo = await exec('flexigraph/oligo.js');

                    const str = `py/ssaso/design-steric-blocking.py`;

                    // Default / Advanced design dialog — the LAST interface before the design runs.
                    const __p = await exec('baja/manchester/menu/aso-design-dialog.js', 'steric');
                    if (!__p) return;   // cancelled
                    let _sequence = __wholeTrackSequence();

                    let json_input = {
                        sequence: _sequence,
                        // Sense mRNA — ASO is the reverse-complement of the target (same fix as siRNA).
                        strand: 1,
                        top_n: parseInt(__p.top_n) || 100,
                        lengths: __p.lengths || [18, 19, 20],
                        full_modification: __p.wing_modification || "2'-MOE",
                        default_backbone: __p.default_backbone || "PS",
                        po_link_positions: [],
                        output_alphabet: __p.output_alphabet || "DNA",
                        // Default TRUE, same as the gapmer call above and for the same reason:
                        // sent as false this asks for the global top N with overlaps allowed,
                        // which returns the length variants of a few good sites rather than a
                        // design spread across the transcript.
                        enforce_non_overlapping: (__p.enforce_non_overlapping != null ? __p.enforce_non_overlapping : true),

                        // Off-target screen, same as the gapmer above. design-steric-blocking.py
                        // ignores these until it grows the screen too; passing them now costs
                        // nothing and means only one place has to change when it does.
                        offtarget_index: await __pickOffTargetIndex(selectedTrack),
                        offtarget_edit_distance: 2,
                        on_target_symbols: [selectedTrack && selectedTrack.name].filter(Boolean),
                        annotations: [] // optional: populate if you have site annotations
                    };

                    const __sp = __showSpinner(__chemistryOf(str, json_input) || __designLabel(str), str); let r = await exec(str, progress, json_input); try { __sp.stop(); } catch (e) { }
                    // Cancelled while it ran: drop the result rather than tiling designs
                    // onto a track the user has already moved on from.
                    if (__sp.cancelled) { return; }

                    // Clear the menus before tiling. No camera move.
                    __clearMenusForDesign();

                    function scoreToColor(score) {
                        if (score >= 40) return "limegreen";
                        if (score >= 25) return "gold";
                        if (score >= 10) return "orange";
                        return "red";
                    }

                    showModal({
                        wid: 'json',
                        data: JSON.stringify(r, null, 2)
                    });

                    function buildStericBlockingArray(resultJson, options = {}) {
                        if (!resultJson || !Array.isArray(resultJson.top_candidates)) {
                            console.warn("Invalid steric-blocking result JSON");
                            return [];
                        }

                        const {
                            strand = selectedTrack.strand,
                            y = 0.2,
                            type = "steric_blocking_aso",
                            track = selectedTrack
                        } = options;

                        const oligos = [];

                        resultJson.top_candidates.forEach((c) => {
                            try {
                                // + the design offset: c.start indexes the sequence that was SENT, which is the
                                // selection when there is one, so without this every result lands at the start
                                // of the track instead of on the selection.
                                const xi = c.start + __designOffset();
                                const xf = c.end + __designOffset();

                                const antisense = c.antisense_display || "";
                                const target = c.target_site_input_alphabet || "";
                                const name = antisense || target || `steric_${xi}_${xf}`;

                                const structure =
                                    (typeof c.structure === "string" && c.structure.trim().length > 0)
                                        ? c.structure
                                        : "";

                                const oligo = new Oligo(
                                    type,
                                    name,
                                    structure,
                                    xi,
                                    xf,
                                    y
                                );

                                oligo.setStrand(strand);

                                // Core identity
                                oligo.name = name;
                                oligo.sequence = antisense;
                                oligo.synthesisSequence = antisense;
                                oligo.targetSequence = target;
                                oligo.targetSite = target;
                                oligo.targetSiteRna = c.target_site_rna || null;
                                oligo.antisense = antisense;
                                oligo.antisenseCoreRna = c.antisense_core_rna || null;

                                // HELM / chemistry
                                oligo.structure = structure;
                                oligo.helm = structure;
                                oligo.chemistryLayout = Array.isArray(c.chemistry_layout) ? c.chemistry_layout : [];
                                oligo.backbonePattern = Array.isArray(c.backbone_pattern) ? c.backbone_pattern : [];
                                oligo.fullModification = c.full_modification || resultJson.full_modification || null;

                                // Steric-blocking metadata
                                oligo.designType = c.design_type || resultJson.design_type || "steric_blocking_aso";
                                oligo.rank = c.rank;
                                oligo.score = c.score;
                                oligo.gc_percent = c.gc_percent;
                                oligo.tm = c.tm_c;
                                oligo.tm_c = c.tm_c;
                                oligo.length = c.length;
                                oligo.notes = c.notes || [];

                                // Optional annotation metadata from backend
                                oligo.annotationHits = Array.isArray(c.annotation_hits) ? c.annotation_hits : [];
                                oligo.annotationScore = c.annotation_score || 0;

                                oligo.setLabelAttribute("score", {
                                    prefix: "Score: ",
                                    offsetY: -18,
                                    textColor: "maroon",
                                    fillColor: "white",
                                    strokeColor: "black",
                                    font: "10px Arial"
                                });

                                oligo.color = scoreToColor(c.score);

                                oligos.push(oligo);
                            } catch (e) {
                                console.error("Failed to build steric-blocking ASO:", c, e);
                            }
                        });

                        if (track && typeof track.addOligo === "function") {
                            // Rows BEFORE they land: once added, they would count as occupants
                            // of the rows they are being assigned, and every one after the first
                            // would climb over its own set.
                            try { __packOligoRows(track, oligos, track.xi); } catch (e) { }
                            let __gi = 0;
                            for (const oligo of oligos) {
                                track.addOligo(oligo);
                                // Bright landing bling, staggered by add order, so each ASO is seen landing.
                                try {
                                    const __d = (__gi++) * 120;
                                    setTimeout(() => { try { if (oligo.highlight) oligo.highlight(1800, 'magenta'); else if (oligo.landingBurst) oligo.landingBurst('magenta'); if (graph.wake) graph.wake(); } catch (e) { } }, __d);
                                } catch (e) { }
                            }
                        }

                        return oligos;
                    }

                    const stericBlockingArray = buildStericBlockingArray(r, {
                        strand: selectedTrack.strand,
                        y: OLIGO_FLOOR_Y,
                        track: selectedTrack
                    });
                    __designDone('ASO', stericBlockingArray, selectedTrack, __chemistryOf(str, json_input), r, str);

                    // Optional:
                    // showModal({
                    //     wid: 'json',
                    //     data: JSON.stringify(stericBlockingArray, null, 2)
                    // });
                }
            },
        ];

        // Preset modality (e.g. from the tile-oligos entry): skip the Design menu and open that
        // therapeutic designer directly — its own Default/Advanced dialog + py design run from here.
        if (presetModality) {
            const __k = ('' + presetModality).toLowerCase();
            const __idx = (__k.indexOf('sirna') >= 0 || __k.indexOf('si-rna') >= 0) ? 0
                : (__k.indexOf('gap') >= 0 ? 1
                    : (__k.indexOf('steric') >= 0 ? 2 : -1));
            if (__idx >= 0 && therapeutics[__idx] && typeof therapeutics[__idx].click === 'function') {
                try { await therapeutics[__idx].click(); } catch (e) { }
                return;
            }
        }

        // Off-target count for an oligo — matches the on-canvas badge: distinct off-target
        // GENES, else the offtargetsymbols count, else the raw Levenshtein hit count.
        // Hoisted out of the menu item that used to wrap it, so the Design library can use it.
        const otCount = (o) => {
            if (!o) return 0;
            let ot = (o.offtarget != null) ? o.offtarget : o._offtarget;
            if (ot == null) return 0;
            if (Array.isArray(ot)) {
                const genes = new Set(ot.map((h) => h && h.symbol).filter(Boolean)).size;
                if (genes) return genes;
                if (o.offtargetsymbols && o.offtargetsymbols.length) return o.offtargetsymbols.length;
                return ot.length;
            }
            if (typeof ot === 'number') return ot;
            if (typeof ot === 'string') {
                const n = parseInt(ot, 10);
                if (!isNaN(n)) return n;
                return (o.offtargetsymbols && o.offtargetsymbols.length) ? o.offtargetsymbols.length : 0;
            }
            return 0;
        };

        // Remove every oligo on this track whose off-target count is over a maximum the user
        // gives. Pushes history first, so the answer to "I did not mean that" is undo.
        const filterByOffTargets = async () => {

            const vap = await prompt("Maximum allowable off-targets:", ["Max"], { "Max": 5 }, 520, 300);
            if (!vap) return;
            const max = parseInt(vap["Max"], 10);
            if (!Number.isInteger(max) || max < 0) {
                infoPrompt("Please enter a non-negative integer.");
                return;
            }
            graph.pushOntoHistory();
            const removed = [];
            const kept = [];
            for (const o of (selectedTrack.oligos || [])) {
                const isAmp = !!(o && (o.type === 'amplicon' || (o.left && o.right)));
                const n = otCount(o);
                // Auto-remove any oligo whose off-target count exceeds the max.
                if (!isAmp && n > max) {
                    removed.push({ id: (o.id != null ? o.id : (o.name || '?')), n });
                } else {
                    kept.push(o);
                }
            }
            selectedTrack.oligos = kept;
            try { if (graph.wake) graph.wake(); } catch (e) { }
            if (removed.length) {
                const lines = removed.map((r) => 'removed ' + r.id + ' with OT ' + r.n);
                try { lines.forEach((l) => log(l)); } catch (e) { }
                // setResultMessage, not setMessage: the canvas draws only error and result
                // toasts, so the plain message this used was set and then never shown -- oligos
                // vanished from the track with no word about why.
                graph.setResultMessage(' ' + removed.length + ' oligo(s) over ' + max + ' off-targets removed:  ' + lines.join('   |   ') + ' ');
            } else {
                graph.setResultMessage(' No oligos exceeded ' + max + ' off-targets. ');
            }
        };









        // Primer-probe assay design (primer3 / djPrimer / exon-exon) on the
        // highlighted region of this track — brought up under "Primer probes ▸".
        const __ppRefresh = () => { graph.setMouseMode('navigate'); try { graph.clearMouseListeners(); exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { } };
        // Design targets the SELECTED SEQUENCE when there is one, and the whole track when
        // there is not.
        //
        // This file used to force the whole track on purpose: the therapeutic designers read
        // selectedTrack.sequence while the primer designers took getSequenceRange(markstart,
        // markend), so one menu designed over two different regions, and the fix at the time
        // was to make them agree on the whole track. That made them agree by ignoring the
        // selection -- which is the one thing a user who has highlighted a region is asking
        // them to respect.
        //
        // They agree again, on the other answer: every designer here now runs over the
        // selection when the track has one. selectedRange()/selectedSequence() on the track
        // are the single source of that, so nothing in this file does its own coordinate
        // arithmetic and no designer can drift from the others again.
        //
        // Still reads only -- opening Design cannot disturb a selection made for something
        // else.
        const __wholeTrackSequence = () => {
            const t = selectedTrack;
            if (!t) return '';
            try {
                const sel = t.selectedSequence ? t.selectedSequence() : '';
                if (sel && sel.length) return sel;
            } catch (e) { }
            if (t.sequence) return t.sequence;
            // Some tracks expose their sequence only through the range accessor.
            try {
                const g = t.grid || t.tgraph;
                if (g && t.getSequenceRange) return t.getSequenceRange(g.xmin, g.xmax) || '';
            } catch (e) { }
            return '';
        };
        // Where the design began, as an index into the track's sequence: the selection's start
        // when there is one, the track origin otherwise. Results are placed from here, so a
        // design over a selection lands on the selection rather than at the start of the track.
        const __designOffset = () => {
            const t = selectedTrack;
            try { return (t && t.selectedOffset) ? t.selectedOffset() : 0; } catch (e) { return 0; }
        };
        // Was __needMark, which refused to run without a highlight. The only precondition left
        // is having a sequence at all.
        const __needSequence = () => {
            if (__wholeTrackSequence()) return true;
            infoPrompt(' That track has no sequence to design against. ');
            return false;
        };
        const runPrimer3 = async () => {
            if (!__needSequence()) return;
            graph.pushOntoHistory(); graph.clearMouseListeners();
            const sequence = __wholeTrackSequence();
            graph.setMessage(' Generating primers (primer3)... ');
            const em = new EngineMonitor((msg) => { try { graph.setMessage(msg); } catch (e) { } });
            const r = await exec('/py/ppsets/generate-ppsets.py', em, '' + sequence, '', 1);
            await exec('baja/manchester/ppsets/apply-primer3.js', r, __designOffset(), selectedTrack, graph);
            if (graph.wake) graph.wake();
            __ppRefresh();
        };
        const runDjprimer = async () => {
            if (!__needSequence()) return;
            graph.pushOntoHistory(); graph.clearMouseListeners();
            const sequence = __wholeTrackSequence();
            const gene = selectedTrack.geneID || selectedTrack.name || '';
            const opts = JSON.stringify({ scorer: 'djprimer', gene: '' + gene });
            graph.setMessage(' Designing primers (djPrimer)... ');
            const r = await exec('py/ppsets/models/find-primer-amplicons.py', '' + sequence, '', '', opts);
            selectedTrack.ampliconResults = r;
            await exec('baja/manchester/ppsets/apply-djprimer.js', r, __designOffset(), selectedTrack, graph);
            if (graph.wake) graph.wake();
            __ppRefresh();
        };
        const runExonExon = async () => {
            if (!__needSequence()) return;
            graph.pushOntoHistory(); graph.clearMouseListeners();
            const r = await exec('py/ppsets/models/find-primer-amplicons-exon-exon.py', selectedTrack);
            selectedTrack.ampliconResults = r;
            showModal({ wid: 'json', data: JSON.stringify(r) });
        };

        // Compounds ▸ Highlight — make every compound on the track twinkle magenta.
        //
        // o.highlight__ is not a boolean: the renderer passes it straight to
        // drawVerticalLineScreen as the COLOUR of the markers at each oligo's start and end
        // (baja/bio/track-flexi.js), so setting it to a colour is what draws them. Toggling it
        // on and off is the twinkle -- a static highlight is easy to miss on a busy track,
        // whereas motion is what the eye actually catches.
        //
        // Whatever each oligo had before is restored at the end, so this cannot clobber a
        // highlight something else set (an off-target run marks its hits the same way).
        const highlightCompounds = () => {
            const t = selectedTrack;
            const list = (t && t.oligos) ? t.oligos.slice() : [];
            if (!list.length) {
                infoPrompt(' There are no compounds on this track to highlight. ');
                return;
            }
            const MAGENTA = '#ff2fd6';
            const prev = list.map((o) => o.highlight__);
            let on = false, ticks = 0;
            const timer = setInterval(() => {
                on = !on;
                for (const o of list) { try { o.highlight__ = on ? MAGENTA : false; } catch (e) { } }
                try { if (graph.wake) graph.wake(); } catch (e) { }
                ticks++;
                if (ticks >= 12) {            // 12 x 450ms, a little over five seconds
                    try { clearInterval(timer); } catch (e) { }
                    list.forEach((o, i) => { try { o.highlight__ = prev[i]; } catch (e) { } });
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                }
            }, 450);
            try {
                graph.setMessage(' Highlighting ' + list.length + ' compound'
                    + (list.length === 1 ? '' : 's') + ' on ' + ((t && t.name) || 'track') + '. ');
            } catch (e) { }
        };


        // ---- The Design library -----------------------------------------------------------
        // Design is a library now rather than a side menu, for the same reason the Data
        // Resources tree became one: a strategy is a choice worth describing -- what a gapmer
        // does that a steric blocker does not, which primer designer suits which assay -- and a
        // one-word row in a popup has nowhere to say it. Each card carries that description.
        // The leaf is where a designer actually runs, and every one of them opens its own
        // Default/Advanced dialog exactly as before: the library replaces the navigation, not
        // the designers.
        const scopeNote = () => {
            try {
                const r = selectedTrack && selectedTrack.selectedRange && selectedTrack.selectedRange();
                if (r) return 'the selected sequence (' + Math.max(0, Math.round(r.end - r.start)) + ' nt)';
            } catch (e) { }
            return 'the whole track';
        };

        // The three therapeutic designers keep their existing handlers untouched -- the dialog
        // and the python run belong to them, not to the library.
        const THERAPEUTIC_ABOUT = {
            'siRNA': {
                badge: 'RNAi',
                blurb: 'Guide / passenger duplexes that load into RISC. Advanced exposes the lengths, '
                    + 'overhangs, alphabet and the per-component weights that drive the ranking.'
            },
            'Gapmer ASO': {
                badge: 'RNase H',
                blurb: 'A DNA gap between modified wings: RNase H cuts the transcript where the gap '
                    + 'binds, which reaches nuclear and non-RISC targets an siRNA cannot.'
            },
            'Steric-blocking ASO': {
                badge: 'Steric',
                blurb: 'Fully modified, recruiting no RNase H — it occupies a site rather than '
                    + 'cutting it. The modality for splice switching, uORFs and start codons.'
            }
        };
        const therapeuticBooks = () => therapeutics.map((t) => {
            const a = THERAPEUTIC_ABOUT[t.label] || {};
            return {
                title: t.label,
                badge: a.badge || 'Therapeutic',
                blurb: a.blurb || ('Design ' + t.label + ' over ' + scopeNote() + '.'),
                open: () => t.click()
            };
        });

        const primerBooks = () => [
            {
                title: 'primer3', badge: 'Standard',
                blurb: 'The reference primer designer — melting temperature, product size and '
                    + 'self-complementarity constraints.',
                open: () => runPrimer3()
            },
            {
                title: 'djPrimer v1', badge: 'In-house',
                blurb: 'The in-house scorer, tuned for the amplicon panels this app produces. '
                    + 'Results come back drawn on the track as amplicons.',
                open: () => runDjprimer()
            },
            {
                title: 'Exon-exon primer-probes', badge: 'Junction',
                blurb: 'Probes spanning an exon-exon junction, so genomic DNA cannot amplify. '
                    + 'Results open as JSON rather than on the track.',
                open: () => runExonExon()
            }
        ];

        const DESIGN = [
            {
                title: 'Therapeutics', badge: 'Oligo design',
                subtitle: 'Pick a modality',
                blurb: 'siRNA, gapmer and steric-blocking ASO designers. Each opens its own '
                    + 'Default / Advanced dialog before it runs.',
                books: therapeuticBooks
            },
            {
                title: 'Primer probes', badge: 'Assay design',
                subtitle: 'Pick a designer',
                blurb: 'Primer and probe design over this track — primer3, the in-house djPrimer '
                    + 'scorer, or exon-exon junction probes.',
                books: primerBooks
            },
            {
                title: 'Off-targets', badge: 'Filtering',
                subtitle: 'Prune the compounds on this track',
                blurb: 'Act on off-target results already attached to the compounds on this track.',
                books: () => [{
                    title: 'Filter by off-target count', badge: 'Remove',
                    blurb: 'Remove every oligo whose off-target count is above a maximum you give. '
                        + 'Amplicons are left alone, and undo restores what it removed.',
                    open: () => filterByOffTargets()
                }]
            },
            {
                title: 'Compounds', badge: 'On this track',
                subtitle: 'Find what is already here',
                blurb: 'Work with the compounds already designed onto this track.',
                books: () => [{
                    title: 'Highlight compounds', badge: 'Locate',
                    blurb: 'Twinkle every compound on the track magenta for about five seconds — '
                        + 'motion catches the eye where a static highlight on a busy track does not.',
                    open: () => highlightCompounds()
                }]
            },
            {
                title: 'Clinical Library', badge: 'Reference',
                blurb: 'Approved and clinical-stage oligonucleotide therapeutics, with the sequences '
                    + 'and chemistries behind them.',
                open: () => exec('manchester/clinical-library.js', graph, genegraph_panel_layout)
            }
        ];

        await exec('baja/lib/shelf.js', {
            id: 'baja-design-library',
            title: 'Design',
            // Say up front what a design will be run over: a selection silently narrowing the
            // work is worse than no narrowing at all.
            subtitle: ((selectedTrack && selectedTrack.name) ? (selectedTrack.name + ' — ') : '')
                + 'designs run over ' + scopeNote(),
            books: DESIGN,
            graph: graph,
            onClose: () => {
                try { graph.clearMouseListeners(); } catch (e) { }
                try { graph.setMouseMode('navigate'); } catch (e) { }
                try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
            }
        });

    })();
}
