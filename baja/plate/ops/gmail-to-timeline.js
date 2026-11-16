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

            let got = null;
            try {
                got = await POSTJSON({ user: who, query: query, max: Math.min(max, 50) },
                    host + '/gmail/messages');
            } catch (e) { got = null; }
            if (!got || got.error) {
                resolve({ error: (got && (got.error_description || got.error)) === 'access_revoked'
                    ? 'that mailbox is no longer shared with this app: connect it again'
                    : ((got && (got.error_description || got.error)) || 'the mail could not be read') });
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
