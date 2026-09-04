function (opts) {

    // A floating list-of-actions modal in the SAME shape as the editor's "Play a script"
    // panel (manchester/editor.js's openPlayScriptPanel): fixed overlay, navy card, title,
    // optional hint line, then the rows, then Close.
    //   exec('baja/lib/action-modal.js', {
    //       id: 'baja-compound-tools',           // optional; replaces an open one with the same id
    //       title: 'Compound tools',
    //       hint: 'Applies to every compound on the canvas.',
    //       items: [{ label: 'Re-number', sub: 'Re-id the oligos', click: () => {...} }, ...],
    //       onClose: () => {...}                 // optional; fired on Close / Escape only
    //   })
    //
    // Appended to document.body, so it is outside CurrentLayout's panel system entirely --
    // a menu or shelf closing behind it cannot restore a panel over the top of it, which is
    // the failure mode that made panel-mounted versions of this vanish. Resolves with the
    // item that was clicked, or null if it was dismissed.

    return new Promise((resolve) => {
        const o = opts || {};
        const id = o.id || 'baja-action-modal';
        const items = (o.items || []).filter((it) => it && it.label);

        const esc = (s) => ('' + (s || '')).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

        try {
            const prev = document.getElementById(id);
            if (prev && prev.parentNode) prev.parentNode.removeChild(prev);

            const wrap = document.createElement('div');
            wrap.id = id;
            wrap.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:2147483000;width:min(640px,92vw);background:#0b2545;color:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.14);font:13px system-ui,Arial;padding:14px;';

            let html = '<div style="font-weight:700;margin-bottom:4px;">' + esc(o.title || 'Actions') + '</div>';
            if (o.hint) html += '<div style="opacity:.7;margin-bottom:8px;font-size:12px;">' + esc(o.hint) + '</div>';
            html += '<div id="' + id + '-rows" style="max-height:min(52vh,420px);overflow:auto;margin:6px 0 4px 0;">';
            items.forEach((it, i) => {
                html += '<button data-i="' + i + '" class="baja-am-row" style="display:block;width:100%;text-align:left;'
                    + 'background:#0a1e3a;color:#e8eef6;border:1px solid rgba(255,255,255,0.14);border-radius:8px;'
                    + 'padding:9px 12px;margin-bottom:6px;cursor:pointer;font:13px system-ui,Arial;">'
                    + esc(it.label)
                    + (it.sub ? ('<div style="opacity:.6;font-size:11.5px;margin-top:2px;">' + esc(it.sub) + '</div>') : '')
                    + '</button>';
            });
            if (!items.length) html += '<div style="opacity:.6;font-size:12px;">Nothing available.</div>';
            html += '</div>'
                + '<div style="display:flex;gap:8px;align-items:center;margin-top:8px;">'
                + '  <span style="flex:1;"></span>'
                + '  <button id="' + id + '-close" style="background:transparent;color:#cbd5e1;border:1px solid rgba(255,255,255,0.25);border-radius:999px;padding:7px 16px;cursor:pointer;">Close</button>'
                + '</div>';
            wrap.innerHTML = html;
            document.body.appendChild(wrap);

            let done = false;
            const finish = (picked) => {
                if (done) return;
                done = true;
                try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
                try { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } catch (e) { }
                if (!picked) { try { if (typeof o.onClose === 'function') o.onClose(); } catch (e) { } }
                resolve(picked || null);
            };
            const onKey = (e) => { if (e && e.key === 'Escape') { e.stopPropagation(); finish(null); } };
            document.addEventListener('keydown', onKey, true);

            // Hover feedback, and the click itself: the modal closes FIRST, then the action
            // runs, so an action that opens its own window is not covered by this one.
            Array.prototype.forEach.call(wrap.querySelectorAll('.baja-am-row'), (btn) => {
                btn.onmouseenter = () => { try { btn.style.background = '#123055'; } catch (e) { } };
                btn.onmouseleave = () => { try { btn.style.background = '#0a1e3a'; } catch (e) { } };
                btn.onclick = () => {
                    const it = items[+btn.getAttribute('data-i')];
                    finish(it || null);
                    try { if (it && typeof it.click === 'function') it.click(); } catch (e) { }
                };
            });
            document.getElementById(id + '-close').onclick = () => finish(null);
        } catch (e) {
            resolve(null);
        }
    });
}
