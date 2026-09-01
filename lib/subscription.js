function () {
    // Shared subscription gate used by cpd/init.js and manchester/editor.js.
    // Verifies an active Stripe subscription for the signed-in user, shows the
    // feature-carousel paywall when it has lapsed, and runs a 20s watcher.

    const apiBase = () => (window['env'] && window['env']['apiUrl']) ? window['env']['apiUrl'] : '';

    // true = active subscriber, false = definitively not subscribed,
    // null = couldn't verify (no email / stripe_not_configured / network error) → fail open.
    const checkSubscription = async () => {
        try {
            let email = (typeof getOidcUser === 'function' && getOidcUser() && getOidcUser().email)
                || ('' + (typeof getUser === 'function' ? getUser() : ''));
            if (!email || email.indexOf('@') < 0) return null;
            let r = await fetch(apiBase() + '/stripe/subscription-status?email=' + encodeURIComponent(email));
            if (!r.ok) return null;
            let j = await r.json();
            return !!j.active;
        } catch (e) {
            console.warn('subscription check failed', e);
            return null;
        }
    };

    // Pause the 20s watcher (nulled so startSubscriptionWatch can restart it later).
    const stopSubscriptionWatch = () => {
        if (window['__subPollTimer']) {
            clearInterval(window['__subPollTimer']);
            window['__subPollTimer'] = null;
        }
    };

    // The paywall: feature carousel + a "Get started" CTA → Stripe checkout (/subscribe).
    const showSubscribeGate = async () => {
        clear();
        let carousel = {
            wid: 'carousel',
            data: {
                images: [
                    await exec('icons/svg/editor-features', 'genomics-mutations'),
                    await exec('icons/svg/editor-features', 'sirna'),
                    await exec('icons/svg/editor-features', 'offtargets'),
                    await exec('icons/svg/editor-features', 'primers'),
                    await exec('icons/svg/editor-features', 'splicing'),
                    await exec('icons/svg/editor-features', 'rbp'),
                    await exec('icons/svg/editor-features', 'rnaseq'),
                    await exec('icons/svg/editor-features', 'mrna'),
                    await exec('icons/svg/editor-features', 'structure'),
                    await exec('icons/svg/editor-features', 'aso'),
                    await exec('icons/svg/editor-features', 'patents'),
                    await exec('icons/svg/editor-features', 'tracks')
                ]
            }
        };
        let getStarted_button = {
            wid: 'mt-button',
            data: {
                useStyledButtons: true,
                buttons: [
                    {
                        label: 'Get started...',
                        ionFunction: createIonFunction(() => {
                            // Stripe hosted checkout: card / Apple Pay / Google Pay / Link.
                            window.location.assign('/subscribe');
                        })
                    }
                ]
            }
        };
        // Free tier never sees the paywall — it has canvas access by design, and the 20s
        // watcher would otherwise paint this over a working editor at any moment.
        try { if (window['__bajaFreeTier']) { window['__paywallShown'] = false; return; } } catch (e) { }
        showWidget(carousel);
        showWidget({
            wid: 'html',
            data: `<center> Subscribe to unlock the full BajaBio editor </center>`
        });
        showWidget(getStarted_button);
        window['__paywallShown'] = true;
        stopSubscriptionWatch(); // pause polling while the paywall is up
    };

    // Re-verify every 20s. Singleton so repeated runs never stack timers.
    const startSubscriptionWatch = () => {
        if (window['__subPollTimer']) return;
        window['__subPollTimer'] = setInterval(async () => {
            try {
                let a = await checkSubscription();
                if (a === false) {
                    if (!window['__paywallShown']) await showSubscribeGate();
                } else if (a === true) {
                    if (window['__paywallShown']) {
                        window['__paywallShown'] = false;
                        window.location.reload();
                    }
                }
            } catch (e) { console.warn('subscription watch failed', e); }
        }, 20000);
    };

    // Verify now, gate if lapsed, and (re)start the watcher.
    //   strict = false (default): only a definitive "not subscribed" (active:false) gates;
    //     an unverifiable result (null: no email / stripe error / network) fails OPEN.
    //   strict = true: proceed ONLY when an active subscription is positively confirmed;
    //     anything else (false OR null) shows the paywall. Used at the editor entry so a
    //     subscription that can't be found means the paywall, not open access.
    // Returns true if the caller may proceed, false if gated.
    const enforce = async (strict) => {
        let a = await checkSubscription();
        startSubscriptionWatch();
        if (a === false || (strict && a !== true)) {
            await showSubscribeGate();
            return false;
        }
        window['__paywallShown'] = false;
        return true;
    };

    return { checkSubscription, showSubscribeGate, startSubscriptionWatch, stopSubscriptionWatch, enforce };
}
