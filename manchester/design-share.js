function () {
    // SHARING AN LOH DESIGN STRATEGY. The same two ways the Genome Viewer shares a genome:
    //   a public link   a copy saved in the owner's public folder, a short /s/<code> alias for
    //                   it, opened view-only by anyone through manchester/viewer.js;
    //   with people     a copy for each address through /share-with, which emails a link that
    //                   opens in the Design Viewer after sign-in.
    // Returns open(doc, name): a dialog offering both, for a document already built.
    return (doc, name) => {
        const host_ = window['env']['apiUrl'];
        const user = ('' + ((typeof getUser === 'function' ? getUser() : '') || '')).trim();
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const body = (r) => (r && r.error && typeof r.error === 'object') ? r.error : r;
        let fileName = ('' + (name || 'LOH_design_strategy')).replace(/[\\/]+/g, '_').replace(/\.design$/i, '').trim() || 'LOH_design_strategy';
        fileName += '.design';

        try { const old = document.getElementById('baja-design-share'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const wrap = document.createElement('div');
        wrap.id = 'baja-design-share';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483200;background:rgba(0,0,0,0.45);font-family:Arial,Helvetica,sans-serif;';
        const btn = (id, label, primary) => '<button id="' + id + '" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;'
            + (primary ? 'border:1px solid #22c55e;background:#22c55e;color:#04210f;' : 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;') + '">' + label + '</button>';
        const field = 'width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:9px;font:13px Arial;';
        wrap.innerHTML = '<div style="position:absolute;top:70px;left:50%;transform:translateX(-50%);width:min(560px,94vw);max-height:calc(100vh - 100px);overflow:auto;'
            + 'background:#0b2545;color:#fff;border:1px solid rgba(255,255,255,0.14);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.45);padding:18px;">'
            + '<div style="font:700 16px Arial;margin-bottom:4px;">Share this design strategy</div>'
            + '<div style="font:12px Arial;color:#9fb3c8;margin-bottom:14px;">' + esc(fileName) + '</div>'
            + '<div style="font:700 13px Arial;margin-bottom:6px;">A public link</div>'
            + '<div style="font:12px Arial;color:#9fb3c8;margin-bottom:8px;">Anyone with the link can view it, without signing in.</div>'
            + btn('ds-public', 'Create a public link', false)
            + '<div id="ds-public-out" style="margin-top:8px;font:12px Arial;"></div>'
            + '<div style="height:1px;background:rgba(255,255,255,0.12);margin:16px 0;"></div>'
            + '<div style="font:700 13px Arial;margin-bottom:6px;">With people</div>'
            + '<div style="font:12px Arial;color:#9fb3c8;margin-bottom:8px;">Each person gets their own copy and an email with the link. Separate addresses with commas.</div>'
            + '<input id="ds-to" placeholder="name@example.com" style="' + field + '"/>'
            + '<textarea id="ds-msg" rows="3" placeholder="A message (optional)" style="' + field + 'margin-top:8px;resize:vertical;"></textarea>'
            + '<div style="margin-top:10px;display:flex;gap:10px;">' + btn('ds-send', 'Share', true) + btn('ds-close', 'Close', false) + '</div>'
            + '<div id="ds-status" style="margin-top:10px;font:12px Arial;color:#cfe0f5;"></div>'
            + '<div id="ds-results"></div></div>';
        document.body.appendChild(wrap);
        for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) wrap.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
        const $ = (id) => document.getElementById(id);
        const close = () => { try { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } catch (e) { } };
        wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
        wrap.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
        $('ds-close').onclick = close;
        if (!user) {
            $('ds-status').textContent = 'Sign in to share.';
            $('ds-public').disabled = true; $('ds-send').disabled = true;
            return;
        }
        const text = JSON.stringify(doc);

        $('ds-public').onclick = async () => {
            const out = $('ds-public-out');
            $('ds-public').disabled = true;
            out.textContent = 'Creating the link...';
            try {
                const rs = await POSTJSON({ name: fileName, key: 'user', user: user, spath: 'public', value: text }, host_ + '/save-user-data');
                if (!rs || !(rs.status === 'saved' || rs.path)) throw new Error((rs && (rs.status || rs.error)) || 'the copy could not be saved');
                try { await POSTJSON({ name: '.share', key: 'user', user: user, spath: 'public', value: 'public\n/public' }, host_ + '/save-user-data'); } catch (e) { }
                const sharedPath = ('' + (rs.path || '')).replace(/\/{2,}/g, '/');
                let link = window.location.origin + '/app/manchester/viewer?path=' + encodeURIComponent(sharedPath);
                try { const al = await POSTJSON({ path: sharedPath }, host_ + '/share-alias'); if (al && al.code) link = window.location.origin + '/s/' + al.code; } catch (e) { }
                let copied = false;
                try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(link); copied = true; } } catch (e) { }
                out.innerHTML = (copied ? 'Copied to your clipboard: ' : 'The link: ')
                    + '<a href="' + esc(link) + '" target="_blank" rel="noopener" style="color:#4fd0e6;word-break:break-all;">' + esc(link) + '</a>';
            } catch (e) { out.innerHTML = '<span style="color:#fca5a5;">Could not create the link: ' + esc(e && e.message ? e.message : e) + '</span>'; }
            $('ds-public').disabled = false;
        };

        $('ds-send').onclick = async () => {
            const addrs = ('' + ($('ds-to').value || '')).split(/[,;\s]+/).map((x) => x.trim()).filter((x) => /.+@.+\..+/.test(x));
            if (!addrs.length) { $('ds-status').textContent = 'Enter an email address.'; return; }
            const message = ('' + ($('ds-msg').value || '')).trim();
            const b = $('ds-send');
            b.disabled = true; b.textContent = 'Sharing...';
            $('ds-status').textContent = 'Saving a copy for ' + (addrs.length === 1 ? addrs[0] : addrs.length + ' people') + '...';
            let firstLink = '';
            for (const to of addrs) {
                let r = null;
                try { r = body(await POSTJSON({ user: user, to: to, name: fileName, value: text, message: message }, host_ + '/share-with')); }
                catch (e) { r = { error: '' + (e && e.message ? e.message : e) }; }
                if (r && r.url) {
                    if (!firstLink) firstLink = r.url;
                    const mail = r.mailed ? '<span style="color:#86efac;">Emailed to ' + esc(to) + '.</span>'
                        : '<span style="color:#fcd34d;">Email not sent' + (r.mailError ? ' (' + esc(r.mailError) + ')' : '') + ': copy the link and send it.</span>';
                    $('ds-results').insertAdjacentHTML('beforeend', '<div style="background:#0a1e3a;border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:8px 10px;margin:6px 0;font:12px Arial;">'
                        + '<b>' + esc(to) + '</b><div style="word-break:break-all;margin-top:4px;"><a href="' + esc(r.url) + '" target="_blank" rel="noopener" style="color:#4fd0e6;">' + esc(r.url) + '</a></div>'
                        + '<div style="margin-top:4px;">' + mail + '</div></div>');
                } else {
                    $('ds-results').insertAdjacentHTML('beforeend', '<div style="font:12px Arial;color:#fca5a5;margin:6px 0;">' + esc(to) + ': '
                        + esc((r && (r.error || r.message)) || 'sharing failed') + '</div>');
                }
            }
            if (firstLink && addrs.length === 1) { try { await navigator.clipboard.writeText(firstLink); } catch (e) { } }
            $('ds-status').textContent = firstLink ? ('Shared.' + (addrs.length === 1 ? ' The link is on your clipboard.' : '')) : 'Nothing was shared.';
            $('ds-to').value = '';
            b.disabled = false; b.textContent = 'Share';
        };
        try { $('ds-to').focus(); } catch (e) { }
    };
}
