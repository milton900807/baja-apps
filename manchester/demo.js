function (script, config) {

    // demo.js — a scripted, "driverless" version of manchester/editor.js.
    //
    // It builds the same gene-graph canvas the editor uses, then DRIVES the application from a
    // script instead of the user's mouse. Launch it like the editor, passing a script:
    //
    //   exec('manchester/demo.js', <script>, { stepDelayMs: 900 })
    //
    // <script> may be:
    //   • an ARRAY of command objects            [{cmd:'load', value:'ENST00000357033'}, …]
    //   • a JSON string of that array
    //   • a newline "cmd arg1 arg2" text block   (one command per line; # starts a comment)
    //   • a URL / path to a .json/.demo file      (fetched with GETXT)
    //
    // Command vocabulary (object form | line form):
    //   load  <id>                    graph.add(id)  — Ensembl/RefSeq id, gene symbol or free text
    //   sequence <ACGT…> [name]       add a raw sequence as a track      {cmd:'sequence',sequence,name}
    //   zoom  [track] [from] [to]     zoom to a track (default: last), or a region
    //   variants <sig> [track]        load ClinVar variants by significance via points-of-interest
    //                                 sig = pathogenic | likely_pathogenic | benign | likely_benign |
    //                                       uncertain | all
    //   tour  [track] [dwellMs]       focus + zoom each mutation on a track in turn
    //   message <text…>               show a status message
    //   wait  <ms>                    pause
    //   fit                           rescale / fit the view
    //   exec  <module> [args…]        run any lionscript module: exec(module, graph, layout, …args)
    //   js    <code>                  run arbitrary code with (graph, exec, layout, Track, sleep, say)
    //
    // Nothing here gates on a subscription — it's an automation/demo harness.

    return (async () => {

        // ---- 1) Environment ----------------------------------------------------------------
        // Normal mode builds a fresh editor-like graph and drives it. IN-PLACE mode (used by the
        // action recorder's replay, config.inPlace) reuses the LIVE editor graph + its toolbar so
        // recorded top-level button / dialog clicks have real DOM elements to hit.
        const inPlace = !!(config && (config.inPlace || config.useLive));
        let graph, Track, genegraph_panel_layout;
        try { const __tm = await exec('baja/bio/track.js'); Track = __tm && __tm.Track; } catch (e) { }
        if (inPlace && window.__bajaLiveGraph) {
            graph = window.__bajaLiveGraph;
            genegraph_panel_layout = graph.genegraph_panel_layout || window.__bajaLiveLayout || null;
        } else {
            const progressBar = () => { };                   // gene.js progress callback (no-op)
            graph = await exec('flexigraph/gene.js', progressBar);
            if (!Track) { try { const m = await exec('baja/bio/track.js'); Track = m.Track; } catch (e) { } }

            const geneGraph = await graph.createComponent();
            geneGraph.height = '100%';

            genegraph_panel_layout = {
                wid: 'card',
                componentRef: 'geneGraphPanel',
                data: { cards: [[{ 'width': '100%', 'height': '100%', 'component': geneGraph }]] }
            };
            graph.genegraph_panel_layout = genegraph_panel_layout;

            const main_layout = {
                wid: 'card', height: '100%', componentRef: 'mainPanel',
                data: { cards: [[{ 'width': '100%', 'height': '100%', 'component': genegraph_panel_layout }]] }
            };
            try { clear(); } catch (e) { }
            showWidget(main_layout);
            try { CurrentLayout.stash('mainPanel', main_layout); } catch (e) { }

            // Default interactive mode (so hover/selection still works between scripted steps).
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { }
        }

        // ---- 2) Helpers ---------------------------------------------------------------------
        const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, +ms || 0)));
        // Playback must NEVER put anything on the page's bottom message bar / log panel — status
        // goes to the browser console only.
        const say = (m) => { try { console.log('demo:', '' + m); } catch (e) { } };
        const lastTrack = () => (graph.track && graph.track.length ? graph.track.length - 1 : 0);
        const trackAt = (i) => (graph.track && graph.track[i]) ? graph.track[i] : null;

        // Zoom to a TRACK-LOCAL region [from, to] (bases). NOTE: graph.zoomToTrack is shadowed by
        // an override that ignores start/end, so drive the real camera (zoomRect → animateTo)
        // directly. X is projected to main-grid via tgraph.X(); Y uses the track's main-grid
        // extent (tgraph.yi) — NOT tgraph.Y() — exactly like the working mutation tour. The
        // half-width targets ~6 px/base so the sequence is readable when zoomed in.
        const zoomRegion = (t, from, to) => {
            try {
                if (!t || !t.tgraph || typeof graph.zoomRect !== 'function') return false;
                const tg = t.tgraph;
                const center = (from + to) / 2;
                const TARGET_PXPB = 6;
                let gridW = 800;
                try { gridW = (graph.graph && graph.graph.grid && graph.graph.grid.width) || (graph.canvas && graph.canvas.width) || 800; } catch (e) { }
                const worldPerBase = Math.abs((tg.X(center + 1) - tg.X(center)) || 1) || 1;
                const halfWorld = Math.max(Math.abs(tg.X(to) - tg.X(from)) / 2, (worldPerBase * gridW) / (2 * TARGET_PXPB));
                const centerW = tg.X(center);
                const xMin = centerW - halfWorld, xMax = centerW + halfWorld;
                const yA = tg.yi, yB = tg.yi + (tg.height || 0);
                const cy = (yA + yB) / 2, span = Math.abs(yB - yA) || 0.1;
                const topExt = span * 3.6, botExt = span * 2.2;   // room above for lollipops
                graph.animating = false;                          // clear any stuck animation lock
                graph.zoomRect(xMin, xMax, cy + topExt, cy - botExt, 300);
                return true;
            } catch (e) { return false; }
        };

        // ---- 2b) Virtual demo cursor --------------------------------------------------------
        // A fake pointer overlay the demo drives around the screen (the OS cursor can't be moved
        // by script). It animates smoothly to targets and can pulse a "click" ring.
        let __curX = (typeof window !== 'undefined' ? window.innerWidth : 800) / 2;
        let __curY = (typeof window !== 'undefined' ? window.innerHeight : 600) / 2;
        let __curEl = null;
        const ensureCursor = () => {
            try {
                if (__curEl && document.body.contains(__curEl)) return __curEl;
                const el = document.createElement('div');
                el.id = 'baja-demo-cursor';
                el.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483600;pointer-events:none;width:26px;height:26px;'
                    + 'transform:translate(' + __curX + 'px,' + __curY + 'px);filter:drop-shadow(0 2px 3px rgba(0,0,0,0.55));';
                el.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none">'
                    + '<path d="M4 2 L4 20 L9 15 L12 22 L15 21 L12 14 L19 14 Z" fill="#ffffff" stroke="#0b2545" stroke-width="1.4" stroke-linejoin="round"/></svg>';
                document.body.appendChild(el);
                __curEl = el; return el;
            } catch (e) { return null; }
        };
        const moveCursor = (x, y, ms) => new Promise((resolve) => {
            const el = ensureCursor();
            if (!el || typeof requestAnimationFrame === 'undefined') { __curX = x; __curY = y; if (el) el.style.transform = 'translate(' + x + 'px,' + y + 'px)'; return resolve(); }
            const sx = __curX, sy = __curY, dur = Math.max(1, +ms || 600), t0 = performance.now();
            const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
            const step = (now) => {
                const t = Math.min(1, (now - t0) / dur), e = ease(t);
                __curX = sx + (x - sx) * e; __curY = sy + (y - sy) * e;
                el.style.transform = 'translate(' + __curX + 'px,' + __curY + 'px)';
                if (t < 1) requestAnimationFrame(step); else resolve();
            };
            requestAnimationFrame(step);
        });
        const clickPulse = () => {
            try {
                const r = document.createElement('div');
                r.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483599;pointer-events:none;width:16px;height:16px;margin:-8px 0 0 -8px;'
                    + 'border-radius:50%;border:2px solid #22c55e;opacity:0.9;transition:transform .35s ease,opacity .35s ease;'
                    + 'transform:translate(' + (__curX + 7) + 'px,' + (__curY + 7) + 'px) scale(0.4);';
                document.body.appendChild(r);
                requestAnimationFrame(() => { r.style.transform = 'translate(' + (__curX + 7) + 'px,' + (__curY + 7) + 'px) scale(2.4)'; r.style.opacity = '0'; });
                setTimeout(() => { try { r.remove(); } catch (e) { } }, 420);
            } catch (e) { }
        };
        const removeCursor = () => { try { if (__curEl) __curEl.remove(); } catch (e) { } __curEl = null; };
        // Biggest on-screen canvas + its viewport rect (for world→viewport cursor targeting).
        // The VISIBLE gene-graph canvas: largest by ON-SCREEN DISPLAY area (getBoundingClientRect),
        // not internal resolution — so an off-screen/buffer canvas can't be picked and its rect
        // (top = below the header + buttonMenuPanel) is the coordinate reference for playback.
        const biggestCanvas = () => {
            let best = null, area = -1;
            try {
                const vh = window.innerHeight || 1e9, vw = window.innerWidth || 1e9;
                for (const c of document.querySelectorAll('canvas')) {
                    const r = c.getBoundingClientRect();
                    if (!r || r.width <= 1 || r.height <= 1) continue;
                    if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;   // off-screen
                    const a = r.width * r.height;
                    if (a > area) { area = a; best = c; }
                }
                if (!best) { for (const c of document.querySelectorAll('canvas')) { const a = c.width * c.height; if (a > area) { area = a; best = c; } } }
            } catch (e) { }
            return best;
        };
        // World (track) coords → viewport pixels, for pointing the cursor at a feature.
        const worldToViewport = (track, worldXi, worldY) => {
            try {
                const cv = biggestCanvas(); if (!cv) return null;
                const rect = cv.getBoundingClientRect();
                const g = graph.graph; if (!g || !track || !track.tgraph) return null;
                const cx = g.X(track.tgraph.X(worldXi));
                const cy = g.Y(track.tgraph.Y(worldY != null ? worldY : 0));
                const sxk = rect.width / (cv.width || rect.width), syk = rect.height / (cv.height || rect.height);
                return { x: rect.left + cx * sxk, y: rect.top + cy * syk };
            } catch (e) { return null; }
        };
        // Viewport position of one of the gene's on-canvas control buttons (e.g. 'lasso'),
        // via graph._ctrlPos(id) → canvas pixels → viewport.
        const ctrlButtonViewport = (id) => {
            try {
                if (typeof graph._ctrlPos !== 'function') return null;
                const p = graph._ctrlPos(id); if (!p) return null;
                const cv = biggestCanvas(); if (!cv) return null;
                const rect = cv.getBoundingClientRect();
                const sxk = rect.width / (cv.width || rect.width), syk = rect.height / (cv.height || rect.height);
                return { x: rect.left + p.cx * sxk, y: rect.top + p.cy * syk };
            } catch (e) { return null; }
        };
        // Viewport position of item #index in a canvas side-menu (graph.showSideMenu). Mirrors the
        // menu layout in gene.js showSideMenu (centered; columns of 10; itemHeight 35; columnWidth
        // from the longest 18px-Arial label) so the demo cursor can land on a real menu item.
        const sideMenuItemViewport = (items, index) => {
            try {
                const cv = biggestCanvas(); if (!cv) return null;
                const rect = cv.getBoundingClientRect();
                const g = graph.graph;
                const gridW = (g && g.grid && g.grid.width) || cv.width;
                const gridH = (g && g.grid && g.grid.height) || cv.height;
                const itemHeight = 35, gap = 20, maxPerColumn = 10;
                const count = items.length;
                const cols = Math.ceil(count / maxPerColumn);
                let maxLabelWidth = 0;
                try { const tc = document.createElement('canvas').getContext('2d'); tc.font = '18px Arial'; for (const it of items) maxLabelWidth = Math.max(maxLabelWidth, tc.measureText('' + (it.label || it)).width); } catch (e) { }
                const maxTotal = Math.max(200, gridW - 24);
                const perColFit = Math.floor((maxTotal - gap * (cols - 1)) / cols);
                const columnWidth = Math.max(120, Math.min(500, Math.ceil(maxLabelWidth) + 40, perColFit));
                const menuWidth = columnWidth * cols + gap * (cols - 1);
                const rows = Math.min(count, maxPerColumn);
                const menuHeight = rows * itemHeight;
                const xpos = (gridW - menuWidth) / 2;
                const ypos = (gridH - menuHeight) / 2;
                const col = Math.floor(index / maxPerColumn), row = index % maxPerColumn;
                const itemCX = xpos + col * (columnWidth + gap) + columnWidth / 2;
                const itemCY = ypos + row * itemHeight + itemHeight / 2;
                const sxk = rect.width / (cv.width || rect.width), syk = rect.height / (cv.height || rect.height);
                return { x: rect.left + itemCX * sxk, y: rect.top + itemCY * syk };
            } catch (e) { return null; }
        };

        // ---- 2c) Scripted lasso -------------------------------------------------------------
        // Build an ellipse loop (viewport pts) enclosing a set of on-screen features.
        const lassoLoopPoints = (track, items) => {
            const pts = items.map((s) => worldToViewport(track, (s.xi != null ? +s.xi : 0), 0)).filter(Boolean);
            if (!pts.length) return null;
            let minx = 1e9, miny = 1e9, maxx = -1e9, maxy = -1e9;
            for (const p of pts) { minx = Math.min(minx, p.x); maxx = Math.max(maxx, p.x); miny = Math.min(miny, p.y); maxy = Math.max(maxy, p.y); }
            const padX = 45, padTop = 75, padBot = 32;   // extra top room for the lollipop heads
            const top = miny - padTop, bot = maxy + padBot;
            const cx = (minx + maxx) / 2, cy = (top + bot) / 2;
            const rx = (maxx - minx) / 2 + padX, ry = (bot - top) / 2;
            const N = 16, loop = [];
            for (let i = 0; i <= N; i++) { const a = -Math.PI / 2 + (i / N) * 2 * Math.PI; loop.push({ x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) }); }
            return loop;
        };
        // Animate the cursor drawing the loop, trailing the app's cyan/dashed lasso outline.
        const drawLassoLoop = async (loop) => {
            let svg = null, path = null;
            try {
                svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.style.cssText = 'position:fixed;inset:0;left:0;top:0;width:100%;height:100%;z-index:2147483500;pointer-events:none;';
                path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                path.setAttribute('fill', 'rgba(53,198,214,0.14)');
                path.setAttribute('stroke', 'rgba(1,28,60,0.9)');
                path.setAttribute('stroke-width', '2');
                path.setAttribute('stroke-dasharray', '5,3');
                svg.appendChild(path); document.body.appendChild(svg);
            } catch (e) { }
            let d = '';
            for (let i = 0; i < loop.length; i++) {
                const p = loop[i];
                await moveCursor(p.x, p.y, i === 0 ? 500 : 140);
                d += (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ' ';
                if (path) path.setAttribute('d', d);
            }
            if (path) path.setAttribute('d', d + 'Z');
            clickPulse();
            await sleep(400);
            try { if (svg) svg.remove(); } catch (e) { }
        };
        // Put a set of snpindels into the selection window (mirrors gene.js lasso mouse-up).
        const selectSnps = (track, items) => {
            try { if (graph.clearSelectionVisuals) graph.clearSelectionVisuals(); } catch (e) { }
            const sel = [];
            for (const s of items) {
                try { s.highlight = true; } catch (e) { }
                sel.push({ kind: 'snp', label: (s.id || s.name || ('snp@' + s.xi)) + (s.clinsig ? ' · ' + s.clinsig : ''), track: track, chr: track.chr, xi: s.xi, xf: (s.xf != null ? s.xf : s.xi), ref: s, clinsig: s.clinsig });
            }
            graph.__lassoSelection = sel;
            graph.__snpSelectionActive = sel.length > 0;
            graph.showDisplay = true;
            try { if (graph.wake) graph.wake(); } catch (e) { }
            return sel.length;
        };
        // Point-in-polygon (viewport coords) — ray cast.
        const pointInPoly = (px, py, poly) => {
            let inside = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
                if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-9) + xi)) inside = !inside;
            }
            return inside;
        };
        // Normalize script "gene graph points" → viewport polygon. Each point is [xBase, yTrack]
        // or {x, y} in TRACK-LOCAL gene-graph coords (x = base index, y = track y; default 0).
        const pointsToViewport = (track, pts) => {
            if (!Array.isArray(pts)) return null;
            const out = [];
            for (const p of pts) {
                const px = Array.isArray(p) ? p[0] : (p && p.x != null ? p.x : null);
                const py = Array.isArray(p) ? (p[1] != null ? p[1] : 0) : (p && p.y != null ? p.y : 0);
                if (px == null) continue;
                const v = worldToViewport(track, +px, +py);
                if (v) out.push(v);
            }
            return out.length >= 3 ? out : null;
        };

        // Dispatch a REAL DOM input event on the gene-graph canvas at canvas-fraction coords
        // (fx,fy ∈ 0..1). Replays recorded actions: the app listens to mousedown/mousemove/
        // mouseup/wheel with clientX/clientY, so synthetic events drive selection, menus, pan & zoom.
        // Client (screen) coords for a canvas event. Prefer WORLD coords (wx,wy) — map them
        // through the grid to the current canvas so replay lands on the same GRAPH location
        // regardless of viewport size; fall back to the recorded canvas-fraction (fx,fy).
        const canvasClient = (fx, fy, wx, wy) => {
            try {
                const cv = biggestCanvas(); if (!cv) return null;
                const rect = cv.getBoundingClientRect();
                const g = graph && graph.graph;
                if (wx != null && wy != null && g && typeof g.X === 'function' && typeof g.Y === 'function') {
                    const sx = g.X(+wx), sy = g.Y(+wy);
                    if (isFinite(sx) && isFinite(sy)) {
                        return { cx: rect.left + sx * (rect.width / (cv.width || rect.width)), cy: rect.top + sy * (rect.height / (cv.height || rect.height)) };
                    }
                }
                return { cx: rect.left + (+fx) * rect.width, cy: rect.top + (+fy) * rect.height };
            } catch (e) { return null; }
        };
        const dispatchCanvasEvent = (type, fx, fy, extra, wx, wy) => {
            try {
                const cv = biggestCanvas(); if (!cv) return null;
                const pt = canvasClient(fx, fy, wx, wy); if (!pt) return null;
                const cx = pt.cx, cy = pt.cy;
                const base = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, screenX: cx, screenY: cy };
                const fire = (name, opts) => {
                    try { cv.dispatchEvent(new MouseEvent(name, Object.assign({}, base, opts))); } catch (e) { }
                    try { if (typeof PointerEvent === 'function' && /^pointer/.test(name)) cv.dispatchEvent(new PointerEvent(name, Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, base, opts))); } catch (e) { }
                };
                if (type === 'wheel') { try { cv.dispatchEvent(new WheelEvent('wheel', Object.assign({ deltaY: +extra || 0, deltaMode: 0 }, base))); } catch (e) { } return { cx, cy }; }
                if (type === 'down') { fire('pointerdown', { button: 0, buttons: 1 }); fire('mousedown', { button: 0, buttons: 1 }); return { cx, cy }; }
                if (type === 'up') { fire('pointerup', { button: 0, buttons: 0 }); fire('mouseup', { button: 0, buttons: 0 }); fire('click', { button: 0, buttons: 0 }); return { cx, cy }; }
                if (type === 'move') { fire('pointermove', { buttons: +extra ? 1 : 0 }); fire('mousemove', { buttons: +extra ? 1 : 0 }); return { cx, cy }; }
                return { cx, cy };
            } catch (e) { return null; }
        };

        // Fire a canvas mouse event at ABSOLUTE screen (client) coordinates cx,cy. This is the
        // single path used by everything now that record/playback are all in screen coordinates.
        const fireCanvas = (type, cx, cy, extra) => {
            try {
                const cv = biggestCanvas(); if (!cv) return;
                const base = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, screenX: cx, screenY: cy };
                const fire = (name, opts) => {
                    try { cv.dispatchEvent(new MouseEvent(name, Object.assign({}, base, opts))); } catch (e) { }
                    try { if (typeof PointerEvent === 'function' && /^pointer/.test(name)) cv.dispatchEvent(new PointerEvent(name, Object.assign({ pointerId: 1, pointerType: 'mouse', isPrimary: true }, base, opts))); } catch (e) { }
                };
                if (type === 'wheel') { try { cv.dispatchEvent(new WheelEvent('wheel', Object.assign({ deltaY: +extra || 0, deltaMode: 0 }, base))); } catch (e) { } return; }
                if (type === 'down') { fire('pointerdown', { button: 0, buttons: 1 }); fire('mousedown', { button: 0, buttons: 1 }); return; }
                if (type === 'up') { fire('pointerup', { button: 0, buttons: 0 }); fire('mouseup', { button: 0, buttons: 0 }); fire('click', { button: 0, buttons: 0 }); return; }
                if (type === 'move') { fire('pointermove', { buttons: +extra ? 1 : 0 }); fire('mousemove', { buttons: +extra ? 1 : 0 }); return; }
            } catch (e) { }
        };
        // Recorded screen point (viewport fraction sx,sy → client px). Legacy recordings used a
        // canvas fraction (fx,fy) + world coords — map those through the canvas rect as a fallback.
        // Recorded coordinates are a fraction of the ENTIRE window (clientX/innerWidth,
        // clientY/innerHeight) — the header above the top buttons is part of that window — so
        // playback maps them straight back onto the full window: sx*innerWidth, sy*innerHeight.
        const screenClient = (c, loc) => {
            const iw = window.innerWidth || 1, ih = window.innerHeight || 1;
            const sx = (c && c.sx != null) ? +c.sx : (loc && loc.wx != null ? +loc.wx : null);
            const sy = (c && c.sy != null) ? +c.sy : (loc && loc.wy != null ? +loc.wy : null);
            if (sx != null && isFinite(sx) && sy != null && isFinite(sy)) return { cx: sx * iw, cy: sy * ih };
            // Legacy canvas-fraction fallback (old recordings only).
            const fx = c ? +(c.fx != null ? c.fx : NaN) : NaN, fy = c ? +(c.fy != null ? c.fy : NaN) : NaN;
            if (isFinite(fx) && isFinite(fy) && fx >= -1.5 && fx <= 1.5 && fy >= -1.5 && fy <= 1.5) {
                const pt = canvasClient(fx, fy, (c && c.wx != null) ? +c.wx : null, (c && c.wy != null) ? +c.wy : null);
                if (pt) return pt;
            }
            return null;
        };

        // Resolve a recorded DOM locator {by:'id'|'text'|'path', v, tag?, path?} back to a live
        // element. Text match prefers the SMALLEST visible element with that exact text (the actual
        // button/label, not an outer container that merely contains the text).
        const visibleArea = (el) => { try { const r = el.getBoundingClientRect(); return (r.width <= 0 || r.height <= 0) ? -1 : r.width * r.height; } catch (e) { return -1; } };
        const smallestMatch = (sel, test) => {
            let best = null, bestArea = Infinity;
            try {
                for (const el of document.querySelectorAll(sel)) {
                    if (!test(el)) continue;
                    const a = visibleArea(el); if (a < 0) continue;
                    if (a < bestArea) { bestArea = a; best = el; }
                }
            } catch (e) { }
            return best;
        };
        const resolveLocator = (loc) => {
            if (!loc) return null;
            try {
                if (loc.by === 'id' && loc.v) { const el = document.getElementById(loc.v); if (el) return el; }
                if (loc.by === 'path' && loc.v) { try { const el = document.querySelector(loc.v); if (el && visibleArea(el) > 0) return el; } catch (e) { } }
                if (loc.by === 'label' && loc.v) {
                    const el = smallestMatch(loc.tag || '[aria-label],[title],[name],[placeholder],[data-rec]', (e) => {
                        const a = ('' + (e.getAttribute('data-rec') || e.getAttribute('aria-label') || e.getAttribute('title') || e.getAttribute('name') || e.getAttribute('placeholder') || '')).trim();
                        return a === loc.v;
                    });
                    if (el) return el;
                }
                if (loc.by === 'text' && loc.v) {
                    const el = smallestMatch(loc.tag || '*', (e) => ('' + (e.innerText || e.textContent || '')).trim().replace(/\s+/g, ' ') === loc.v);
                    if (el) return el;
                }
                // Structural path as a secondary attempt regardless of primary strategy.
                if (loc.path) { try { const el = document.querySelector(loc.path); if (el && visibleArea(el) > 0) return el; } catch (e) { } }
                // Last resort: whatever element sits at the recorded screen point.
                if (loc.wx != null && loc.wy != null) {
                    try {
                        const px = loc.wx * (window.innerWidth || 1), py = loc.wy * (window.innerHeight || 1);
                        const el = document.elementFromPoint(px, py);
                        if (el) return el;
                    } catch (e) { }
                }
            } catch (e) { }
            return null;
        };

        // Given a resolved element (often a wrapper/card), find the actual editable field inside /
        // around it — search descendants, the recorded screen point, then ancestors.
        const isEditable = (n) => { try { if (!n || n.nodeType !== 1) return false; const t = n.tagName.toLowerCase(); return t === 'input' || t === 'textarea' || (n.getAttribute && n.getAttribute('contenteditable') === 'true'); } catch (e) { return false; } };
        const findEditable = (el, loc) => {
            if (isEditable(el)) return el;
            try { const inner = el && el.querySelector && el.querySelector('input,textarea,[contenteditable="true"]'); if (inner) return inner; } catch (e) { }
            try {
                if (loc && loc.wx != null) {
                    const px = loc.wx * (window.innerWidth || 1), py = loc.wy * (window.innerHeight || 1);
                    let n = document.elementFromPoint(px, py);
                    for (let i = 0; i < 4 && n; i++) { if (isEditable(n)) return n; const inner = n.querySelector && n.querySelector('input,textarea,[contenteditable="true"]'); if (inner) return inner; n = n.parentElement; }
                }
            } catch (e) { }
            try { let n = el; for (let i = 0; i < 4 && n; i++) { if (isEditable(n)) return n; n = n.parentElement; } } catch (e) { }
            return el;
        };
        // Set an input/textarea value through the NATIVE setter so framework-patched value
        // properties (Angular/React) still see and render the change.
        const setNativeValue = (el, value) => {
            try {
                const proto = (typeof HTMLTextAreaElement !== 'undefined' && el instanceof HTMLTextAreaElement) ? HTMLTextAreaElement.prototype
                    : (typeof HTMLInputElement !== 'undefined' && el instanceof HTMLInputElement) ? HTMLInputElement.prototype : null;
                const desc = proto && Object.getOwnPropertyDescriptor(proto, 'value');
                if (desc && desc.set) { desc.set.call(el, value); return true; }
            } catch (e) { }
            try { el.value = value; return true; } catch (e) { }
            return false;
        };

        // ---- 3) Normalize the script into an array of command objects -----------------------
        const parseLine = (line) => {
            const parts = ('' + line).trim().split(/\s+/);
            const cmd = (parts.shift() || '').toLowerCase();
            return { cmd, args: parts, raw: ('' + line).trim() };
        };
        async function normalizeScript(s) {
            if (s == null) return [];
            if (Array.isArray(s)) return s;
            if (typeof s === 'object' && Array.isArray(s.script)) return s.script;
            let text = ('' + s).trim();
            // URL / path → fetch its text.
            if (/^https?:\/\//i.test(text) || /\.(json|demo|txt)$/i.test(text)) {
                try { if (typeof GETXT === 'function') text = await GETXT(text); } catch (e) { }
            }
            // JSON array/object?
            try { const j = JSON.parse(text); return Array.isArray(j) ? j : (Array.isArray(j.script) ? j.script : []); } catch (e) { }
            // Line format.
            return text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map(parseLine);
        }

        // ---- 4) Command interpreter ---------------------------------------------------------
        async function runCommand(c) {
            if (typeof c === 'string') c = parseLine(c);
            const cmd = ('' + (c.cmd || '')).toLowerCase();
            const a = c.args || [];
            switch (cmd) {
                case 'setstate': case 'state': {
                    // Restore the full gene-graph JSON state (captured by the recorder via getState)
                    // as the starting point, BEFORE the recorded actions run. Clear the live tracks
                    // first so setState replaces rather than appends.
                    const st = (c.state != null) ? c.state : c.value;
                    if (st == null) break;
                    let obj = null;
                    try { obj = (typeof st === 'string') ? JSON.parse(st) : st; } catch (e) { try { console.warn('demo setstate: bad JSON', e); } catch (e2) { } break; }
                    try { if (graph.clearTracks) graph.clearTracks(); } catch (e) { }
                    try { if (graph.setState) await graph.setState(obj); } catch (e) { try { console.warn('demo setstate failed', e); } catch (e2) { } }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    await sleep(200);
                    break;
                }
                case 'load': case 'add': case 'transcript': case 'gene': {
                    const id = ('' + (c.value != null ? c.value : (c.id != null ? c.id : a.join(' ')))).trim();
                    if (!id) break;
                    // Skip an internal UUID/track-id that was mistakenly recorded as a load — it isn't
                    // a transcript and would fail (older recorded scripts may contain one).
                    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) { say('Skipping non-transcript id ' + id); break; }
                    // Close the New-track window FIRST — put the editor canvas back in the mainPanel,
                    // exactly like the real "Load" button's showEditorCanvas() — and dismiss any center
                    // menu, THEN load. Order matters: graph.add creates the track and frames the view,
                    // which needs a mounted canvas; loading while the dialog still owns the mainPanel
                    // leaves the canvas absent and the load/frame fails.
                    try { graph.menu = null; if (graph.graph) graph.graph.menu = null; } catch (e) { }
                    try {
                        if (typeof CurrentLayout !== 'undefined' && CurrentLayout) {
                            const __gpl = graph.genegraph_panel_layout || genegraph_panel_layout;
                            if (__gpl) { try { CurrentLayout.clearComponent('mainPanel'); } catch (e) { } try { CurrentLayout.setComponent('mainPanel', __gpl); } catch (e) { } }
                            else if (CurrentLayout.reset) { CurrentLayout.reset('mainPanel'); }
                        }
                    } catch (e) { }
                    await sleep(250);   // let the canvas mount (matches the real flow's setTimeout)
                    say('Loading ' + id + ' …');
                    await graph.add(id, 10, 10);
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    break;
                }
                case 'sequence': case 'seq': {
                    const seq = ('' + (c.sequence || c.value || a.join(''))).toUpperCase().replace(/[^ACGTUN]/g, '');
                    if (!seq) break;
                    const name = c.name || 'sequence';
                    const t = new Track(name, 0, seq.length, 1, 1); t.sequence = seq; graph.addTrack(t);
                    say('Added sequence "' + name + '" (' + seq.length + ' nt)');
                    break;
                }
                case 'zoom': {
                    const ti = (c.track != null ? +c.track : (a[0] != null && a[0] !== '' ? +a[0] : lastTrack()));
                    const t = trackAt(ti);
                    const from = (c.from != null ? +c.from : (a[1] != null ? +a[1] : null));
                    const to = (c.to != null ? +c.to : (a[2] != null ? +a[2] : null));
                    if (from != null && to != null) zoomRegion(t, from, to);
                    else { const len = (t && t.sequence ? t.sequence.length : 1000); zoomRegion(t, -len * 0.2, len * 1.2); }
                    break;
                }
                case 'variants': case 'clinvar': {
                    const sig = ('' + (c.significance || c.sig || a[0] || 'pathogenic')).toLowerCase();
                    const ti = (c.track != null ? +c.track : (a[1] != null ? +a[1] : lastTrack()));
                    const t = trackAt(ti); if (!t) { say('variants: no track'); break; }
                    say('Loading ' + sig + ' ClinVar variants …');
                    await exec('baja/manchester/menu/points-of-interest.js', graph, genegraph_panel_layout, t, sig);
                    break;
                }
                case 'tour': {
                    const ti = (c.track != null ? +c.track : (a[0] != null && a[0] !== '' ? +a[0] : lastTrack()));
                    const dwell = +(c.dwell || a[1] || 3000);
                    const t = trackAt(ti); if (!t) break;
                    const snps = (t.snpindels || []).slice().sort((x, y) => (x.xi || 0) - (y.xi || 0));
                    // Half-window (bases) — tight enough that the base sequence is visible (zoomed in).
                    const w = +(c.window || a[2] || 22);
                    // ALWAYS show the cursor going over to a "Tour…" menu item and clicking it before the
                    // tour begins. Prefer the "Tour…" item in an already-open side menu (e.g. the one shown
                    // after loading variants); if none is open, pop a small prop menu that contains it.
                    try {
                        ensureCursor();
                        let __list = (graph.side_menu && Array.isArray(graph.side_menu.list)) ? graph.side_menu.list : null;
                        let __idx = __list ? __list.findIndex((it) => it && /tour/i.test('' + (it.label || it.name || ''))) : -1;
                        if (!__list || __idx < 0) {
                            const __menu = [
                                { label: 'Tour…', move: () => { }, click: () => { } },
                                { label: 'Go to…', move: () => { }, click: () => { } },
                            ];
                            graph.showSideMenu(__menu); await sleep(650);
                            __list = __menu; __idx = 0;
                        }
                        say('Clicking "Tour…"…');
                        // Land on the real menu-item position; if it can't be computed, aim near canvas center.
                        let __ip = sideMenuItemViewport(__list, __idx);
                        if (!__ip) {
                            try { const cv = biggestCanvas(); const r = cv && cv.getBoundingClientRect(); if (r) __ip = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } catch (e) { }
                        }
                        if (__ip) { await moveCursor(__ip.x, __ip.y, 850); await sleep(120); clickPulse(); await sleep(450); }
                        try { graph.showSideMenu(null); } catch (e) { }
                    } catch (e) { }

                    // Stop the tour if the user clicks anywhere on the canvas.
                    let __tourStopped = false;
                    const __tcv = biggestCanvas();
                    const __onCanvasDown = () => { __tourStopped = true; };
                    try { if (__tcv) __tcv.addEventListener('pointerdown', __onCanvasDown); } catch (e) { }

                    say('Touring ' + snps.length + ' mutation(s)…');
                    for (const s of snps) {
                        if (__tourStopped) break;
                        // Select the mutation (grays out the rest, shows its annotation)…
                        // Hold the focus for the WHOLE tour (a huge ms) so focus-mutation's auto-expire
                        // timer never fires mid-tour. If it expired at `dwell` — exactly when we advance —
                        // the spotlight would drop for a frame and flash the whole cluster bright. Instead
                        // the next snp's focus-mutation instantly REPLACES this one: a clean, instant jump.
                        try { await exec('baja/manchester/menu/focus-mutation.js', graph, s, 3600000); } catch (e) { }
                        // …then ZOOM IN, centered on the mutation, tight enough to read the bases.
                        try {
                            const xi = (s.xi != null ? +s.xi : 0);
                            const xf = (s.xf != null ? +s.xf : xi + 1);
                            const mid = (xi + xf) / 2;
                            zoomRegion(t, mid - w, mid + w);
                        } catch (e) { }
                        try { if (graph.wake) graph.wake(); } catch (e) { }
                        // Dwell, but bail out promptly if the canvas was clicked.
                        for (let waited = 0; waited < dwell && !__tourStopped; waited += 100) await sleep(100);
                    }
                    try { if (__tcv) __tcv.removeEventListener('pointerdown', __onCanvasDown); } catch (e) { }
                    if (__tourStopped) {
                        try { graph.__focusSnp = null; graph.__focusUntil = 0; if (graph.wake) graph.wake(); } catch (e) { }
                        say('Tour stopped.');
                    } else {
                        // Leave the LAST mutation spotlighted, then release it gently a few seconds later
                        // (one soft un-dim, well after the tour ended — never a mid-tour flash).
                        try {
                            graph.__focusUntil = Date.now() + 6000;
                            if (graph.__focusTimer) { try { clearTimeout(graph.__focusTimer); } catch (e) { } }
                            graph.__focusTimer = setTimeout(function () { try { graph.__focusSnp = null; graph.__focusUntil = 0; if (graph.wake) graph.wake(); } catch (e) { } }, 6000);
                        } catch (e) { }
                        say('Tour complete.');
                    }
                    break;
                }
                case 'exec': {
                    const mod = c.module || a[0]; if (!mod) break;
                    const extra = c.execArgs || (c.module ? (c.args || []) : a.slice(1));
                    await exec(mod, graph, genegraph_panel_layout, ...(extra || []));
                    break;
                }
                case 'cursor': case 'point': {
                    // cursor <x> <y> [ms]   move the demo pointer to viewport pixels
                    // cursor click          pulse a click ring at the pointer
                    // cursor track <i> [ms] point at the start of a track
                    if (('' + (a[0] || c.action || '')).toLowerCase() === 'click' || c.click) { clickPulse(); break; }
                    if (('' + (a[0] || '')).toLowerCase() === 'track' || c.track != null) {
                        const ti = (c.track != null ? +c.track : +a[1]);
                        const t = trackAt(ti);
                        const pos = t ? worldToViewport(t, (t.tgraph ? t.tgraph.xi : 0) + 5, 0) : null;
                        if (pos) await moveCursor(pos.x, pos.y, +(c.ms || a[2] || 700));
                        break;
                    }
                    const x = (c.x != null ? +c.x : +a[0]);
                    const y = (c.y != null ? +c.y : +a[1]);
                    if (isFinite(x) && isFinite(y)) await moveCursor(x, y, +(c.ms || a[2] || 700));
                    break;
                }
                case 'lasso': {
                    // lasso [track] [from] [to]                    auto-loop around mutations (range)
                    // { cmd:'lasso', track, points:[[base,y],…] }  explicit gene-graph lasso polygon
                    // With explicit points, the loop is drawn through them and the mutations that
                    // fall INSIDE the polygon are selected.
                    const ti = (c.track != null ? +c.track : (a[0] != null && a[0] !== '' ? +a[0] : lastTrack()));
                    const t = trackAt(ti); if (!t) { say('lasso: no track'); break; }
                    // Explicit gene-graph points → viewport polygon (track-local coords).
                    const poly = pointsToViewport(t, c.points || c.poly);
                    let items;
                    if (poly) {
                        items = (t.snpindels || []).filter((s) => {
                            const vp = worldToViewport(t, (s.xi != null ? +s.xi : 0), 0);
                            return vp && pointInPoly(vp.x, vp.y, poly);
                        });
                    } else {
                        const from = (c.from != null ? +c.from : (a[1] != null ? +a[1] : null));
                        const to = (c.to != null ? +c.to : (a[2] != null ? +a[2] : null));
                        items = (t.snpindels || []).slice();
                        if (from != null && to != null) {
                            const lo = Math.min(from, to), hi = Math.max(from, to);
                            items = items.filter((s) => { const x = (s.xi != null ? +s.xi : 0); return x >= lo && x <= hi; });
                        }
                    }
                    // Glide the cursor onto the REAL lasso button in the canvas control row
                    // (top-centre) and click it, then draw the loop.
                    say('Clicking the lasso tool…');
                    try {
                        const bp = ctrlButtonViewport('lasso');
                        if (bp) { await moveCursor(bp.x, bp.y, 800); clickPulse(); await sleep(450); }
                    } catch (e) { }
                    // Draw the loop: explicit polygon (closed) if given, else auto-enclose the items.
                    const loop = poly ? poly.concat([poly[0]]) : lassoLoopPoints(t, items);
                    say('Lasso-selecting ' + items.length + ' mutation(s)…');
                    if (loop) await drawLassoLoop(loop);
                    const n = selectSnps(t, items);
                    say('Selected ' + n + ' mutation(s).');
                    break;
                }
                case 'camera': {
                    // camera <x0> <x1> <y0> <y1> [ms]  — restore an exact grid-space view (as recorded).
                    const x0 = +(c.x0 != null ? c.x0 : a[0]), x1 = +(c.x1 != null ? c.x1 : a[1]);
                    const y0 = +(c.y0 != null ? c.y0 : a[2]), y1 = +(c.y1 != null ? c.y1 : a[3]);
                    const ms = +(c.ms != null ? c.ms : (a[4] != null ? a[4] : 300));
                    if ([x0, x1, y0, y1].every(isFinite)) {
                        try { graph.animating = false; if (graph.zoomRect) graph.zoomRect(x0, x1, y0, y1, ms); } catch (e) { }
                        try { if (graph.wake) graph.wake(); } catch (e) { }
                    }
                    break;
                }
                case 'tap': {
                    // tap <fx> <fy>   — a full click (down+up) at canvas-fraction coords (0..1).
                    const fx = +(c.fx != null ? c.fx : a[0]);
                    const fy = +(c.fy != null ? c.fy : a[1]);
                    if (!isFinite(fx) || !isFinite(fy)) break;
                    const cv = biggestCanvas();
                    if (cv) { const r = cv.getBoundingClientRect(); await moveCursor(r.left + fx * r.width, r.top + fy * r.height, +(c.ms || 240)); }
                    clickPulse();
                    dispatchCanvasEvent('down', fx, fy, 0);
                    await sleep(70);
                    dispatchCanvasEvent('up', fx, fy, 0);
                    break;
                }
                case 'event': case 'ev': {
                    // A raw canvas input event, replayed at the recorded SCREEN point.
                    const type = ('' + (c.type || a[0] || 'move')).toLowerCase();
                    const extra = (c.extra != null ? c.extra : a[3]);
                    const pt = screenClient(c, null);
                    if (!pt) break;
                    const cx = pt.cx, cy = pt.cy;
                    // Coalesce a duplicate release (a single tap once logged as two identical 'up's):
                    // skip an 'up' at the same screen point as the previous 'up'.
                    const __le = graph.__replayLastEv;
                    if (type === 'up' && __le && __le.type === 'up' && Math.abs(__le.x - cx) < 0.5 && Math.abs(__le.y - cy) < 0.5) { break; }
                    await moveCursor(cx, cy, +(c.ms || 150));
                    if (type === 'down') clickPulse();
                    fireCanvas(type, cx, cy, extra);
                    try { graph.__replayLastEv = { type: type, x: cx, y: cy }; } catch (e) { }
                    break;
                }
                case 'domclick': case 'dom': case 'click': case 'domdown': case 'domup': {
                    // Reproduce a DOM interaction by locator at the recorded screen point. A recorded
                    // press/release is replayed as its own phase: `domdown` fires down, `domup` fires
                    // up + click. Legacy `domclick` fires the whole down+up+click.
                    const __phase = (cmd === 'domdown') ? 'down' : (cmd === 'domup') ? 'up' : 'both';
                    // Click a top-level toolbar / dialog element (outside the canvas) by locator.
                    const loc = c.locator || c.loc || (c.by ? { by: c.by, v: c.v, tag: c.tag, path: c.path } : null);
                    // Poll for the target — a DOM overlay/menu opened by the PREVIOUS step may still be
                    // rendering, so a single resolve can miss (the intermittent "some clicks don't work").
                    let el = resolveLocator(loc);
                    for (let tries = 0; !el && tries < 30; tries++) { await sleep(80); el = resolveLocator(loc); }
                    // The recorded SCREEN point (viewport fraction → client px).
                    const spt = screenClient(c, loc);
                    if (!el && spt) { try { el = document.elementFromPoint(spt.cx, spt.cy); } catch (e) { } }
                    if (!el) { try { console.warn('demo click: element not found', loc); } catch (e) { } break; }
                    try { if (el.scrollIntoView) el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (e) { }
                    // Cursor + click at the recorded screen point (fall back to the element centre if
                    // the recording had no point). One screen-coordinate model for everything.
                    let cx, cy;
                    if (spt) { cx = spt.cx; cy = spt.cy; }
                    else { const r = el.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
                    await moveCursor(cx, cy, +(c.ms || 420));
                    clickPulse();
                    // If the point lands on the gene-graph canvas (or its container), it must be
                    // dispatched as a canvas mouse event on the canvas element — a click on a wrapper
                    // <div> would never reach the graph's handlers.
                    const __cv = biggestCanvas();
                    const __onCanvas = __cv && el && (el === __cv || (el.contains && el.contains(__cv)) || (__cv.contains && __cv.contains(el)));
                    if (__onCanvas) {
                        if (__phase !== 'up') fireCanvas('down', cx, cy);
                        if (__phase === 'both') await sleep(45);
                        if (__phase !== 'down') fireCanvas('up', cx, cy);
                        break;
                    }
                    const base = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, screenX: cx, screenY: cy, button: 0 };
                    if (__phase !== 'up') {
                        try { el.dispatchEvent(new MouseEvent('pointerdown', base)); } catch (e) { }
                        try { el.dispatchEvent(new MouseEvent('mousedown', base)); } catch (e) { }
                    }
                    if (__phase === 'both') await sleep(45);
                    if (__phase !== 'down') {
                        try { el.dispatchEvent(new MouseEvent('pointerup', base)); } catch (e) { }
                        try { el.dispatchEvent(new MouseEvent('mouseup', base)); } catch (e) { }
                        try { el.dispatchEvent(new MouseEvent('click', base)); } catch (e) { }
                    }
                    break;
                }
                case 'set': case 'domset': case 'type': {
                    // Type a value into an input/textarea/contenteditable one character at a time,
                    // firing keydown/keypress/input/keyup per char so fields that react to each
                    // keystroke (autocomplete, search) respond — then a final change.
                    const loc = c.locator || c.loc || (c.by ? { by: c.by, v: c.v, tag: c.tag, path: c.path } : null);
                    let el = resolveLocator(loc);
                    const val = '' + (c.value != null ? c.value : (c.val != null ? c.val : ''));
                    if (!el) { say('set: element not found (' + JSON.stringify(loc) + ')'); break; }
                    el = findEditable(el, loc);   // drill into the real field if a wrapper resolved
                    const r = el.getBoundingClientRect();
                    await moveCursor(r.left + Math.min(30, r.width / 2), r.top + r.height / 2, +(c.ms || 380));
                    try { el.focus(); } catch (e) { }
                    const isInput = ('value' in el) && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
                    try { if (isInput) setNativeValue(el, ''); else el.textContent = ''; } catch (e) { }
                    const cadence = +(c.cadence != null ? c.cadence : 45);
                    let acc = '';
                    for (let i = 0; i < val.length; i++) {
                        const ch = val[i]; acc += ch;
                        const kopts = { bubbles: true, cancelable: true, key: ch };
                        try { el.dispatchEvent(new KeyboardEvent('keydown', kopts)); } catch (e) { }
                        try { el.dispatchEvent(new KeyboardEvent('keypress', kopts)); } catch (e) { }
                        try { if (isInput) setNativeValue(el, acc); else document.execCommand('insertText', false, ch); } catch (e) { try { el.textContent = acc; } catch (e2) { } }
                        try { el.dispatchEvent(typeof InputEvent === 'function' ? new InputEvent('input', { bubbles: true, data: ch, inputType: 'insertText' }) : new Event('input', { bubbles: true })); } catch (e) { try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e2) { } }
                        try { el.dispatchEvent(new KeyboardEvent('keyup', kopts)); } catch (e) { }
                        if (cadence > 0) await sleep(cadence);
                    }
                    try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) { }
                    break;
                }
                case 'key': {
                    // Press a single non-text key (Enter to submit, Tab, Escape, arrows) on a field.
                    const loc = c.locator || c.loc;
                    const el = resolveLocator(loc) || document.activeElement;
                    const key = '' + (c.key || a[0] || ''); if (!key) break;
                    const KC = { Enter: 13, Tab: 9, Escape: 27, Backspace: 8, Delete: 46, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39 };
                    const code = KC[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
                    const kopts = { bubbles: true, cancelable: true, key: key, code: key, keyCode: code, which: code };
                    const tgt = el || document;
                    try { if (el && el.focus) el.focus(); } catch (e) { }
                    try { tgt.dispatchEvent(new KeyboardEvent('keydown', kopts)); } catch (e) { }
                    try { tgt.dispatchEvent(new KeyboardEvent('keypress', kopts)); } catch (e) { }
                    try { tgt.dispatchEvent(new KeyboardEvent('keyup', kopts)); } catch (e) { }
                    break;
                }
                case 'mode': {
                    // Switch the canvas mouse mode (navigate / draw / …) as recorded.
                    const m = ('' + (c.value || a[0] || 'navigate'));
                    try { if (graph.setMouseMode) graph.setMouseMode(m); } catch (e) { }
                    break;
                }
                case 'addtrackjson': {
                    // Re-add a track/layer captured as JSON.
                    const obj = c.json || c.value; if (obj == null) break;
                    try { if (graph.addTrackJSON) await graph.addTrackJSON(typeof obj === 'string' ? JSON.parse(obj) : obj); } catch (e) { say('addtrackjson failed: ' + (e && e.message ? e.message : e)); }
                    break;
                }
                case 'addtrackjsonobjects': {
                    const arr = c.json || c.value; if (arr == null) break;
                    try { if (graph.addTrackJSONObjects) await graph.addTrackJSONObjects(typeof arr === 'string' ? JSON.parse(arr) : arr); } catch (e) { say('addtrackjsonobjects failed: ' + (e && e.message ? e.message : e)); }
                    break;
                }
                case 'menuclick': {
                    // Select an item in the open CENTER (graph.showMenu) or SIDE (graph.showSideMenu)
                    // canvas menu by its label — waits for the menu to appear, then invokes the item.
                    const menuType = (c.menu === 'center') ? 'center' : 'side';
                    const label = ('' + (c.label != null ? c.label : (c.value != null ? c.value : a.join(' ')))).trim();
                    let item = null, list = null, idx = -1;
                    for (let tries = 0; tries < 60 && !item; tries++) {
                        const menuObj = (menuType === 'center') ? graph.menu : graph.side_menu;
                        list = menuObj ? (menuObj.list || menuObj.items || (Array.isArray(menuObj) ? menuObj : null)) : null;
                        if (Array.isArray(list)) {
                            idx = list.findIndex((it) => it && ('' + (it.label || it.name || '')).trim() === label);
                            if (idx >= 0) item = list[idx];
                        }
                        if (!item) await sleep(50);
                    }
                    // Menu item not found: skip quietly (console only) — don't surface a bottom
                    // error-log panel during playback.
                    if (!item) { try { console.warn('demo menuclick: "' + label + '" not found in ' + menuType + ' menu'); } catch (e) { } break; }
                    // Glide the cursor to the item (side menu: exact; center menu: canvas centre) and pulse.
                    try {
                        let vp = (menuType === 'side') ? sideMenuItemViewport(list, idx) : null;
                        if (!vp) { const cv = biggestCanvas(); const r = cv && cv.getBoundingClientRect(); if (r) vp = { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
                        if (vp) { await moveCursor(vp.x, vp.y, +(c.ms || 550)); clickPulse(); await sleep(160); }
                    } catch (e) { }
                    // Close the CENTER menu BEFORE running the item's action (so it always disappears,
                    // and a submenu the action may open via showMenu still shows). Mirrors the real
                    // mouse-up path in gene.js. The side menu manages its own close via the item.
                    if (menuType === 'center') {
                        try { graph.menu = null; } catch (e) { }
                        try { if (graph.graph) graph.graph.menu = null; } catch (e) { }
                        try { if (graph.wake) graph.wake(); } catch (e) { }
                    }
                    try { if (typeof item.click === 'function') item.click(); } catch (e) { try { console.warn('demo menuclick failed:', e); } catch (e2) { } }
                    if (menuType === 'center') { try { if (graph.wake) graph.wake(); } catch (e) { } }
                    break;
                }
                case 'message': case 'msg': case 'say': { say(c.text || c.value || a.join(' ')); break; }
                case 'wait': case 'sleep': { await sleep(c.ms != null ? c.ms : (a[0] || 1000)); break; }
                case 'fit': {
                    try { if (graph.fitYAxis) graph.fitYAxis(); } catch (e) { }
                    try { if (graph.rescale) graph.rescale(); } catch (e) { }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                    break;
                }
                case 'js': case 'eval': {
                    const code = c.code || c.value || c.raw || '';
                    const fn = new Function('graph', 'exec', 'layout', 'Track', 'sleep', 'say',
                        'return (async () => { ' + code + ' })();');
                    await fn(graph, exec, genegraph_panel_layout, Track, sleep, say);
                    break;
                }
                default: say('demo: unknown command "' + cmd + '"');
            }
        }

        // ---- 5) Run the script --------------------------------------------------------------
        const cmds = await normalizeScript(script);
        const gap = (config && config.stepDelayMs != null) ? +config.stepDelayMs : 900;
        graph.__demoScript = cmds;   // exposed for inspection / re-run

        if (!cmds.length) {
            say('demo: no script given. Pass an array of commands, JSON, "cmd arg" lines, or a URL.');
            return graph;
        }

        // Snapshot the current application state so we can return to it when the demo
        // finishes: the track list, each existing track's oligo list, and the camera. The
        // demo typically ADDS tracks/compounds and pans/zooms; restoring these reverses it.
        let __snapTracks = null, __snapOligos = null, __snapCam = null;
        try {
            __snapTracks = (graph.track || []).slice();
            __snapOligos = (graph.track || []).map((t) => (t && t.oligos ? t.oligos.slice() : null));
            const gd = graph.graph && graph.graph.grid;
            if (gd) {
                const gx0 = (typeof gd.getxmin === 'function') ? gd.getxmin() : gd.xmin;
                const gx1 = (typeof gd.getxmax === 'function') ? gd.getxmax() : gd.xmax;
                const gy0 = (typeof gd.getymax === 'function') ? gd.getymax() : gd.ymax;   // top
                const gy1 = (typeof gd.getymin === 'function') ? gd.getymin() : gd.ymin;   // bottom
                if ([gx0, gx1, gy0, gy1].every((v) => typeof v === 'number' && isFinite(v))) __snapCam = { x0: gx0, x1: gx1, y0: gy0, y1: gy1 };
            }
        } catch (e) { }

        say('Demo: running ' + cmds.length + ' step(s)…');
        // Wait for any in-flight zoom/pan animation to finish before the next step runs — a fresh
        // canvas event or a new zoom would otherwise ABORT it (zoomRect/animateTo no-op while
        // graph.animating is true), so animations never complete. Wake the loop each tick so the
        // animation actually renders during otherwise-idle playback. Bounded so it can't hang.
        const settleAnim = async () => {
            for (let i = 0; i < 200 && graph && graph.animating; i++) { try { if (graph.wake) graph.wake(); } catch (e) { } await sleep(25); }
        };

        // Silence the page's bottom message bar / log for the ENTIRE playback — including any
        // messages the app's own actions (graph.add, off-target runs, …) would post. Restored at
        // the end. Status still goes to the browser console via say().
        const __msgSaved = {};
        try {
            for (const __m of ['setMessage', 'setSunsetMessage', 'setCenterMessage']) {
                if (typeof graph[__m] === 'function') { __msgSaved[__m] = graph[__m]; graph[__m] = function () { return graph; }; }
            }
        } catch (e) { }

        try { ensureCursor(); } catch (e) { }   // show the demo pointer
        try { graph.__replayLastEv = null; } catch (e) { }   // reset duplicate-release coalescing state
        for (let i = 0; i < cmds.length; i++) {
            await settleAnim();   // don't let this step interrupt a zoom animation still in flight
            try { await runCommand(cmds[i]); }
            catch (e) { try { console.warn('demo step ' + (i + 1) + ' failed:', e); } catch (e2) { } }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            await settleAnim();   // and let an animation this step kicked off render/finish
            await sleep(gap);
        }
        try { removeCursor(); } catch (e) { }

        // ---- 6) Return to the original state ------------------------------------------------
        // Drop any tracks the demo added, revert the oligo lists on the tracks that existed
        // before, close any demo-opened overlays/menus, and restore the camera.
        try {
            if (__snapTracks) {
                for (let i = 0; i < __snapTracks.length; i++) {
                    const t = __snapTracks[i];
                    if (t && __snapOligos[i]) { try { t.oligos = __snapOligos[i].slice(); } catch (e) { } }
                }
                graph.track = __snapTracks.slice();
                try { if (graph.notifyTrackListener) graph.notifyTrackListener(); } catch (e) { }
            }
            ['baja-ott-report', 'baja-aso-ot-summary', 'baja-clinical-library', 'baja-demos-library',
                'baja-play-panel', 'baja-demo-panel', 'baja-sirna-design', 'dl-editor', 'dl-editor'].forEach((id) => {
                    try { const el = document.getElementById(id); if (el && el.parentNode) el.parentNode.removeChild(el); } catch (e) { }
                });
            try { if (graph.showSideMenu) graph.showSideMenu(null); } catch (e) { }
            try { if (graph.hideMenu) graph.hideMenu(); } catch (e) { }
            try { graph.__lassoSelection = []; graph.showDisplay = false; graph.__selPanelBounds = null; } catch (e) { }
            try { if (__snapCam && graph.zoomRect) { graph.animating = false; graph.zoomRect(__snapCam.x0, __snapCam.x1, __snapCam.y0, __snapCam.y1, 600); } } catch (e) { }
            try { graph.setMouseMode('navigate'); } catch (e) { }
            try { if (graph.wake) graph.wake(); } catch (e) { }
        } catch (e) { }

        // No page message — console only.
        try { console.log('demo: complete — ' + cmds.length + ' step(s); returned to the original state.'); } catch (e) { }
        // Restore the app's message methods that were silenced for playback.
        try { for (const __m in __msgSaved) { if (__msgSaved[__m]) graph[__m] = __msgSaved[__m]; } } catch (e) { }
        return graph;
    })();
}
