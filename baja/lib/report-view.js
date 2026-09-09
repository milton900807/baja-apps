function (graph, genegraph_panel_layout, opts) {

    // A maximised reader for a generated report.
    //   await exec('baja/lib/report-view.js', graph, genegraph_panel_layout,
    //              { title, subtitle, markdown, filename })
    //
    // Same overlay idiom as design-summary.js and the libraries: it fills the screen over the
    // editor rather than mounting into mainPanel, so nothing has to be unmounted and put back
    // — the clear + setComponent pairing that leaves the canvas gone (see
    // baja/data/load-variants.js) is avoided entirely.
    return (async () => {
        const o = opts || {};
        const ID = 'baja-report-view';
        const md = ('' + (o.markdown || '')).trim();
        if (!md) return false;

        const esc = (t) => ('' + (t == null ? '' : t))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        // A SMALL markdown subset, on purpose: headings, bold, italic, code, lists and
        // paragraphs are what the report generator is told to emit. Escaping happens FIRST and
        // only then are the few known patterns turned into tags, so nothing in the model's
        // output can inject markup.
        const render = (src) => {
            const lines = esc(src).split(/\r?\n/);
            const out = [];
            let inList = false;
            const closeList = () => { if (inList) { out.push('</ul>'); inList = false; } };
            const inline = (s) => s
                .replace(/`([^`]+)`/g, '<code style="background:#0b2545;border:1px solid rgba(255,255,255,0.14);'
                    + 'border-radius:5px;padding:1px 5px;font:12px ui-monospace,Menlo,monospace;">$1</code>')
                .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
                .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');
            for (const raw of lines) {
                const line = raw.trimEnd();
                if (!line.trim()) { closeList(); continue; }
                let m;
                if ((m = line.match(/^\s*###\s+(.*)$/))) {
                    closeList();
                    out.push('<h3 style="font:700 14px Arial;color:#cfe4ef;margin:20px 0 6px;">' + inline(m[1]) + '</h3>');
                } else if ((m = line.match(/^\s*##\s+(.*)$/))) {
                    closeList();
                    out.push('<h2 style="font:700 17px Arial;color:#4fd0e6;margin:26px 0 8px;'
                        + 'padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.12);">' + inline(m[1]) + '</h2>');
                } else if ((m = line.match(/^\s*#\s+(.*)$/))) {
                    closeList();
                    out.push('<h2 style="font:700 19px Arial;color:#eaf6f9;margin:22px 0 8px;">' + inline(m[1]) + '</h2>');
                } else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
                    if (!inList) { out.push('<ul style="margin:6px 0 6px 18px;padding:0;">'); inList = true; }
                    out.push('<li style="margin:4px 0;">' + inline(m[1]) + '</li>');
                } else if ((m = line.match(/^\s*(\d+)\.\s+(.*)$/))) {
                    if (!inList) { out.push('<ul style="margin:6px 0 6px 18px;padding:0;">'); inList = true; }
                    out.push('<li style="margin:4px 0;">' + inline(m[2]) + '</li>');
                } else {
                    closeList();
                    out.push('<p style="margin:8px 0;">' + inline(line) + '</p>');
                }
            }
            closeList();
            return out.join('');
        };

        try {
            const old = document.getElementById(ID);
            if (old && old.parentNode) old.parentNode.removeChild(old);

            const overlay = document.createElement('div');
            overlay.id = ID;
            overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483340;background:#071a30;'
                + 'color:#dceaf3;display:flex;flex-direction:column;'
                + 'font:14px/1.65 Arial,Helvetica,sans-serif;';

            const head = document.createElement('div');
            head.style.cssText = 'flex:0 0 auto;display:flex;align-items:center;gap:14px;'
                + 'padding:16px 22px;border-bottom:1px solid rgba(255,255,255,0.14);background:#08203c;';
            head.innerHTML = '<div style="min-width:0;flex:1 1 auto;">'
                + '<div style="font:700 17px Arial;color:#eaf6f9;overflow:hidden;text-overflow:ellipsis;'
                + 'white-space:nowrap;">' + esc(o.title || 'Report') + '</div>'
                + (o.subtitle ? ('<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">'
                    + esc(o.subtitle) + '</div>') : '')
                + '</div>';

            const mkBtn = (label, primary) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = label;
                b.style.cssText = 'flex:0 0 auto;cursor:pointer;border-radius:9px;padding:9px 16px;'
                    + 'font:700 13px Arial;'
                    + (primary ? 'border:0;background:#12c2e0;color:#04202c;'
                        : 'border:1px solid rgba(255,255,255,0.24);background:transparent;color:#cfe4ef;');
                return b;
            };
            const copy = mkBtn('Copy', false);
            const save = mkBtn('Download', false);
            const close = mkBtn('Close', true);
            head.appendChild(copy); head.appendChild(save); head.appendChild(close);

            const body = document.createElement('div');
            body.style.cssText = 'flex:1 1 auto;overflow:auto;padding:26px 22px 60px;';
            const inner = document.createElement('div');
            inner.style.cssText = 'max-width:820px;margin:0 auto;';
            inner.innerHTML = render(md);
            body.appendChild(inner);

            overlay.appendChild(head);
            overlay.appendChild(body);
            document.body.appendChild(overlay);

            const drop = () => { try { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); } catch (e) { } };
            close.onclick = drop;
            copy.onclick = async () => {
                try { await navigator.clipboard.writeText(md); copy.textContent = 'Copied'; }
                catch (e) { copy.textContent = 'Copy failed'; }
                setTimeout(() => { copy.textContent = 'Copy'; }, 1600);
            };
            save.onclick = () => {
                try {
                    const blob = new Blob([md], { type: 'text/markdown' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = o.filename || 'report.md';
                    document.body.appendChild(a); a.click();
                    setTimeout(() => { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) { } }, 0);
                } catch (e) { }
            };
            // Escape closes, and keys must not reach the editor behind the overlay.
            overlay.tabIndex = -1;
            overlay.addEventListener('keydown', (e) => {
                try { e.stopPropagation(); } catch (e2) { }
                if (e.key === 'Escape') drop();
            });
            for (const ev of ['keyup', 'keypress', 'paste', 'wheel']) {
                overlay.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
            }
            try { overlay.focus(); } catch (e) { }
            return true;
        } catch (e) {
            try { graph.setMessage(' Could not open the report: ' + e + ' '); } catch (e2) { }
            return false;
        }
    })();
}
