function (graph, layout) {

    // A small camera-bookmark navigator, pinned to the LOWER-LEFT corner. Two ways in:
    //   - the Bookmarks button in the top row toggles it (open if closed, close if open);
    //   - a design opened from a share auto-opens it when it carries bookmarks, so the
    //     recipient can step through the views the sharer saved.
    // Click a name to fly the camera there. Read-only: saving, renaming and deleting live in
    // Navigate ▸ Bookmarks. It reads the graph's native `graph.bookmarks` — the one store.

    return (async () => {
        const id = 'baja-bookmark-nav';

        // TOGGLE. A second call while the panel is up takes it down. This is what the top-row
        // button does, and it means the share auto-open and the button share one control.
        try {
            const existing = document.getElementById(id);
            if (existing && existing.parentNode) { existing.parentNode.removeChild(existing); return; }
        } catch (e) { }

        const bm = (graph.bookmarks && typeof graph.bookmarks === 'object') ? graph.bookmarks : {};
        const names = Object.keys(bm);
        const esc = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        const panel = document.createElement('div');
        panel.id = id;
        panel.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:2147482000;'
            + 'width:230px;max-height:52vh;display:flex;flex-direction:column;background:#0b2545;color:#e8f0fb;'
            + 'border:1px solid rgba(255,255,255,0.16);border-radius:12px;box-shadow:0 10px 34px rgba(0,0,0,0.45);'
            + 'font-family:Arial,Helvetica,sans-serif;overflow:hidden;';

        const header = document.createElement('div');
        header.style.cssText = 'flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:10px 12px;'
            + 'background:#0a1e3a;border-bottom:1px solid rgba(255,255,255,0.12);';
        header.innerHTML = ''
            + '<span style="font-size:16px;line-height:1;">📷</span>'
            + '<span style="font:700 13px Arial;flex:1;">Bookmarks</span>'
            + '<button id="bn-min" title="Collapse" style="cursor:pointer;border:none;background:transparent;color:#9fb3c8;font:700 15px Arial;line-height:1;padding:2px 6px;">–</button>'
            + '<button id="bn-x" title="Hide" style="cursor:pointer;border:none;background:transparent;color:#9fb3c8;font:700 14px Arial;line-height:1;padding:2px 6px;">✕</button>';

        const list = document.createElement('div');
        list.style.cssText = 'flex:1 1 auto;overflow:auto;padding:8px;display:flex;flex-direction:column;gap:6px;';

        if (!names.length) {
            const hint = document.createElement('div');
            hint.style.cssText = 'font:12px Arial;color:#9fb3c8;padding:6px 4px;line-height:1.5;';
            hint.innerHTML = 'No bookmarks yet.<br>Save the current view from <b>Navigate ▸ Bookmarks</b>.';
            list.appendChild(hint);
        } else {
            names.forEach((nm) => {
                const btn = document.createElement('button');
                btn.style.cssText = 'text-align:left;cursor:pointer;border:1px solid rgba(255,255,255,0.12);'
                    + 'background:#0a1e3a;color:#e8f0fb;border-radius:8px;padding:8px 10px;font:13px Arial;';
                btn.innerHTML = '<div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'
                    + esc(nm) + '</div>';
                btn.onmouseenter = () => { btn.style.background = '#123a63'; };
                btn.onmouseleave = () => { btn.style.background = '#0a1e3a'; };
                btn.onclick = () => { try { graph.goToBookmark(graph.bookmarks[nm]); } catch (e) { } };
                list.appendChild(btn);
            });
        }

        // A collapsed tab: the panel folds to just its header so it never sits over the canvas
        // more than a person wants. State is remembered for the session.
        let collapsed = false;
        try { collapsed = sessionStorage.getItem('baja.bookmarkNav.collapsed') === '1'; } catch (e) { }
        let __footerEl = null;
        const applyCollapsed = () => {
            list.hidden = collapsed;
            try { if (__footerEl) __footerEl.hidden = collapsed; } catch (e) { }
            try { header.querySelector('#bn-min').textContent = collapsed ? '+' : '–'; } catch (e) { }
            try { sessionStorage.setItem('baja.bookmarkNav.collapsed', collapsed ? '1' : '0'); } catch (e) { }
        };

        panel.appendChild(header);
        panel.appendChild(list);

        // When there are bookmarks, the last item is a Download button — the same action as
        // the green Download button in the toolbar (it opens the Download library). Handy for a
        // share recipient, who reaches the design through this panel.
        if (names.length) {
            const footer = document.createElement('div');
            footer.style.cssText = 'flex:0 0 auto;padding:8px;border-top:1px solid rgba(255,255,255,0.12);';
            const dl = document.createElement('button');
            dl.title = 'Download';
            dl.style.cssText = 'width:100%;box-sizing:border-box;cursor:pointer;border:none;border-radius:8px;'
                + 'padding:9px 12px;font:700 13px Arial;background:#16a34a;color:#eafff2;'
                + 'display:flex;align-items:center;justify-content:center;gap:8px;';
            dl.innerHTML = '<span class="material-icons" style="font-size:18px;line-height:1;">file_download</span><span>Download</span>';
            dl.onclick = () => { try { exec('manchester/io/download-hub.js', graph, layout); } catch (e) { try { graph.setError('Could not open Download: ' + e, 8); } catch (e2) { } } };
            footer.appendChild(dl);
            panel.appendChild(footer);
            __footerEl = footer;
        }

        document.body.appendChild(panel);
        applyCollapsed();

        // LEAVE WITH THE EDITOR. The panel is fixed to the viewport and hung off <body>, so
        // it outlived the screen it belongs to: go to the home menu, the genome viewer or
        // another design and the bookmarks of the last one stayed in the corner, naming
        // views that no longer existed. So it watches the graph's own canvas -- the one
        // element that IS the editor -- and takes itself down the moment that canvas leaves
        // the document, or has been hidden for two consecutive checks (a single check would
        // also catch a modal that briefly hides the canvas and then puts it back).
        const hostEl = () => {
            try {
                const c = graph && graph.canvas;
                if (!c) return null;
                if (c.canvas && c.canvas.nativeElement) return c.canvas.nativeElement;
                if (c.nativeElement) return c.nativeElement;
                if (typeof HTMLElement !== 'undefined' && c instanceof HTMLElement) return c;
            } catch (e) { }
            return null;
        };
        const shown = (el) => {
            try { return !!(el && el.isConnected && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)); }
            catch (e) { return true; }
        };
        let watchTimer = 0, observer = null, hiddenTicks = 0;
        const stopWatch = () => {
            if (watchTimer) { clearInterval(watchTimer); watchTimer = 0; }
            try { if (observer) observer.disconnect(); } catch (e) { }
            observer = null;
            try { window.removeEventListener('popstate', check); window.removeEventListener('hashchange', check); } catch (e) { }
        };
        const close = () => {
            stopWatch();
            try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
        };
        const check = () => {
            if (!panel.isConnected) { stopWatch(); return; }
            const h = hostEl();
            if (!h) return;                          // no canvas to judge by: leave it to ✕
            if (!h.isConnected) { close(); return; }  // the editor is gone
            if (shown(h)) { hiddenTicks = 0; return; }
            if (++hiddenTicks >= 2) close();
        };
        try {
            watchTimer = setInterval(check, 800);
            observer = new MutationObserver(() => { try { check(); } catch (e) { } });
            observer.observe(document.body, { childList: true, subtree: true });
            window.addEventListener('popstate', check);
            window.addEventListener('hashchange', check);
        } catch (e) { }

        header.querySelector('#bn-min').onclick = () => { collapsed = !collapsed; applyCollapsed(); };
        header.querySelector('#bn-x').onclick = () => close();
    })();
}
