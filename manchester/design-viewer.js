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

        await showWidget({ wid: 'html', data: '<div id="baja-design-viewer" style="font-family:Arial,Helvetica,sans-serif;'
            + 'background:#071a30;color:#fff;min-height:calc(100vh - 64px);"></div>' });
        let root = null;
        for (let i = 0; i < 50 && !root; i++) {
            root = document.getElementById('baja-design-viewer');
            if (!root) await new Promise((res) => setTimeout(res, 60));
        }
        if (!root) return;
        const note = (html) => { root.innerHTML = '<div style="padding:40px;font:14px Arial;color:#cfe0f5;">' + html + '</div>'; };

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
        view(root, doc, { fileName: fileName, path: p });
    })();
}
