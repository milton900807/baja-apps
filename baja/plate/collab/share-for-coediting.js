function (pt, graph, pm, objectRef) {
    // objectRef (optional): { kind: 'plate'|'plot'|'glyph', id, label }. With it the share is
    // narrowed to ONE object: the recipient sees only that table, chart, timeline or note,
    // maximized, and edits it under the usual lock. The whole workbook still travels so
    // formulas that reach other tables keep working.
    const objectOnly = (objectRef && objectRef.id) ? { kind: '' + objectRef.kind, id: '' + objectRef.id, label: '' + (objectRef.label || '') } : null;
    const objectNoun = objectOnly ? (objectOnly.kind === 'plot' ? 'chart' : objectOnly.kind === 'glyph' ? 'note' : 'table') : '';

    // SHARE FOR CO-EDITING. The owner names an email address; the workbook is copied into a
    // folder only that address may read (/share-with), the recipient gets a link that opens it
    // in Analytics, and BOTH sides switch to that shared copy so they are editing one document
    // with live locks. The owner's original file is left as it was.
    return (async () => {
        const host_ = window['env']['apiUrl'];
        const user = ('' + (getUser() || '')).trim();
        if (!user) { try { pt.setMessage('Sign in to share a document.', 1); } catch (e) { } return; }
        const rawName = ('' + (graph.file || pt.file || 'untitled')).replace(/\.bjb$/i, '') || 'untitled';
        const docName = rawName + '.bjb';
        const esc = (v) => ('' + (v == null ? '' : v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const body = (r) => (r && r.error && typeof r.error === 'object') ? r.error : r;
        const serialize = () => {
            const seen = new WeakSet();
            return JSON.stringify(graph, function (key, value) {
                if (key === 'canvas') return;
                if (key != null && ('' + key).toLowerCase().startsWith('_')) return null;
                if (typeof value === 'object' && value !== null) {
                    if (Array.isArray(value) && value.every((e) => e && typeof e === 'object' && 'x' in e && 'y' in e)) return value;
                    if (value.x != null && value.y != null && !isNaN(key) && parseInt(key, 10).toString() === key) return value;
                    if (seen.has(value)) return '[a_c]';
                    seen.add(value);
                }
                return value;
            });
        };

        try { const old = document.getElementById('baja-coedit-dialog'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        try { const old = document.getElementById('baja-coedit-backdrop'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const panel = document.createElement('div');
        panel.id = 'baja-coedit-dialog';
        panel.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:2147483000;'
            + 'width:min(560px,94vw);max-height:calc(100vh - 90px);overflow:auto;background:#ffffff;color:#0a2540;border-radius:12px;'
            + 'box-shadow:0 12px 40px rgba(10,37,64,0.35);border:1px solid rgba(10,37,64,0.14);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:18px;';
        const fieldCss = 'width:100%;box-sizing:border-box;background:#f4f7fa;color:#0a2540;border:1px solid #c7d2dd;border-radius:8px;padding:10px;font:13px system-ui,sans-serif;';
        panel.innerHTML = ''
            + '<button id="ce-x" title="Close" aria-label="Close" style="position:absolute;top:8px;right:10px;cursor:pointer;border:none;background:transparent;color:#6b7a90;font:700 18px system-ui;line-height:1;padding:4px 8px;">✕</button>'
            + '<div style="font:600 16px system-ui,sans-serif;margin-bottom:4px;padding-right:24px;">' + (objectOnly
                ? ('Share the ' + objectNoun + ' "' + esc(objectOnly.label || objectNoun) + '" with someone')
                : ('Share "' + esc(rawName) + '" for co-editing')) + '</div>'
            + '<div style="font-size:12.5px;color:#4a5a70;margin-bottom:12px;">' + (objectOnly
                ? ('They get a link that opens just this ' + objectNoun + ', maximized, once they sign in. The rest of "' + esc(rawName) + '" stays out of view. '
                    + 'You both work on it live: one person edits it at a time, and a lock badge shows who has it.')
                : ('They get a link that opens this workbook in Analytics once they sign in. You both work on the same document: '
                    + 'a table, timeline or note can be edited by one person at a time, and a lock badge shows who has it.')) + '</div>'
            + '<label style="font-size:12px;color:#6b7a90;">Email address (one or more, separated by commas)</label>'
            + '<input id="ce-to" type="text" autocomplete="off" placeholder="name@example.org" style="' + fieldCss + 'margin:4px 0 10px;">'
            + '<label style="font-size:12px;color:#6b7a90;">Message (optional)</label>'
            + '<textarea id="ce-msg" rows="2" placeholder="A note to go with the document" style="' + fieldCss + 'margin:4px 0 10px;resize:vertical;"></textarea>'
            + '<div id="ce-status" style="font-size:12px;color:#4a5a70;min-height:16px;margin-bottom:6px;"></div>'
            + '<div id="ce-results"></div>'
            + '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:10px;">'
            + '<button id="ce-close" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:600 13px system-ui;border:1px solid #c7d2dd;background:transparent;color:#0a2540;">Close</button>'
            + '<button id="ce-send" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:600 13px system-ui;border:1px solid #1aa3bd;background:#1aa3bd;color:#ffffff;">Share</button>'
            + '</div>'
            + '<div id="ce-existing" style="margin-top:14px;"></div>';
        const backdrop = document.createElement('div');
        backdrop.id = 'baja-coedit-backdrop';
        backdrop.style.cssText = 'position:fixed;inset:0;z-index:2147482999;background:rgba(10,37,64,0.35);';
        document.body.appendChild(backdrop);
        document.body.appendChild(panel);
        const $ = (id) => panel.querySelector('#' + id);
        let onKey;
        const close = () => {
            try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
            try { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); } catch (e) { }
            try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { }
        };
        $('ce-close').onclick = close; $('ce-x').onclick = close; backdrop.onclick = close;
        onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
        document.addEventListener('keydown', onKey, true);

        const row = (r, withMail) => {
            const mail = !withMail ? '' : (r.mailed
                ? '<span style="color:#15803d;">Emailed to ' + esc(r.to) + '.</span>'
                : '<span style="color:#b45309;">Email not sent' + (r.mailError ? ' (' + esc(r.mailError) + ')' : '') + '. Copy the link and send it yourself.</span>');
            return '<div style="background:#f4f7fa;border:1px solid #dfe6ee;border-radius:8px;padding:8px 10px;margin:6px 0;font-size:12px;">'
                + '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;"><b>' + esc(r.to) + '</b>'
                + '<span style="white-space:nowrap;"><button class="ce-copy" data-link="' + esc(r.url) + '" style="cursor:pointer;border-radius:6px;padding:4px 10px;font:600 12px system-ui;border:1px solid #1aa3bd;background:transparent;color:#0f6e7a;margin-right:6px;">Copy link</button>'
                + '<button class="ce-revoke" data-code="' + esc(r.code) + '" style="cursor:pointer;border-radius:6px;padding:4px 10px;font:600 12px system-ui;border:1px solid #c7d2dd;background:transparent;color:#b42318;">Revoke</button></span></div>'
                + '<div style="word-break:break-all;margin-top:4px;"><a href="' + esc(r.url) + '" target="_blank" style="color:#0f6e7a;">' + esc(r.url) + '</a></div>'
                + (mail ? '<div style="margin-top:4px;">' + mail + '</div>' : '') + '</div>';
        };
        const wire = (root) => {
            root.querySelectorAll('.ce-copy').forEach((b) => { b.onclick = async () => { try { await navigator.clipboard.writeText(b.getAttribute('data-link')); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy link'; }, 1500); } catch (e) { } }; });
            root.querySelectorAll('.ce-revoke').forEach((b) => {
                b.onclick = async () => {
                    b.disabled = true;
                    try { await POSTJSON({ user, code: b.getAttribute('data-code') }, host_ + '/share-with/revoke'); } catch (e) { }
                    await refresh();
                };
            });
        };
        const refresh = async () => {
            try {
                const r = body(await GETJSON(host_ + '/share-with?user=' + encodeURIComponent(user) + '&name=' + encodeURIComponent(docName)));
                const shares = ((r && r.shares) || []).filter((x) => objectOnly ? (x.object && ('' + x.object.id) === objectOnly.id) : !x.object);
                $('ce-existing').innerHTML = shares.length
                    ? '<div style="font:600 11px system-ui;letter-spacing:.08em;text-transform:uppercase;color:#6b7a90;margin-bottom:4px;">Already shared with</div>' + shares.map(s => row(s, false)).join('')
                    : '';
                wire($('ce-existing'));
            } catch (e) { }
        };
        refresh();

        // After the copy is made, this editor works on it: saves go to the shared path and the
        // live session is joined there.
        const switchToShared = async (r) => {
            if (!r || !r.path) return;
            try {
                if (pt.__collab && pt.__collab.docPath !== r.path) { try { pt.__collab.destroy(); } catch (e) { } pt.__collab = null; }
                if (!pt.__collab) pt.__collab = await exec('baja/plate/collab/collab-session.js', pt, { path: r.path, graph });
                pt.__collabDoc = r.path;
                pt.__collabShareUrl = r.url || pt.__collabShareUrl;
                graph.file = r.name;
                if (pt.file != null) pt.file = r.path;
                try { window.history.replaceState({ collab: r.path }, 'analytics', '/app/cpd/baja-analytics?share=' + encodeURIComponent(r.code)); } catch (e) { }
            } catch (e) { console.warn('could not join the shared document', e); }
        };

        $('ce-send').onclick = async () => {
            const raw = ('' + ($('ce-to').value || '')).split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
            if (!raw.length) { $('ce-status').textContent = 'Enter at least one email address.'; return; }
            const message = ('' + ($('ce-msg').value || '')).trim();
            const btn = $('ce-send'); btn.disabled = true; btn.textContent = 'Sharing…';
            let value = '';
            try { value = serialize(); } catch (e) { $('ce-status').textContent = 'Could not serialize the document: ' + e; btn.disabled = false; btn.textContent = 'Share'; return; }
            const out = [];
            let last = null;
            for (const to of raw) {
                try {
                    const r = body(await POSTJSON({ user, to, name: docName, value, message, object: objectOnly }, host_ + '/share-with'));
                    if (r && r.error) out.push('<div style="color:#b42318;font-size:12px;margin:4px 0;">' + esc(to) + ': ' + esc(r.error) + '</div>');
                    else { out.push(row(r, true)); last = r; }
                } catch (e) { out.push('<div style="color:#b42318;font-size:12px;margin:4px 0;">' + esc(to) + ': ' + esc(e && e.message ? e.message : e) + '</div>'); }
            }
            $('ce-results').innerHTML = out.join('');
            wire($('ce-results'));
            $('ce-to').value = '';
            btn.disabled = false; btn.textContent = 'Share';
            if (last) {
                await switchToShared(last);
                $('ce-status').textContent = objectOnly
                    ? ('You are now working on the shared copy; ' + shortName(last.to) + ' sees only this ' + objectNoun + ', and you will see when they pick it up.')
                    : ('You are now working on the shared copy; saves go there, and you will see when ' + shortName(last.to) + ' picks something up.');
            }
            await refresh();
        };
        function shortName(email) { return ('' + (email || '')).split('@')[0]; }
    })();
}
