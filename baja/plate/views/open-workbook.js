function (pt, graph, pm, startPath, opts) {
    // opts (optional): { container, onFile, hideExtensions, onPath }. With a container the
    // browser is EMBEDDED there (the home page's file structure) instead of floating over the
    // canvas: no backdrop, no close, every file kind handed to onFile. It returns a controller
    // with refresh / load / currentPath / navigateUp / navigateToFolderNamed, the surface the
    // home page's delete, new-folder and upload flows already drive.
    // OPEN (Analytics). A plain folder browser laid over the canvas, listing the user's
    // drive straight from the server. The Angular file-browser card the old dialog used
    // gets no height inside the Analytics layout and collapsed to nothing, which read as
    // "no files". Folders first, then files with a kind badge; a workbook opens in
    // Analytics, the shared folders show the shared-documents list.
    //   await exec('baja/plate/views/open-workbook.js', pt, graph, pm)
    return (async () => {
        const host_ = window['env']['apiUrl'];
        const user = ('' + (getUser() || '')).trim();
        if (!user) { try { pt && pt.setMessage('Sign in to open a document.', 1); } catch (e) { } return false; }
        const esc = (v) => ('' + (v == null ? '' : v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const when = (t) => { const d = new Date(t); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); };
        const size = (n) => (n == null) ? '' : (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
        const kindOf = (name) => /\.bjb$/i.test(name) ? 'workbook' : /\.baja$/i.test(name) ? 'design' : /\.karyotype(\.json)?$/i.test(name) ? 'genome' : /\.(vcf|vcf\.gz)$/i.test(name) ? 'vcf' : '';
        // The listing, plus the server's message when it sends none: "Missing user id"
        // means the request went out before sign-in had settled, which is retried below.
        let lastListMsg = '';
        const nodes = async (p) => { const r = await GETJSON(host_ + '/get-nodes?key=user&path=' + encodeURIComponent(p)); lastListMsg = (r && r.msg) ? ('' + r.msg) : ''; return (r && r.values) || []; };
        // The folder flag arrives as true/false or as the strings "True"/"False".
        const isDir = (n) => !!n && (n.isFolder === true || n.isFolder === 1 || /^true$/i.test('' + n.isFolder));
        const mobile = (typeof isMobile === 'function') && isMobile();
        const embed = !!(opts && opts.container);
        const hideExt = (opts && Array.isArray(opts.hideExtensions)) ? opts.hideExtensions.map(x => ('' + x).toLowerCase()) : [];
        const hidden = (name) => { const n = ('' + name).toLowerCase(); return hideExt.some(ext => n.length > ext.length + 1 && n.endsWith('.' + ext)) && !/\.karyotype\.json$/i.test(n); };

        try { const old = document.getElementById('baja-open-dialog'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        try { const old = document.getElementById('baja-open-backdrop'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const panel = document.createElement('div');
        panel.id = 'baja-open-dialog';
        // A phone gets the dialog maximized: the whole screen, no rounded card, and rows
        // tall enough for a finger. The desktop keeps the centred card.
        panel.style.cssText = embed
            ? ('position:fixed;left:0;top:0;width:0;height:0;z-index:5;display:flex;flex-direction:column;background:#ffffff;color:#0a2540;'
                + 'border-radius:12px;border:1px solid rgba(10,37,64,0.14);box-shadow:0 4px 18px rgba(10,37,64,0.10);box-sizing:border-box;'
                + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;')
            : mobile
            ? ('position:fixed;inset:0;z-index:2147483000;width:100vw;height:100vh;height:100dvh;max-height:none;'
                + 'display:flex;flex-direction:column;background:#ffffff;color:#0a2540;border-radius:0;border:none;'
                + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;')
            : ('position:fixed;top:56px;left:50%;transform:translateX(-50%);z-index:2147483000;'
                + 'width:min(720px,96vw);max-height:calc(100vh - 80px);display:flex;flex-direction:column;background:#ffffff;color:#0a2540;border-radius:12px;'
                + 'box-shadow:0 12px 40px rgba(10,37,64,0.35);border:1px solid rgba(10,37,64,0.14);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;');
        panel.innerHTML = ''
            + '<div style="display:flex;align-items:center;gap:10px;padding:' + (mobile ? '16px 14px 12px' : '14px 16px 10px') + ';border-bottom:1px solid #e3e9ef;' + (mobile ? 'background:#0a2540;color:#eaf6f9;' : '') + '">'
            + '<div style="font:600 ' + (mobile ? '17px' : '16px') + ' system-ui;">' + (embed ? 'My files' : 'Open') + '</div>'
            + '<div id="ob-crumbs" style="flex:1;min-width:0;font-size:12.5px;color:#4a5a70;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div>'
            + '<button id="ob-shared" type="button" style="cursor:pointer;border-radius:8px;padding:' + (mobile ? '9px 12px' : '6px 10px') + ';font:600 12px system-ui;border:1px solid #1aa3bd;background:' + (mobile ? '#1aa3bd' : 'transparent') + ';color:' + (mobile ? '#ffffff' : '#0f6e7a') + ';white-space:nowrap;">' + (mobile ? 'Shared' : 'Shared documents') + '</button>'
            + (embed ? '<button id="ob-refresh" title="Refresh" type="button" style="cursor:pointer;border-radius:8px;padding:6px 10px;font:600 12px system-ui;border:1px solid #c7d2dd;background:transparent;color:#0a2540;">Refresh</button>' : '')
            + (embed ? '' : '<button id="ob-x" title="Close" aria-label="Close" style="cursor:pointer;border:none;background:transparent;color:' + (mobile ? '#eaf6f9' : '#6b7a90') + ';font:700 ' + (mobile ? '22px' : '18px') + ' system-ui;line-height:1;padding:4px 8px;">✕</button>')
            + '</div>'
            + '<div id="ob-list" style="flex:1;overflow:auto;padding:6px 10px 12px;"></div>';
        const backdrop = document.createElement('div');
        backdrop.id = 'baja-open-backdrop';
        backdrop.style.cssText = 'position:fixed;inset:0;z-index:2147482999;background:rgba(10,37,64,0.35);';
        // Embedded: the panel is pinned over the anchor's box from the body, so the anchor
        // (a placeholder Angular re-renders at will) can come and go without touching it.
        const reposition = () => {
            if (!embed) return;
            const a = opts.container;
            if (!a || !a.isConnected) { panel.style.display = 'none'; return; }
            const r = a.getBoundingClientRect();
            if (r.width < 10 || r.height < 10) { panel.style.display = 'none'; return; }
            panel.style.display = 'flex';
            panel.style.left = Math.round(r.left) + 'px'; panel.style.top = Math.round(r.top) + 'px';
            panel.style.width = Math.round(r.width) + 'px'; panel.style.height = Math.round(r.height) + 'px';
        };
        if (embed) { document.body.appendChild(panel); reposition(); try { window.addEventListener('resize', reposition); } catch (e) { } }
        else { document.body.appendChild(backdrop); document.body.appendChild(panel); }
        const $ = (id) => panel.querySelector('#' + id);
        let onKey;
        const close = () => {
            if (embed) return;   // embedded: the page owns the panel
            try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
            try { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); } catch (e) { }
            try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
        };
        if (!embed) {
            onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
            document.addEventListener('keydown', onKey, true);
            $('ob-x').onclick = close; backdrop.onclick = close;
        }
        $('ob-shared').onclick = () => { close(); exec('baja/plate/collab/shared-documents.js', pt, graph, pm); };
        if (embed) { const rb = $('ob-refresh'); if (rb) rb.onclick = () => render(); }

        // The drive root is the user's own folder; the server hands back a scrubbed path
        // for every node, which is what the next listing and /load-file take.
        let stack = [{ label: 'My files', path: startPath || '/' }];
        let renderTries = 0, renderRetry = null;
        const currentPath = () => stack[stack.length - 1].path;
        // A workbook (.bjb) is an analysis file: a bar chart. Designs get a strand, genomes
        // a chromosome-ish mark, everything else a plain document.
        const fileIcon = (k) => {
            const a = '<svg width="18" height="18" viewBox="0 0 24 24" style="flex:0 0 18px;" ';
            if (k === 'workbook') return a + 'fill="#1aa3bd"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="6" width="4" height="15" rx="1"/><rect x="17" y="9" width="4" height="12" rx="1"/><rect x="2" y="21" width="20" height="1.5" fill="#0a2540" opacity=".5"/></svg>';
            if (k === 'design') return a + 'fill="none" stroke="#0f6e7a" stroke-width="2" stroke-linecap="round"><path d="M7 3c0 6 10 6 10 12s-10 6-10 6"/><path d="M17 3c0 6-10 6-10 12s10 6 10 6"/><path d="M8 8h8M8 16h8"/></svg>';
            if (k === 'genome') return a + 'fill="#0f6e7a"><rect x="9" y="2" width="6" height="8" rx="3"/><rect x="9" y="14" width="6" height="8" rx="3"/><circle cx="12" cy="12" r="2.2" fill="#FD5E53"/></svg>';
            return a + 'fill="none" stroke="#6b7a90" stroke-width="1.8" stroke-linejoin="round"><path d="M6 2h8l5 5v15H6z"/><path d="M14 2v5h5"/></svg>';
        };
        const rowCss = 'display:flex;align-items:center;gap:10px;padding:' + (mobile ? '14px 10px' : '7px 10px') + ';border-radius:8px;cursor:pointer;' + (mobile ? 'border-bottom:1px solid #eef2f6;font-size:15px;' : '');
        const openWorkbook = (node) => {
            close();
            try { if (pt && pt.__collab) pt.__collab.destroy(); } catch (e) { }
            try { clear(); } catch (e) { }
            try { CurrentLayout.reset('mainPanel'); } catch (e) { }
            exec('cpd/baja-analytics', node.path, { silent: true, user: getUser(), mode: 'editor' }, '/app/cpd/baja-analytics');
        };
        const render = async () => {
            const cur = stack[stack.length - 1];
            $('ob-crumbs').innerHTML = stack.map((s, i) => '<span class="ob-crumb" data-i="' + i + '" style="cursor:pointer;' + (i === stack.length - 1 ? 'font-weight:600;color:' + (mobile ? '#ffffff' : '#0a2540') + ';' : 'color:' + (mobile ? '#9fd8e6' : '#0f6e7a') + ';') + '">' + esc(s.label) + '</span>').join(' <span style="color:#9aa7b4;">/</span> ');
            $('ob-crumbs').querySelectorAll('.ob-crumb').forEach((c) => { c.onclick = () => { stack = stack.slice(0, +c.getAttribute('data-i') + 1); render(); }; });
            const list = $('ob-list');
            list.innerHTML = '<div style="padding:12px 10px;color:#6b7a90;font-size:12.5px;">Loading…</div>';
            let items = [];
            lastListMsg = '';
            try { items = await nodes(cur.path); } catch (e) { items = []; }
            // Not signed in yet (the browser can mount before the sign-in settles): say so
            // and try again shortly, rather than presenting the folder as empty. A refresh
            // used to be the only way to see the files.
            const notSignedIn = /missing user id/i.test(lastListMsg) || (!items.length && !('' + (getUser() || '')).trim());
            if (notSignedIn) {
                renderTries = (renderTries || 0) + 1;
                if (renderTries <= 12) {
                    list.innerHTML = '<div style="padding:14px 10px;color:#6b7a90;font-size:12.5px;">Signing in…</div>';
                    clearTimeout(renderRetry);
                    renderRetry = setTimeout(() => { if (panel.isConnected) render(); }, 1500);
                    return;
                }
            }
            renderTries = 0;
            items = items.filter(n => n && n.name && !/^\./.test(n.name) && (isDir(n) || !hidden(n.name)));
            try { if (opts && typeof opts.onPath === 'function') opts.onPath(currentPath()); } catch (e) { }
            const folders = items.filter(n => isDir(n)).sort((a, b) => a.name.localeCompare(b.name));
            const files = items.filter(n => !isDir(n)).sort((a, b) => new Date(b.lastEdited || 0) - new Date(a.lastEdited || 0));
            if (!folders.length && !files.length) { list.innerHTML = '<div style="padding:14px 10px;color:#6b7a90;font-size:12.5px;">' + (lastListMsg ? esc(lastListMsg) : 'This folder is empty.') + '</div>'; return; }
            let html = '';
            if (stack.length > 1) html += '<div class="ob-up" style="' + rowCss + 'color:#0f6e7a;font-size:12.5px;">← Back</div>';
            for (const f of folders) {
                html += '<div class="ob-folder" data-path="' + esc(f.path) + '" data-name="' + esc(f.name) + '" style="' + rowCss + '">'
                    + '<svg width="18" height="18" viewBox="0 0 24 24" fill="#1aa3bd"><path d="M10 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2z"/></svg>'
                    + '<span style="flex:1;font:600 13px system-ui;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(f.name) + '</span></div>';
            }
            for (const f of files) {
                const k = kindOf(f.name);
                const openable = embed ? true : (k === 'workbook');
                html += '<div class="ob-file" data-path="' + esc(f.path) + '" data-name="' + esc(f.name) + '" data-open="' + (openable ? 1 : 0) + '" style="' + rowCss + (openable ? '' : 'opacity:.7;') + '">'
                    + fileIcon(k)
                    + '<span style="flex:1;min-width:0;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(f.name) + '</span>'
                    + (k ? '<span style="font:600 10px system-ui;letter-spacing:.06em;text-transform:uppercase;color:' + (openable ? '#0f6e7a' : '#6b7a90') + ';background:' + (openable ? '#e6f6f9' : '#eef2f6') + ';border-radius:6px;padding:3px 7px;">' + k + '</span>' : '')
                    + '<span style="font-size:11.5px;color:#6b7a90;white-space:nowrap;">' + esc(when(f.lastEdited)) + (f.size != null ? ' · ' + esc(size(f.size)) : '') + '</span></div>';
            }
            list.innerHTML = html;
            list.querySelectorAll('.ob-folder, .ob-file, .ob-up').forEach((el) => {
                el.onmouseenter = () => { el.style.background = '#e6f6f9'; };
                el.onmouseleave = () => { el.style.background = 'transparent'; };
            });
            const up = list.querySelector('.ob-up'); if (up) up.onclick = () => { stack.pop(); render(); };
            list.querySelectorAll('.ob-folder').forEach((el) => {
                el.onclick = () => {
                    const name = el.getAttribute('data-name'), path = el.getAttribute('data-path');
                    if (name === 'shared' || name === 'shared_with_me') { close(); exec('baja/plate/collab/shared-documents.js', pt, graph, pm); return; }
                    stack.push({ label: name, path }); render();
                };
            });
            list.querySelectorAll('.ob-file').forEach((el) => {
                el.onclick = () => {
                    const node = { path: el.getAttribute('data-path'), name: el.getAttribute('data-name'), isFolder: false };
                    if (embed && opts && typeof opts.onFile === 'function') { try { opts.onFile(node); } catch (e) { console.warn('open', e); } return; }
                    if (el.getAttribute('data-open') === '1') openWorkbook(node);
                    else { try { pt && pt.setMessage('Only Baja workbooks (.bjb) open here. Designs open in the editor, genomes in the Genome Viewer.', 3); } catch (e) { } }
                };
            });
        };
        render();
        if (!embed) return true;
        // The controller the home page drives (the surface of the widget it replaces).
        const ctl = {
            refresh: () => render(),
            load: async (node) => { const p = (node && (node.path || node)) || '/'; const name = (node && node.name) || ('' + p).split('/').filter(Boolean).pop() || 'My files'; if (p === '/' || p === (startPath || '/')) stack = [stack[0]]; else stack.push({ label: name, path: '' + p }); await render(); },
            get currentPath() { return currentPath(); },
            set currentPath(p) { const v = ('' + (p || '/')).replace(/\/+/g, '/'); if (v === '/' || v === (startPath || '/')) stack = [stack[0]]; else stack = [stack[0], { label: v.split('/').filter(Boolean).pop() || v, path: v }]; render(); },
            get canNavigateUp() { return stack.length > 1; },
            set canNavigateUp(v) { },
            navigateUp: async () => { if (stack.length > 1) { stack.pop(); await render(); } },
            navigateToFolderNamed: async (name) => {
                const items = await nodes(currentPath()).catch(() => []);
                const f = (items || []).find(n => isDir(n) && n.name === name);
                if (f) { stack.push({ label: f.name, path: f.path }); await render(); }
            },
            reposition,
            anchor: (el) => { opts.container = el; reposition(); },
            alive: () => !!panel.isConnected,
            destroy: () => { try { window.removeEventListener('resize', reposition); } catch (e) { } try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } }
        };
        return ctl;
    })();
}
