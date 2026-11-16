function (pm, o) {

    // DATES OUT OF A MAILBOX, ONTO A TIMELINE.
    //
    // This is the thin half of "integrate gmail": fetch some mail and hand it to the part
    // that already reads dates out of text, which shows what it found with the words it came
    // from and waits to be told yes. One reader, one confirmation, whether the text was
    // pasted or fetched -- a second path for mail would be a second set of bugs about
    // relative dates and a second place to forget the confirmation.
    //
    // A SEARCH, NOT A MAILBOX. The default is the last fortnight, and the server caps what
    // it will return. Mail is fetched to be read for dates in the moment, not copied into
    // the project: only the events the user keeps are written down anywhere.
    //
    // EACH MESSAGE CARRIES THE DAY IT WAS SENT, because "Thursday" in a message from three
    // weeks ago is a Thursday three weeks ago. The reader is told to resolve each event
    // against its own message's Sent line.

    return new Promise(async (resolve) => {
        try {
            const pt = (pm && pm.plateTrack) ? pm.plateTrack : pm;
            const host = (() => {
                try { return ('' + ((window['env'] && window['env']['apiUrl']) || '')).replace(/\/+$/, ''); }
                catch (e) { return ''; }
            })();
            const who = (() => { try { return ('' + (getUser() || '')).trim(); } catch (e) { return ''; } })();
            if (!host) { resolve({ error: 'this editor is not talking to a server' }); return; }

            // Connect first if need be: being told "not connected" and left to find the
            // button is a dead end when the button is one call away.
            let conn = null;
            try { conn = await exec('baja/plate/ops/gmail-connect.js', pt, { what: 'status' }); } catch (e) { conn = null; }
            if (!conn || !conn.connected) {
                let made = null;
                try { made = await exec('baja/plate/ops/gmail-connect.js', pt, {}); } catch (e) { made = null; }
                if (!made || made.error || !made.connected) {
                    resolve({ error: (made && made.error) || 'no mailbox is connected' });
                    return;
                }
            }

            const query = ('' + ((o && o.query) || '')).trim() || 'newer_than:14d -in:spam -in:trash';
            let max = Math.floor(Number((o && o.max) || 25));
            if (!isFinite(max) || max < 1) max = 25;

            // A FAILED CALL IS NOT A RESULT. POSTJSON resolves on a non-2xx with Angular's
            // HttpErrorResponse, whose fields read like an answer; the reply is checked
            // rather than trusted, and both paths the server answers on are tried.
            const answered = (r) => {
                if (!r || typeof r !== 'object') return null;
                if (r.ok === false) return null;
                if (typeof r.status === 'number' && r.status >= 400) return null;
                if (r.error) return null;
                return r;
            };
            const body = { user: who, query: query, max: Math.min(max, 50) };
            let got = null, bad = null;
            for (const path of ['/gmail/messages', '/api/gmail/messages']) {
                let r = null;
                try { r = await POSTJSON(body, host + path); } catch (e) { r = null; }
                got = answered(r);
                if (got) break;
                // THE FIRST REASON IS KEPT. The second path is a fallback for where the
                // server is mounted, and when it is not there either it answers nothing at
                // all -- which overwrote "that mailbox is no longer shared" with a blank and
                // turned a clear refusal into "the mail could not be read".
                if (r && !bad) bad = r;
            }
            if (!got) {
                const b = (bad && bad.error && typeof bad.error === 'object') ? bad.error : bad;
                const code = '' + ((b && (b.error_description || b.error)) || '');
                const st = bad && typeof bad.status === 'number' ? bad.status : 0;
                resolve({ error: code === 'access_revoked'
                    ? 'that mailbox is no longer shared with this app: connect it again'
                    : (st === 404
                        ? 'this server has no Gmail endpoints yet: the server side of this '
                            + 'needs to be deployed first'
                        : (code || 'the mail could not be read')) });
                return;
            }
            const messages = Array.isArray(got.messages) ? got.messages : [];
            if (!messages.length) {
                resolve({ error: 'no mail matched ' + query });
                return;
            }

            // One block of text, each message labelled with who sent it and when. The Sent
            // line is what the reader resolves "tomorrow" against.
            const text = messages.map((m) => {
                const sent = ('' + (m.sent || m.date || '')).slice(0, 10);
                return '--- MESSAGE ---\nSent: ' + (sent || 'unknown')
                    + '\nFrom: ' + ('' + (m.from || ''))
                    + '\nSubject: ' + ('' + (m.subject || ''))
                    + '\n\n' + ('' + (m.text || '')).trim();
            }).join('\n\n');

            const out = await exec('baja/plate/ops/text-to-timeline.js', pt, {
                text: text,
                timeline: (o && o.timeline) || null,
                // Not one sent date for the lot: each message states its own, above its body.
                sent: null
            });
            if (out && out.error) { resolve({ error: out.error, read: messages.length }); return; }
            resolve(Object.assign({ read: messages.length, query: query }, out || {}));
        } catch (e) {
            resolve({ error: ('' + (e && e.message ? e.message : e)) });
        }
    });
}
