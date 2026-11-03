function () {
    // THE CANVAS OVERLAY PANEL: the editor's standard result window.
    //   const OV = await exec('baja/lib/canvas-overlay-panel.js');
    //   const p = OV.open({ id, title, body, onClose });   // body = HTML string or an element
    //   p.panel / p.head / p.body / p.close()
    //
    // It sits ON TOP of the gene-graph canvas, fitted to its rect, rather than replacing it:
    // the mainPanel component is never touched, so closing the window is removing one DOM node
    // and the canvas underneath never re-mounts (and so never loses its scroll, zoom or
    // selection). The header holding the title and Close is pinned; only the body scrolls, so
    // Close is reachable however long the list is.
    //
    // Written as one module because the look was previously inlined per tool: the off-target
    // summary built this shell by hand, and the splicing results went through the host's
    // showModal instead and came out a white sheet with no header, no Close button, and a close
    // path that had to reach for `.cdk-overlay-backdrop`. Two windows for the same job that
    // looked nothing alike. One shell also means injected HTML keeps its event handlers: the
    // host's html-field scrub() strips every on* attribute from what showModal renders, which
    // is why callers there had to re-attach listeners by polling the DOM for their own rows.
    //
    // PALETTE (the off-target window's, now the shared one): navy #0b2545 ground, #fff titles,
    // #eaf6f9 body text, #8fb8c8 dim, #4fd0e6 accent / links, #1aa3bd outlines, green Close.
    const C = {
        bg: '#0b2545', text: '#eaf6f9', title: '#fff', dim: '#8fb8c8',
        accent: '#4fd0e6', line: 'rgba(255,255,255,0.14)', rule: 'rgba(255,255,255,0.08)',
        outline: '#1aa3bd', warm: '#ffb4a2', ok: '#22c55e', okInk: '#04210f',
        panelRadius: '12px', font: 'Arial,Helvetica,sans-serif',
    };

    // The VISIBLE gene-graph canvas: largest by on-screen display area, so an off-screen or
    // buffer canvas cannot be picked and the rect fitted to is the one the user is looking at.
    const biggestCanvas = () => {
        let best = null, area = -1;
        try {
            const vh = window.innerHeight || 1e9, vw = window.innerWidth || 1e9;
            for (const c of document.querySelectorAll('canvas')) {
                const r = c.getBoundingClientRect();
                if (!r || r.width <= 1 || r.height <= 1) continue;
                if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
                const a = r.width * r.height;
                if (a > area) { area = a; best = c; }
            }
        } catch (e) { }
        return best;
    };

    const open = (opts) => {
        const o = opts || {};
        const id = o.id || 'baja-overlay-panel';
        // One window per id: opening again replaces the old one rather than stacking.
        try { const old = document.getElementById(id); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }

        const panel = document.createElement('div');
        panel.id = id;
        panel.style.cssText = 'position:fixed;z-index:2147483000;display:flex;flex-direction:column;overflow:hidden;'
            + 'background:' + C.bg + ';color:' + C.text + ';border-radius:' + C.panelRadius + ';'
            + 'box-shadow:0 12px 40px rgba(0,0,0,0.45);border:1px solid ' + C.line + ';'
            + 'font-family:' + C.font + ';box-sizing:border-box;';

        const fitToCanvas = () => {
            try {
                const cv = biggestCanvas();
                const r = cv ? cv.getBoundingClientRect() : null;
                if (r && r.width > 1 && r.height > 1) {
                    panel.style.left = Math.round(r.left) + 'px';
                    panel.style.top = Math.round(r.top) + 'px';
                    panel.style.width = Math.round(r.width) + 'px';
                    panel.style.height = Math.round(r.height) + 'px';
                    panel.style.transform = '';
                } else {   // no canvas found — fall back to a centred sheet
                    panel.style.left = '50%'; panel.style.top = '60px'; panel.style.transform = 'translateX(-50%)';
                    panel.style.width = 'min(720px,94vw)'; panel.style.height = 'min(80vh,820px)';
                }
            } catch (e) { }
        };

        // Header: flex-none, so it holds its height and Close is on screen from the start.
        const head = document.createElement('div');
        head.style.cssText = 'flex:0 0 auto;display:flex;align-items:center;gap:12px;padding:14px 18px;'
            + 'border-bottom:1px solid ' + C.line + ';background:' + C.bg + ';'
            + 'border-radius:' + C.panelRadius + ' ' + C.panelRadius + ' 0 0;';
        const h1 = document.createElement('div');
        h1.style.cssText = 'font:700 16px ' + C.font + ';color:' + C.title
            + ';flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
        h1.textContent = '' + (o.title || '');
        const btn = document.createElement('button');
        btn.title = 'Close (Esc)';
        btn.setAttribute('data-rec', (o.title || 'panel') + ' close');
        btn.style.cssText = 'cursor:pointer;flex:0 0 auto;border-radius:8px;padding:9px 18px;'
            + 'font:700 13px ' + C.font + ';border:1px solid ' + C.ok + ';background:' + C.ok + ';color:' + C.okInk + ';';
        btn.textContent = 'Close';
        head.appendChild(h1);
        // A caller's own header controls sit between the title and Close.
        for (const el of (Array.isArray(o.headerExtras) ? o.headerExtras : [])) {
            try { if (el) head.appendChild(el); } catch (e) { }
        }
        head.appendChild(btn);

        const bodyEl = document.createElement('div');
        bodyEl.style.cssText = 'flex:1 1 auto;min-height:0;overflow:auto;padding:16px 18px 18px;';
        if (o.body && o.body.nodeType === 1) bodyEl.appendChild(o.body);
        else bodyEl.innerHTML = '' + (o.body == null ? '' : o.body);

        panel.appendChild(head); panel.appendChild(bodyEl);
        fitToCanvas();
        document.body.appendChild(panel);

        let onKey = null, onResize = null, ro = null, closed = false;
        const close = () => {
            if (closed) return;
            closed = true;
            try { if (onResize) window.removeEventListener('resize', onResize); } catch (e) { }
            try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { if (ro) ro.disconnect(); } catch (e) { }
            try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
            try { if (typeof o.onClose === 'function') o.onClose(); } catch (e) { }
        };
        onResize = () => fitToCanvas();
        window.addEventListener('resize', onResize);
        onKey = (e) => { try { if (e.key === 'Escape') close(); } catch (er) { } };
        document.addEventListener('keydown', onKey, true);
        // The canvas itself changing size (panel splits, sidebar toggles), not just the window.
        try {
            const cv0 = biggestCanvas();
            if (cv0 && typeof ResizeObserver === 'function') { ro = new ResizeObserver(() => fitToCanvas()); ro.observe(cv0); }
        } catch (e) { }
        btn.onclick = () => close();

        return { panel: panel, head: head, body: bodyEl, close: close, fit: fitToCanvas, colors: C };
    };

    return { open: open, colors: C, biggestCanvas: biggestCanvas };
}
