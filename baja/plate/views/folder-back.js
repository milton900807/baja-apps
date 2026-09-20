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
        const depth = () => (pt && Array.isArray(pt.ptracks)) ? pt.ptracks.length : 0;

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
        // pt.ptracks holds "<folder uid>:<the compressed canvas you left>". The folder plate
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

        let shownFor = null, atX = null, atY = null, visible = false;
        const render = () => {
            const d = depth();
            // While an object is maximized the canvas top belongs to its own title bar, and
            // the folder is not where the eye is: stand aside until it is closed.
            if (!d || pt.__maximized) {
                if (visible) { bar.style.display = 'none'; visible = false; }
                shownFor = null;
                return;
            }

            // The canvas is re-measured every tick but only written back when it has moved,
            // so a button that just sits there costs no layout.
            const r = canvasRect();
            const x = Math.round((r ? r.left : 0) + 14), y = Math.round((r ? r.top : 0) + 10);
            if (x !== atX || y !== atY) { bar.style.left = x + 'px'; bar.style.top = y + 'px'; atX = x; atY = y; }
            if (!visible) { bar.style.display = 'flex'; visible = true; }

            const entry = pt.ptracks[d - 1];
            if (shownFor === entry) return;
            shownFor = entry;

            badge.hidden = d < 2;
            if (d >= 2) badge.textContent = d + ' deep';

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
            try { pt.wb(null); } catch (e) { }
            try { pt.popFolder(); }
            catch (e) {
                console.warn('exit folder', e);
                try { pt.setMessage('Could not leave this folder: ' + (e && e.message ? e.message : e), 2); } catch (e2) { }
            }
            shownFor = null;
            render();
        };
        btn.onclick = out;
        // No Escape shortcut: on this canvas Escape already belongs to the draw and lasso
        // modes, and to a maximized object's title bar.

        fb.timer = setInterval(() => { try { render(); } catch (e) { } }, TICK_MS);
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
