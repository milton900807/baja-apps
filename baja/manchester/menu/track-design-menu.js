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
    // How far apart the compounds land. Each one rings 120 ms after the one before it, so a
    // run is a sequence of arrivals rather than everything appearing at once -- which is what
    // makes it possible to see WHERE they went.
    //
    // The report waits that out. It used to open the moment the last addOligo returned, while
    // the compounds were still arriving underneath it: a full-screen panel over the one part
    // of the run worth watching, and over a track that did not yet hold what the panel was
    // describing.
    const LAND_STAGGER_MS = 120;
    // A hundred compounds would otherwise hold the report for twelve seconds. Past a couple of
    // seconds the arrivals have made their point and the wait is just a wait.
    const LAND_CAP_MS = 2400;
    const __landingTime = (n) => Math.min(LAND_CAP_MS, Math.max(0, ((n | 0) - 1)) * LAND_STAGGER_MS) + 260;

    // Are they all actually ON the track? The timer above covers the animation; this covers
    // the placement, which is what the request was about. Polled rather than assumed because
    // a modality can add asynchronously, and it gives up rather than hanging: a report that
    // never opens is worse than one that opens a moment early.
    const __whenPlaced = (track, oligos) => new Promise((resolve) => {
        const list = (oligos || []).filter(Boolean);
        if (!list.length || !track) { resolve(false); return; }
        const t0 = Date.now();
        const tick = () => {
            let on = [];
            try { on = track.oligos || []; } catch (e) { on = []; }
            let missing = 0;
            for (const o of list) if (on.indexOf(o) < 0) missing++;
            if (!missing) { resolve(true); return; }
            if (Date.now() - t0 > 4000) { resolve(false); return; }
            setTimeout(tick, 60);
        };
        tick();
    });

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
            //
            // Opened only once every compound is on the track AND the last of them has landed.
            // The toast still goes up immediately, so the run is never silent while this waits.
            (async () => {
                try {
                    const placed = await __whenPlaced(track, oligos);
                    await new Promise((r) => setTimeout(r, placed ? __landingTime(n) : 0));
                    exec('baja/manchester/menu/design-summary.js', graph, genegraph_panel_layout, {
                        modality: modality,
                        algorithm: algorithm,
                        chemistry: chemistry,
                        track: track,
                        oligos: oligos,
                        result: result
                    });
                } catch (e) { }
            })();
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

        // THIS MENU IS ABOUT ONE TRACK, so the board-wide intent stops here.
        //
        // The Layers button (manchester/editor.js) sets window.__bajaApplyAllTracks to mean
        // "whatever you pick applies to the whole board", then opens the library. Walking from
        // there into Design Library and choosing a track BY NAME is the user narrowing that
        // intent to one track, but nothing on this path consumed the flag: shelf.js only clears
        // it when the shelf closes, and passes it through on 'open'. Anything downstream that
        // honours the flag -- run-djprimer.js falling back to baja/lib/for-each-track.js, say --
        // then quietly ran over every track on the canvas, one python call each. That is the
        // repeated "Parsing input sequence..." with an identical window count on every pass.
        //
        // Consuming it here is the narrowing: the later, more specific choice wins.
        try { window.__bajaApplyAllTracks = false; } catch (e) { }

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
                            // Maximized, like the ASO dialog and the report the run ends in. The
                            // form stays a 640px column: text inputs stretched to the width of a
                            // monitor are harder to use, and what the room buys is every field
                            // and the rules document visible at once, not a wider field.
                            panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#fff;'
                                + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';
                            panel.innerHTML = ''
                                + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:16px 22px 14px;'
                                + 'background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);'
                                + 'box-shadow:0 6px 20px rgba(0,0,0,0.35);">'
                                + '<div style="min-width:0;"><div style="font:700 20px Arial;">siRNA Design</div>'
                                + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">Choose Default, or Advanced to tune the design algorithm.</div></div>'
                                + '<div style="margin-left:auto;display:flex;gap:10px;">'
                                + '<button id="sd-cancel" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Cancel</button>'
                                + '<button id="sd-run" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 12.5px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">Run design</button>'
                                + '</div></div>'
                                + '<div style="flex:1 1 auto;overflow:auto;padding:24px 22px 32px;">'
                                + '<div style="width:100%;max-width:640px;margin:0 auto;">'
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
                                // The rules a Default run applies, written out. Same reason as
                                // the ASO dialog: Default chooses everything and used to say
                                // nothing about what it chose.
                                + '<div id="sd-doc"></div>'
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
                                + '</div></div>';
                            document.body.appendChild(panel);
                            const q = (id) => panel.querySelector(id);
                            let mode = 'default';
                            let sdDoc = null;
                            const fillSirnaDoc = async () => {
                                try {
                                    if (sdDoc == null) sdDoc = await exec('baja/manchester/menu/design-rules-doc.js', 'sirna');
                                    q('#sd-doc').innerHTML = sdDoc || '';
                                } catch (e) { try { q('#sd-doc').innerHTML = ''; } catch (e2) { } }
                            };
                            const setMode = (m) => {
                                mode = m;
                                q('#sd-doc').style.display = (m === 'default') ? 'block' : 'none';
                                if (m === 'default') fillSirnaDoc();
                                q('#sd-adv').style.display = (m === 'advanced') ? 'block' : 'none';
                                q('#sd-default').style.background = (m === 'default') ? '#22c55e' : 'transparent';
                                q('#sd-default').style.color = (m === 'default') ? '#04210f' : '#fff';
                                q('#sd-advanced').style.background = (m === 'advanced') ? '#22c55e' : 'transparent';
                                q('#sd-advanced').style.color = (m === 'advanced') ? '#04210f' : '#fff';
                            };
                            fillSirnaDoc();
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
                    // Run design was clicked: frame what the run will operate on before it
                    // starts, so the compounds land in view rather than somewhere off-screen.
                    await __zoomToDesignScope();
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







                    const __sp = __showSpinner(__chemistryOf(str, json_input) || __designLabel(str), str);
                    __activeProgress = progress;
                    let r = await __runDesign(str, json_input);
                    try { __sp.stop(); } catch (e) { }
                    if (!r) { return; }   // refused or failed; __runDesign has said which
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
                                        setTimeout(() => { try { sirna.highlight(1800, 'magenta'); if (graph.wake) graph.wake(); } catch (e) { } }, __gi * LAND_STAGGER_MS);
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
                    await __zoomToDesignScope();
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

                        // NO off-target screen during design. py/ssaso/design.py can run one --
                        // pass offtarget_index and it weights every site by the other genes it
                        // hits -- and naming no index is how you say don't, which the script
                        // reads as "score on sequence terms only".
                        //
                        // Design ranks on the sequence; screening is its own step, run
                        // deliberately over the compounds you decide to keep (Run off-targets,
                        // which ends in its own report). Folding it into the design spent a
                        // transcriptome search on candidates before anyone had looked at them,
                        // and made the ranking depend on an index being reachable.

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

                    const __sp = __showSpinner(__chemistryOf(str, json_input) || __designLabel(str), str);
                    __activeProgress = progress;
                    let r = await __runDesign(str, json_input);
                    try { __sp.stop(); } catch (e) { }
                    if (!r) { return; }   // refused or failed; __runDesign has said which
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
                                    const __d = (__gi++) * LAND_STAGGER_MS;
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
                // `spliceMode` is 'inclusion', 'exclusion' or null (no splicing). It only ever
                // changes the ORDER the candidates are tiled in -- the chemistry, the lengths
                // and the design rules are identical either way. See
                // baja/manchester/menu/splice-tiling-priority.js for the sign convention.
                click: async (scx, scy, spliceMode) => {
                    // A splice-switching run is ranked against the track's cis-regulatory
                    // model, so without one there is nothing to rank by. Say so and stop:
                    // running it anyway would produce a design that looks splice-aware and is
                    // not, which is worse than not running.
                    // Splice-switching tiles AROUND the model's windows: every cis-regulatory
                    // layer on the track is read, the windows of the right sign are taken, and
                    // the designer runs over those regions rather than over the whole
                    // transcript. Down bars (suppressive) for inclusion, up bars (supportive)
                    // for exclusion -- see baja/manchester/menu/splice-tiling-priority.js.
                    //
                    // With no model, or no window of the needed sign, this DEGRADES to the plain
                    // steric-blocking design and says so. Refusing was the wrong call: the user
                    // asked for a steric compound and there is a good one to design. What they
                    // must not get is a plain design silently presented as splice-switching.
                    let __prio = null, __targets = null, __sites = [], __scored = [];
                    const __trackName = ((selectedTrack && selectedTrack.name) || 'this track');
                    if (spliceMode) {
                        __prio = await exec('baja/manchester/menu/splice-tiling-priority.js');
                        const __windows = __prio.modelWindows(selectedTrack);
                        __targets = __windows.length ? __prio.targetWindows(__windows, spliceMode) : [];
                        // Keep-out zones for an inclusion design, from EVERY layer on the
                        // track, not only the ones being targeted.
                        __sites = __prio.modelSites(selectedTrack);
                        // Both signs, noise removed: what the ranking measures under each
                        // compound, as opposed to where the tiling is aimed.
                        __scored = __prio.scoredWindows(__windows);
                        if (!__windows.length) {
                            graph.setMessage(' No cis-regulatory model on ' + __trackName
                                + ' \u2014 designing standard steric-blocking ASOs across the whole'
                                + ' transcript instead. Run Models \u25b8 Splicing cis-regulatory windows'
                                + ' on the track first for a splice-switching design. ');
                            spliceMode = null;
                        } else if (!__targets.length) {
                            graph.setMessage(' The model on ' + __trackName + ' has no '
                                + (spliceMode === 'inclusion' ? 'suppressive (down)' : 'supportive (up)')
                                + ' windows clearing the noise threshold, so there is nothing to tile'
                                + ' around for exon ' + spliceMode + ' \u2014 designing standard'
                                + ' steric-blocking ASOs instead. ');
                            spliceMode = null;
                        }
                    }
                    let progress = __designProgress('Steric-blocking ASO');

                    let Oligo = await exec('flexigraph/oligo.js');

                    const str = `py/ssaso/design-steric-blocking.py`;

                    // Default / Advanced design dialog — the LAST interface before the design runs.
                    const __p = await exec('baja/manchester/menu/aso-design-dialog.js', 'steric');
                    if (!__p) return;   // cancelled
                    await __zoomToDesignScope();
                    let _sequence = __wholeTrackSequence();

                    let json_input = {
                        sequence: _sequence,
                        // Sense mRNA — ASO is the reverse-complement of the target (same fix as siRNA).
                        strand: 1,
                        top_n: parseInt(__p.top_n) || 100,
                        lengths: __p.lengths || [18, 19, 20],
                        // FULL 2'-MOE, FULL PS is the steric-blocking default: every residue
                        // modified and every linkage phosphorothioate. That is what makes the
                        // compound occupy a site without recruiting RNase H, which is the whole
                        // point of the modality -- a PO linkage anywhere is a nuclease liability
                        // rather than a design choice.
                        full_modification: __p.wing_modification || "2'-MOE",
                        default_backbone: __p.default_backbone || "PS",
                        // No PO substitutions: an empty list is a FULL PS backbone. Named here
                        // rather than left as a bare [] so the intent survives the next edit.
                        po_link_positions: [],
                        output_alphabet: __p.output_alphabet || "DNA",
                        // Default TRUE, same as the gapmer call above and for the same reason:
                        // sent as false this asks for the global top N with overlaps allowed,
                        // which returns the length variants of a few good sites rather than a
                        // design spread across the transcript.
                        enforce_non_overlapping: (__p.enforce_non_overlapping != null ? __p.enforce_non_overlapping : true),

                        // No off-target screen here either -- see the note in the gapmer
                        // request above.
                        annotations: [] // optional: populate if you have site annotations
                    };

                    // Tile AROUND the model's windows, in ONE server call.
                    //
                    // Two earlier shapes were wrong. Running the designer once per region read
                    // well and spent one QUOTA CHARGE per region (freeCharge(req, 'design') in
                    // baja-server), so later regions came back 402 Payment Required. Asking for
                    // a dense whole-transcript set and filtering was one charge but missed
                    // windows outright: the designer returns its top N by score, and a window
                    // over a low-scoring stretch is simply not in that list at any N a long
                    // transcript can afford to return.
                    //
                    // So the regions are CONCATENATED and sent as one sequence. The designer
                    // then scores densely over exactly the sequence that matters, and every
                    // candidate is mapped back to its own region. A candidate straddling the
                    // join between two regions is not a real site and is discarded -- the join
                    // is an artefact of the concatenation, not sequence the transcript has.
                    const __spliceRegions = () => {
                        const base = (selectedTrack.xi || 0) + __designOffset();
                        const lens = (json_input.lengths || [18, 19, 20]).map(Number).filter(isFinite);
                        const maxLen = Math.max.apply(null, lens.concat([20]));
                        const seqLen = (_sequence || '').length;
                        const spans = [];
                        for (const w of (__targets || [])) {
                            // Padded by a full oligo length each side, so a compound can sit
                            // CENTRED on the window rather than only clipping its edge.
                            const lo = Math.max(0, Math.floor(w.x0 - base) - maxLen);
                            const hi = Math.min(seqLen, Math.ceil(w.x1 - base) + maxLen);
                            if (hi - lo < maxLen) continue;   // falls outside the sent sequence
                            spans.push({ lo: lo, hi: hi, impact: Math.abs(+w.impact) });
                        }
                        spans.sort((x, y) => x.lo - y.lo);
                        const out = [];
                        for (const sp of spans) {
                            const last = out[out.length - 1];
                            // Adjacent windows are one stretch to tile, not two.
                            if (last && sp.lo <= last.hi) {
                                last.hi = Math.max(last.hi, sp.hi);
                                last.impact = Math.max(last.impact, sp.impact);
                            } else out.push({ lo: sp.lo, hi: sp.hi, impact: sp.impact });
                        }
                        return out;
                    };

                    const __designOnRegions = async (regions) => {
                        const wantN = parseInt(json_input.top_n) || 100;
                        const parts = [], bounds = [];
                        let acc = 0;
                        for (const g of regions) {
                            const part = (_sequence || '').slice(g.lo, g.hi);
                            if (!part) continue;
                            parts.push(part);
                            bounds.push({ cs: acc, ce: acc + part.length, lo: g.lo, impact: g.impact });
                            acc += part.length;
                        }
                        if (!parts.length) return null;
                        let rr = null;
                        try {
                            __activeProgress = progress;
                            rr = await __runDesign(str, Object.assign({}, json_input, {
                                sequence: parts.join(''),
                                // Dense over a short sequence: the regions are a few hundred
                                // bases, so this covers them without a large payload.
                                enforce_non_overlapping: false,
                                top_n: Math.max(400, wantN * 4)
                            }));
                        } catch (e) { rr = null; }   // __runDesign already reported it
                        if (!rr || !Array.isArray(rr.top_candidates)) return null;
                        let kept = [];
                        for (const c of rr.top_candidates) {
                            let b = null;
                            for (const x of bounds) {
                                if (c.start >= x.cs && c.end <= x.ce) { b = x; break; }
                            }
                            if (!b) continue;                       // straddles a join
                            const cc = Object.assign({}, c);
                            cc.start = c.start - b.cs + b.lo;        // back into the sent sequence
                            cc.end = c.end - b.cs + b.lo;
                            cc.__windowImpact = b.impact;
                            kept.push(cc);
                        }
                        // AN INCLUSION ASO MUST NOT SIT ON THE SPLICE SITE.
                        //
                        // Covering the 5' or 3' splice site blocks U1 / U2AF from it, which is
                        // how an exon is made to SKIP -- the opposite of what this design is
                        // for. A suppressive window right beside a junction is a real target and
                        // the compound over it is not, so the candidates are filtered rather
                        // than the windows: the rest of that window stays usable.
                        //
                        // Exclusion designs are left alone. Sitting on the splice site is a
                        // legitimate, and classic, way to force skipping.
                        let __onSite = 0;
                        if (spliceMode === 'inclusion' && __sites && __sites.length) {
                            const SITE_GUARD_NT = 3;   // the junction consensus, not just the AG/GT
                            const b3 = (selectedTrack.xi || 0) + __designOffset();
                            const safe = [];
                            for (const c of kept) {
                                const span = { xi: c.start + b3, xf: c.end + b3 };
                                if (__prio.hitsSite(span, __sites, SITE_GUARD_NT)) { __onSite++; continue; }
                                safe.push(c);
                            }
                            kept = safe;
                            if (!kept.length) {
                                graph.setMessage(' Every candidate over the suppressive windows of '
                                    + __trackName + ' would sit on a splice site, which would force'
                                    + ' skipping rather than inclusion. Nothing was designed. ');
                                return null;
                            }
                        }

                        if (!kept.length) return null;

                        // RANK ON THE SUMMED ATTRIBUTION UNDER THE COMPOUND, and by a lot.
                        //
                        // The score is the SIGNED sum of every model window the ASO covers,
                        // each scaled by how much of that window is covered. Sign carries the
                        // direction, so the two modes read off the same number:
                        //
                        //   inclusion -> the MOST NEGATIVE sum wins (most suppressive sequence
                        //                covered, so the site is freed)
                        //   exclusion -> the MOST POSITIVE sum wins (most supportive sequence
                        //                covered, so the site is starved)
                        //
                        // Summing rather than taking the best single window is what makes a
                        // compound that covers a suppressive window AND a supportive one score
                        // as the net of the two, which is what it would actually do. It also
                        // lets a long compound spanning three elements earn all three.
                        //
                        // The two terms are on different scales -- the sum is log-odds, the
                        // design score is roughly 0-50 -- so each is normalised across this
                        // candidate set before blending.
                        //
                        // ATTR_WEIGHT is the knob, and it is deliberately high. At 0.95 the
                        // design score can only move a compound past another whose summed
                        // attribution is within 5% of the range -- so it acts as a tie-break
                        // between compounds the model rates alike, and never overrules the
                        // model. At the previous 0.8 a top-scoring compound could beat one
                        // covering a quarter more suppressive sequence, which is backwards for
                        // a design whose whole purpose is the attribution. Set it to 1 to rank
                        // on the model alone and ignore the design rules entirely.
                        const ATTR_WEIGHT = 0.95;
                        const dir = (spliceMode === 'inclusion') ? -1 : 1;
                        const base2 = (selectedTrack.xi || 0) + __designOffset();
                        for (const c of kept) {
                            const span = { xi: c.start + base2, xf: c.end + base2 };
                            c.__spliceSum = __prio.spliceSum(span, __scored);
                            // Higher is better, whichever direction was asked for.
                            c.__attrGood = dir * c.__spliceSum;
                        }
                        let minA = Infinity, maxA = -Infinity, minS = Infinity, maxS = -Infinity;
                        for (const c of kept) {
                            if (c.__attrGood < minA) minA = c.__attrGood;
                            if (c.__attrGood > maxA) maxA = c.__attrGood;
                            const sc = +c.score || 0;
                            if (sc < minS) minS = sc;
                            if (sc > maxS) maxS = sc;
                        }
                        const spanA = (maxA - minA) || 1;
                        const spanS = (maxS - minS) || 1;
                        for (const c of kept) {
                            c.__rankScore = ATTR_WEIGHT * ((c.__attrGood - minA) / spanA)
                                + (1 - ATTR_WEIGHT) * (((+c.score || 0) - minS) / spanS);
                        }
                        kept.sort((x, y) => (y.__rankScore - x.__rankScore)
                            || (y.__attrGood - x.__attrGood) || ((y.score || 0) - (x.score || 0)));
                        // The request turned non-overlap off to get dense coverage of every
                        // region, so honour the design's own setting here instead.
                        let out = kept;
                        if (json_input.enforce_non_overlapping) {
                            const taken = []; out = [];
                            for (const c of kept) {
                                let clash = false;
                                for (const t of taken) { if (c.start < t.hi && c.end > t.lo) { clash = true; break; } }
                                if (clash) continue;
                                taken.push({ lo: c.start, hi: c.end });
                                out.push(c);
                            }
                        }
                        out = out.slice(0, wantN);
                        out.forEach((c, i) => { c.rank = i + 1; });
                        const res = Object.assign({}, rr,
                            { top_candidates: out, returned_candidates: out.length });
                        res.__windowCount = (__targets || []).length;
                        res.__regionCount = regions.length;
                        res.__onSiteDropped = __onSite;
                        res.__attrWeight = ATTR_WEIGHT;
                        return res;
                    };

                    const __sp = __showSpinner(__chemistryOf(str, json_input) || __designLabel(str), str);
                    let r = null;
                    if (spliceMode) {
                        const __regions = __spliceRegions();
                        if (!__regions.length) {
                            // Nothing has been charged yet, so the plain design below is still
                            // this run's ONE call.
                            graph.setMessage(' No ' + (spliceMode === 'inclusion' ? 'suppressive (down)' : 'supportive (up)')
                                + ' window on ' + __trackName + ' lies inside the sequence being designed'
                                + ' \u2014 designing standard steric-blocking ASOs instead. ');
                            spliceMode = null;
                        } else {
                            r = await __designOnRegions(__regions);
                            if (!r) {
                                // The call was made and charged. Do NOT spend a second one on a
                                // fallback design; say so and stop.
                                graph.setMessage(' No compound could be placed on the '
                                    + (spliceMode === 'inclusion' ? 'suppressive (down)' : 'supportive (up)')
                                    + ' windows of ' + __trackName + '. Nothing was designed. ');
                                try { __sp.stop(); } catch (e) { }
                                return;
                            }
                        }
                    }
                    if (!r) {
                        __activeProgress = progress;
                        r = await __runDesign(str, json_input);
                        if (!r) { try { __sp.stop(); } catch (e) { } return; }
                    }
                    try { __sp.stop(); } catch (e) { }
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

                    // WHY a compound is red, in the label rather than only in the color.
                    //
                    // Red is the bottom band of the design score (< 10). The color says a
                    // compound is poor and nothing says what is wrong with it, which leaves the
                    // user to guess or to go digging in the report. The scorer already writes
                    // the reasons -- score_gc, score_tm and score_offtarget_toxicity_rules in
                    // py/ssaso/design-steric-blocking.py each append a note -- so the label is
                    // built from the candidate's OWN notes rather than re-deriving anything.
                    //
                    // Ordered by the penalty the scorer actually applies, so the worst reason
                    // is first and a truncated label still names the real problem.
                    const __whyRed = (c) => {
                        const notes = Array.isArray(c.notes) ? c.notes : [];
                        // Anything the scorer calls favourable, and anything that is a caveat
                        // about the SCORER rather than the compound, is not a reason it is red.
                        const NOT_A_FAULT = /favorable|acceptable but not ideal|No major|bonus|annotations|does not explicitly model|sequence-only/i;
                        // [match, penalty the scorer applies, terse label]
                        const FAULTS = [
                            [/GC outside preferred range\s*\(([^)]*)\)/i, 15, (m) => 'GC ' + m[1]],
                            [/Tm outside preferred range\s*\(([^)]*)\)/i, 12, (m) => 'Tm ' + m[1]],
                            [/Contains CpG motif/i, 8, () => 'CpG motif'],
                            [/Long G run detected\s*\(max (\d+)\)/i, 6, (m) => 'G-run ' + m[1]],
                            [/Palindrome/i, 6, () => 'palindromic'],
                            [/Self-complementary stretch detected\s*\(max (\d+)\)/i, 5, (m) => 'self-complementary ' + m[1]],
                            [/Repetitive sequence/i, 5, () => 'repetitive']
                        ];
                        const found = [];
                        for (const n of notes) {
                            if (!n || NOT_A_FAULT.test(n)) continue;
                            let hit = null;
                            for (const f of FAULTS) {
                                const m = ('' + n).match(f[0]);
                                if (m) { hit = { w: f[1], t: f[2](m) }; break; }
                            }
                            // An unrecognised note is still a fault -- the scorer only writes a
                            // note when it has something to say -- so it is kept verbatim rather
                            // than dropped for not matching a pattern this list knows about.
                            found.push(hit || { w: 1, t: ('' + n).replace(/\s+detected.*$/i, '') });
                        }
                        found.sort((a, b) => b.w - a.w);
                        const head = 'Low score ' + (Math.round((+c.score || 0) * 10) / 10);
                        if (!found.length) return head;
                        const shown = found.slice(0, 3).map((f) => f.t);
                        return head + ' — ' + shown.join(', ')
                            + (found.length > 3 ? (' +' + (found.length - 3) + ' more') : '');
                    };

                    // A raw JSON dump of the design result used to fire here, before the
                    // compounds were even built -- leftover debugging that put a modal over
                    // every steric run. What it was showing is in the design report now, in
                    // a form that can be read and exported.

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

                        // THE MAXIMUM IS ENFORCED HERE TOO, at the last point before compounds
                        // are built. The designer honours top_n and the splice path slices to
                        // it as well, so this is a backstop rather than the only guard -- but
                        // it is the one place every route passes through, so a future path that
                        // forgets cannot put more on the track than was asked for.
                        const __maxAso = Math.max(1, parseInt(json_input.top_n) || 100);
                        const __candidates = resultJson.top_candidates.slice(0, __maxAso);

                        __candidates.forEach((c) => {
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
                                // Only the red band gets the reason. A green compound needs no
                                // explaining, and replacing its score label with prose would
                                // cost information rather than add it.
                                if (oligo.color === 'red') {
                                    oligo.flagReason = __whyRed(c);
                                    oligo.setLabelAttribute('flagReason', {
                                        prefix: '',
                                        offsetY: -18,
                                        textColor: 'white',
                                        fillColor: '#a3402c',
                                        strokeColor: '#4a170e',
                                        font: 'bold 10px Arial'
                                    });
                                }

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
                                // INTO TRACK SPACE. c.start indexes the SEQUENCE that was sent,
                                // so a compound built from it sits at a raw sequence offset --
                                // on a track whose xi is a genomic coordinate that is millions
                                // of bases to the left of the track, i.e. invisible. The gapmer
                                // and siRNA paths both do this; steric was the one that did not,
                                // which is why its compounds never appeared.
                                //
                                // Length is taken FIRST and xf rebuilt from it: xf is an absolute
                                // coordinate too, so adding the offset to both would stretch every
                                // compound by track.xi rather than move it.
                                const length = Math.abs(oligo.xf - oligo.xi);
                                oligo.xi += track.xi;
                                oligo.xf = oligo.xi + length;
                                track.addOligo(oligo);
                                // Bright landing bling, staggered by add order, so each ASO is seen landing.
                                try {
                                    const __d = (__gi++) * LAND_STAGGER_MS;
                                    setTimeout(() => { try { if (oligo.highlight) oligo.highlight(1800, 'magenta'); else if (oligo.landingBurst) oligo.landingBurst('magenta'); if (graph.wake) graph.wake(); } catch (e) { } }, __d);
                                } catch (e) { }
                            }
                        }

                        return oligos;
                    }

                    // The candidates ARE the tiling around the windows now, already ordered
                    // strongest element first, so there is nothing to re-rank. Report what was
                    // tiled, so a splice-switching run is distinguishable from a plain one by
                    // more than the menu item that started it.
                    if (spliceMode && r) {
                        const __n = (r.top_candidates || []).length;
                        graph.setMessage(' Exon ' + spliceMode + ': tiled ' + __n + ' compound'
                            + (__n === 1 ? '' : 's') + ' on ' + (r.__windowCount || 0) + ' '
                            + (spliceMode === 'inclusion' ? 'suppressive (down)' : 'supportive (up)')
                            + ' window' + (((__targets || []).length === 1) ? '' : 's')
                            + ', ranked ' + Math.round((r.__attrWeight != null ? r.__attrWeight : 0.95) * 100)
                            + '% on model attribution / '
                            + Math.round((1 - (r.__attrWeight != null ? r.__attrWeight : 0.95)) * 100)
                            + '% on design score'
                            + ((r.__onSiteDropped > 0)
                                ? ('; ' + r.__onSiteDropped + ' rejected for sitting on a splice site') : '')
                            + ((r.top_candidates && r.top_candidates[0])
                                ? ('; best covers a summed attribution of '
                                    + (+(r.top_candidates[0].__spliceSum || 0)).toFixed(2)
                                    + ' (' + (spliceMode === 'inclusion' ? 'most negative' : 'most positive')
                                    + ' wins)') : '')
                            + '. ');
                    }

                    // Non-overlap can yield FEWER than the maximum -- with it on, a request
                    // for 100 came back with 48, because that is how many fit without
                    // overlapping. Saying so stops a short list reading as a failed run.
                    const __askedMax = Math.max(1, parseInt(json_input.top_n) || 100);
                    const stericBlockingArray = buildStericBlockingArray(r, {
                        strand: selectedTrack.strand,
                        y: OLIGO_FLOOR_Y,
                        track: selectedTrack
                    });
                    try {
                        const __n = stericBlockingArray.length;
                        if (__n < __askedMax) {
                            graph.setMessage(' Placed ' + __n + ' of a maximum ' + __askedMax
                                + ' — that is how many fit'
                                + (json_input.enforce_non_overlapping ? ' without overlapping' : '')
                                + (spliceMode ? ' on the targeted windows' : '') + '. ');
                        }
                    } catch (e) { }
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
        // Frame what the design is about to work on. Every route reads either the SELECTED
        // range or the whole track, and which of those it is has until now been invisible at
        // the moment it matters most -- the click that starts the run. Zooming to it makes the
        // scope of the design something the user sees rather than remembers.
        //
        // Not a no-op when there is no selection: framing the whole track is still the honest
        // answer to "what is this about to design against", and it is the case where a user is
        // most likely to have meant to select something first.
        const __zoomToDesignScope = async () => {
            try {
                const t = selectedTrack;
                const g = t && (t.tgraph || t.grid);
                if (!g || !graph || typeof graph.zoomRect !== 'function') return;
                const lo = g.xi, hi = g.xi + (g.width || 0);
                let a = lo, b = hi;
                try {
                    const r = t.selectedRange && t.selectedRange();
                    if (r && isFinite(+r.start) && isFinite(+r.end) && +r.end > +r.start) {
                        a = Math.max(lo, +r.start); b = Math.min(hi, +r.end);
                    }
                } catch (e) { }
                if (!(b > a)) { a = lo; b = hi; }
                const xpad = Math.max(50, (b - a) * 0.08);
                const yA = g.yi, yB = g.yi + (g.height || 0);
                const cy = (yA + yB) / 2;
                const yhalf = (Math.abs(yB - yA) || 1) * 1.65;
                await graph.zoomRect(a - xpad, b + xpad, cy + yhalf, cy - yhalf, 150);
                if (graph.wake) graph.wake();
            } catch (e) { }
        };

        // Show every compound already on the board: pulse them all magenta and pull the
        // camera back far enough to see them at once.
        //
        // It reads graph.track, NOT selectedTrack: a design run usually leaves compounds on
        // several tracks, and "where did everything land" is the question this answers.
        //
        // The camera moves here deliberately, which the design runs deliberately do not (see
        // __clearMenusForDesign). Framing everything IS the request, so the trade the designers
        // refuse -- losing where the user had navigated to -- is the one being asked for.
        const __highlightAllCompounds = async () => {
            const tracks = ((graph && graph.track) || []).filter(Boolean);
            let x0 = Infinity, x1 = -Infinity, yTop = Infinity, yBot = -Infinity;
            let n = 0, onTracks = 0;
            for (const t of tracks) {
                const os = ((t && t.oligos) || []).filter(Boolean);
                if (!os.length) continue;
                onTracks++;
                // THROUGH THE TRACK'S OWN MAPPING. An oligo's xi/xf are positions along the
                // TRACK; zoomRect works in the world frame, which is what the y bounds below
                // were already collected in (g.yi, g.height). Mixing the two put the camera at
                // a base number read as a world coordinate -- an arbitrary place that only
                // coincides with the compounds on a track whose two frames happen to line up.
                // tgraph.X is the same mapping every draw() goes through.
                const g = t.tgraph || t.grid;
                for (const o of os) {
                    const a = Math.min(+o.xi, +o.xf), b = Math.max(+o.xi, +o.xf);
                    if (isFinite(a) && isFinite(b) && g && typeof g.X === 'function') {
                        const wa = g.X(a), wb = g.X(b);
                        if (isFinite(wa) && isFinite(wb)) {
                            x0 = Math.min(x0, wa, wb); x1 = Math.max(x1, wa, wb);
                        }
                    }
                    // >= 1200 is what oligo.js treats as a LANDING highlight: the expanding
                    // burst plus the on/off blink, rather than the brief hover glow.
                    try { o.highlight(2600, 'magenta'); n++; } catch (e) { }
                }
                if (g && isFinite(+g.yi)) {
                    yTop = Math.min(yTop, +g.yi);
                    yBot = Math.max(yBot, +g.yi + (+g.height || 0));
                }
            }
            if (!n) {
                graph.setMessage(' No compounds on the canvas to highlight — design or load some first. ');
                return;
            }
            // Frame them. A guard on every bound: a compound with no usable coordinates would
            // otherwise zoom the camera to Infinity and lose the board entirely, which is a far
            // worse outcome than simply not moving.
            try {
                if (typeof graph.zoomRect === 'function'
                    && isFinite(x0) && isFinite(x1) && x1 > x0
                    && isFinite(yTop) && isFinite(yBot)) {
                    const xpad = Math.max(50, (x1 - x0) * 0.06);
                    const cy = (yTop + yBot) / 2;
                    const yhalf = (Math.abs(yBot - yTop) || 1) * 0.62;
                    await graph.zoomRect(x0 - xpad, x1 + xpad, cy + yhalf, cy - yhalf, 220);
                }
            } catch (e) { }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            // Re-fire after the camera has settled: the blink runs on a timer, and most of it
            // would otherwise play out during the zoom, off-screen or mid-flight.
            setTimeout(() => {
                for (const t of tracks) {
                    for (const o of ((t && t.oligos) || [])) {
                        try { if (o) o.highlight(2600, 'magenta'); } catch (e) { }
                    }
                }
                try { if (graph.wake) graph.wake(); } catch (e) { }
            }, 260);
            graph.setMessage(' Highlighting ' + n + ' compound' + (n === 1 ? '' : 's')
                + ' on ' + onTracks + ' track' + (onTracks === 1 ? '' : 's') + '. ');
        };

        // Every design call goes through here. exec() REJECTS on a non-2xx, and none of the
        // three designers caught that -- a 402 became an unhandled rejection and the user saw
        // a stream error in the console and nothing on screen. Returns null when the run did
        // not happen, having already told the user why.
        // Is there a design left? Asked BEFORE the call, not after it fails.
        //
        // exec() goes through lion_engine -> POSTJSON -> RxJS, and a 402 there does NOT reject
        // the promise the caller awaits: the error path throws "invalid object where a stream
        // was expected" inside the subscriber, so the await never settles and no catch around
        // it can ever run. That is why a refused design looked like it had silently done
        // nothing, and why wrapping the call in try/catch did not fix it.
        //
        // /free-quota is an ordinary GET that answers reliably -- the free-plan bar reads it
        // every 20s -- so the question is asked there instead.
        //
        // FAILS OPEN. Anything unreadable (no user, endpoint down, unknown shape) proceeds
        // with the call: the cost of a wrong "you are out" is a paying user blocked from what
        // they bought, and the cost of a wrong "go ahead" is one 402 from the server, which is
        // the authority anyway.
        const __designAllowanceGate = async () => {
            try {
                const host = (window['env'] && window['env']['apiUrl']) || window.location.origin;
                const user = (typeof getUser === 'function') ? (getUser() || '') : '';
                const q = await GETJSON(host + '/free-quota?user=' + encodeURIComponent(user)
                    + '&t=' + Date.now());
                if (!q || q.error || q.subscribed) return null;
                const left = (q.designRemaining != null) ? q.designRemaining
                    : ((q.aiRemaining != null) ? q.aiRemaining : null);
                if (left == null || left > 0) return null;
                // Shaped like the server's own 402 body so the notice reads identically
                // whichever route reached it. `message` is left out on purpose: the notice
                // composes it from limit and resetsOn rather than keeping a second copy of
                // the server's sentence that could drift from freeLimitBody.
                return {
                    error: 'free-limit', metric: 'design',
                    used: q.design,
                    limit: (q.designLimit != null) ? q.designLimit : q.limit,
                    resetsOn: q.resetsOn
                };
            } catch (e) { return null; }
        };

        const __runDesign = async (scriptPath, input) => {
            // The free-plan bar shows the remaining allowance. A run spends one, so poke it
            // either way: on success the count has dropped, and on a refusal it is at zero
            // and the bar is the thing that explains why.
            const __pokeBar = () => {
                try { if (typeof window.__bajaFreeBarRefresh === 'function') window.__bajaFreeBarRefresh(); } catch (e) { }
            };
            const __gate = await __designAllowanceGate();
            if (__gate) {
                try { await exec('baja/lib/free-limit-notice.js', graph, __gate, 'design'); } catch (e) { }
                __pokeBar();
                return null;
            }
            try {
                const out = await exec(scriptPath, progressOf(scriptPath), input);
                __pokeBar();
                return out;
            } catch (e) {
                __pokeBar();
                let shown = false;
                try { shown = await exec('baja/lib/free-limit-notice.js', graph, e, 'design'); } catch (e2) { }
                if (!shown) {
                    try { graph.setMessage(' Design failed: ' + (e && (e.message || e)) + ' '); } catch (e2) { }
                    try { console.log('design call failed: ' + (e && (e.stack || e.message || e))); } catch (e2) { }
                }
                return null;
            }
        };
        // The progress bar belongs to the caller; each designer makes its own before running.
        let __activeProgress = null;
        const progressOf = () => __activeProgress;

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
        // What a primer run just PUT on the track. The apply-*.js scripts resolve with a
        // count, not the objects, so the compounds are taken as the difference across the
        // call. Diffing rather than changing their contract keeps two scripts with other
        // callers out of it, and it is right for any placement route, including one that does
        // not go through an apply script at all.
        const __placedDuring = async (fn) => {
            const before = new Set((selectedTrack && selectedTrack.oligos) || []);
            await fn();
            return ((selectedTrack && selectedTrack.oligos) || []).filter((o) => o && !before.has(o));
        };

        const runPrimer3 = async () => {
            if (!__needSequence()) return;
            graph.pushOntoHistory(); graph.clearMouseListeners();
            await __zoomToDesignScope();
            const sequence = __wholeTrackSequence();
            graph.setMessage(' Generating primers (primer3)... ');
            const em = new EngineMonitor((msg) => { try { graph.setMessage(msg); } catch (e) { } });
            let r = null;
            const placed = await __placedDuring(async () => {
                r = await exec('/py/ppsets/generate-ppsets.py', em, '' + sequence, '', 1);
                await exec('baja/manchester/ppsets/apply-primer3.js', r, __designOffset(), selectedTrack, graph);
            });
            if (graph.wake) graph.wake();
            __ppRefresh();
            __designDone('Primer-probe', placed, selectedTrack, 'primer3', r, '/py/ppsets/generate-ppsets.py');
        };
        // LIVE PROGRESS FOR A DESIGN THAT TAKES MINUTES.
        //
        // djPrimer walks the transcript in 260nt windows at a 10nt step and runs primer3 at
        // every one, so a real transcript is hundreds of primer3 calls -- minutes of work.
        // The python reports its way through that (works.progress / works.msg), and none of
        // the four djPrimer call sites passed an EngineMonitor, so none of it was collected:
        // the badge read "Designing primers (djPrimer)..." from the first moment to the last
        // and the run was indistinguishable from a hang.
        //
        // The ellipsis matters. The shell shows its spinner only while the status ENDS in one
        // (see flexigraph/gene.js) -- a message without it is read as a conclusion and clears
        // the badge -- so every line built here keeps one.
        const __designMonitor = (label) => {
            let pct = null;
            const show = (m) => {
                try {
                    const body = ('' + (m == null ? '' : m)).replace(/[.…\s]+$/, '');
                    graph.setMessage(' ' + label + (pct != null ? ' · ' + pct + '%' : '')
                        + (body ? ' · ' + body : '') + '… ');
                } catch (e) { }
            };
            const em = new EngineMonitor((m) => show(m));
            try { em.addProgressListener((p) => { const n = +p; if (isFinite(n)) { pct = Math.round(n); show(em.lastMsg || ''); } }); } catch (e) { }
            // Remember the last message so a progress tick on its own still names what is
            // running rather than replacing the text with a bare percentage.
            try {
                const orig = em.listenerFunction;
                em.listenerFunction = (m) => { em.lastMsg = m; orig(m); };
            } catch (e) { }
            show('starting');
            return em;
        };

        const runDjprimer = async () => {
            if (!__needSequence()) return;
            graph.pushOntoHistory(); graph.clearMouseListeners();
            await __zoomToDesignScope();
            const sequence = __wholeTrackSequence();
            const gene = selectedTrack.geneID || selectedTrack.name || '';
            const opts = JSON.stringify({ scorer: 'djprimer', gene: '' + gene });
            // NAMED FOR THE JOB, NOT ONE OF THE TWO TOOLS. This heading read "djPrimer",
            // which put the label of the RANKER over a line that spends the first half of the
            // run saying "primer3 proposing candidates" -- a contradiction to anyone who knows
            // that djPrimer cannot design a primer and primer3 cannot predict assay success.
            // The heading is the job; the phase underneath names whichever tool is working.
            const em = __designMonitor('Primer-probe design · ' + (selectedTrack.name || 'track'));
            let r = null;
            const placed = await __placedDuring(async () => {
                r = await exec('py/ppsets/models/find-primer-amplicons.py', em, '' + sequence, '', '', opts);
                selectedTrack.ampliconResults = r;
                await exec('baja/manchester/ppsets/apply-djprimer.js', r, __designOffset(), selectedTrack, graph);
            });
            if (graph.wake) graph.wake();
            __ppRefresh();
            __designDone('Primer-probe', placed, selectedTrack, 'djPrimer assay-success ranking',
                r, 'py/ppsets/models/find-primer-amplicons.py');
        };
        const runExonExon = async () => {
            if (!__needSequence()) return;
            graph.pushOntoHistory(); graph.clearMouseListeners();
            await __zoomToDesignScope();
            const em = __designMonitor('Exon-exon primer-probes · ' + (selectedTrack.name || 'track'));
            let r = null;
            const placed = await __placedDuring(async () => {
                r = await exec('py/ppsets/models/find-primer-amplicons-exon-exon.py', em, selectedTrack);
                selectedTrack.ampliconResults = r;
                // OFFSET 0, unlike the two routes above, and this is not an oversight.
                //
                // They are handed __wholeTrackSequence(), which is the SELECTION when there is
                // one, so their amp_start is relative to it and __designOffset() puts it back.
                // This one is handed the TRACK and reads track.sequence together with
                // track.annotations -- it has to, because exon junctions are an annotation and
                // a cut-out selection no longer describes them -- so its coordinates are
                // already whole-track. Adding the offset would count the selection start twice
                // and place every amplicon that far downstream of where it belongs.
                await exec('baja/manchester/ppsets/apply-djprimer.js', r, 0, selectedTrack, graph);
            });
            if (graph.wake) graph.wake();
            __ppRefresh();
            __designDone('Primer-probe (exon-exon)', placed, selectedTrack,
                'Junction-spanning, Ct-model ranked', r,
                'py/ppsets/models/find-primer-amplicons-exon-exon.py');
        };

        // Compounds ▸ Highlight — make every compound on the track twinkle magenta.
        //
        // o.highlight__ is not a boolean: the renderer passes it straight to
        // drawVerticalLineScreen as the COLOR of the markers at each oligo's start and end
        // (baja/bio/track-flexi.js), so setting it to a color is what draws them. Toggling it
        // on and off is the twinkle -- a static highlight is easy to miss on a busy track,
        // whereas motion is what the eye actually catches.
        //
        // Whatever each oligo had before is restored at the end, so this cannot clobber a
        // highlight something else set (an off-target run marks its hits the same way).
        // An amplicon carries .left and .right (and .mid when there is a probe), which is what
        // separates a primer set from a single-strand compound in the same oligos list. Same
        // test filterByOffTargets uses to leave amplicons alone.
        const isPrimerProbe = (o) => !!(o && (o.type === 'amplicon' || (o.left && o.right)));
        const __probeCount = (() => {
            let here = 0, canvas = 0;
            try {
                for (const t of ((graph && graph.track) || [])) {
                    const n = ((t && t.oligos) || []).filter(isPrimerProbe).length;
                    canvas += n;
                    if (t === selectedTrack) here = n;
                }
            } catch (e) { }
            return { here: here, canvas: canvas };
        })();

        // The blink, shared. It was written inline for compounds; primer probes want exactly
        // the same behaviour on a different subset, and a second copy would drift the first
        // time the timing or the color changed.
        const __blinkOligos = (list, noun) => {
            if (!list || !list.length) return;
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
                graph.setMessage(' Highlighting ' + list.length + ' ' + noun
                    + (list.length === 1 ? '' : 's') + ' on '
                    + ((selectedTrack && selectedTrack.name) || 'track') + '. ');
            } catch (e) { }
        };

        // The two callers. Each picks its own subset and says what it is highlighting, so the
        // status line names probes as probes rather than calling everything a compound.
        const highlightCompounds = () => {
            const list = ((selectedTrack && selectedTrack.oligos) || []).filter(Boolean);
            if (!list.length) { infoPrompt(' There are no compounds on this track to highlight. '); return; }
            __blinkOligos(list, 'compound');
        };
        const highlightPrimerProbes = () => {
            const list = ((selectedTrack && selectedTrack.oligos) || []).filter(isPrimerProbe);
            if (!list.length) { infoPrompt(' There are no primer probes on this track to highlight. '); return; }
            __blinkOligos(list, 'primer set');
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
        // Steric blocking is the one modality whose TARGET is a decision rather than a
        // consequence of the chemistry: the same compound raises or lowers exon inclusion
        // depending only on which element it covers. So it opens a small library of its own
        // instead of designing straight away.
        const stericBooks = async (t) => {
            // A splice-switching design is ranked and placed against the track's
            // cis-regulatory model, so with no model there is nothing to design against.
            // The card is GREYED rather than hidden, and says what to do about it: a missing
            // prerequisite the user can fix reads very differently from a feature that does
            // not exist, and hiding it would leave them wondering where the option went.
            let nWindows = 0;
            try {
                const P = await exec('baja/manchester/menu/splice-tiling-priority.js');
                nWindows = (P.modelWindows(selectedTrack) || []).length;
            } catch (e) { nWindows = 0; }
            const hasModel = nWindows > 0;
            const trackName = (selectedTrack && selectedTrack.name) || 'this track';

            return [
            {
                title: 'Use splicing', badge: 'Splice switching',
                ready: hasModel,
                readyNote: 'needs a splicing model',
                blurb: hasModel
                    ? ('Aim the tiling at the ' + nWindows + ' cis-regulatory window'
                        + (nWindows === 1 ? '' : 's') + ' on ' + trackName + ', so the compounds '
                        + 'that sit on the elements that matter are designed first.')
                    : ('No splicing model on ' + trackName + '. Add one first: Layers \u25b8 Models '
                        + '\u25b8 Splicing \u2014 cis-regulatory windows, then click a splice site on '
                        + 'the track. That marks which sequence supports the site and which '
                        + 'suppresses it, which is what a splice-switching design is aimed at.'),
                subtitle: 'Which way should the exon move?',
                books: () => [
                    {
                        title: 'Exon inclusion', badge: 'Include',
                        blurb: 'Cover the windows the model scores as SUPPRESSIVE. The native '
                            + 'sequence there holds the splice site down, so occupying it should '
                            + 'increase use of the exon.',
                        open: () => t.click(0, 0, 'inclusion')
                    },
                    {
                        title: 'Exon exclusion', badge: 'Exclude',
                        blurb: 'Cover the windows the model scores as SUPPORTIVE. The site depends '
                            + 'on that sequence, so occupying it should reduce use of the exon.',
                        open: () => t.click(0, 0, 'exclusion')
                    }
                ]
            },
            {
                // Named for WHAT IT DESIGNS, not for what it leaves out. "No splicing" defined
                // the option by its absence, which reads as the lesser of the two even when it
                // is the one you want -- and it is the whole modality, not a fallback.
                title: 'Steric Blocking oligo', badge: 'Steric',
                blurb: 'Tile the transcript on the design rules alone, with no splice-switching '
                    + 'priority. The behaviour this modality has always had'
                    + (hasModel ? '.' : ' — and the only option here until a model is added.'),
                open: () => t.click(0, 0, null)
            }
            ];
        };

        const therapeuticBooks = () => therapeutics.map((t) => {
            const a = THERAPEUTIC_ABOUT[t.label] || {};
            const book = {
                title: t.label,
                badge: a.badge || 'Therapeutic',
                blurb: a.blurb || ('Design ' + t.label + ' over ' + scopeNote() + '.'),
                open: () => t.click()
            };
            if (t.label === 'Steric-blocking ASO') {
                delete book.open;              // a card with both is treated as a sub-library
                book.subtitle = 'Design against the splicing model, or on the rules alone';
                book.books = () => stericBooks(t);
            }
            return book;
        }).concat([{
            // Not a fourth modality: a different question. The three above design against the
            // transcript; this one designs against ONE ALLELE of it, and the modality (siRNA or
            // gapmer) is chosen inside. baja/manchester/menu/allele-selective-design.js.
            title: 'Allele selective', badge: 'Around a mutation',
            // Gated on the CANVAS: the designer asks which track carries the mutation when it
            // is not the selected one, so a variant on another track is still designable and
            // greying on the selected track alone would refuse a design that would work.
            ready: __variantCount.canvas > 0,
            readyNote: 'no variants loaded',
            blurb: (__variantCount.canvas > 0)
                ? ('Oligos that hit the mutant allele and spare the wild-type one — siRNA or '
                    + 'gapmer, chosen next. Designed against one of the ' + __variantCount.canvas
                    + ' variant' + (__variantCount.canvas === 1 ? '' : 's') + ' already on the canvas, '
                    + 'and ranked by WHERE the wild-type mismatch falls: the central/seed positions '
                    + 'of an siRNA guide, or inside a gapmer\'s DNA gap, because that placement is '
                    + 'what discrimination is.')
                : ('No variants on the canvas to design against. This design needs a specific '
                    + 'mutation to discriminate against the wild-type allele — load one first '
                    + 'from Data \u25b8 Variants (ClinVar, dbSNP, gnomAD or COSMIC), or describe '
                    + 'one with Draw \u25b8 Describe a variant.'),
            // A LEAF, not a shelf. It used to open a two-card level naming the modalities, and
            // the design then asked for the modality again in its own menu -- the same question
            // twice, with the shelf's answer thrown away. The card opens the design directly,
            // and the modality is asked once, where the chemistry and the mutation are also
            // chosen: Therapeutics -> Allele selective -> modality -> chemistry.
            open: () => exec('baja/manchester/menu/allele-selective-design.js', window['env']['apiUrl'], graph, genegraph_panel_layout, selectedTrack)
        }, {
            // Screening belongs beside designing: an ASO is not finished until you know what
            // else it binds, and having to leave Therapeutics to find out made that a separate
            // errand. The same entry points as the off-target tools menu -- one screen, reached
            // from two places, rather than a second implementation that can drift.
            title: 'Off-targets', badge: 'Screen',
            ready: __oligoCount.here > 0,
            readyNote: (__oligoCount.canvas > 0) ? 'compounds are on another track' : 'no compounds yet',
            subtitle: 'Screen the compounds on this track',
            blurb: (__oligoCount.here > 0)
                ? ('Screen the ' + __oligoCount.here + ' compound'
                    + (__oligoCount.here === 1 ? '' : 's') + ' on ' + __trackLabel + ' against the '
                    + 'transcriptome, and count what else each one binds. Results attach to the '
                    + 'compounds, so the design report and the off-target filter can both read them.')
                : ((__oligoCount.canvas > 0)
                    ? ('No compounds on ' + __trackLabel + ' to screen. There '
                        + (__oligoCount.canvas === 1 ? 'is 1 compound' : 'are ' + __oligoCount.canvas + ' compounds')
                        + ' elsewhere on the canvas — select that track and reopen this menu.')
                    : 'Design some compounds first, then this will screen them against the '
                        + 'transcriptome and record what else they bind.'),
            books: () => {
                // The "selected" variants only exist when something IS selected, exactly as in
                // baja/manchester/menu/off-target-tools-sub-menu.js -- offering them otherwise
                // would be a screen of nothing.
                // On THIS track: the screens below are handed selectedTrack and look no
                // further, so a selection elsewhere on the canvas would offer a screen of
                // nothing.
                let anySelected = false;
                try {
                    anySelected = ((selectedTrack && selectedTrack.oligos) || [])
                        .some((o) => o && (o.selected || o.highlight__));
                } catch (e) { anySelected = false; }
                const books = [
                    {
                        title: 'Full antisense sequence', badge: 'Screen',
                        blurb: 'Screen the whole antisense strand of every compound on ' + __trackLabel + '. '
                            + 'The default for an ASO, where the entire length is the binding event.',
                        // Every screen here is handed selectedTrack: reached by walking Design >
                        // <track> > Off-targets, it covers that track's compounds and no other.
                        open: () => exec('baja/manchester/menu/run-off-target-tool.js', graph, genegraph_panel_layout, false, selectedTrack)
                    },
                    {
                        title: 'Seed sequence only', badge: 'siRNA',
                        blurb: 'Screen the seed region rather than the full strand — positions 2-8 of '
                            + 'the guide, which is what drives siRNA off-target silencing. Use this for '
                            + 'a duplex, not for a steric-blocking ASO.',
                        open: () => exec('baja/manchester/menu/run-off-target-tool-seed-seq.js', graph, genegraph_panel_layout, false, selectedTrack)
                    },
                    {
                        title: 'Fuzzy match (edit distance)', badge: 'Levenshtein',
                        blurb: 'A tolerant search that finds near-matches as well as exact ones, so a '
                            + 'site differing by a base or two is still reported.',
                        open: () => exec('baja/data/aso-offtarget.js', '', window['env']['apiUrl'], graph, genegraph_panel_layout, selectedTrack)
                    }
                ];
                if (anySelected) {
                    books.push({
                        title: 'Full antisense (selected only)', badge: 'Screen',
                        blurb: 'The same full-strand screen, restricted to the compounds currently '
                            + 'selected on ' + __trackLabel + '.',
                        open: () => exec('baja/manchester/menu/run-off-target-tool.js', graph, genegraph_panel_layout, true, selectedTrack)
                    });
                    books.push({
                        title: 'Seed sequence (selected only)', badge: 'siRNA',
                        blurb: 'The seed-region screen, restricted to the selected compounds.',
                        open: () => exec('baja/manchester/menu/run-off-target-tool-seed-seq.js', graph, genegraph_panel_layout, true, selectedTrack)
                    });
                }
                return books;
            }
        }, {
            // Not a designer either: a way of WRITING UP what the designers produced. It needs
            // compounds to describe, so with none on this track it is greyed with the reason
            // rather than offered and then failing.
            title: 'Generate Design Report', badge: 'Written up',
            ready: __oligoCount.here > 0,
            readyNote: (__oligoCount.canvas > 0) ? 'compounds are on another track' : 'no compounds yet',
            blurb: (__oligoCount.here > 0)
                ? ('Write up the ' + __oligoCount.here + ' compound'
                    + (__oligoCount.here === 1 ? '' : 's') + ' on ' + __trackLabel + ': the target, the '
                    + 'data and ML model layers in use, the compounds and their chemistry, and their '
                    + 'off-targets. The facts are read off the track and the model only writes them up '
                    + '— it is told to invent nothing and to say plainly where a screen was not run.')
                : ((__oligoCount.canvas > 0)
                    ? ('No compounds on ' + __trackLabel + ' to report on. There '
                        + (__oligoCount.canvas === 1 ? 'is 1 compound' : 'are ' + __oligoCount.canvas + ' compounds')
                        + ' elsewhere on the canvas — select that track and reopen this menu.')
                    : 'Design some compounds first, then this will write up the target, the models '
                        + 'in use, the chemistry and the off-targets as a report you can export.'),
            open: () => exec('baja/manchester/menu/design-report.js', graph, genegraph_panel_layout, selectedTrack)
        }, {
            // Not a designer: a way of FINDING what the designers already produced. It sits
            // here because this is where compounds come from, and after a few runs across
            // several tracks they are easy to lose track of.
            title: 'Highlight all compounds', badge: 'On the board',
            // Gated on the CANVAS total, not this track: this one deliberately reaches every
            // track, so compounds elsewhere are exactly what it is for.
            ready: __oligoCount.canvas > 0,
            readyNote: 'nothing designed yet',
            blurb: (__oligoCount.canvas > 0)
                ? ('Pulse all ' + __oligoCount.canvas + ' compound'
                    + (__oligoCount.canvas === 1 ? '' : 's') + ' on the canvas magenta and pull the '
                    + 'camera back to frame them — across every track, not just this one. Nothing '
                    + 'is designed, changed or removed.')
                : ('No compounds anywhere on the canvas to highlight. Design some first — '
                    + 'siRNA, Gapmer or Steric-blocking ASO above.'),
            open: () => __highlightAllCompounds()
        }]);

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
            },
            {
                // Not a designer: finding what the designers already placed. Gated on primer
                // sets specifically, not on compounds in general -- a track can be covered in
                // ASOs and still have no amplicon to highlight, and offering it there would be
                // a button that blinks nothing.
                title: 'Highlight primer probes', badge: 'Locate',
                ready: __probeCount.here > 0,
                readyNote: (__probeCount.canvas > 0) ? 'primer sets are on another track' : 'no primer sets yet',
                blurb: (__probeCount.here > 0)
                    ? ('Twinkle the ' + __probeCount.here + ' primer set'
                        + (__probeCount.here === 1 ? '' : 's') + ' on ' + __trackLabel + ' magenta for '
                        + 'about five seconds. Amplicons only — the ASOs on the track are left alone.')
                    : ((__probeCount.canvas > 0)
                        ? ('No primer sets on ' + __trackLabel + '. There '
                            + (__probeCount.canvas === 1 ? 'is 1' : 'are ' + __probeCount.canvas)
                            + ' elsewhere on the canvas — select that track and reopen this menu.')
                        : 'Design primers first — primer3, djPrimer or exon-exon probes above — '
                            + 'and this will find them on the track.'),
                open: () => highlightPrimerProbes()
            }
        ];

        // Compounds available to act on: on the SELECTED track, which is what the filters
        // operate on, and across the whole canvas, which is what makes "they are on another
        // track" sayable instead of a flat "there are none".
        const __oligoCount = (() => {
            let here = 0, canvas = 0;
            try {
                for (const t of ((graph && graph.track) || [])) {
                    const n = ((t && t.oligos) || []).filter(Boolean).length;
                    canvas += n;
                    if (t === selectedTrack) here = n;
                }
            } catch (e) { }
            return { here: here, canvas: canvas };
        })();
        const __trackLabel = (selectedTrack && selectedTrack.name) || 'this track';

        // Variants available to design against. The SAME filter allele-selective-design.js
        // applies -- a snpindel with no xi is not a position it can aim at -- so the menu
        // cannot offer a design the designer would then refuse.
        const __variantCount = (() => {
            let here = 0, canvas = 0;
            try {
                for (const t of ((graph && graph.track) || [])) {
                    const n = ((t && t.snpindels) || []).filter((v) => v && v.xi != null).length;
                    canvas += n;
                    if (t === selectedTrack) here = n;
                }
            } catch (e) { }
            return { here: here, canvas: canvas };
        })();

        const DESIGN = [
            {
                title: 'Therapeutics', badge: 'Oligo design',
                subtitle: 'Pick a modality',
                blurb: 'siRNA, gapmer and steric-blocking ASO designers, plus allele-selective '
                    + 'design around a mutation. Each opens its own dialog before it runs.',
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
                // Off-target FILTERING moved in here from a top level node of its own. Pruning
                // by off-target count is something you do to compounds already on the track, so
                // it belongs with the rest of that work rather than beside the designers.
                // Running a screen still lives under Therapeutics, next to the designs that
                // produce the compounds: one is finishing a design, the other is managing what
                // the design left behind.
                title: 'Compounds', badge: 'On this track',
                subtitle: 'Work with the compounds already here',
                ready: __oligoCount.here > 0,
                readyNote: (__oligoCount.canvas > 0) ? 'compounds are on another track' : 'no compounds yet',
                blurb: (__oligoCount.here > 0)
                    ? ('Find and prune the ' + __oligoCount.here + ' compound'
                        + (__oligoCount.here === 1 ? '' : 's') + ' already designed onto ' + __trackLabel + '.')
                    : ((__oligoCount.canvas > 0)
                        ? ('No compounds on ' + __trackLabel + '. There '
                            + (__oligoCount.canvas === 1 ? 'is 1 compound' : 'are ' + __oligoCount.canvas + ' compounds')
                            + ' elsewhere on the canvas — select that track and reopen this menu.')
                        : ('Nothing designed on the canvas yet. Design compounds first — '
                            + 'Therapeutics \u25b8 siRNA, Gapmer or Steric-blocking ASO — and they '
                            + 'will show up here.')),
                books: () => [
                    {
                        title: 'Highlight compounds', badge: 'Locate',
                        ready: __oligoCount.here > 0,
                        readyNote: 'no compounds on this track',
                        blurb: (__oligoCount.here > 0)
                            ? ('Twinkle the ' + __oligoCount.here + ' compound'
                                + (__oligoCount.here === 1 ? '' : 's') + ' on this track magenta for '
                                + 'about five seconds — motion catches the eye where a static '
                                + 'highlight on a busy track does not.')
                            : 'Nothing on this track to highlight.',
                        open: () => highlightCompounds()
                    },
                    {
                        title: 'Filter by off-target count', badge: 'Remove',
                        ready: __oligoCount.here > 0,
                        readyNote: 'no compounds on this track',
                        blurb: 'Remove every oligo whose off-target count is above a maximum you give. '
                            + 'Amplicons are left alone, and undo restores what it removed. Compounds '
                            + 'that have not been screened have no count to filter on, so run the '
                            + 'screen first: Therapeutics \u25b8 Off-targets.',
                        open: () => filterByOffTargets()
                    }
                ]
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
