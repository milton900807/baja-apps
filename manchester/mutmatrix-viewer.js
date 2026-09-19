function (path, config) {
    // THE MATRIX VIEWER. Opens a .mutmax file -- a differential mutational matrix saved from a
    // region of the Genome Viewer -- without the genome it came from. Everything it shows is
    // inside the file: the pair, the counts, every gene's variants and the substitution spectrum.
    return (async () => {
        const host_ = window['env']['apiUrl'];
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        // The path, read as the Genome Viewer reads its own: decoded once, slashes collapsed,
        // and with no folder id taken to mean the user's own My Files.
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
        // Shared two ways, as a design strategy is: config.shared from the public viewer, or
        // ?share=<code> for a copy shared with a person, resolved against whoever is signed in.
        let shared = !!(config && config.shared);
        let srcPath = path;
        let sc = '';
        try { sc = ('' + (new URL(window.location.href).searchParams.get('share') || '')).trim(); } catch (e) { sc = ''; }
        if (sc) {
            const who = ('' + ((typeof getUser === 'function' ? getUser() : '') || '')).trim();
            if (!who) {
                try { sessionStorage.setItem('oidc.returnTo', window.location.pathname + window.location.search); } catch (e) { }
                window.location.href = window.location.origin + '/login?free=1';
                return;
            }
            try {
                const r0 = await GETJSON(host_ + '/share-open?code=' + encodeURIComponent(sc) + '&user=' + encodeURIComponent(who));
                const b0 = (r0 && r0.error && typeof r0.error === 'object') ? r0.error : r0;
                if (b0 && b0.path) { srcPath = '' + b0.path; shared = true; }
            } catch (e) { }
        }
        const p = normPath(srcPath);
        const fileName = p.split('/').filter(Boolean).pop() || 'matrix';

        // Its own panel on the page body: never inside the 'html' widget, whose Angular binding
        // re-applies its own HTML and would wipe this away (as it did the Design Viewer once).
        try { const old = document.getElementById('baja-mutmatrix-viewer'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const root = document.createElement('div');
        root.id = 'baja-mutmatrix-viewer';
        root.style.cssText = 'position:fixed;inset:0;z-index:2147482000;overflow:auto;font-family:Arial,Helvetica,sans-serif;background:#071a30;color:#fff;';
        document.body.appendChild(root);
        const remove = () => { try { if (root.parentNode) root.parentNode.removeChild(root); } catch (e) { } window.removeEventListener('popstate', remove); };
        window.addEventListener('popstate', remove);
        // Closing opens My Files, as the Design Viewer does: the browsers clear the screen before
        // opening a file, so going back in history lands on an empty page.
        const close = () => {
            remove();
            const signedIn = !!('' + ((typeof getUser === 'function' ? getUser() : '') || '')).trim();
            if (!signedIn) { try { if (window.history.length > 1) window.history.back(); else window.location.assign('/'); } catch (e) { } return; }
            try { window.history.pushState({}, 'files', '/app/manchester/fb'); } catch (e) { }
            try { exec('manchester/fb.js'); } catch (e) { try { window.location.assign('/app/manchester/fb'); } catch (e2) { } }
        };
        for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) root.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
        const note = (html) => { root.innerHTML = '<div style="padding:40px;font:14px Arial;color:#cfe0f5;">' + html
            + '<div style="margin-top:18px;"><button id="mx-close0" style="cursor:pointer;border-radius:8px;padding:8px 16px;font:700 12.5px Arial;'
            + 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Close</button></div></div>';
            const b0 = document.getElementById('mx-close0'); if (b0) b0.onclick = close; };

        if (!p || !/\.mutmax$/i.test(p)) { note('That is not a .mutmax file.'); return; }
        note('Opening ' + esc(fileName) + '...');
        if (!shared) { try { window.history.replaceState({ mutmax: p }, 'matrix', '/app/manchester/mutmatrix-viewer?path=' + p); } catch (e) { } }

        let doc = null, err = '';
        try {
            const rs = await POSTJSON({ path: p, key: 'user', user: getUser() }, host_ + '/load-file');
            doc = (typeof rs === 'string') ? JSON.parse(rs) : rs;
            if (doc && doc.msg && !doc.type) { err = '' + doc.msg; doc = null; }
        } catch (e) { err = '' + (e && e.message ? e.message : e); }
        if (!doc || doc.type !== 'baja-mut-matrix') {
            note(esc(fileName) + ' could not be opened' + (err ? ': ' + esc(err) : ': it is not a saved mutational matrix.'));
            return;
        }

        const view = await exec('manchester/mutmatrix-viewer-render.js');
        const onShare = shared ? null : async () => {
            try { const openShare = await exec('manchester/design-share.js'); openShare(doc, fileName); } catch (e) { }
        };
        view(root, doc, { fileName: fileName, path: p, onClose: close, onShare: onShare, shared: shared });
    })();
}
