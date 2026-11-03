function (graph, items, opts) {
    // THE POINT'S OPTIONS IN A SIDE PANEL, not a menu over the canvas.
    //   exec('baja/plots/point-side-panel.js', pt, items, { title, subtitle, canvas, point })
    //
    // A click on a timeline point used to open a canvas Menu and hand it to pt.menu. While
    // pt.menu is set, mouseDown answers nothing else, so the menu was MODAL: the timeline
    // behind it could not be panned, zoomed or clicked until an item was chosen or the menu
    // was dismissed. This panel is docked to the right edge of the canvas instead and leaves
    // the canvas alone. Click another point and the panel shows that point instead; press
    // the close button or Escape (or deselect everything) to put it away.
    //
    // It is deliberately NOT role="dialog": pt.__modalOver() treats any visible dialog as
    // modal and would block the canvas again.
    //
    // Items are the usual { label, click }, { type:'separator' }, { header:true, label },
    // with emphasis:'danger' (or a red bg) for destructive ones. A destructive item, or one
    // carrying closePanel:true, closes the panel after it runs; the rest leave it open so
    // you can do several things to the same point.
    const C = {
        bg: '#0b2545', line: 'rgba(255,255,255,0.14)', ink: '#eaf6f9',
        dim: '#8fb8c8', hot: 'rgba(26,163,189,0.38)', danger: 'rgba(217,58,43,0.38)'
    };
    const o = opts || {};
    const WIDTH = o.width || 280;

    const list = (Array.isArray(items) ? items : []).filter(Boolean);

    // One panel at a time: a new point replaces the old one in place.
    try { if (window.__bajaPointPanel && window.__bajaPointPanel.destroy) window.__bajaPointPanel.destroy(); } catch (e) { }
    if (!list.length) return null;

    const esc = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const labelOf = (it) => ('' + ((it && (it.label || it.name)) || '')).trim();
    const isSub = (it) => /[▸►>]\s*$/.test(labelOf(it));
    const isDanger = (it) => !!it && (it.emphasis === 'danger' || /^#?fd5e53$/i.test(('' + (it.bg || '')).replace('#', ''))
        || /^delete\b/i.test(labelOf(it)));

    const el = document.createElement('div');
    el.id = 'baja-point-side-panel';
    el.setAttribute('role', 'complementary');
    el.setAttribute('aria-label', 'Point options');
    el.style.cssText = 'position:fixed;z-index:2147483500;width:' + WIDTH + 'px;box-sizing:border-box;'
        + 'display:flex;flex-direction:column;background:' + C.bg + ';color:' + C.ink + ';'
        + 'border:1px solid ' + C.line + ';border-radius:12px;'
        + 'box-shadow:0 18px 44px rgba(0,0,0,0.45);font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif;'
        + 'transform:translateX(12px);opacity:0;transition:transform .14s ease,opacity .14s ease;';

    let html = '<div style="display:flex;align-items:flex-start;gap:8px;padding:10px 10px 8px 12px;border-bottom:1px solid ' + C.line + ';flex:0 0 auto;">'
        + '<div style="flex:1 1 auto;min-width:0;">'
        + '<div style="font:700 13px system-ui,Segoe UI,Arial;color:' + C.ink + ';overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + esc(o.title || 'Point') + '</div>'
        + (o.subtitle ? '<div style="font:11.5px system-ui,Segoe UI,Arial;color:' + C.dim + ';margin-top:2px;">' + esc(o.subtitle) + '</div>' : '')
        + '</div>'
        + '<button data-close="1" title="Close (Esc)" aria-label="Close" style="flex:0 0 auto;background:transparent;border:0;color:' + C.dim + ';'
        + 'font:600 16px system-ui,Segoe UI,Arial;line-height:1;cursor:pointer;padding:2px 6px;border-radius:6px;">×</button>'
        + '</div>'
        + '<div data-body="1" style="flex:1 1 auto;overflow-y:auto;padding:6px;">';
    list.forEach((it, i) => {
        if (it.type === 'separator' || it.separator) {
            html += '<div style="height:1px;background:' + C.line + ';margin:5px 8px;"></div>';
            return;
        }
        const lab = labelOf(it);
        if (!lab) return;
        if (it.header || it.type === 'text') {
            html += '<div style="padding:7px 10px 3px;font:600 10.5px system-ui,Segoe UI,Arial;'
                + 'letter-spacing:.09em;text-transform:uppercase;color:' + C.dim + ';">' + esc(lab) + '</div>';
            return;
        }
        const danger = isDanger(it);
        html += '<button data-i="' + i + '"' + (it.disabled ? ' disabled' : '')
            + ' style="display:flex;width:100%;align-items:center;gap:10px;box-sizing:border-box;'
            + 'background:transparent;border:0;border-radius:8px;padding:8px 10px;cursor:'
            + (it.disabled ? 'default' : 'pointer') + ';text-align:left;'
            + 'font:' + (danger ? '600' : '500') + ' 13px system-ui,Segoe UI,Arial;'
            + 'color:' + (it.disabled ? C.dim : (danger ? '#ffb4ab' : C.ink)) + ';opacity:' + (it.disabled ? 0.55 : 1) + ';">'
            + '<span style="flex:1 1 auto;">' + esc(lab.replace(/\s*[▸►>]\s*$/, '')) + '</span>'
            + (isSub(it) ? '<span style="color:' + C.dim + ';font-size:12px;">▸</span>' : '')
            + '</button>';
    });
    html += '</div>';
    el.innerHTML = html;
    document.body.appendChild(el);

    // ---- where it goes: docked to the right edge of the canvas ---------------------------
    let cv = (o.canvas && o.canvas.getBoundingClientRect) ? o.canvas : null;
    if (!cv) { try { cv = graph.__canvas__; } catch (e) { cv = null; } }
    const place = () => {
        const r = (cv && cv.getBoundingClientRect) ? cv.getBoundingClientRect()
            : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight };
        const right = Math.min(r.right, window.innerWidth);
        const top = Math.max(r.top, 0) + 12;
        const bottom = Math.min(r.bottom, window.innerHeight) - 12;
        el.style.left = Math.max(8, right - WIDTH - 12) + 'px';
        el.style.top = top + 'px';
        el.style.maxHeight = Math.max(160, bottom - top) + 'px';
    };
    place();
    requestAnimationFrame(() => { el.style.transform = 'translateX(0)'; el.style.opacity = '1'; });

    // ---- closing -------------------------------------------------------------------------
    // No outside-click close: that is the whole point. The canvas keeps working with the
    // panel up, and a click on another point swaps the panel's contents.
    const panel = { point: o.point || null };
    const onKey = (e) => {
        if (e.key !== 'Escape') return;
        // Escape belongs to an open popup or prompt first.
        if (window.__bajaPopupMenu) return;
        close();
    };
    function close() {
        try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
        try { window.removeEventListener('resize', place); } catch (e) { }
        try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) { }
        if (window.__bajaPointPanel === panel) window.__bajaPointPanel = null;
        try { if (typeof o.onClose === 'function') o.onClose(); } catch (e) { }
    }
    panel.el = el; panel.destroy = close;
    window.__bajaPointPanel = panel;
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', place);

    // ---- choosing ------------------------------------------------------------------------
    el.addEventListener('click', (e) => {
        if (e.target && e.target.closest && e.target.closest('button[data-close]')) { e.stopPropagation(); close(); return; }
        const b = e.target && e.target.closest ? e.target.closest('button[data-i]') : null;
        if (!b || b.disabled) return;
        e.stopPropagation();
        const it = list[+b.getAttribute('data-i')];
        // Submenus open beside the panel, at its own left edge, rather than at the pointer.
        let sx = o.screenX, sy = o.screenY;
        try {
            const br = b.getBoundingClientRect();
            const r = cv.getBoundingClientRect();
            const kx = cv.width ? cv.width / r.width : 1, ky = cv.height ? cv.height / r.height : 1;
            sx = (el.getBoundingClientRect().left - r.left - 250) * kx;
            sy = (br.top - r.top) * ky;
        } catch (err) { }
        if (isDanger(it) || it.closePanel) close();
        try { const rr = it && it.click && it.click(sx, sy); if (rr && rr.catch) rr.catch(() => { }); }
        catch (err) { console.warn('[point side panel]', err); }
    });
    el.addEventListener('mouseover', (e) => {
        const b = e.target && e.target.closest ? e.target.closest('button[data-i]') : null;
        for (const x2 of el.querySelectorAll('button[data-i]')) {
            const it = list[+x2.getAttribute('data-i')];
            x2.style.background = (x2 === b && !x2.disabled) ? (isDanger(it) ? C.danger : C.hot) : 'transparent';
        }
    });
    el.addEventListener('mouseleave', () => {
        for (const x2 of el.querySelectorAll('button[data-i]')) x2.style.background = 'transparent';
    });
    // Presses and scrolls on the panel are the panel's, not the canvas's.
    for (const ev of ['mousedown', 'mouseup', 'mousemove', 'wheel', 'contextmenu', 'dblclick', 'touchstart']) {
        el.addEventListener(ev, (e) => { e.stopPropagation(); if (ev === 'contextmenu') e.preventDefault(); }, ev === 'wheel' || ev === 'touchstart' ? { passive: false } : false);
    }
    return panel;
}
