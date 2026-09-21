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

        // THE LIVE DESIGN, NOT THE ONE HANDED OVER. Opening a design from the home menu does
        // not refill the graph this panel was given: the editor builds a NEW one and stashes
        // it in the old one's place. Holding the first graph meant holding a canvas that had
        // left the document, which the watch below read as "the editor is gone" and closed
        // the panel -- the whole reason it vanished on opening a design. Every use asks for
        // the graph that is on the screen NOW, and the list is rebuilt when it changes.
        const liveGraph = () => {
            try {
                const g = CurrentLayout.getStashed('graph');
                if (g && (g.bookmarks || g.canvas)) return g;
            } catch (e) { }
            return graph;
        };
        const bookmarksOf = (g) => (g && g.bookmarks && typeof g.bookmarks === 'object') ? g.bookmarks : {};
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

        // The list is rebuilt whenever the design changes, so opening another one from the
        // home menu re-fills the panel with ITS bookmarks instead of leaving the last
        // design's names in the corner naming views that no longer exist.
        let __shownFor = '';
        const renderList = () => {
            const g = liveGraph();
            const bm = bookmarksOf(g);
            const names = Object.keys(bm);
            const sig = names.join('\u0000');
            if (sig === __shownFor) return false;
            __shownFor = sig;

            list.innerHTML = '';
            if (!names.length) {
                const hint = document.createElement('div');
                hint.style.cssText = 'font:12px Arial;color:#9fb3c8;padding:6px 4px;line-height:1.5;';
                hint.innerHTML = 'No bookmarks yet.<br>Save the current view from <b>Navigate \u25b8 Bookmarks</b>.';
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
                    // Resolved at click time: the design under the panel may have changed.
                    btn.onclick = () => {
                        try { const gg = liveGraph(); gg.goToBookmark(bookmarksOf(gg)[nm]); } catch (e) { }
                    };
                    list.appendChild(btn);
                });
            }
            return true;
        };
        renderList();

        // A collapsed tab: the panel folds to just its header so it never sits over the canvas
        // more than a person wants. State is remembered for the session.
        let collapsed = false;
        try { collapsed = sessionStorage.getItem('baja.bookmarkNav.collapsed') === '1'; } catch (e) { }
        let __footerEl = null;
        const applyCollapsed = () => {
            list.hidden = collapsed;
            try { if (__footerEl) __footerEl.hidden = collapsed || !Object.keys(bookmarksOf(liveGraph())).length; } catch (e) { }
            try { header.querySelector('#bn-min').textContent = collapsed ? '+' : '–'; } catch (e) { }
            try { sessionStorage.setItem('baja.bookmarkNav.collapsed', collapsed ? '1' : '0'); } catch (e) { }
        };

        panel.appendChild(header);
        panel.appendChild(list);

        // When there are bookmarks, the last item is a Download button — the same action as
        // the green Download button in the toolbar (it opens the Download library). Handy for a
        // share recipient, who reaches the design through this panel.
        {
            const footer = document.createElement('div');
            footer.style.cssText = 'flex:0 0 auto;padding:8px;border-top:1px solid rgba(255,255,255,0.12);';
            const dl = document.createElement('button');
            dl.title = 'Download';
            dl.style.cssText = 'width:100%;box-sizing:border-box;cursor:pointer;border:none;border-radius:8px;'
                + 'padding:9px 12px;font:700 13px Arial;background:#16a34a;color:#eafff2;'
                + 'display:flex;align-items:center;justify-content:center;gap:8px;';
            dl.innerHTML = '<span class="material-icons" style="font-size:18px;line-height:1;">file_download</span><span>Download</span>';
            dl.onclick = () => {
                const g = liveGraph();
                try { exec('manchester/io/download-hub.js', g, layout); }
                catch (e) { try { g.setError('Could not open Download: ' + e, 8); } catch (e2) { } }
            };
            footer.appendChild(dl);
            panel.appendChild(footer);
            __footerEl = footer;
        }
        // Shown only when the design being looked at HAS bookmarks, which changes with it.
        const applyFooter = () => {
            try { __footerEl.hidden = collapsed || !Object.keys(bookmarksOf(liveGraph())).length; } catch (e) { }
        };

        document.body.appendChild(panel);
        applyCollapsed();
        applyFooter();

        // LEAVE WITH THE EDITOR, AND ONLY WITH IT. The panel is fixed to the viewport and
        // hung off <body>, so it outlived the screen it belongs to: go to the home menu,
        // the genome viewer or another design and the bookmarks of the last one stayed in
        // the corner, naming views that no longer existed.
        //
        // It used to also take itself down when the canvas was merely HIDDEN for two
        // checks, and those checks were driven by a MutationObserver on the whole of
        // <body> as well as by the timer -- so two DOM mutations while a dialog covered
        // the canvas were enough to close it within milliseconds, and it never came back.
        // That is why it kept disappearing: anything that puts a panel over the editor
        // (a picker, a download, a maximized object) looked like leaving.
        //
        // Now it goes only when the editor is really gone: the route changed, or the
        // canvas has been OUT OF THE DOCUMENT for two consecutive ticks of the timer --
        // a gap wide enough to sit out the editor rebuilding its own canvas. Being
        // covered up or hidden is not leaving, so it stays.
        const hostEl = () => {
            try {
                const g = liveGraph();
                const c = g && g.canvas;
                if (!c) return null;
                if (c.canvas && c.canvas.nativeElement) return c.canvas.nativeElement;
                if (c.nativeElement) return c.nativeElement;
                if (typeof HTMLElement !== 'undefined' && c instanceof HTMLElement) return c;
            } catch (e) { }
            return null;
        };
        const home = (() => { try { return location.pathname; } catch (e) { return ''; } })();
        let watchTimer = 0, goneTicks = 0;
        const stopWatch = () => {
            if (watchTimer) { clearInterval(watchTimer); watchTimer = 0; }
            try { window.removeEventListener('popstate', routeCheck); window.removeEventListener('hashchange', routeCheck); } catch (e) { }
        };
        const close = () => {
            stopWatch();
            try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
        };
        // Only the timer counts the canvas out, so a burst of DOM changes cannot rush it.
        // Opening a design can lengthen the address (/app/cpd/editor -> .../<design>), which
        // is still the editor; going to the viewer or the home menu is not. So the route
        // counts as the same screen while either path is a prefix of the other.
        const sameScreen = () => {
            try {
                const now = location.pathname;
                if (!home || !now) return true;
                return now.indexOf(home) === 0 || home.indexOf(now) === 0;
            } catch (e) { return true; }
        };
        const check = () => {
            if (!panel.isConnected) { stopWatch(); return; }
            if (!sameScreen()) { close(); return; }
            // A design may have been opened underneath: show ITS bookmarks.
            try { if (renderList()) applyFooter(); } catch (e) { }
            const h = hostEl();
            if (!h) { goneTicks = 0; return; }        // no canvas to judge by: leave it to ✕
            if (h.isConnected) { goneTicks = 0; return; }
            if (++goneTicks >= 2) close();            // out of the document, not just hidden
        };
        const routeCheck = () => { try { if (!sameScreen()) close(); } catch (e) { } };
        try {
            watchTimer = setInterval(check, 800);
            window.addEventListener('popstate', routeCheck);
            window.addEventListener('hashchange', routeCheck);
        } catch (e) { }

        header.querySelector('#bn-min').onclick = () => { collapsed = !collapsed; applyCollapsed(); };
        header.querySelector('#bn-x').onclick = () => close();
    })();
}
