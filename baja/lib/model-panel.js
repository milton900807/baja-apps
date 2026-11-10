function (opts) {

    // A MAXIMIZED PANEL FOR AN ANSWER, in the one look this application gives them.
    //
    // snp-more-info.js, the off-target summary and the design summary all draw the same
    // thing: a dark full-screen page, a header carrying what the answer is about and a
    // green Close, and a column of cards whose sections are an uppercase heading over a
    // paragraph. Each had its own copy of that markup. This is it once.
    //
    //   exec('baja/lib/model-panel.js', {
    //       id, title, subtitle,
    //       cards:   [{ title, meta, sections: [{ heading, text }] }],
    //       buttons: [{ label, onClick }],     // optional, left of Close
    //       onClose                            // optional
    //   });
    //
    // Text is escaped, never interpolated as markup: every one of these panels is showing
    // something a model wrote or a file supplied, and neither is markup this app authored.

    const esc = (t) => ('' + (t == null ? '' : t))
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    return (async () => {
        const o = opts || {};
        const id = o.id || 'baja-model-panel';
        const cards = Array.isArray(o.cards) ? o.cards : [];
        const extra = Array.isArray(o.buttons) ? o.buttons : [];

        try {
            const old = document.getElementById(id);
            if (old && old.parentNode) { old.parentNode.removeChild(old); }
        } catch (e) { }

        const panel = document.createElement('div');
        panel.id = id;
        panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#fff;'
            + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';

        // OPTIONAL COLOUR CONTROLS, and nothing changes for a caller that passes none.
        // A section may carry  swatch: { value, onChange(hex) }  and a card
        // swatchAll: { value, onChange(hex) }. The markup is built as a string like the
        // rest of this file, so each control gets an id and is wired up after the panel is
        // in the document; ids are positional because that is the only thing a section is
        // guaranteed to have.
        const swatch = (sw, id, title) => {
            if (!sw) return '';
            const v = /^#[0-9a-fA-F]{6}$/.test('' + (sw.value || '')) ? sw.value : '#c2410c';
            return '<input type="color" id="' + id + '" value="' + v + '" title="' + esc(title || 'Colour') + '" '
                + 'style="vertical-align:middle;margin-left:8px;width:26px;height:18px;padding:0;cursor:pointer;'
                + 'background:transparent;border:1px solid rgba(255,255,255,0.28);border-radius:4px;"/>';
        };

        const card = (c, ci) => ''
            + '<div style="margin-bottom:22px;border-radius:10px;overflow:hidden;'
            + 'background:#0a1e3a;border:1px solid rgba(255,255,255,0.14);">'
            + '<div style="padding:14px 18px;background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);">'
            + '<div style="font:700 16px Arial;color:#e8f0fb;">' + esc(c.title || '')
            + swatch(c.swatchAll, 'mp-swall-' + ci, 'Colour every item in this group') + '</div>'
            + (c.meta ? '<div style="font:12px Arial;color:#9fb3c8;margin-top:4px;">' + esc(c.meta) + '</div>' : '')
            + '</div>'
            + '<div style="padding:6px 18px 16px;">'
            + (Array.isArray(c.sections) ? c.sections : []).map((s, si) => ''
                + '<div style="margin-top:14px;">'
                + '<div style="font:700 11px Arial;letter-spacing:0.06em;text-transform:uppercase;color:#7fb0e8;">'
                + esc(s.heading || '') + swatch(s.swatch, 'mp-sw-' + ci + '-' + si, 'Colour this one') + '</div>'
                + '<div style="font:13.5px/1.55 Arial;color:#dde8f6;margin-top:5px;white-space:pre-wrap;">'
                + esc(s.text || '') + '</div>'
                + '</div>').join('')
            + '</div></div>';

        panel.innerHTML = ''
            + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:16px 22px 14px;'
            + 'background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);box-shadow:0 6px 20px rgba(0,0,0,0.35);">'
            + '<div style="min-width:0;"><div style="font:700 20px Arial;">' + esc(o.title || 'Information') + '</div>'
            + (o.subtitle ? '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">'
                + esc(o.subtitle) + '</div>' : '')
            + '</div>'
            + '<div style="margin-left:auto;display:flex;gap:10px;">'
            + extra.map((b, i) => '<button id="mp-x' + i + '" style="cursor:pointer;border-radius:8px;'
                + 'padding:9px 16px;font:700 12.5px Arial;border:1px solid rgba(255,255,255,0.22);'
                + 'background:transparent;color:#fff;">' + esc(b.label || '') + '</button>').join('')
            + '<button id="mp-close" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 12.5px Arial;'
            + 'border:1px solid #22c55e;background:#22c55e;color:#04210f;">Close</button>'
            + '</div></div>'
            + '<div style="flex:1 1 auto;overflow:auto;padding:24px 22px 32px;">'
            + '<div style="width:100%;max-width:820px;margin:0 auto;">'
            + (cards.length ? cards.map((c, ci) => card(c, ci)).join('')
                : '<div style="color:#9fb3c8;font:13px Arial;">Nothing to show.</div>')
            + '</div></div>';

        document.body.appendChild(panel);
        // These panels sit over an editor that listens for keys, and a paste or an arrow
        // meant for the page must not reach the canvas behind it.
        for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
            panel.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
        }

        const close = () => {
            try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
            try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { if (typeof o.onClose === 'function') o.onClose(); } catch (e) { }
        };
        const onKey = (e) => { if (e && e.key === 'Escape') { close(); } };
        document.addEventListener('keydown', onKey, true);
        try { panel.querySelector('#mp-close').onclick = close; } catch (e) { }
        // Wire every colour control that was asked for. oninput rather than onchange, so the
        // track follows the picker while it is being dragged.
        cards.forEach((c, ci) => {
            try {
                if (c.swatchAll && typeof c.swatchAll.onChange === 'function') {
                    const el = panel.querySelector('#mp-swall-' + ci);
                    if (el) el.oninput = () => { try { c.swatchAll.onChange(el.value); } catch (e) { } };
                }
                (Array.isArray(c.sections) ? c.sections : []).forEach((s, si) => {
                    if (!s || !s.swatch || typeof s.swatch.onChange !== 'function') return;
                    const el = panel.querySelector('#mp-sw-' + ci + '-' + si);
                    if (el) el.oninput = () => { try { s.swatch.onChange(el.value); } catch (e) { } };
                });
            } catch (e) { }
        });
        extra.forEach((b, i) => {
            try {
                const el = panel.querySelector('#mp-x' + i);
                if (el) { el.onclick = () => { try { if (b.onClick) b.onClick(close); } catch (e) { } }; }
            } catch (e) { }
        });
        return close;
    })();
}
