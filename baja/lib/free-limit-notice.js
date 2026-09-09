function (graph, err, what) {

    // "You are out of design tokens" — shown when the server refuses a metered call.
    //
    //   const shown = await exec('baja/lib/free-limit-notice.js', graph, e, 'design run');
    //   if (!shown) { ...ordinary error handling... }
    //
    // Returns TRUE when the refusal was an allowance one and the notice was shown, so the
    // caller can tell "you have run out" apart from "it broke", which are different things
    // to say to someone.
    //
    // The free tier is enforced server-side (freeCharge / freeLimitBody in baja-server),
    // which answers HTTP 402 with { error:'free-limit', metric, used, limit, resetsOn,
    // message }. The WORDING COMES FROM THE SERVER: it owns the limits and the reset date,
    // and a second copy here would drift the first time either changed. Only if the payload
    // cannot be read does this compose its own line.
    //
    // Design calls go through exec(), which REJECTS on a non-2xx rather than resolving, so
    // the 402 body arrives as a rejection rather than a result -- which is why it surfaced
    // as "POST failed" and an unhandled stream error instead of a message. Every shape the
    // two transports produce is checked below.
    return (async () => {

        const dig = (e) => {
            if (!e) return null;
            try {
                if (typeof freeLimitInfo === 'function') {
                    const hit = freeLimitInfo(e);
                    if (hit) return hit;
                }
            } catch (e2) { }
            // Nested one deeper: an HttpErrorResponse wrapped by the exec transport.
            const inner = e.error || e.body || e.response || e.data;
            if (inner && typeof inner === 'object') {
                if (inner.error === 'free-limit') return inner;
                const deeper = inner.error;
                if (deeper && typeof deeper === 'object' && deeper.error === 'free-limit') return deeper;
            }
            // Last resort: a 402 whose body did not survive the transport at all. Believed
            // on the status alone, because 402 is not used for anything else here.
            if (+e.status === 402 || +(e.statusCode) === 402) {
                return { error: 'free-limit', metric: 'design', message: '' };
            }
            return null;
        };

        const info = dig(err);
        if (!info) return false;

        const metric = info.metric || 'design';
        const noun = (metric === 'design') ? 'design' : 'off-target';
        const msg = ('' + (info.message || '')).trim() || (
            'You have used all ' + (info.limit != null ? info.limit : 'your') + ' free '
            + noun + ' runs this month'
            + (info.resetsOn ? ('. Your allowance resets on ' + info.resetsOn) : '')
            + ' — or subscribe for unlimited use.');

        const esc = (t) => ('' + (t == null ? '' : t))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        // The status line too, so the reason is still on screen after the dialog is closed
        // and so it is recorded wherever the canvas messages are read.
        try { graph.setMessage(' Out of free ' + noun + ' tokens — ' + msg + ' '); } catch (e) { }

        try {
            const ID = 'baja-free-limit-notice';
            const old = document.getElementById(ID);
            if (old && old.parentNode) old.parentNode.removeChild(old);

            const wrap = document.createElement('div');
            wrap.id = ID;
            wrap.style.cssText = 'position:fixed;z-index:100000;left:50%;top:50%;'
                + 'transform:translate(-50%,-50%);width:min(92vw,520px);background:#08203c;'
                + 'border:1px solid rgba(255,255,255,0.14);border-radius:14px;padding:26px 28px;'
                + 'box-shadow:0 24px 70px rgba(0,0,0,0.55);color:#eaf6f9;'
                + 'font:14px/1.6 Arial,Helvetica,sans-serif;';
            wrap.innerHTML =
                '<div style="font:700 11px Arial;letter-spacing:.14em;text-transform:uppercase;'
                + 'color:#4fd0e6;margin-bottom:10px;">Free allowance</div>'
                + '<div style="font:600 20px Arial;margin-bottom:12px;">Out of ' + esc(noun) + ' tokens</div>'
                + '<div style="color:#bcd3e2;margin-bottom:6px;">' + esc(msg) + '</div>'
                + (what ? ('<div style="color:#8fb8c8;font-size:12.5px;margin-bottom:4px;">'
                    + 'Nothing was designed, and this run was not charged.</div>') : '')
                + '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:22px;">'
                + '<button type="button" data-role="close" style="cursor:pointer;border-radius:9px;'
                + 'padding:9px 16px;border:1px solid rgba(255,255,255,0.22);background:transparent;'
                + 'color:#cfe4ef;font:600 13px Arial;">Not now</button>'
                + '<button type="button" data-role="subscribe" style="cursor:pointer;border-radius:9px;'
                + 'padding:9px 20px;border:0;background:#12c2e0;color:#04202c;font:700 13px Arial;">'
                + 'Subscribe</button>'
                + '</div>';

            const close = () => { try { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } catch (e) { } };
            document.body.appendChild(wrap);
            wrap.querySelector('[data-role="close"]').onclick = close;
            wrap.querySelector('[data-role="subscribe"]').onclick = () => {
                close();
                // The same destination the subscriber-only gate uses, so there is one
                // subscribe route rather than two that can drift apart.
                try { window.location.href = '/subscribe'; } catch (e) { }
            };
            // Typing must not reach the editor behind the dialog.
            for (const ev of ['keydown', 'keyup', 'keypress', 'paste']) {
                wrap.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
            }
        } catch (e) { /* the status line above still carries it */ }

        return true;
    })();
}
