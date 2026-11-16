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
        const who = (() => { try { return ('' + (getUser() || '')).trim(); } catch (e) { return ''; } })();
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            const host = api();
            if (!host) { resolve({ error: 'this editor is not talking to a server' }); return; }
            if (!who) { resolve({ error: 'sign in first: a mailbox is connected to an account' }); return; }

            const status = async () => {
                try {
                    return await GETJSON(host + '/gmail/status?user=' + encodeURIComponent(who),
                        { 'x-user-id': who });
                } catch (e) { return null; }
            };

            if (o && o.what === 'status') {
                const s = await status();
                resolve({ connected: !!(s && s.connected), mailbox: (s && s.mailbox) || '' });
                return;
            }

            if (o && o.what === 'disconnect') {
                let r = null;
                try { r = await POSTJSON({ user: who }, host + '/gmail/disconnect'); } catch (e) { r = null; }
                try { pt.setMessage('Gmail disconnected, and the access given back to Google', 6); } catch (e) { }
                resolve({ connected: false, disconnected: true });
                return;
            }

            const already = await status();
            if (already && already.connected && !(o && o.force)) {
                resolve({ connected: true, mailbox: already.mailbox || '', already: true });
                return;
            }

            let start = null;
            try { start = await POSTJSON({ user: who }, host + '/gmail/start'); } catch (e) { start = null; }
            if (!start || !start.url) {
                // The server says exactly what is missing, and that is worth passing on
                // rather than replacing with something vaguer.
                resolve({ error: (start && (start.error_description || start.error))
                    || 'the server cannot start a Gmail connection' });
                return;
            }

            const win = window.open(start.url, 'baja-gmail',
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
