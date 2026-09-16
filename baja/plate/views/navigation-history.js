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
        const open = (o) => {
            try {
                if (pt.__maximized && pt.__maximized !== o && pt.exitMaximize) pt.exitMaximize();
                if (typeof o.drawPlot === 'function') pt.setActive(o);
                else if (o.shape) pt.selectGlyph__(o);
                else pt.setSelected(o);
                pt.maximizeObject(o);
            } catch (e) { console.warn('bookmark', e); }
            closeLists();
        };

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
        // Places: a clock with a history arrow. Bookmarks: a bookmark ribbon. Un-maximize: arrows in.
        const ICON_PLACES = svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/>');
        const ICON_MARKS = svg('<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/>');
        const ICON_RESTORE = svg('<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/>');
        bar.innerHTML = B('nv-back', ICON_BACK, 'Back (Alt+Left)') + B('nv-fwd', ICON_FWD, 'Forward (Alt+Right)')
            + '<span style="width:1px;height:' + (H - 10) + 'px;background:rgba(255,255,255,0.18);"></span>'
            + B('nv-places', ICON_PLACES + '<span class="nv-lbl">Places</span>', 'Places the camera has stayed at') + B('nv-marks', ICON_MARKS + '<span class="nv-lbl">Bookmarks</span>', 'Open a table, chart, timeline or note maximized')
            + B('nv-restore', ICON_RESTORE + '<span class="nv-lbl">Un-maximize</span>', 'Return to the whole canvas (Escape)')
            + '<div id="nv-list" hidden style="position:absolute;right:0;bottom:' + (H + 14) + 'px;width:min(320px,calc(100vw - 40px));max-height:min(60vh,420px);overflow:auto;'
            + 'background:#ffffff;color:#0a2540;border:1px solid rgba(10,37,64,0.14);border-radius:12px;box-shadow:0 12px 40px rgba(10,37,64,0.35);padding:6px;"></div>';
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
                let right = 14;
                try {
                    let el = null;
                    try { const c = CurrentLayout.getStashed('graph-canvas'); el = c && c.canvas; if (el && el.nativeElement) el = el.nativeElement; } catch (e) { el = null; }
                    if (!el || !el.getBoundingClientRect) el = document.querySelector('canvas[tabindex]') || document.querySelector('canvas');
                    const r = el ? el.getBoundingClientRect() : null;
                    const m = pt.__maxMenuRect;
                    if (r && m) right = Math.max(8, Math.round(window.innerWidth - (r.left + m.x) + 8));
                } catch (e) { }
                const h = mobile ? 34 : 30;
                bar.style.top = '5px'; bar.style.bottom = 'auto'; bar.style.right = right + 'px';
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
        const render = () => {
            dock();
            // Un-maximize sits next to Bookmarks only while an object is maximized (and the
            // viewer is allowed out of it: a single-object share is not).
            const rs = $('nv-restore');
            const maxed = !!(pt.__maximized && !pt.__objectOnly);
            rs.hidden = !maxed;
            rs.style.background = maxed ? '#1aa3bd' : 'transparent';
            rs.style.borderColor = maxed ? '#1aa3bd' : 'transparent';
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
                if (pt.__maximized && !pt.__objectOnly) html += item('<span style="color:#b42318;">Exit maximize</span>', 'data-exit="1"');
                for (const [title, kind] of groups) {
                    const of = objs.filter(o => kindOf(o) === kind);
                    if (!of.length) continue;
                    any = true;
                    html += head(title + ' (' + of.length + ')');
                    of.forEach((o) => {
                        const cur = pt.__maximized === o;
                        html += item('<span style="' + (cur ? 'font-weight:700;color:#0f6e7a;' : '') + '">' + esc(nameOf(o)) + '</span><span style="color:#6b7a90;font-size:11px;">' + (cur ? 'open' : 'maximize') + '</span>', 'data-obj="' + esc('' + (o.uid || o.id || '')) + '"');
                    });
                }
                if (!any) html += '<div style="padding:8px 10px;font-size:12px;color:#6b7a90;">Nothing on the workbench yet.</div>';
            }
            list.innerHTML = html;
            list.hidden = false;
            list.querySelectorAll('.nv-item').forEach((el) => {
                el.onmouseenter = () => { el.style.background = '#e6f6f9'; };
                el.onmouseleave = () => { el.style.background = 'transparent'; };
                el.onclick = async () => {
                    if (el.hasAttribute('data-place')) { nav.index = +el.getAttribute('data-place'); await goTo(nav.history[nav.index].view); closeLists(); }
                    else if (el.hasAttribute('data-exit')) { try { pt.exitMaximize(); } catch (e) { } closeLists(); }
                    else if (el.hasAttribute('data-obj')) { const id = el.getAttribute('data-obj'); const o = allObjects().find(x => ('' + (x.uid || x.id || '')) === id); if (o) open(o); }
                };
            });
            const mk = list.querySelector('#nv-mark-now'); if (mk) mk.onclick = () => { record(view(), 'marked'); listMode = 'places'; render(); };
            const cl = list.querySelector('#nv-clear'); if (cl) cl.onclick = () => { nav.history = []; nav.index = -1; render(); };
        };
        $('nv-back').onclick = back; $('nv-fwd').onclick = forward;
        $('nv-restore').onclick = () => { try { pt.exitMaximize(); } catch (e) { } closeLists(); };
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
        nav.timer = setInterval(() => {
            try {
                if (!pt || !pt.grid) return;
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
