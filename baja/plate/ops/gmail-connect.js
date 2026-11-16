function (pm, o) {

    // CONNECTING A MAILBOX, OR SAYING WHETHER ONE IS CONNECTED.
    //
    // Everything that matters happens on the server: the consent window goes to Google and
    // comes back to the server's own /gmail/callback, which keeps the refresh token and
    // closes. Nothing here ever sees a token, and there is nothing here worth stealing.
    //
    // THE POPUP IS OPENED FROM THE CLICK, not after an await. A window opened later is a
    // window the browser blocks, and the user gets nothing and no reason -- so the address
    // to open is asked for first and the window is opened in the same breath.

    return new Promise(async (resolve) => {
        const api = () => {
            try { return ('' + ((window['env'] && window['env']['apiUrl']) || '')).replace(/\/+$/, ''); }
            catch (e) { return ''; }
        };

        // A FAILED CALL IS NOT A RESULT.
        //
        // POSTJSON resolves rather than rejects on a non-2xx and hands back Angular's
        // HttpErrorResponse -- an object with status, error and URL on it. Read as the
        // answer, its `url` is the address that just failed, and the consent window was
        // opened on it: a popup showing "Cannot GET /gmail/start" instead of Google.
        const answered = (r) => {
            if (!r || typeof r !== 'object') return null;
            if (r.ok === false) return null;
            if (typeof r.status === 'number' && r.status >= 400) return null;
            if (r.error && typeof r.error === 'object') return null;
            return r;
        };
        const why = (r, fallback) => {
            const b = (r && r.error && typeof r.error === 'object') ? r.error : r;
            const code = b && (b.error_description || b.error);
            const st = r && typeof r.status === 'number' ? r.status : 0;
            if (st === 404) {
                return 'this server has no Gmail endpoints yet: the server side of this needs '
                    + 'to be deployed before a mailbox can be connected';
            }
            return ('' + (code || fallback)).slice(0, 300);
        };

        // The server answers at /gmail/... and at /api/gmail/..., and which one is reachable
        // depends on what sits in front of it. Both are tried before anything is called a
        // failure.
        const call = async (path, body) => {
            const host = api();
            const first = await POSTJSON(body, host + path).catch(() => null);
            const ok1 = answered(first);
            if (ok1) return { ok: ok1 };
            const second = await POSTJSON(body, host + '/api' + path).catch(() => null);
            const ok2 = answered(second);
            // The FIRST reason is kept: the second path is a fallback for where the server
            // is mounted, and when it is not there either it answers nothing, which would
            // replace a real refusal with a blank.
            return ok2 ? { ok: ok2 } : { bad: first || second };
        };
        const who = (() => { try { return ('' + (getUser() || '')).trim(); } catch (e) { return ''; } })();
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            const host = api();
            if (!host) { resolve({ error: 'this editor is not talking to a server' }); return; }
            if (!who) { resolve({ error: 'sign in first: a mailbox is connected to an account' }); return; }

            const status = async () => {
                const q = '?user=' + encodeURIComponent(who);
                for (const path of ['/gmail/status', '/api/gmail/status']) {
                    let r = null;
                    try { r = await GETJSON(host + path + q, { 'x-user-id': who }); } catch (e) { r = null; }
                    const good = answered(r);
                    if (good) return good;
                }
                return null;
            };

            if (o && o.what === 'status') {
                const s = await status();
                resolve({ connected: !!(s && s.connected), mailbox: (s && s.mailbox) || '' });
                return;
            }

            if (o && o.what === 'disconnect') {
                await call('/gmail/disconnect', { user: who });
                try { pt.setMessage('Gmail disconnected, and the access given back to Google', 6); } catch (e) { }
                resolve({ connected: false, disconnected: true });
                return;
            }

            const already = await status();
            if (already && already.connected && !(o && o.force)) {
                resolve({ connected: true, mailbox: already.mailbox || '', already: true });
                return;
            }

            const got = await call('/gmail/start', { user: who });
            if (!got.ok) {
                // The server says exactly what is missing, and that is worth passing on
                // rather than replacing with something vaguer.
                resolve({ error: why(got.bad, 'the server cannot start a Gmail connection') });
                return;
            }
            const start = got.ok;
            // WHERE IT GOES IS CHECKED BEFORE IT IS OPENED. A consent window can only ever go
            // to Google; anything else arriving in that field is a failure wearing a URL, and
            // opening it is how the browser ended up showing "Cannot GET /gmail/start".
            const url = ('' + ((start && start.url) || '')).trim();
            if (!/^https:\/\/accounts\.google\.com\//.test(url)) {
                resolve({ error: 'the server did not return a Google consent address' });
                return;
            }

            const win = window.open(url, 'baja-gmail',
                'width=520,height=680,menubar=no,toolbar=no');
            if (!win) {
                resolve({ error: 'the consent window was blocked. Allow popups for this site '
                    + 'and ask again' });
                return;
            }

            // The window posts back when it is done; a window simply closed is a no.
            const answer = await new Promise((done) => {
                let finished = false;
                const finish = (v) => { if (finished) return; finished = true; cleanup(); done(v); };
                const onMsg = (e) => {
                    const d = e && e.data;
                    if (d && d.source === 'baja-gmail') finish(!!d.ok);
                };
                const watch = setInterval(() => { try { if (win.closed) finish(null); } catch (e) { } }, 500);
                const giveUp = setTimeout(() => finish(null), 5 * 60 * 1000);
                const cleanup = () => {
                    try { window.removeEventListener('message', onMsg); } catch (e) { }
                    clearInterval(watch); clearTimeout(giveUp);
                };
                try { window.addEventListener('message', onMsg); } catch (e) { }
            });

            // Asked rather than believed: the window's word is a hint, the server's record is
            // the fact, and only the server knows whether a refresh token was really kept.
            const now = await status();
            if (now && now.connected) {
                try { pt.setMessage('Gmail connected' + (now.mailbox ? (' (' + now.mailbox + ')') : ''), 6); } catch (e) { }
                resolve({ connected: true, mailbox: now.mailbox || '' });
                return;
            }
            resolve({ error: answer === false
                ? 'Google did not grant access. If the consent screen has not been given the '
                    + 'Gmail scope yet, only accounts listed as test users on it can connect.'
                : 'the consent window closed without connecting' });
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}
