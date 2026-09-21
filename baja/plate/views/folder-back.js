function (pt, graph) {
    // THE WAY BACK OUT OF A FOLDER, top left of the canvas.
    //   pt.__folderBack = await exec('baja/plate/views/folder-back.js', pt, graph)
    //
    // Opening a folder (a 'package' plate, its menu's "Open..") swaps the whole canvas for
    // the one inside it and pushes the canvas you left onto pt.ptracks. Until now nothing on
    // the Analytics workbench brought you back: pt.popFolder() had no button, so a folder was
    // a one-way door. This is that button. It shows only while pt.ptracks has something on
    // it, names the folder you are standing in, and sits at the top left of the canvas, over
    // the corner the canvas keeps empty.
    return (async () => {
        const TICK_MS = 400;

        try { if (window.__bajaFolderBack && window.__bajaFolderBack.destroy) window.__bajaFolderBack.destroy(); } catch (e) { }

        const fb = { timer: null, destroy: null };
        // THE LIVE TRACK. Opening a file does not refill the plate track it was handed: the
        // loader builds a NEW PlateTrack and puts it in the old one's place (gene2plates:
        // this.plateTrack = ffs; plateManager.setPlateTrack). This pill kept the object it was
        // created with, so after File > Open it watched a track nobody was looking at: inside
        // a folder it never appeared, and its popFolder() would have popped the dead track.
        // Every use below asks for the track that is on the canvas NOW, and it is that
        // track's popFolder() the button calls.
        const track0 = pt;
        const T = () => {
            try {
                const pm = CurrentLayout.getStashed('plate-track');
                const t = pm && (pm.plateTrack || (typeof pm.getPlateTrack === 'function' && pm.getPlateTrack()));
                if (t) return t;
            } catch (e) { }
            return track0;
        };
        // Inside a folder at all: there is a canvas to go back to.
        const depth = () => (T() && Array.isArray(T().ptracks)) ? T().ptracks.length : 0;
        // HOW deep. The track's ptracks is a chain one link long however deep you are (each entry
        // carries the stack that came before it inside its saved canvas), so its length
        // only ever says "inside". The track's folderDepth is the count, kept by pushFolder; a
        // document saved inside a folder before that existed has none, and falls back.
        const levels = () => Math.max(depth(), (T() && Number(T().folderDepth)) || 0);

        // ---- the button ---------------------------------------------------------------
        const mobile = (typeof isMobile === 'function') && isMobile();
        const H = mobile ? 40 : 32, FS = mobile ? 13.5 : 12.5;
        const bar = document.createElement('div');
        bar.id = 'baja-folder-back';
        bar.style.cssText = 'position:fixed;left:-9999px;top:-9999px;z-index:2147482000;display:none;align-items:center;gap:6px;'
            + 'background:rgba(10,37,64,0.96);border:1px solid #1aa3bd;border-radius:12px;padding:4px;'
            + 'box-shadow:0 10px 30px rgba(10,37,64,0.35);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;user-select:none;';
        const ICON = '<svg width="' + (mobile ? 17 : 15) + '" height="' + (mobile ? 17 : 15) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
            + 'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px;"><path d="M15 5l-7 7 7 7"/></svg>';
        bar.innerHTML = '<button id="fb-out" type="button" style="cursor:pointer;height:' + H + 'px;padding:0 12px;border-radius:8px;'
            + 'border:1px solid transparent;background:transparent;color:#eaf6f9;font:600 ' + FS + 'px system-ui;white-space:nowrap;'
            + 'max-width:min(360px,calc(100vw - 60px));overflow:hidden;text-overflow:ellipsis;">' + ICON + '<span id="fb-lbl">Back</span></button>'
            + '<span id="fb-depth" hidden style="margin-right:6px;padding:2px 7px;border-radius:999px;background:rgba(26,163,189,0.28);'
            + 'color:#bfeaf3;font:600 10.5px system-ui;white-space:nowrap;"></span>';
        document.body.appendChild(bar);
        const btn = bar.querySelector('#fb-out');
        const lbl = bar.querySelector('#fb-lbl');
        const badge = bar.querySelector('#fb-depth');
        btn.onmouseenter = () => { btn.style.background = 'rgba(26,163,189,0.35)'; };
        btn.onmouseleave = () => { btn.style.background = 'transparent'; };

        // ---- which folder are we in? -----------------------------------------------------
        // ptracks holds "<folder uid>:<the compressed canvas you left>". The folder plate
        // itself lives in THAT canvas, so its name costs a decompress to read. One per folder
        // entered, cached on the stack entry, and done off the click so opening a folder is
        // not held up by it. A big state is left alone: the plain "Back" reads well enough.
        const MAX_DECODE = 6e6;
        const labelCache = new Map();
        const folderName = (entry) => {
            if (labelCache.has(entry)) return labelCache.get(entry);
            let name = '';
            try {
                const at = entry.indexOf(':');
                if (at > 0 && entry.length - at < MAX_DECODE) {
                    const uid = entry.substring(0, at);
                    let state = __decompress(entry.substring(at + 1));
                    if (typeof state === 'string') state = JSON.parse(state);
                    const root = (state && (state.root || (state.plate_track && state.plate_track.root))) || [];
                    const folder = root.find((p) => p && ('' + p.uid) === ('' + uid));
                    // Folders drawn on the canvas are named "Folder:<what was typed>"; the ones
                    // an analysis publishes (Competition, and the like) are named outright.
                    if (folder && folder.name) name = ('' + folder.name).replace(/^Folder:\s*/i, '').trim();
                }
            } catch (e) { name = ''; }
            labelCache.set(entry, name);
            if (labelCache.size > 40) { try { labelCache.delete(labelCache.keys().next().value); } catch (e) { } }
            return name;
        };

        // ---- where the canvas is ---------------------------------------------------------
        // Top left of the CANVAS, which sits below the application toolbar and the menubar,
        // so the button follows the canvas's page position and not the page's top edge.
        const canvasRect = () => {
            let el = null;
            try { const c = CurrentLayout.getStashed('graph-canvas'); el = c && c.canvas; if (el && el.nativeElement) el = el.nativeElement; } catch (e) { el = null; }
            if (!el || !el.getBoundingClientRect) el = document.querySelector('canvas[tabindex]') || document.querySelector('canvas');
            try { return el ? el.getBoundingClientRect() : null; } catch (e) { return null; }
        };

        // MAXIMIZED: HOW FAR DOWN TO STAND. A maximized object paints its own title bar
        // across the canvas top -- __drawMaximizeChrome fills 44px and rules 2px under it --
        // and this pill sits in exactly that corner. It used to hide for the duration, which
        // left no way out of the folder and no clue why the button had gone. It drops below
        // the title bar instead. That bar is drawn in the canvas's own pixels, which are not
        // the page's if the canvas is scaled, so it is measured rather than assumed.
        const MAX_CHROME = 46;
        const chromeBelow = () => {
            try {
                const c = T() && T().__canvas__;
                if (c && c.height && c.getBoundingClientRect) {
                    const rr = c.getBoundingClientRect();
                    if (rr.height) return MAX_CHROME * (rr.height / c.height);
                }
            } catch (e) { }
            return MAX_CHROME;
        };

        let shownFor = null, atX = null, atY = null, visible = false;
        const render = () => {
            const d = depth();
            if (!d) {
                if (visible) { bar.style.display = 'none'; visible = false; }
                shownFor = null;
                return;
            }

            // The canvas is re-measured every tick but only written back when it has moved,
            // so a button that just sits there costs no layout.
            const r = canvasRect();
            const top = (T() && T().__maximized) ? (chromeBelow() + 8) : 10;
            const x = Math.round((r ? r.left : 0) + 14), y = Math.round((r ? r.top : 0) + top);
            if (x !== atX || y !== atY) { bar.style.left = x + 'px'; bar.style.top = y + 'px'; atX = x; atY = y; }
            if (!visible) { bar.style.display = 'flex'; visible = true; }

            const entry = T().ptracks[d - 1];
            if (shownFor === entry) return;
            shownFor = entry;

            const n = levels();
            badge.hidden = n < 2;
            if (n >= 2) { badge.textContent = n + ' deep'; badge.title = n + ' folders deep: Back goes up one at a time'; }

            const cached = labelCache.get(entry);
            const paint = (nm) => {
                lbl.textContent = nm ? ('Leave ' + nm) : 'Back out of this folder';
                btn.title = nm ? ('Go back out of ' + nm + ' to the canvas you came from') : 'Go back out to the canvas you came from';
            };
            if (cached !== undefined) paint(cached);
            else {
                paint('');
                // Off the entering click, so opening a folder never waits on the decompress.
                setTimeout(() => { try { if (shownFor === entry) paint(folderName(entry)); } catch (e) { } }, 0);
            }
        };

        const out = () => {
            if (!depth()) return;
            // Leaving the folder replaces the whole canvas, so a maximized object has to be
            // put down first: __maximized starts with an underscore and is never serialised,
            // so it would survive the swap still pointing at an object that is no longer on
            // the canvas, and the parent would come back wearing a title bar for nothing.
            try { if (T().__maximized && T().exitMaximize) T().exitMaximize(); } catch (e) { }
            try { T().wb(null); } catch (e) { }
            try { T().popFolder(); }
            catch (e) {
                console.warn('exit folder', e);
                try { T().setMessage('Could not leave this folder: ' + (e && e.message ? e.message : e), 2); } catch (e2) { }
            }
            shownFor = null;
            render();
        };
        btn.onclick = out;
        // No Escape shortcut: on this canvas Escape already belongs to the draw and lasso
        // modes, and to a maximized object's title bar.

        // THE APP IS GONE: this pill is fixed to the page body, not to the canvas, so when the
        // Analytics window is closed (the shell routes to another page) nothing removes it
        // and it sat over whatever came next. It checks for itself: the page is no longer
        // the one it was opened on, or the canvas it serves has left the document.
        const homePath = location.pathname;
        let sawCanvas = false;
        const appGone = () => {
            try {
                if (location.pathname !== homePath) return true;
                const c = T() && T().__canvas__;
                if (c && c.isConnected) { sawCanvas = true; return false; }
                return sawCanvas && !!c && !c.isConnected;
            } catch (e) { return false; }
        };
        fb.timer = setInterval(() => { try { if (appGone()) { fb.destroy(); return; } render(); } catch (e) { } }, TICK_MS);
        fb.refresh = () => { try { shownFor = null; render(); } catch (e) { } };
        fb.out = out;
        fb.destroy = () => {
            try { clearInterval(fb.timer); } catch (e) { }
            try { if (bar.parentNode) bar.parentNode.removeChild(bar); } catch (e) { }
            if (window.__bajaFolderBack === fb) window.__bajaFolderBack = null;
        };

        window.__bajaFolderBack = fb;
        render();
        return fb;
    })();
}
