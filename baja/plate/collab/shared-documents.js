function (pt, graph, pm) {
    // SHARED DOCUMENTS. Everything shared with you and everything you have shared, by name,
    // person and date, each with an Open button that lands in the shared copy -- so nobody
    // has to guess which seven-letter code folder is the working file.
    //   await exec('baja/plate/collab/shared-documents.js', pt, graph, pm)
    return (async () => {
        const host_ = window['env']['apiUrl'];
        const user = ('' + (getUser() || '')).trim();
        if (!user) { try { pt && pt.setMessage('Sign in to see shared documents.', 1); } catch (e) { } return; }
        const esc = (v) => ('' + (v == null ? '' : v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const body = (r) => (r && r.error && typeof r.error === 'object') ? r.error : r;
        const when = (t) => { const d = new Date(t); if (isNaN(d)) return ''; return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };
        const short = (email) => ('' + (email || '')).split('@')[0] || email;
        const nodes = async (p) => { try { const r = await GETJSON(host_ + '/get-nodes?key=user&path=' + encodeURIComponent(p)); return (r && r.values) || []; } catch (e) { return []; } };
        const isDir = (n) => !!n && (n.isFolder === true || n.isFolder === 1 || /^true$/i.test('' + n.isFolder));

        // ---- gather --------------------------------------------------------------------
        // Mine: the share records (name, recipient, when, code).
        let mine = [];
        try { const r = body(await GETJSON(host_ + '/share-with?user=' + encodeURIComponent(user))); mine = ((r && r.shares) || []); } catch (e) { }
        // With me: pointer files two folders down in shared_with_me/<owner>/<code>/.
        let withMe = [];
        try {
            const root = await nodes('/');
            const swm = root.find(n => isDir(n) && n.name === 'shared_with_me');
            if (swm) {
                const owners = (await nodes(swm.path)).filter(n => isDir(n));
                for (const o of owners) {
                    const codes = (await nodes(o.path)).filter(n => isDir(n));
                    for (const c of codes) {
                        const files = (await nodes(c.path)).filter(n => n && !isDir(n) && !/^\./.test(n.name));
                        for (const f of files) withMe.push({ code: c.name, name: f.name, owner: o.name.replace(/_/g, '.').replace(/\.gmail\.com$/i, '@gmail.com'), ownerLabel: o.name, at: f.lastEdited || null, path: f.path });
                    }
                }
            }
        } catch (e) { }
        mine.sort((a, b) => (b.updated || 0) - (a.updated || 0));
        withMe.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

        // ---- panel ---------------------------------------------------------------------
        try { const old = document.getElementById('baja-shared-docs'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        try { const old = document.getElementById('baja-shared-docs-backdrop'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const mobile = (typeof isMobile === 'function') && isMobile();
        const panel = document.createElement('div');
        panel.id = 'baja-shared-docs';
        panel.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:2147483000;'
            + 'width:min(640px,94vw);max-height:calc(100vh - 90px);overflow:auto;background:#ffffff;color:#0a2540;border-radius:12px;'
            + 'box-shadow:0 12px 40px rgba(10,37,64,0.35);border:1px solid rgba(10,37,64,0.14);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:18px;';
        const kindOf = (name) => /\.bjb$/i.test('' + name) ? 'workbook' : /\.karyotype(\.json)?$/i.test('' + name) ? 'genome' : /\.baja$/i.test('' + name) ? 'design' : '';
        const row = (title, sub, meta, code, name) => '<div class="sd-row" data-code="' + esc(code) + '" data-name="' + esc(name || '') + '" style="display:flex;align-items:center;gap:10px;padding:' + (mobile ? '12px 10px' : '9px 10px') + ';border:1px solid #dfe6ee;border-radius:8px;margin:6px 0;background:#f4f7fa;">'
            + '<div style="flex:1;min-width:0;"><div style="font:600 13px system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(title) + '</div>'
            + '<div style="font-size:12px;color:#4a5a70;">' + sub + (meta ? ' &middot; <span style="color:#6b7a90;">' + esc(meta) + '</span>' : '') + '</div></div>'
            + (kindOf(name) ? '<span style="font:600 10px system-ui;letter-spacing:.06em;text-transform:uppercase;color:#0f6e7a;background:#e6f6f9;border-radius:6px;padding:3px 7px;white-space:nowrap;">' + kindOf(name) + '</span>' : '')
            + '<button class="sd-open" data-code="' + esc(code) + '" data-name="' + esc(name || '') + '" type="button" style="cursor:pointer;border-radius:8px;padding:8px 14px;font:600 12.5px system-ui;border:1px solid #1aa3bd;background:#1aa3bd;color:#ffffff;white-space:nowrap;">Open</button></div>';
        const head = (t) => '<div style="font:600 11px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#6b7a90;margin:14px 0 4px;">' + t + '</div>';
        let html = '<button id="sd-x" title="Close" aria-label="Close" style="position:absolute;top:8px;right:10px;cursor:pointer;border:none;background:transparent;color:#6b7a90;font:700 18px system-ui;line-height:1;padding:4px 8px;">✕</button>'
            + '<div style="font:600 16px system-ui;margin-bottom:2px;padding-right:24px;">Shared documents</div>'
            + '<div style="font-size:12.5px;color:#4a5a70;">Open lands in the shared copy, the one you and the other person both work on.</div>';
        html += head('Shared with you (' + withMe.length + ')');
        html += withMe.length ? withMe.map(s => row(s.name.replace(/\.(bjb|baja|karyotype(\.json)?)$/i, ''), 'from <b>' + esc(short(s.owner)) + '</b>', s.at ? when(s.at) : '', s.code, s.name)).join('')
            : '<div style="padding:6px 10px;font-size:12px;color:#6b7a90;">Nothing has been shared with you yet.</div>';
        html += head('You shared (' + mine.length + ')');
        html += mine.length ? mine.map(s => row(('' + s.name).replace(/\.(bjb|baja|karyotype(\.json)?)$/i, '') + (s.object ? ' — ' + (s.object.label || s.object.kind) + ' only' : ''), 'with <b>' + esc(short(s.to)) + '</b>', when(s.updated || s.created), s.code, s.name)).join('')
            : '<div style="padding:6px 10px;font-size:12px;color:#6b7a90;">You have not shared a document yet. Use Share for co-editing on a document.</div>';
        panel.innerHTML = html;
        const backdrop = document.createElement('div');
        backdrop.id = 'baja-shared-docs-backdrop';
        backdrop.style.cssText = 'position:fixed;inset:0;z-index:2147482999;background:rgba(10,37,64,0.35);';
        document.body.appendChild(backdrop); document.body.appendChild(panel);
        let onKey;
        const close = () => {
            try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
            try { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); } catch (e) { }
            try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
        };
        onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
        document.addEventListener('keydown', onKey, true);
        panel.querySelector('#sd-x').onclick = close; backdrop.onclick = close;
        // Open: the share code is the address; Analytics resolves it to the shared copy and
        // joins the live session, exactly as the emailed link does.
        panel.querySelectorAll('.sd-open').forEach((b) => {
            b.onclick = () => {
                const code = b.getAttribute('data-code');
                const name = b.getAttribute('data-name') || '';
                close();
                // A workbook while Analytics is running opens in place. Anything else (a
                // design, a genome, or a workbook from the file manager) goes through the
                // server's share link, which routes by file kind exactly as the email does.
                const inAnalytics = !!(pt && pm && /baja-analytics/.test('' + window.location.pathname));
                if (inAnalytics && /\.bjb$/i.test(name)) {
                    try { if (pt && pt.__collab) pt.__collab.destroy(); } catch (e) { }
                    try { clear(); } catch (e) { }
                    try { CurrentLayout.reset('mainPanel'); } catch (e) { }
                    try { window.history.replaceState({ collab: code }, 'Baja - Pedregal', '/app/cpd/baja-analytics?share=' + encodeURIComponent(code)); } catch (e) { }
                    exec('cpd/baja-analytics', '', { silent: true, user: getUser(), mode: 'editor' }, '/app/cpd/baja-analytics');
                    return;
                }
                window.location.href = '/s/' + encodeURIComponent(code);
            };
        });
        return true;
    })();
}
