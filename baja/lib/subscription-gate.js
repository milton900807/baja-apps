function (options) {

    // SUBSCRIBER-ONLY APPLICATION, SHOWN RATHER THAN HIDDEN.
    //
    //   await exec('baja/lib/subscription-gate.js', {
    //       panel,                                  // the editor's root element
    //       name: 'Neoantigen designer',
    //       what: 'Designing neoantigen cassettes and the mRNA that carries them'
    //   });
    //
    // A non-subscriber opening this editor gets the whole interface, drawn and populated,
    // behind a notice saying a subscription is required. Nothing underneath responds.
    //
    // WHY SHOW IT AT ALL. The alternative -- bouncing straight to /subscribe -- asks
    // somebody to pay for a tool they have never seen. Leaving the interface on screen is
    // the argument for subscribing, and it costs nothing: every operation that spends
    // server compute is gated server-side in freeGate (baja-server/src/index.ts), where a
    // browser cannot reach it. This overlay decides what is DRAWN, not what is allowed.
    //
    // FAILS OPEN. checkSubscription() answers true, false, or null when it could not tell
    // (no email, Stripe unconfigured, network down). Only a definitive false gates. A
    // paying user whose status call times out keeps working, which is the right way round:
    // the cost of a wrong "not subscribed" is a customer locked out of what they bought,
    // and the cost of a wrong "subscribed" is one free session.
    //
    // Returns true when the editor was gated, false when it was left alone.

    return (async () => {
        const o = options || {};
        const panel = o.panel;
        if (!panel) return false;

        const name = o.name || 'This application';
        const what = o.what || 'This application';
        const ID = 'baja-sub-gate';

        const esc = (t) => ('' + (t == null ? '' : t))
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

        let active = null;
        try {
            const SUB = await exec('lib/subscription.js');
            active = await SUB.checkSubscription();
        } catch (e) {
            active = null;
        }
        // null means "could not tell". Only a definite no gates.
        if (active !== false) return false;

        // A second call (a re-render, a reopened file) must not stack overlays.
        try {
            const prev = panel.querySelector('#' + ID);
            if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
        } catch (e) { }

        // The interface stays visible and stops responding. The overlay swallows pointer
        // events on its own, but a keyboard user could still Tab into the buttons behind
        // it, so the content is made inert as well -- `inert` where the browser has it,
        // and tabindex/pointer-events where it does not.
        const content = [];
        try {
            for (let i = 0; i < panel.children.length; i++) content.push(panel.children[i]);
        } catch (e) { }
        for (const el of content) {
            try {
                el.setAttribute('inert', '');
                el.setAttribute('aria-hidden', 'true');
                el.style.pointerEvents = 'none';
                const focusable = el.querySelectorAll('button, input, select, textarea, a[href], [tabindex]');
                for (let i = 0; i < focusable.length; i++) focusable[i].setAttribute('tabindex', '-1');
            } catch (e) { }
        }

        const wrap = document.createElement('div');
        wrap.id = ID;
        // Inside the panel, above its content. The panel is position:fixed, so it is the
        // containing block for this.
        wrap.style.cssText = 'position:absolute;inset:0;z-index:40;display:flex;'
            + 'align-items:center;justify-content:center;padding:24px;'
            + 'background:rgba(4,14,28,0.72);backdrop-filter:blur(2px);'
            + 'font-family:Arial,Helvetica,sans-serif;';

        wrap.innerHTML = ''
            + '<div role="dialog" aria-modal="true" aria-labelledby="' + ID + '-t" '
            + 'style="background:#0a1e3a;color:#fff;border:1px solid rgba(255,255,255,0.16);'
            + 'border-radius:14px;width:min(520px,96vw);box-shadow:0 22px 60px rgba(0,0,0,0.55);'
            + 'overflow:hidden;">'
            + '<div style="padding:22px 24px 6px;">'
            + '<div style="font:700 11px Arial;letter-spacing:.14em;text-transform:uppercase;color:#7f9bb8;">'
            + 'Subscription required</div>'
            + '<div id="' + ID + '-t" style="font:700 20px Arial;letter-spacing:-0.01em;margin-top:8px;">'
            + esc(name) + '</div>'
            + '<div style="font:13.5px/1.6 Arial;color:#9fb3c8;margin-top:10px;">'
            + esc(what) + ' is part of the subscription. '
            + 'You can see how it is laid out here, but it will not run until you subscribe.</div>'
            + '</div>'
            + '<div style="display:flex;gap:10px;justify-content:flex-end;padding:18px 24px 22px;">'
            + '<button type="button" data-role="leave" style="cursor:pointer;border-radius:9px;padding:10px 16px;'
            + 'font:700 12.5px Arial;border:1px solid rgba(255,255,255,0.24);background:transparent;color:#fff;">'
            + 'Back to home</button>'
            + '<button type="button" data-role="subscribe" style="cursor:pointer;border-radius:9px;padding:10px 20px;'
            + 'font:700 12.5px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">'
            + 'Subscribe</button>'
            + '</div></div>';

        try {
            wrap.querySelector('[data-role="subscribe"]').onclick = () => {
                try { window.location.href = '/subscribe'; } catch (e) { }
            };
            // The editor's own Close is behind the overlay and unreachable, so the way out
            // lives here. Without it the only exit is the browser's back button.
            wrap.querySelector('[data-role="leave"]').onclick = () => {
                try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
                try { exec('baja/init'); } catch (e) { }
            };
            panel.appendChild(wrap);
        } catch (e) {
            return false;
        }

        return true;
    })();
}
