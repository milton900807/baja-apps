function (graph, layout) {

    // recorder.js — record the user's actions on the editor, then emit a demo.js script that
    // plays them back. Companion to manchester/demo.js.
    //
    //   exec('manchester/recorder.js', graph, layout)   // start recording (call again to stop)
    //
    // WHAT IT CAPTURES
    //   • A start SNAPSHOT — a `load`/`sequence` line per existing track + a `camera` line for the
    //     current view — so replay rebuilds the pre-recording scene after a clean reset.
    //   • RAW canvas input (mousedown / drag / mouseup / wheel) → `event` commands. Replaying these
    //     reproduces canvas clicks, panning, zooming, lasso and side-menu selections.
    //   • TOP-LEVEL DOM interactions: toolbar buttons, sub-toolbars (tracks / layers / draw / data),
    //     and dialog buttons → `domclick` commands (located by id / button text). Dialog field entry
    //     (e.g. the load-id box) → `domset` commands.
    //   Because replay just reproduces the real inputs, the app itself does the loading / drawing /
    //   layer-adding — no per-feature hooks and no double-driving.
    //
    // REPLAY runs IN-PLACE on the live editor (so the real toolbar exists to click) and starts by
    // clearing tracks, so it plays from a clean slate. See demo.js `config.inPlace`.

    try {
        if (window.__bajaRecorder && window.__bajaRecorder.on) { try { window.__bajaRecorder.stop(); } catch (e) { } return graph; }

        // Expose the live editor to demo.js's in-place replay.
        try { window.__bajaLiveGraph = graph; window.__bajaLiveLayout = layout || graph.genegraph_panel_layout || null; } catch (e) { }

        const biggestCanvas = () => {
            let best = null, area = -1;
            try { for (const c of document.querySelectorAll('canvas')) { const a = c.width * c.height; if (a > area) { area = a; best = c; } } } catch (e) { }
            return best;
        };
        const now = () => Date.now();
        const cv = biggestCanvas();

        const rec = { on: true, t0: now(), events: [], canvas: cv, moveThrottle: 0, dragging: false, snapshotCount: 0, lastDomClickT: 0 };
        window.__bajaRecorder = rec;

        const OVERLAY_IDS = ['baja-rec-badge', 'baja-recorded-panel'];
        const inOverlay = (el) => { try { for (let n = el; n; n = n.parentElement) { if (n.id && OVERLAY_IDS.indexOf(n.id) >= 0) return true; } } catch (e) { } return false; };
        const isCanvas = (el) => { try { return !!(cv && (el === cv || cv.contains(el))); } catch (e) { return false; } };

        const fracOf = (e) => {
            const r = cv ? cv.getBoundingClientRect() : { left: 0, top: 0, width: 1, height: 1 };
            return { fx: (e.clientX - r.left) / (r.width || 1), fy: (e.clientY - r.top) / (r.height || 1) };
        };
        // World (graph) coordinates of a canvas event: convert the CSS-pixel position to the
        // canvas's internal pixel space, then through the grid's inverse map (Xwc/Ywc). Recording
        // canvas clicks in WORLD coords makes replay robust to screen-size changes — the same graph
        // location is hit regardless of the viewport the demo is replayed in. (Buttons outside the
        // gene-graph are recorded by DOM locator instead — see locate()/onDocClick.)
        const worldOf = (e) => {
            try {
                const g = graph && graph.graph;
                if (!cv || !g || typeof g.Xwc !== 'function' || typeof g.Ywc !== 'function') return null;
                const r = cv.getBoundingClientRect();
                const sx = (e.clientX - r.left) * ((cv.width || r.width) / (r.width || 1));
                const sy = (e.clientY - r.top) * ((cv.height || r.height) / (r.height || 1));
                const wx = g.Xwc(sx), wy = g.Ywc(sy);
                return (isFinite(wx) && isFinite(wy)) ? { wx: wx, wy: wy } : null;
            } catch (er) { return null; }
        };
        const push = (cmd) => { rec.events.push({ t: now(), cmd: cmd }); };

        // ---- Build a robust locator for a DOM element -------------------------------------
        const cssPath = (el) => {
            try {
                const parts = [];
                let node = el;
                while (node && node.nodeType === 1 && node.tagName.toLowerCase() !== 'body' && parts.length < 6) {
                    let sel = node.tagName.toLowerCase();
                    const parent = node.parentElement;
                    if (parent) {
                        const sibs = Array.prototype.filter.call(parent.children, (c) => c.tagName === node.tagName);
                        if (sibs.length > 1) sel += ':nth-of-type(' + (sibs.indexOf(node) + 1) + ')';
                    }
                    parts.unshift(sel);
                    node = parent;
                }
                return parts.join('>');
            } catch (e) { return ''; }
        };
        const stableId = (id) => id && !/(\d{4,}|[0-9a-f]{8}|^cdk-|^mat-|^ng-)/i.test(id);
        const attrLabel = (el) => {
            try {
                const a = el.getAttribute && (el.getAttribute('data-rec') || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('name') || el.getAttribute('placeholder'));
                return a ? ('' + a).trim() : '';
            } catch (e) { return ''; }
        };
        const locate = (el, ev) => {
            // Climb to the nearest button-like ancestor (up to 4 hops) for a stable target.
            let node = el, hops = 0, chosen = el, loc = null;
            while (node && hops < 4) {
                const tag = node.tagName ? node.tagName.toLowerCase() : '';
                if (node.id && stableId(node.id)) { loc = { by: 'id', v: node.id, path: cssPath(el) }; break; }
                const lab = attrLabel(node);
                if (lab && lab.length <= 60) { loc = { by: 'label', v: lab, tag: tag, path: cssPath(node) }; break; }
                if (tag === 'button' || tag === 'a' || (node.getAttribute && node.getAttribute('role') === 'button')) { chosen = node; break; }
                chosen = node; node = node.parentElement; hops++;
            }
            if (!loc) {
                const txt = ('' + (chosen.innerText || chosen.textContent || '')).trim().replace(/\s+/g, ' ');
                if (txt && txt.length <= 60) loc = { by: 'text', v: txt, tag: chosen.tagName.toLowerCase(), path: cssPath(chosen) };
                else loc = { by: 'path', v: cssPath(chosen), tag: chosen.tagName.toLowerCase() };
            }
            // Always record a screen point as a robust fallback (elementFromPoint on replay). Click
            // events carry clientX/Y; input/key events don't, so fall back to the field's own centre.
            try {
                let cx, cy;
                if (ev && Number.isFinite(ev.clientX)) { cx = ev.clientX; cy = ev.clientY; }
                else { const rr = el.getBoundingClientRect(); if (rr.width || rr.height) { cx = rr.left + rr.width / 2; cy = rr.top + rr.height / 2; } }
                if (cx != null) { loc.wx = +(cx / (window.innerWidth || 1)).toFixed(4); loc.wy = +(cy / (window.innerHeight || 1)).toFixed(4); }
            } catch (e) { }
            return loc;
        };

        // ---- 1) Start snapshot -------------------------------------------------------------
        try {
            for (const t of (graph.track || [])) {
                // Only `load` a REAL transcript/gene id (Ensembl / RefSeq) — NEVER the track's internal
                // UUID id (that isn't a transcript and fails on replay). Everything else (clinical
                // compounds, raw pasted sequences) reproduces via its exact `sequence`.
                const idRe = /^(ENS[A-Z]*[TGP]\d|N[MRP]_|X[MR]_)/i;
                const acc = t.accession || t.geneId || t.transcriptId || null;
                const nm = ('' + (t.name || '')).trim();
                const loadVal = (acc && idRe.test('' + acc)) ? ('' + acc) : (idRe.test(nm) ? nm : null);
                if (loadVal) push({ cmd: 'load', value: loadVal });
                else if (t.sequence) push({ cmd: 'sequence', sequence: t.sequence, name: (nm || 'seq').replace(/\s+/g, '_') });
                else if (acc) push({ cmd: 'load', value: '' + acc });
            }
        } catch (e) { }
        try {
            const g = graph.graph;
            if (g && g.grid && typeof g.Xwc === 'function' && typeof g.Ywc === 'function') {
                const gw = g.grid.width, gh = g.grid.height;
                const x0 = g.Xwc(0), x1 = g.Xwc(gw), y0 = g.Ywc(0), y1 = g.Ywc(gh);
                if ([x0, x1, y0, y1].every(Number.isFinite)) push({ cmd: 'camera', x0: x0, x1: x1, y0: y0, y1: y1, ms: 0 });
            }
        } catch (e) { }
        rec.snapshotCount = rec.events.length;
        rec.t0 = now();
        rec.events.forEach((ev) => { ev.t = rec.t0; });

        // ---- 1b) Capture WHICH track is loaded (fallback) ----------------------------------
        // Every load funnels through graph.add(id,…) with the resolved transcript id. But we PREFER
        // to reproduce the load the way the user did it — clicking the new-track window's "Load"
        // button — because that click also CLOSES the window. So:
        //   • If a DOM button click happened recently (it drove this load), do nothing here: the
        //     recorded type + Load click reproduces the load AND closes the window. Adding a semantic
        //     `load` on top would double-load and leave the window open.
        //   • Otherwise (programmatic / canvas-menu load with no button), collapse the trailing menu
        //     taps and record a semantic `load <id>` as a robust fallback.
        try {
            rec.origAdd = graph.add;
            graph.add = function (id) {
                try {
                    const drivenByClick = (now() - (rec.lastDomClickT || 0)) < 45000;
                    if (!drivenByClick) {
                        while (rec.events.length > rec.snapshotCount) {
                            const n = rec.events.length;
                            const e2 = rec.events[n - 1].cmd;
                            if (e2.cmd === 'domclick' || e2.cmd === 'domset') { rec.events.pop(); continue; }
                            if (n - rec.snapshotCount >= 2) {
                                const e1 = rec.events[n - 2].cmd;
                                if (e1.cmd === 'event' && e1.type === 'down' && e2.cmd === 'event' && e2.type === 'up') { rec.events.pop(); rec.events.pop(); continue; }
                            }
                            break;
                        }
                        if (id != null && ('' + id).trim()) push({ cmd: 'load', value: ('' + id).trim() });
                    }
                } catch (er) { }
                return rec.origAdd.apply(this, arguments);
            };
        } catch (e) { }

        // ---- 1c) Capture CENTER / SIDE menu selections semantically -------------------------
        // Center menus (graph.showMenu) and side menus (graph.showSideMenu) are drawn on the canvas;
        // reproducing a selection by raw click coordinates is fragile (menu position + async render
        // timing vary on replay). Instead, wrap each menu item's click to record the chosen LABEL,
        // and drop the raw canvas tap that selected it. Replay finds the open menu and invokes the
        // matching item directly — robust to layout and timing.
        const popTrailingTap = () => {
            while (rec.events.length > rec.snapshotCount) {
                const n = rec.events.length, last = rec.events[n - 1].cmd;
                if (last.cmd === 'event' && (last.type === 'down' || last.type === 'up')) {
                    if (n - rec.snapshotCount >= 2) {
                        const prev = rec.events[n - 2].cmd;
                        if (prev.cmd === 'event' && prev.type === 'down' && last.type === 'up') { rec.events.pop(); rec.events.pop(); rec.skipNextUp = false; return; }
                    }
                    rec.events.pop(); rec.skipNextUp = true; return;   // popped a lone down → absorb the coming up
                }
                break;
            }
        };
        const wrapMenu = (methodName, menuType) => {
            try {
                const orig = graph[methodName];
                if (typeof orig !== 'function') return;
                rec['orig_' + methodName] = orig;
                graph[methodName] = function (list) {
                    try {
                        if (Array.isArray(list)) {
                            for (const item of list) {
                                if (item && typeof item.click === 'function' && !item.__recWrapped) {
                                    const origClick = item.click;
                                    const lbl = ('' + (item.label || item.name || '')).trim();
                                    item.click = function () {
                                        try { popTrailingTap(); push({ cmd: 'menuclick', menu: menuType, label: lbl }); } catch (e) { }
                                        return origClick.apply(this, arguments);
                                    };
                                    item.__recWrapped = true;
                                }
                            }
                        }
                    } catch (e) { }
                    return orig.apply(this, arguments);
                };
            } catch (e) { }
        };
        wrapMenu('showMenu', 'center');
        wrapMenu('showSideMenu', 'side');

        // ---- 2) Canvas input capture ------------------------------------------------------
        // Canvas events carry BOTH the canvas-fraction (fx,fy — legacy/fallback) and the world
        // (wx,wy) coordinates; replay prefers world coords so a screen-size change doesn't shift it.
        const worldFields = (e) => { const w = worldOf(e); return w ? { wx: +w.wx.toFixed(4), wy: +w.wy.toFixed(4) } : {}; };
        const onDown = (e) => { try { rec.dragging = true; const f = fracOf(e); push(Object.assign({ cmd: 'event', type: 'down', fx: +f.fx.toFixed(4), fy: +f.fy.toFixed(4) }, worldFields(e))); } catch (er) { } };
        const onMove = (e) => { try { if (!rec.dragging) return; const t = now(); if (t - rec.moveThrottle < 45) return; rec.moveThrottle = t; const f = fracOf(e); push(Object.assign({ cmd: 'event', type: 'move', fx: +f.fx.toFixed(4), fy: +f.fy.toFixed(4), extra: 1 }, worldFields(e))); } catch (er) { } };
        const onUp = (e) => { try { if (e) { if (e.__bajaRecUp) return; try { e.__bajaRecUp = true; } catch (_) { } } rec.dragging = false; if (rec.skipNextUp) { rec.skipNextUp = false; return; } const f = fracOf(e); push(Object.assign({ cmd: 'event', type: 'up', fx: +f.fx.toFixed(4), fy: +f.fy.toFixed(4) }, worldFields(e))); } catch (er) { } };
        const onWheel = (e) => { try { const f = fracOf(e); push(Object.assign({ cmd: 'event', type: 'wheel', fx: +f.fx.toFixed(4), fy: +f.fy.toFixed(4), extra: Math.round(e.deltaY || 0) }, worldFields(e))); } catch (er) { } };
        rec.canvasListeners = [['mousedown', onDown], ['mousemove', onMove], ['mouseup', onUp], ['wheel', onWheel]];
        try { for (const p of rec.canvasListeners) (cv || document).addEventListener(p[0], p[1], { capture: true, passive: true }); } catch (e) { }
        try { document.addEventListener('mouseup', onUp, { capture: true, passive: true }); rec.docUp = onUp; } catch (e) { }

        // ---- 3) Top-level DOM capture (toolbar / dialogs) ---------------------------------
        const onDocClick = (e) => {
            try {
                const el = e.target; if (!el || el.nodeType !== 1) return;
                if (isCanvas(el) || inOverlay(el)) return;   // canvas handled as events; ignore our overlays
                rec.lastDomClickT = now();                   // marks a button-driven load (see graph.add wrap)
                push({ cmd: 'domclick', locator: locate(el, e) });
            } catch (er) { }
        };
        const onDocInput = (e) => {
            try {
                const el = e.target; if (!el || el.nodeType !== 1) return;
                const tag = el.tagName ? el.tagName.toLowerCase() : '';
                if (['input', 'textarea', 'select'].indexOf(tag) < 0) return;
                if (inOverlay(el)) return;
                const loc = locate(el, e), val = el.value != null ? el.value : '';
                // Coalesce continued typing into the same element's last domset.
                const last = rec.events.length ? rec.events[rec.events.length - 1] : null;
                if (last && last.cmd && last.cmd.cmd === 'domset' && last.cmd.__el === el) { last.cmd.value = val; last.t = now(); return; }
                rec.events.push({ t: now(), cmd: { cmd: 'domset', locator: loc, value: val, __el: el } });
            } catch (er) { }
        };
        // Submit / navigation keystrokes on a field (Enter to submit, Tab, Escape, arrows for an
        // autocomplete). Printable characters are already captured as the field's coalesced value
        // (domset) — and Backspace/Delete are reflected there too — so only these extra keys are
        // recorded, keeping their order relative to the typed text.
        const SPECIAL = { Enter: 1, Tab: 1, Escape: 1, ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1 };
        const onDocKey = (e) => {
            try {
                const el = e.target; if (!el || el.nodeType !== 1) return;
                if (inOverlay(el)) return;
                const tag = el.tagName ? el.tagName.toLowerCase() : '';
                const editable = (tag === 'input' || tag === 'textarea' || (el.getAttribute && el.getAttribute('contenteditable') === 'true'));
                if (editable && SPECIAL[e.key]) push({ cmd: 'key', key: e.key, locator: locate(el, e) });
            } catch (er) { }
        };
        try { document.addEventListener('click', onDocClick, { capture: true, passive: true }); rec.docClick = onDocClick; } catch (e) { }
        try { document.addEventListener('input', onDocInput, { capture: true, passive: true }); rec.docInput = onDocInput; } catch (e) { }
        try { document.addEventListener('keydown', onDocKey, { capture: true, passive: true }); rec.docKey = onDocKey; } catch (e) { }

        // ---- 4) Build the script ----------------------------------------------------------
        rec.buildScript = () => {
            const arr = [];
            let prev = rec.t0;
            rec.events.forEach((ev, i) => {
                if (i >= rec.snapshotCount) {
                    const gap = ev.t - prev;
                    if (gap > 120) arr.push({ cmd: 'wait', ms: Math.min(4000, Math.round(gap)) });
                    prev = ev.t;
                }
                const c = Object.assign({}, ev.cmd); delete c.__el;   // strip the internal element ref
                arr.push(c);
            });
            return JSON.stringify(arr, null, 2);
        };

        // ---- 5) REC badge + Stop -----------------------------------------------------------
        const badge = document.createElement('div');
        badge.id = 'baja-rec-badge';
        badge.style.cssText = 'position:fixed;top:14px;right:14px;z-index:2147483400;display:flex;align-items:center;gap:10px;'
            + 'background:#0b2545;color:#fff;border-radius:999px;padding:8px 12px 8px 14px;font:600 13px Arial;'
            + 'box-shadow:0 8px 26px rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.16);';
        const dot = document.createElement('span');
        dot.style.cssText = 'width:11px;height:11px;border-radius:50%;background:#ef4444;animation:bajaRecPulse 1.1s infinite;';
        const timer = document.createElement('span'); timer.textContent = 'REC 0:00';
        const stopBtn = document.createElement('span');
        stopBtn.textContent = '■ Stop';
        stopBtn.style.cssText = 'cursor:pointer;background:#ef4444;color:#fff;border-radius:999px;padding:4px 12px;font:700 12px Arial;';
        stopBtn.onmouseenter = () => { try { stopBtn.style.filter = 'brightness(1.12)'; } catch (e) { } };
        stopBtn.onmouseleave = () => { try { stopBtn.style.filter = ''; } catch (e) { } };
        badge.appendChild(dot); badge.appendChild(timer); badge.appendChild(stopBtn);
        try {
            if (!document.getElementById('baja-rec-style')) {
                const st = document.createElement('style'); st.id = 'baja-rec-style';
                st.textContent = '@keyframes bajaRecPulse{0%{box-shadow:0 0 0 0 rgba(239,68,68,0.6)}70%{box-shadow:0 0 0 8px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}';
                document.head.appendChild(st);
            }
        } catch (e) { }
        document.body.appendChild(badge); rec.badge = badge;

        rec.tick = setInterval(() => {
            try { const s = Math.floor((now() - rec.t0) / 1000); timer.textContent = 'REC ' + Math.floor(s / 60) + ':' + ('' + (s % 60)).padStart(2, '0'); } catch (e) { }
        }, 500);

        rec.stop = () => {
            if (!rec.on) return; rec.on = false;
            try { if (rec.tick) clearInterval(rec.tick); } catch (e) { }
            try { for (const p of rec.canvasListeners) (cv || document).removeEventListener(p[0], p[1], { capture: true }); } catch (e) { }
            try { if (rec.docUp) document.removeEventListener('mouseup', rec.docUp, { capture: true }); } catch (e) { }
            try { if (rec.docClick) document.removeEventListener('click', rec.docClick, { capture: true }); } catch (e) { }
            try { if (rec.docInput) document.removeEventListener('input', rec.docInput, { capture: true }); } catch (e) { }
            try { if (rec.docKey) document.removeEventListener('keydown', rec.docKey, { capture: true }); } catch (e) { }
            try { if (rec.origAdd) graph.add = rec.origAdd; } catch (e) { }
            try { if (rec.orig_showMenu) graph.showMenu = rec.orig_showMenu; } catch (e) { }
            try { if (rec.orig_showSideMenu) graph.showSideMenu = rec.orig_showSideMenu; } catch (e) { }
            try { if (rec.badge && rec.badge.parentNode) rec.badge.parentNode.removeChild(rec.badge); } catch (e) { }
            const text = rec.buildScript();
            showScriptPanel(text);
            try { window.__bajaRecorder = null; } catch (e) { }
        };
        stopBtn.onclick = () => { try { rec.stop(); } catch (e) { } };

        // ---- Navy script panel (Run / Copy / Close) ---------------------------------------
        function showScriptPanel(text) {
            try {
                const old = document.getElementById('baja-recorded-panel'); if (old && old.parentNode) old.parentNode.removeChild(old);
                const panel = document.createElement('div');
                panel.id = 'baja-recorded-panel';
                panel.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:2147483400;width:min(720px,92vw);'
                    + 'background:#0b2545;color:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.45);'
                    + 'border:1px solid rgba(255,255,255,0.14);padding:16px;font-family:Arial,Helvetica,sans-serif;';
                const h = document.createElement('div'); h.textContent = 'Recorded script'; h.style.cssText = 'font:700 16px Arial;margin-bottom:4px;';
                const sub = document.createElement('div');
                sub.textContent = (rec.events.length - rec.snapshotCount) + ' action(s) captured — Run replays in place (clears tracks first).';
                sub.style.cssText = 'font:13px Arial;color:#9fb3c8;margin-bottom:12px;';
                const ta = document.createElement('textarea'); ta.value = text; ta.spellcheck = false;
                ta.style.cssText = 'width:100%;height:300px;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);'
                    + 'border-radius:8px;padding:10px;font:12px/1.5 Menlo,Consolas,monospace;resize:vertical;';
                const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:14px;';
                const mkBtn = (label, primary) => {
                    const b = document.createElement('button'); b.textContent = label;
                    b.style.cssText = 'cursor:pointer;border-radius:8px;padding:9px 16px;font:700 13px Arial;border:1px solid '
                        + (primary ? '#22c55e' : 'rgba(255,255,255,0.22)') + ';background:' + (primary ? '#22c55e' : 'transparent')
                        + ';color:' + (primary ? '#04210f' : '#fff') + ';';
                    b.onmouseenter = () => { try { b.style.filter = 'brightness(1.1)'; } catch (e) { } };
                    b.onmouseleave = () => { try { b.style.filter = ''; } catch (e) { } };
                    return b;
                };
                const runBtn = mkBtn('▶ Run', true), copyBtn = mkBtn('⧉ Copy', false), closeBtn = mkBtn('✕ Close', false);
                runBtn.onclick = () => {
                    const script = ta.value;
                    try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
                    try { if (window.__bajaLiveGraph && window.__bajaLiveGraph.clearTracks) window.__bajaLiveGraph.clearTracks(); if (window.__bajaLiveGraph && window.__bajaLiveGraph.wake) window.__bajaLiveGraph.wake(); } catch (e) { }
                    try { exec('manchester/demo.js', script, { inPlace: true, stepDelayMs: 0 }); } catch (e) { try { graph.setMessage(' Replay failed: ' + (e && e.message ? e.message : e)); } catch (e2) { } }
                };
                copyBtn.onclick = () => {
                    try { ta.select(); } catch (e) { }
                    try { if (navigator.clipboard) navigator.clipboard.writeText(ta.value); else document.execCommand('copy'); } catch (e) { try { document.execCommand('copy'); } catch (e2) { } }
                    copyBtn.textContent = '✓ Copied'; setTimeout(() => { copyBtn.textContent = '⧉ Copy'; }, 1200);
                };
                closeBtn.onclick = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
                row.appendChild(copyBtn); row.appendChild(closeBtn); row.appendChild(runBtn);
                panel.appendChild(h); panel.appendChild(sub); panel.appendChild(ta); panel.appendChild(row);
                document.body.appendChild(panel);
            } catch (e) { }
        }

        try { graph.setMessage(' ● Recording — use the toolbar & canvas, then press Stop. '); } catch (e) { }
    } catch (e) { try { graph.setMessage(' Recorder error: ' + (e && e.message ? e.message : e)); } catch (e2) { } }

    return graph;
}
