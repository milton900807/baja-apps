function (pt, graph) {
    // NAVIGATION BAR for the Analytics workbench.
    //   pt.__nav = await exec('baja/plate/views/navigation-history.js', pt, graph)
    //
    // Camera history: when the view has stayed put for 20 seconds it becomes a place in
    // the history; Back and Forward walk the places (Alt+Left / Alt+Right too), and the
    // Places list jumps to any of them. Bookmarks list every table, chart, timeline and
    // note on the workbench and open the chosen one maximized. Fixed at the bottom
    // right, above the canvas, in the site palette; sized for a finger on a phone.
    return (async () => {
        const DWELL_MS = 20000, TICK_MS = 1000, MAX_HISTORY = 60;
        let AnimateGrid = null;
        try { AnimateGrid = await exec('flexigraph/animate-it.js'); } catch (e) { AnimateGrid = null; }

        try { if (window.__bajaNavPanel && window.__bajaNavPanel.destroy) window.__bajaNavPanel.destroy(); } catch (e) { }

        const nav = { history: [], index: -1, timer: null, dwellStart: 0, lastView: null, destroy: null };
        const view = () => { const g = pt.grid; return { xmin: g.xmin, xmax: g.xmax, ymin: g.ymin, ymax: g.ymax }; };
        const same = (a, b) => {
            if (!a || !b) return false;
            const span = Math.max(1e-9, Math.abs(a.xmax - a.xmin));
            const tol = span * 0.002;
            return Math.abs(a.xmin - b.xmin) < tol && Math.abs(a.xmax - b.xmax) < tol && Math.abs(a.ymin - b.ymin) < tol && Math.abs(a.ymax - b.ymax) < tol;
        };
        const kindOf = (o) => (typeof o.drawPlot === 'function') ? (o.type === 'timeline' ? 'Timeline' : 'Chart') : (o.shape ? 'Note' : 'Table');
        const nameOf = (o) => ('' + (o.name || o.comment || o.text || kindOf(o))).trim().slice(0, 40) || kindOf(o);
        const allObjects = () => [].concat(pt.root || [], pt.m_plots || [], pt.glyphs || []).filter(Boolean);
        const bounds = (o) => { try { return pt.__maxWorldBounds ? pt.__maxWorldBounds(o) : null; } catch (e) { return null; } };
        // What a place shows: the objects in view, by name, for its label.
        const describe = (v) => {
            const seen = [];
            for (const o of allObjects()) {
                const b = bounds(o);
                if (!b) continue;
                if (b.x1 < v.xmin || b.x0 > v.xmax || b.yTop < v.ymin || b.yBot > v.ymax) continue;
                seen.push(nameOf(o));
                if (seen.length === 3) break;
            }
            return seen.length ? seen.join(', ') : 'Empty canvas';
        };
        const time = (t) => { const d = new Date(t); return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0'); };

        const goTo = async (v) => {
            if (!v) return;
            nav.lastView = v; nav.dwellStart = Date.now();
            try {
                if (AnimateGrid) { AnimateGrid.INTERUPT = true; await new AnimateGrid(pt.grid).animateTo(v.xmin, v.xmax, v.ymin, v.ymax, 18); }
                else { pt.grid.xmin = v.xmin; pt.grid.xmax = v.xmax; pt.grid.ymin = v.ymin; pt.grid.ymax = v.ymax; }
            } catch (e) { pt.grid.xmin = v.xmin; pt.grid.xmax = v.xmax; pt.grid.ymin = v.ymin; pt.grid.ymax = v.ymax; }
            try { pt.grid.rescale(); } catch (e) { }
            nav.lastView = view(); nav.dwellStart = Date.now();
        };
        const record = (v, why) => {
            if (nav.index >= 0 && same(nav.history[nav.index].view, v)) return;
            nav.history = nav.history.slice(0, nav.index + 1);
            nav.history.push({ view: v, at: Date.now(), label: describe(v), why: why || 'stayed' });
            if (nav.history.length > MAX_HISTORY) nav.history.shift();
            nav.index = nav.history.length - 1;
            render();
        };
        const back = async () => { if (nav.index > 0) { nav.index--; await goTo(nav.history[nav.index].view); render(); } };
        const forward = async () => { if (nav.index < nav.history.length - 1) { nav.index++; await goTo(nav.history[nav.index].view); render(); } };
        const select = (o) => {
            if (typeof o.drawPlot === 'function') pt.setActive(o);
            else if (o.shape) pt.selectGlyph__(o);
            else pt.setSelected(o);
        };
        const open = (o) => {
            try {
                if (pt.__maximized && pt.__maximized !== o && pt.exitMaximize) pt.exitMaximize();
                select(o);
                pt.maximizeObject(o);
            } catch (e) { console.warn('bookmark', e); }
            closeLists();
        };
        // Zoom over to the object and centre it, for editing it in place on the workbench.
        const goToObject = async (o) => {
            try {
                if (pt.__maximized && pt.exitMaximize) pt.exitMaximize();
                select(o);
                if (typeof o.drawPlot === 'function') await pt.zoomintoplot(o);
                else if (o.shape) {
                    const g = o.grid;
                    if (g) {
                        const w = g.width || 0, h = (typeof o.getHeight === 'function' ? o.getHeight(pt) : g.height) || 0;
                        await pt.zoomto(g.xi + w / 2, g.yi + h / 2, Math.max(w * 1.8, w + 200), Math.max(h * 1.8, h + 200));
                    }
                } else if (pt.zoomToFitTable) await pt.zoomToFitTable(o);   // whole table, cells >= 40 x 10 px
                else await pt.zoomintoplate(o);
            } catch (e) { console.warn('bookmark go to', e); }
            closeLists();
        };
        // Zoom out until everything on the workbench is in view.
        const showAll = async () => {
            try {
                if (pt.__maximized && pt.exitMaximize) pt.exitMaximize();
                if (pt.zoomouttoFit) await pt.zoomouttoFit(); else if (pt.zoomtfit) await pt.zoomtfit();
            } catch (e) { console.warn('bookmark show all', e); }
            closeLists();
        };
        const act = (attr, id, label) => '<button type="button" class="nv-act" ' + attr + '="' + id + '" style="cursor:pointer;border-radius:7px;padding:3px 8px;font:600 11px system-ui;border:1px solid #1aa3bd;background:transparent;color:#0f6e7a;white-space:nowrap;">' + label + '</button>';

        // ---- the bar ------------------------------------------------------------------
        const mobile = (typeof isMobile === 'function') && isMobile();
        const bar = document.createElement('div');
        bar.id = 'baja-nav-panel';
        const H = mobile ? 44 : 34, FS = mobile ? 14 : 12.5;
        bar.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147482000;display:flex;align-items:center;gap:6px;'
            + 'background:rgba(10,37,64,0.96);border:1px solid #1aa3bd;border-radius:12px;padding:5px;'
            + 'box-shadow:0 10px 30px rgba(10,37,64,0.35);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;user-select:none;';
        const B = (id, html, title) => '<button id="' + id + '" type="button" title="' + title + '" style="cursor:pointer;height:' + H + 'px;min-width:' + H + 'px;padding:0 10px;'
            + 'border-radius:8px;border:1px solid transparent;background:transparent;color:#eaf6f9;font:600 ' + FS + 'px system-ui;white-space:nowrap;">' + html + '</button>';
        const IC = (mobile ? 18 : 15);
        const svg = (d) => '<svg width="' + IC + '" height="' + IC + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px;">' + d + '</svg>';
        const ICON_BACK = '<svg width="' + IC + '" height="' + IC + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;"><path d="M15 5l-7 7 7 7"/></svg>';
        const ICON_FWD = '<svg width="' + IC + '" height="' + IC + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;"><path d="M9 5l7 7-7 7"/></svg>';
        // Places: a clock with a history arrow. Bookmarks: a bookmark ribbon.
        const ICON_PLACES = svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>');
        const ICON_MARKS = svg('<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>');
        bar.innerHTML = B('nv-back', ICON_BACK, 'Back (Alt+Left)') + B('nv-fwd', ICON_FWD, 'Forward (Alt+Right)')
            + '<span style="width:1px;height:' + (H - 10) + 'px;background:rgba(255,255,255,0.18);"></span>'
            + B('nv-places', ICON_PLACES + '<span class="nv-lbl">Places</span>', 'Places the camera has stayed at') + B('nv-marks', ICON_MARKS + '<span class="nv-lbl">Bookmarks</span>', 'Open a table, chart, timeline or note maximized')
            // ON A PHONE THE LIST IS THE WHOLE WINDOW. As a 320px dropdown above the badge
            // it showed three rows at a time with the canvas distracting behind it, and the
            // Go to / Maximize buttons beside each name were too small to hit. Full window,
            // it is the way to open anything on the workbench -- which is now the ONLY way
            // to open a table full window, since a tap no longer maximizes one.
            + (mobile
                ? '<div id="nv-list" hidden style="position:fixed;inset:0;width:100vw;height:100dvh;max-height:none;overflow:auto;'
                + 'background:#ffffff;color:#0a2540;border:none;border-radius:0;padding:0 0 env(safe-area-inset-bottom,0px);"></div>'
                : '<div id="nv-list" hidden style="position:absolute;right:0;bottom:' + (H + 14) + 'px;width:min(320px,calc(100vw - 40px));max-height:min(60vh,420px);overflow:auto;'
                + 'background:#ffffff;color:#0a2540;border:1px solid rgba(10,37,64,0.14);border-radius:12px;box-shadow:0 12px 40px rgba(10,37,64,0.35);padding:6px;"></div>');
        document.body.appendChild(bar);
        const $ = (id) => bar.querySelector('#' + id);
        const list = $('nv-list');
        let listMode = null;
        const closeLists = () => { listMode = null; list.hidden = true; render(); };
        const item = (html, extra) => '<div class="nv-item" ' + (extra || '') + ' style="cursor:pointer;padding:' + (mobile ? '11px 10px' : '8px 10px') + ';border-radius:8px;font-size:' + FS + 'px;display:flex;justify-content:space-between;gap:8px;align-items:center;">' + html + '</div>';
        const head = (t) => '<div style="font:600 11px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#6b7a90;padding:8px 10px 4px;">' + t + '</div>';
        const esc = (v) => ('' + (v == null ? '' : v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        // Where the bar lives. On the open canvas: bottom right. While an object is
        // maximized: docked in the navy title bar, just left of its Menu pill, so the
        // navigation sits where the table's own menu is. The lists then open downward.
        const dock = () => {
            const maxed = !!pt.__maximized;
            const docked = bar.dataset.dock === 'top';
            if (maxed) {
                let right = 14, top = 5;
                try {
                    let el = null;
                    try { const c = CurrentLayout.getStashed('graph-canvas'); el = c && c.canvas; if (el && el.nativeElement) el = el.nativeElement; } catch (e) { el = null; }
                    if (!el || !el.getBoundingClientRect) el = document.querySelector('canvas[tabindex]') || document.querySelector('canvas');
                    const r = el ? el.getBoundingClientRect() : null;
                    const m = pt.__maxMenuRect;
                    if (r && m) right = Math.max(8, Math.round(window.innerWidth - (r.left + m.x) + 8));
                    // The title bar is drawn at the top of the CANVAS, which sits below the
                    // application toolbar and the menubar: the dock follows the canvas's page
                    // position, not the page's top edge.
                    if (r) top = Math.round(r.top + 5);
                } catch (e) { }
                const h = mobile ? 34 : 30;
                bar.style.top = top + 'px'; bar.style.bottom = 'auto'; bar.style.right = right + 'px';
                bar.style.padding = '2px'; bar.style.borderRadius = '10px';
                bar.style.background = 'rgba(255,255,255,0.10)'; bar.style.boxShadow = 'none'; bar.style.borderColor = 'rgba(255,255,255,0.25)';
                bar.querySelectorAll('button').forEach((b) => { b.style.height = h + 'px'; b.style.minWidth = h + 'px'; });
                bar.querySelectorAll('.nv-lbl').forEach((l) => { l.style.display = mobile ? 'none' : ''; });
                list.style.bottom = 'auto'; list.style.top = (h + 12) + 'px';
                bar.dataset.dock = 'top';
            } else if (docked || !bar.dataset.dock) {
                bar.style.top = 'auto'; bar.style.bottom = '14px'; bar.style.right = '14px';
                bar.style.padding = '5px'; bar.style.borderRadius = '12px';
                bar.style.background = 'rgba(10,37,64,0.96)'; bar.style.boxShadow = '0 10px 30px rgba(10,37,64,0.35)'; bar.style.borderColor = '#1aa3bd';
                bar.querySelectorAll('button').forEach((b) => { b.style.height = H + 'px'; b.style.minWidth = H + 'px'; });
                bar.querySelectorAll('.nv-lbl').forEach((l) => { l.style.display = ''; });
                list.style.top = 'auto'; list.style.bottom = (H + 14) + 'px';
                bar.dataset.dock = 'bottom';
            }
        };
        // HOW DEEP INSIDE A FOLDER, read off the track that is on the canvas NOW. ptracks is
        // one link long however deep you are (each entry holds the canvas you left), so the
        // count comes from folderDepth where it has one -- the same pair folder-back.js
        // reads, for the same reason.
        const folderLevels = () => {
            try {
                const t = liveTrack() || pt;
                const stack = (t && Array.isArray(t.ptracks)) ? t.ptracks.length : 0;
                return Math.max(stack, (t && Number(t.folderDepth)) || 0);
            } catch (e) { return 0; }
        };

        const render = () => {
            dock();
            // Leaving a maximized object is the title bar's "Exit maximize" pill (and
            // Escape); a second button for it here was redundant.
            const b = $('nv-back'), f = $('nv-fwd');
            const canBack = nav.index > 0, canFwd = nav.index < nav.history.length - 1;
            b.style.opacity = canBack ? '1' : '0.35'; f.style.opacity = canFwd ? '1' : '0.35';
            b.disabled = !canBack; f.disabled = !canFwd;
            for (const id of ['nv-places', 'nv-marks']) {
                const on = (id === 'nv-places' && listMode === 'places') || (id === 'nv-marks' && listMode === 'marks');
                $(id).style.background = on ? '#1aa3bd' : 'transparent';
                $(id).style.borderColor = on ? '#1aa3bd' : 'transparent';
            }
            if (!listMode) return;
            let html = '';
            if (listMode === 'places') {
                html += head('Places (' + nav.history.length + ')');
                if (!nav.history.length) html += '<div style="padding:8px 10px;font-size:12px;color:#6b7a90;">Stay on a view for 20 seconds and it is added here.</div>';
                for (let i = nav.history.length - 1; i >= 0; i--) {
                    const h = nav.history[i];
                    const cur = i === nav.index;
                    html += item('<span style="' + (cur ? 'font-weight:700;color:#0f6e7a;' : '') + '">' + esc(h.label) + '</span><span style="color:#6b7a90;font-size:11px;white-space:nowrap;">' + time(h.at) + '</span>', 'data-place="' + i + '"');
                }
                html += '<div style="display:flex;gap:6px;padding:6px 6px 2px;"><button id="nv-mark-now" type="button" style="cursor:pointer;border-radius:8px;padding:7px 12px;font:600 12px system-ui;border:1px solid #1aa3bd;background:#1aa3bd;color:#fff;">Add this view</button>'
                    + '<button id="nv-clear" type="button" style="cursor:pointer;border-radius:8px;padding:7px 12px;font:600 12px system-ui;border:1px solid #c7d2dd;background:transparent;color:#0a2540;">Clear</button></div>';
            } else {
                // A single-object share lists only the shared object.
                const objs = allObjects().filter(o => !pt.__objectOnlyId || ('' + (o.uid || o.id)) === ('' + pt.__objectOnlyId));
                const groups = [['Tables', 'Table'], ['Charts', 'Chart'], ['Timelines', 'Timeline'], ['Notes', 'Note']];
                let any = false;
                // INSIDE A FOLDER, THE WAY OUT COMES FIRST. The canvas you are looking at is
                // the folder's, so nothing else in this list can take you back up.
                const __lv = folderLevels();
                if (__lv > 0) html += item('<span style="font-weight:600;">\u21B0 Up a folder</span>'
                    + '<span style="color:#6b7a90;font-size:11px;white-space:nowrap;">' + __lv + ' level' + (__lv === 1 ? '' : 's') + ' in</span>', 'data-up="1"');
                if (pt.__maximized && !pt.__objectOnly) html += item('<span style="color:#b42318;">Exit maximize</span>', 'data-exit="1"');
                if (!pt.__objectOnly) html += item('<span style="font-weight:600;">Show all</span><span style="color:#6b7a90;font-size:11px;">zoom out to everything</span>', 'data-all="1"');
                for (const [title, kind] of groups) {
                    const of = objs.filter(o => kindOf(o) === kind);
                    if (!of.length) continue;
                    any = true;
                    html += head(title + ' (' + of.length + ')');
                    of.forEach((o) => {
                        const cur = pt.__maximized === o;
                        const id = esc('' + (o.uid || o.id || ''));
                        // Two ways in: "Go to" zooms over and centres it on the workbench for
                        // editing in place; "Maximize" opens it full-window. The row itself maximizes.
                        html += item('<span style="' + (cur ? 'font-weight:700;color:#0f6e7a;' : '') + '">' + esc(nameOf(o)) + '</span>'
                            + '<span style="display:flex;gap:4px;align-items:center;">' + act('data-goto', id, 'Go to') + (cur ? '<span style="color:#6b7a90;font-size:11px;padding:0 4px;">open</span>' : act('data-max', id, 'Maximize')) + '</span>',
                            'data-obj="' + id + '"');
                    });
                }
                if (!any) html += '<div style="padding:8px 10px;font-size:12px;color:#6b7a90;">Nothing on the workbench yet.</div>';
            }
            // The sheet needs a heading and a way out; the dropdown is closed by tapping off it.
            if (mobile) {
                html = '<div style="position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:10px;'
                    + 'padding:calc(10px + env(safe-area-inset-top,0px)) 12px 10px;background:#0a2540;color:#eaf6f9;">'
                    + '<span style="flex:1;font:700 15px system-ui;">'
                    + (listMode === 'places' ? 'Places' : 'Workbench') + '</span>'
                    + '<button id="nv-close" type="button" style="min-height:40px;padding:0 16px;border-radius:10px;'
                    + 'border:1px solid rgba(255,255,255,0.28);background:transparent;color:#eaf6f9;font:600 14px system-ui;">Close</button>'
                    + '</div><div style="padding:6px;">' + html + '</div>';
            }
            list.innerHTML = html;
            list.hidden = false;
            const cx = list.querySelector('#nv-close'); if (cx) cx.onclick = () => closeLists();
            list.querySelectorAll('.nv-item').forEach((el) => {
                el.onmouseenter = () => { el.style.background = '#e6f6f9'; };
                el.onmouseleave = () => { el.style.background = 'transparent'; };
                el.onclick = async () => {
                    if (el.hasAttribute('data-place')) { nav.index = +el.getAttribute('data-place'); await goTo(nav.history[nav.index].view); closeLists(); }
                    else if (el.hasAttribute('data-up')) {
                        // popFolder on the LIVE track: the one this panel was built with may
                        // have been replaced, and popping a dead track pops nothing.
                        const t = liveTrack() || pt;
                        closeLists();
                        try { if (t && t.__maximized && t.exitMaximize) t.exitMaximize(); } catch (e) { }
                        try { await t.popFolder(); } catch (e) { console.warn('up a folder', e); }
                        try { render(); } catch (e) { }
                    }
                    else if (el.hasAttribute('data-exit')) { try { pt.exitMaximize(); } catch (e) { } closeLists(); }
                    else if (el.hasAttribute('data-all')) { await showAll(); }
                    else if (el.hasAttribute('data-obj')) { const id = el.getAttribute('data-obj'); const o = allObjects().find(x => ('' + (x.uid || x.id || '')) === id); if (o) open(o); }
                };
            });
            const byId = (id) => allObjects().find(x => ('' + (x.uid || x.id || '')) === id);
            list.querySelectorAll('.nv-act').forEach((b) => {
                b.onclick = async (ev) => {
                    ev.stopPropagation();
                    if (b.hasAttribute('data-goto')) { const o = byId(b.getAttribute('data-goto')); if (o) await goToObject(o); }
                    else if (b.hasAttribute('data-max')) { const o = byId(b.getAttribute('data-max')); if (o) open(o); }
                };
            });
            const mk = list.querySelector('#nv-mark-now'); if (mk) mk.onclick = () => { record(view(), 'marked'); listMode = 'places'; render(); };
            const cl = list.querySelector('#nv-clear'); if (cl) cl.onclick = () => { nav.history = []; nav.index = -1; render(); };
        };
        $('nv-back').onclick = back; $('nv-fwd').onclick = forward;
        let __wasMaxed = !!pt.__maximized;
        $('nv-places').onclick = () => { listMode = listMode === 'places' ? null : 'places'; list.hidden = !listMode; render(); };
        $('nv-marks').onclick = () => { listMode = listMode === 'marks' ? null : 'marks'; list.hidden = !listMode; render(); };
        const onDocDown = (e) => { if (listMode && !bar.contains(e.target)) closeLists(); };
        const onKey = (e) => {
            if (!e.altKey) return;
            if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
            else if (e.key === 'ArrowRight') { e.preventDefault(); forward(); }
        };
        document.addEventListener('mousedown', onDocDown, true);
        document.addEventListener('touchstart', onDocDown, true);
        window.addEventListener('keydown', onKey, true);

        // ---- the dwell ticker -------------------------------------------------------------
        nav.lastView = view(); nav.dwellStart = Date.now();
        record(view(), 'start');
        // THE APP IS GONE (see folder-back.js): the bar, its lists and its Alt+Left / Alt+Right
        // key handler are attached to the page, and stayed after the Analytics window closed.
        // A DIFFERENT TRACK: opening or SAVING a file puts a new PlateTrack in the old
        // one's place (see folder-back.js), and this bar's camera, places and object list
        // were all bound to the one it was created with.
        const liveTrack = () => {
            try { const pm = CurrentLayout.getStashed('plate-track'); return (pm && pm.plateTrack) || pt; } catch (e) { return pt; }
        };

        const homePath = location.pathname;
        let sawCanvas = false;
        // Whether the APP has gone, judged on the track that is on the canvas now -- not on
        // the one this bar was built with. Saving puts a new PlateTrack in the old one's
        // place, so the captured track's canvas is left disconnected: read that way, a save
        // looked exactly like closing the app and the bar destroyed itself.
        const appGone = () => {
            try {
                if (location.pathname !== homePath) return true;
                const t = liveTrack() || pt;
                const c = t && t.__canvas__;
                if (c && c.isConnected) { sawCanvas = true; return false; }
                // A CANVAS STILL ON THE PAGE MEANS THE APP IS STILL HERE. __canvas__ is only
                // refreshed when the track next DRAWS, so anything that replaces the canvas
                // element -- saving rebuilds the panel it lives in -- leaves this pointing at
                // the removed one until the next frame. Read that as the app closing and the
                // bar destroys itself over a save. The page is the authority.
                if (document.querySelector('canvas')) { sawCanvas = true; return false; }
                return sawCanvas && !!c && !c.isConnected;
            } catch (e) { return false; }
        };
        // ...and even then, not on one reading. A tick can land in the gap between the old
        // canvas going and the new one arriving; the bar is only given up when it has been
        // gone for several ticks together.
        let goneTicks = 0;
        // A different canvas: going into or out of a folder swaps the whole canvas, and the
        // places remembered so far are views of the one that was left -- Back would fly to
        // coordinates that mean nothing here. They go, and this canvas starts its own.
        const canvasKey = () => { try { return (Number(pt.folderDepth) || 0) + ':' + ((pt.ptracks && pt.ptracks.length) ? ('' + pt.ptracks[pt.ptracks.length - 1]).slice(0, 48) : ''); } catch (e) { return ''; } };
        let __canvasKey = canvasKey();
        // A DIFFERENT TRACK: opening a file puts a new PlateTrack in the old one's place (see
        // folder-back.js), and this bar's camera, places and object list were all bound to the
        // one it was created with. It rebuilds itself on the track that is on the canvas now.
        nav.timer = setInterval(() => {
            try {
                // The rebuild is tested FIRST: a swapped track must be followed, not read as
                // the app closing.
                const lt = liveTrack();
                if (appGone() && (!lt || lt === pt)) {
                    if (++goneTicks >= 4) { nav.destroy(); return; }
                } else { goneTicks = 0; }
                if (lt && lt !== pt) {
                    nav.destroy();
                    exec('baja/plate/views/navigation-history.js', lt, graph).then((n) => { try { lt.__nav = n; } catch (e) { } }).catch(() => { });
                    return;
                }
                if (!pt || !pt.grid) return;
                const ck = canvasKey();
                if (ck !== __canvasKey) {
                    __canvasKey = ck;
                    nav.history = []; nav.index = -1;
                    nav.lastView = view(); nav.dwellStart = Date.now();
                    record(view(), 'start');
                    render();
                    return;
                }
                const nowMaxed = !!pt.__maximized;
                if (nowMaxed !== __wasMaxed) { __wasMaxed = nowMaxed; render(); }
                else if (nowMaxed) dock();
                if (pt.__maximized) { nav.lastView = view(); nav.dwellStart = Date.now(); return; }   // pinned view: not a place
                const v = view();
                if (!same(v, nav.lastView)) { nav.lastView = v; nav.dwellStart = Date.now(); return; }
                if (Date.now() - nav.dwellStart >= DWELL_MS) { record(v, 'stayed'); nav.dwellStart = Date.now() + 1e12; }   // once per stay
            } catch (e) { }
        }, TICK_MS);

        nav.destroy = () => {
            try { clearInterval(nav.timer); } catch (e) { }
            try { document.removeEventListener('mousedown', onDocDown, true); document.removeEventListener('touchstart', onDocDown, true); window.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { if (bar.parentNode) bar.parentNode.removeChild(bar); } catch (e) { }
            if (window.__bajaNavPanel === nav) window.__bajaNavPanel = null;
        };
        nav.record = (why) => record(view(), why || 'marked');
        nav.refresh = () => { try { __wasMaxed = !!pt.__maximized; render(); } catch (e) { } };
        nav.back = back; nav.forward = forward; nav.open = open;
        window.__bajaNavPanel = nav;
        render();
        return nav;
    })();
}
