function (result) {

    // Shown when a user without a subscription is denied the full editor.
    //   exec('baja/datayak/ljlcheckout.js', result)   // result from verifyUserPath()
    //
    // This file was REFERENCED but did not exist — manchester/editor.js, cpd/editor.js,
    // cpd/apps.js, cpd/demo-mobile.js and baja/nogo.js all exec it on denial, so a
    // non-subscriber hit a dead script and got a blank screen instead of any way forward.
    //
    // It now offers BOTH routes rather than only a paywall:
    //   • Subscribe — Stripe checkout, priced live from /stripe/price-info
    //   • Use the free version — /app/free/editor, which is the same editor with the AI and
    //     off-target calls metered at 5 each per month
    // A dead end that only says "pay" loses the user who would happily have tried the free
    // tier first.

    return (async () => {
        const host = (window['env'] && window['env']['apiUrl']) || window.location.origin;
        const email = (typeof getUser === 'function') ? (getUser() || '') : '';
        const esc = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Live price, so the page never contradicts what Stripe will actually charge.
        let price = null;
        try { price = await GETJSON(host + '/stripe/price-info'); } catch (e) { price = null; }
        const priceText = (price && price.display)
            ? (price.display + (price.period || ''))
            : 'See pricing';

        try { const old = document.getElementById('baja-checkout'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const wrap = document.createElement('div');
        wrap.id = 'baja-checkout';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483400;background:#071a30;color:#e8f0fb;'
            + 'font-family:Arial,Helvetica,sans-serif;display:flex;align-items:center;justify-content:center;'
            + 'padding:24px;overflow:auto;';

        const reason = (result && result.reason) ? ('' + result.reason) : '';

        wrap.innerHTML = ''
            + '<div style="width:min(880px,96vw);">'
            + '<div style="font:800 26px Arial;margin-bottom:6px;">Choose how to continue</div>'
            + '<div style="font:14px/1.6 Arial;color:#9fb3c8;margin-bottom:22px;">'
            + 'Your account does not have a subscription for the full editor.'
            + (reason ? ('<br><span style="color:#8fb8c8;font:12.5px Arial;">' + esc(reason) + '</span>') : '')
            + '</div>'
            + '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px;">'

            // ---- Free -----------------------------------------------------------------
            + '<div style="background:#0b2545;border:1px solid rgba(255,255,255,0.16);border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:10px;">'
            + '<div style="font:700 18px Arial;">Free</div>'
            + '<div style="font:800 26px Arial;color:#eaf6f9;">$0</div>'
            + '<ul style="margin:6px 0 0 18px;padding:0;font:13px/1.75 Arial;color:#cfe6ee;">'
            + '<li>Load, edit, save and design — unlimited</li>'
            + '<li>Tracks, layers, data and models</li>'
            + '<li><b>5 AI requests</b> per month</li>'
            + '<li><b>5 off-target searches</b> per month</li>'
            + '</ul>'
            + '<button id="bc-free" style="margin-top:auto;cursor:pointer;border-radius:9px;padding:11px 16px;'
            + 'font:700 14px Arial;border:1px solid rgba(255,255,255,0.3);background:transparent;color:#e8f0fb;">'
            + 'Free version (with limited features)</button>'
            + '</div>'

            // ---- Subscription ---------------------------------------------------------
            + '<div style="background:#0b2545;border:1px solid #22c55e;border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:10px;box-shadow:0 10px 30px rgba(0,0,0,0.35);">'
            + '<div style="font:700 18px Arial;">Subscription</div>'
            + '<div style="font:800 26px Arial;color:#eaf6f9;">' + esc(priceText) + '</div>'
            + '<ul style="margin:6px 0 0 18px;padding:0;font:13px/1.75 Arial;color:#cfe6ee;">'
            + '<li>Everything in Free</li>'
            + '<li><b>Unlimited</b> AI requests</li>'
            + '<li><b>Unlimited</b> off-target searches</li>'
            + '</ul>'
            + '<button id="bc-sub" style="margin-top:auto;cursor:pointer;border-radius:9px;padding:11px 16px;'
            + 'font:700 14px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">Subscribe</button>'
            + '</div>'

            + '</div>'
            + '<div id="bc-msg" style="margin-top:16px;font:12.5px Arial;color:#8fb8c8;min-height:16px;"></div>'
            + '</div>';

        document.body.appendChild(wrap);
        const msg = (t) => { try { wrap.querySelector('#bc-msg').textContent = t || ''; } catch (e) { } };

        try {
            wrap.querySelector('#bc-free').onclick = () => {
                window.location.href = window.location.origin + '/app/free/editor';
            };
        } catch (e) { }

        try {
            wrap.querySelector('#bc-sub').onclick = async () => {
                if (!email) { msg('Please sign in first, then subscribe.'); return; }
                msg('Opening secure checkout…');
                try {
                    const r = await POSTJSON({
                        email: email,
                        priceId: (price && price.priceId) || undefined,
                        appBase: window.location.origin,
                        returnPath: '/subscribe'
                    }, host + '/stripe/create-checkout-session');
                    if (r && r.url) { window.location.href = r.url; return; }
                    msg('Could not start checkout: ' + ((r && (r.error_description || r.error)) || 'unknown error'));
                } catch (e) {
                    msg('Could not start checkout: ' + (e && e.message ? e.message : e));
                }
            };
        } catch (e) { }

        return true;
    })();
}
