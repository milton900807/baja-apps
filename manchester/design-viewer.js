function (path, config) {
    // THE DESIGN VIEWER. Opens a .design file -- an LOH design strategy saved from the Genome
    // Viewer -- without the genome it came from. Everything it shows is inside the file, and
    // every gene can still go to the oligo editor as two tracks, germline and tumor.
    return (async () => {
        const host_ = window['env']['apiUrl'];
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        // The path, read the way the Genome Viewer reads its own: decoded once, slashes
        // collapsed, and with no folder id taken to mean the user's own My Files.
        const normPath = (v) => {
            let t = ('' + (v == null ? '' : v)).trim();
            if (/%[0-9A-Fa-f]{2}/.test(t)) { try { t = decodeURIComponent(t); } catch (e) { } }
            t = t.replace(/\/{2,}/g, '/');
            if (!t) return '';
            if (t.charAt(0) !== '/') t = '/' + t;
            const head = t.replace(/^\/+/, '').split('/')[0] || '';
            if (!/^[0-9a-f]{32,}$/i.test(head) && !/^myfiles$/i.test(head)) t = '/myfiles/' + t.replace(/^\/+/, '');
            return t;
        };
        const p = normPath(path);
        const fileName = p.split('/').filter(Boolean).pop() || 'design';

        // ITS OWN PANEL, ON THE PAGE BODY. It was drawn inside the 'html' widget, whose Angular
        // binding re-applies the widget's original HTML on every change-detection pass -- so
        // whatever was drawn into it was wiped straight away, leaving the empty navy container.
        // A fixed panel on the body is outside that binding, as the LOH Design Strategy panel is.
        try { const old = document.getElementById('baja-design-viewer'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const root = document.createElement('div');
        root.id = 'baja-design-viewer';
        root.style.cssText = 'position:fixed;inset:0;z-index:2147482000;overflow:auto;font-family:Arial,Helvetica,sans-serif;'
            + 'background:#071a30;color:#fff;';
        document.body.appendChild(root);
        // Gone when the reader leaves: Close, the back button, or another page taking over.
        const remove = () => { try { if (root.parentNode) root.parentNode.removeChild(root); } catch (e) { } window.removeEventListener('popstate', remove); };
        window.addEventListener('popstate', remove);
        const close = () => { remove(); try { if (window.history.length > 1) window.history.back(); else window.location.assign('/app/'); } catch (e) { } };
        for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) root.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
        const note = (html) => { root.innerHTML = '<div style="padding:40px;font:14px Arial;color:#cfe0f5;">' + html
            + '<div style="margin-top:18px;"><button id="dv-close0" style="cursor:pointer;border-radius:8px;padding:8px 16px;font:700 12.5px Arial;'
            + 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Close</button></div></div>';
            const b0 = document.getElementById('dv-close0'); if (b0) b0.onclick = close; };

        if (!p || !/\.design$/i.test(p)) { note('That is not a .design file.'); return; }
        note('Opening ' + esc(fileName) + '...');
        // A reload comes back to this file.
        try { window.history.replaceState({ design: p }, 'design', '/app/manchester/design-viewer?path=' + p); } catch (e) { }

        let doc = null, err = '';
        try {
            const rs = await POSTJSON({ path: p, key: 'user', user: getUser() }, host_ + '/load-file');
            doc = (typeof rs === 'string') ? JSON.parse(rs) : rs;
            if (doc && doc.msg && !doc.type) { err = '' + doc.msg; doc = null; }
        } catch (e) { err = '' + (e && e.message ? e.message : e); }
        if (!doc || doc.type !== 'baja-loh-design') {
            note(esc(fileName) + ' could not be opened' + (err ? ': ' + esc(err) : ': it is not a saved design strategy.'));
            return;
        }

        const view = await exec('manchester/design-viewer-render.js');
        view(root, doc, { fileName: fileName, path: p, onClose: close });
    })();
}
