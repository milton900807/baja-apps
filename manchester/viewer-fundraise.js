function (path, config) {

    // THE PUBLIC FUNDRAISING DISPLAY: a campaign's total, its goal and a thermometer, big
    // enough to project, open to anyone with the link and no sign-in.
    //
    //   /app/manchester/viewer-fundraise?s=<share code>
    //   /app/manchester/viewer-fundraise?path=<public path>
    //
    // WHY THE NAME BEGINS "viewer". The app shell lets exactly two route shapes through
    // without a sign-in, and a URL containing /manchester/viewer is one of them (see the
    // guard in baja/src/app/auth/auth.guard.ts). A display nobody can open without an account
    // is not a public display, and renaming this route means editing and redeploying the
    // shell; the route name is the cheap half of that bargain.
    //
    // The document is written by fundraise/console.js into the owner's public folder and read
    // here through /load-file as `public`, which is the same path a shared genome takes.
    //
    //   { kind: 'fundraise', title, subtitle, currency, goal, raised, donors, note,
    //     updated, by, story, gifts: [{ amount, name, note, at }], updates: [{ at, text }],
    //     donate: { on, mode: 'checkout'|'link', label, url, amounts: [...], custom },
    //     media: { theme, imageFile, imageV, imageMode, youtube },
    //     team: [{ id, name, role, note }], teamFile, teamV }
    //
    // GIVING. The donate button asks for an amount and then hands the donor to Stripe, either
    // through a Checkout session this server creates for that amount (POST /stripe/donation-
    // session) or through a Payment Link made in the Stripe dashboard. WHICH PAYMENT METHODS
    // APPEAR -- card, Apple Pay, Google Pay, Link, Cash App, Klarna, bank debits -- is a
    // Stripe dashboard setting, not a choice this page makes: the session asks for no
    // payment_method_types, so Stripe offers every method enabled on the account that is
    // eligible for the amount, currency and country. Money never touches this page, and no
    // card detail is typed on it.
    //
    // DONATIONS COME BACK ON THEIR OWN. A paid session is known to Stripe and to nobody else,
    // so before each re-read this asks the server to reconcile: POST /stripe/donation-sync
    // folds any session Stripe reports as paid for this campaign into the document, once. The
    // total then rises here the same way it does when the organiser types a gift in, without
    // anyone touching anything. The server ignores the call more often than it obeys it (one
    // Stripe lookup per campaign per 15s, however many screens are watching).
    //
    // TWO LEVELS. The first is the number, which is what a screen in a room is for and which
    // has to stay readable from the back of it. Everything that wants reading up close --
    // what the money is for, who has given, what has happened since -- is one button away on
    // a details page, so that the display itself never fills up with text nobody can read
    // from a distance. The details page is READ-ONLY, because this route is open without a
    // sign-in: the organiser adds gifts and posts updates in the console, and this page sees
    // them on its next read, within seconds.
    //
    // IT REFRESHES ITSELF. The display is meant to be left on a screen while the number
    // changes, so it re-reads the document every few seconds and animates to the new total
    // rather than needing someone to reload it. ?refresh=<seconds> tunes that; ?refresh=0
    // turns it off.
    return (async () => {
        const host = (window['env'] && window['env']['apiUrl']) || window.location.origin;
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const qp = (k) => { try { return new URL(window.location.href).searchParams.get(k); } catch (e) { return null; } };

        let every = 10;
        const rq = qp('refresh');
        if (rq != null && rq !== '') { const v = parseFloat(rq); if (isFinite(v)) every = Math.max(0, Math.min(3600, v)); }

        // Where the document lives: a share code first, so the owner's email -- which is part
        // of the stored path -- never appears in the address bar of a screen in a room.
        let docPath = '';
        const code = qp('s') || qp('share') || '';
        if (code) {
            try {
                const r = await GETJSON(host + '/share-resolve?code=' + encodeURIComponent(code));
                if (r && r.path) docPath = '' + r.path;
            } catch (e) { }
        }
        if (!docPath) docPath = '' + (qp('path') || (config && config.path) || path || '');

        // ---- the screen ------------------------------------------------------------------
        try { const old = document.getElementById('baja-fundraise-display'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const el = document.createElement('div');
        el.id = 'baja-fundraise-display';
        el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;overflow:auto;'
            + 'background:radial-gradient(1200px 700px at 50% -10%,#123a63 0%,#0a1e3a 55%,#071526 100%);'
            + 'color:#eaf6f9;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;'
            + 'display:flex;align-items:center;justify-content:center;padding:4vmin;box-sizing:border-box;';
        el.innerHTML = '<div id="fd-card" style="width:min(1100px,96vw);text-align:center;">'
            + '<div id="fd-state" style="font:500 15px system-ui;color:#9fc4d4;">Loading…</div></div>';
        document.body.appendChild(el);
        if (!document.getElementById('fd-kf')) {
            const st = document.createElement('style');
            st.id = 'fd-kf';
            st.textContent = '@keyframes fdPulse{0%{opacity:.35}50%{opacity:1}100%{opacity:.35}}'
                + '@keyframes fdPop{0%{transform:scale(1)}40%{transform:scale(1.06)}100%{transform:scale(1)}}'
                // The donate button breathes rather than flashes: on a screen somebody
                // glances at across a room, a slow change of size is what the eye picks up,
                // and anything faster reads as an advertisement.
                + '@keyframes fdBreathe{0%{transform:scale(1);box-shadow:0 10px 30px rgba(34,197,94,0.30),0 0 0 0 rgba(34,197,94,0.45)}'
                + '50%{transform:scale(1.035);box-shadow:0 16px 44px rgba(34,197,94,0.45),0 0 0 14px rgba(34,197,94,0)}'
                + '100%{transform:scale(1);box-shadow:0 10px 30px rgba(34,197,94,0.30),0 0 0 0 rgba(34,197,94,0)}}'
                + '#fd-give:hover{filter:brightness(1.06)}'
                // Someone who has asked their system for less movement gets a button that
                // holds still. It keeps its size and its ring, which is most of what makes
                // it carry; the motion is the part that can be given up.
                + '@media (prefers-reduced-motion: reduce){#fd-give{animation:none!important}'
                + '#fd-live{animation:none!important}}';
            document.head.appendChild(st);
        }
        const card = () => document.getElementById('fd-card');

        // THE LOOK. A campaign picks one of a few backgrounds, and may put a photograph
        // behind the whole display or as a banner over the title. The picture is NOT in the
        // campaign document -- that is re-read every few seconds -- but in a file beside it,
        // fetched once and again only when the campaign says the version changed.
        // id, then the three colours of the background: inner, middle, outer. An empty
        // middle means a flat background rather than a glow. All dark: a white total goes
        // over them and has to carry to the back of a room.
        //
        // THE SAME TABLE IS IN fundraise/console.js, which previews it. Two modules with no
        // import between them: change one and change the other.
        const THEMES = [
            ['deep', '#123a63', '#0a1e3a', '#071526'],
            ['ocean', '#0e4a6b', '#063149', '#04202f'],
            ['teal', '#0d5157', '#06333a', '#032126'],
            ['ice', '#27456b', '#142742', '#0a1424'],
            ['steel', '#2c3f52', '#16222e', '#0a1016'],
            ['forest', '#14492f', '#0b2a1d', '#061712'],
            ['moss', '#2d5132', '#16291b', '#0a150e'],
            ['mint', '#0f5742', '#073228', '#04211a'],
            ['warm', '#5a2b1b', '#311611', '#1a0c08'],
            ['ember', '#6b2a14', '#38140a', '#1c0906'],
            ['amber', '#6b4c12', '#3a2808', '#1c1304'],
            ['sand', '#4a4030', '#262013', '#13100a'],
            ['coral', '#7a2f2a', '#42140f', '#210907'],
            ['wine', '#5c1533', '#30091b', '#19050e'],
            ['rose', '#6b2342', '#3a1124', '#1e0812'],
            ['violet', '#43236b', '#251241', '#130a22'],
            ['plum', '#4e1a56', '#2a0c2f', '#16061a'],
            ['berry', '#591a4a', '#300d28', '#190615'],
            ['indigo', '#2b2b6e', '#15153a', '#0a0a1f'],
            ['midnight', '#241b4e', '#140f2e', '#0a0718'],
            ['slate', '#1e2733', '#121923', '#0a0e14'],
            ['night', '#0b1020', '#080c18', '#05070f'],
            ['graphite', '#23272e', '', '#0b0c0f'],
            ['plain', '#0d1420', '', '#0a0f18'],
        ];
        const THEME_BY = {};
        for (const t of THEMES) THEME_BY[t[0]] = t;
        const themeCss = (id) => {
            const t = THEME_BY[id] || THEME_BY.deep;
            return t[2]
                ? 'radial-gradient(1200px 700px at 50% -10%,' + t[1] + ' 0%,' + t[2] + ' 55%,' + t[3] + ' 100%)'
                : 'linear-gradient(' + t[1] + ',' + t[3] + ')';
        };
        const medOf = (d) => ((d && d.media && typeof d.media === 'object') ? d.media : {});
        let pictureUri = '', pictureKey = '';
        const readPicture = async (d) => {
            const m = medOf(d);
            const key = ('' + (m.imageFile || '')) + '@' + ('' + (m.imageV || ''));
            if (!m.imageFile) { pictureUri = ''; pictureKey = ''; return; }
            if (key === pictureKey) return;
            const base = ('' + docPath).replace(/[^/]*$/, '');
            if (!base) return;
            try {
                const rs = await POSTJSON({ path: base + m.imageFile, user: 'public' }, host + '/load-file');
                let v = rs;
                if (v && typeof v.value === 'string') { try { v = JSON.parse(v.value); } catch (e) { } }
                if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
                // Only a data: image. Anything else in that field would be a URL this page
                // then went and fetched, which is not something a campaign document gets to
                // decide for a screen in someone's hall.
                const u = (v && typeof v.dataUri === 'string') ? v.dataUri : '';
                pictureUri = /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(u) ? u : '';
                pictureKey = key;
            } catch (e) { }
        };
        // The faces, from one sibling file, fetched once and again only when the campaign
        // says the team changed.
        let faces = {}, facesKey = '';
        const readFaces = async (d) => {
            const file = '' + ((d && d.teamFile) || '');
            const key = file + '@' + ('' + ((d && d.teamV) || ''));
            if (!file || !listOf(d, 'team').length) { faces = {}; facesKey = ''; return; }
            if (key === facesKey) return;
            const base = ('' + docPath).replace(/[^/]*$/, '');
            if (!base) return;
            try {
                const rs = await POSTJSON({ path: base + file, user: 'public' }, host + '/load-file');
                let v = rs;
                if (v && typeof v.value === 'string') { try { v = JSON.parse(v.value); } catch (e) { } }
                if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
                const got = (v && v.faces && typeof v.faces === 'object') ? v.faces : {};
                // data: images only, as with the campaign picture: a URL in this file would
                // be a page in someone's hall fetching whatever it said.
                const clean = {};
                for (const k of Object.keys(got)) {
                    const u = '' + got[k];
                    if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(u)) clean[k] = u;
                }
                faces = clean; facesKey = key;
            } catch (e) { }
        };

        const paintBackground = (d) => {
            const m = medOf(d);
            const base = themeCss(m.theme);
            // Behind the whole display only when the campaign asked for that. Unset means
            // above the title, which is how the console publishes by default.
            const asBg = pictureUri && m.imageMode === 'background';
            try {
                // The photograph goes UNDER a dark wash: a total has to stay readable from the
                // back of a room, and white numbers on someone's sunny garden party do not.
                el.style.backgroundImage = asBg
                    ? 'linear-gradient(rgba(5,14,26,0.72),rgba(5,14,26,0.86)), url("' + pictureUri + '")'
                    : base;
                el.style.backgroundSize = asBg ? 'cover' : '';
                el.style.backgroundPosition = asBg ? 'center' : '';
                el.style.backgroundRepeat = 'no-repeat';
                el.style.backgroundColor = '#071526';
            } catch (e) { }
        };
        const bannerHtml = (d, big) => {
            const m = medOf(d);
            if (!pictureUri || m.imageMode === 'background') return '';
            return '<div style="margin:0 auto ' + (big ? 'clamp(12px,2.4vmin,26px)' : '14px') + ';">'
                + '<img src="' + esc(pictureUri) + '" alt="" style="max-width:' + (big ? 'min(760px,86vw)' : '100%')
                + ';max-height:' + (big ? '26vh' : '200px') + ';border-radius:14px;display:block;margin:0 auto;'
                + 'box-shadow:0 10px 34px rgba(0,0,0,0.4);"/></div>';
        };
        const filmHtml = (d) => {
            const id = ('' + (medOf(d).youtube || '')).trim();
            if (!/^[\w-]{11}$/.test(id)) return '';
            // youtube-nocookie, and no autoplay: a film that starts talking by itself in a
            // room with a microphone in it is a bad surprise.
            // Capped rather than full width: at 820px a 16:9 film is 460px tall and pushes
            // everything else off the page, and nobody came to this page for the film alone.
            return '<div style="margin:10px auto 0;max-width:620px;position:relative;padding-top:34.9%;'
                + 'max-height:349px;border-radius:12px;overflow:hidden;'
                + 'border:1px solid rgba(255,255,255,0.14);background:#000;">'
                + '<iframe src="https://www.youtube-nocookie.com/embed/' + esc(id) + '?rel=0" title="Campaign film" '
                + 'loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen '
                + 'referrerpolicy="strict-origin-when-cross-origin" '
                + 'style="position:absolute;inset:0;width:100%;height:100%;border:0;"></iframe></div>';
        };

        // A donor coming back from the payment page lands here with ?donated=1 on the URL. The
        // processor's own emailed receipt is the proof of payment; this is only an
        // acknowledgement on the way back.
        //
        // NOTHING A DONOR READS NAMES THE PROCESSOR. Which company clears the card is the
        // organiser's arrangement, not the donor's business, and a page that belongs to the
        // campaign should speak in the campaign's name. The comments below still say Stripe
        // because that is what the code talks to.
        const thanked = (qp('donated') === '1');
        // THE ADDRESS BAR SHOWS THE SHORT LINK, NOT THIS ONE. /f/<code> sends a browser here,
        // which leaves the long URL on screen -- and the long URL is the one that gets
        // copied, pasted into Facebook, and shows the shell's card instead of the campaign's.
        // So once this page is up it puts /f/<code> back in the address bar. Nothing
        // navigates: it is the same page, under the name it should be shared by, and
        // reloading that name comes back here through the server.
        if (code) {
            try { history.replaceState({}, '', '/f/' + encodeURIComponent(code)); } catch (e) { }
        }

        // Taken off the URL once read, so a reload later does not thank someone twice.
        if (thanked) {
            try {
                const u = new URL(window.location.href);
                u.searchParams.delete('donated');
                history.replaceState({}, '', u.pathname + (u.search || '') + (u.hash || ''));
            } catch (e) { }
        }

        const money = (n, cur) => {
            const v = (+n || 0);
            try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: (v % 1 ? 2 : 0) }).format(v); }
            catch (e) { return (cur || '$') + v.toLocaleString(); }
        };
        const fail = (msg) => {
            card().innerHTML = '<div style="font:700 clamp(20px,3.4vmin,34px) system-ui;margin-bottom:10px;">Nothing to show here yet</div>'
                + '<div style="font:400 clamp(13px,1.8vmin,17px) system-ui;color:#9fc4d4;max-width:48ch;margin:0 auto;">' + esc(msg) + '</div>';
        };

        // The number counts UP to its new value rather than jumping: on a screen people are
        // watching, the movement is the point.
        let shownRaised = null, lastStamp = '';
        const animateTo = (fromV, toV, cur, draw) => {
            const t0 = (window.performance && performance.now) ? performance.now() : Date.now();
            const ms = Math.min(1400, 300 + Math.abs(toV - fromV) * 2);
            const step = () => {
                const now = (window.performance && performance.now) ? performance.now() : Date.now();
                const k = Math.max(0, Math.min(1, (now - t0) / ms));
                const e = 1 - Math.pow(1 - k, 3);
                draw(fromV + (toV - fromV) * e);
                if (k < 1) requestAnimationFrame(step);
            };
            step();
        };

        // "3 minutes ago" for anything recent, a real date once it is old: a donation that
        // landed during the event reads as news, one from last week reads as history.
        const ago = (iso) => {
            const t = iso ? new Date(iso) : null;
            if (!t || isNaN(+t)) return '';
            const secs = Math.round((Date.now() - t.getTime()) / 1000);
            if (secs < 45) return 'just now';
            if (secs < 5400) { const m = Math.round(secs / 60); return m + (m === 1 ? ' minute ago' : ' minutes ago'); }
            if (secs < 86400) { const h = Math.round(secs / 3600); return h + (h === 1 ? ' hour ago' : ' hours ago'); }
            if (secs < 6 * 86400) { const dd = Math.round(secs / 86400); return dd + (dd === 1 ? ' day ago' : ' days ago'); }
            return t.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
        };
        const listOf = (d, k) => (Array.isArray(d && d[k]) ? d[k] : []).filter((x) => x && typeof x === 'object');
        const hasDetail = (d) => !!(('' + ((d && d.story) || '')).trim() || listOf(d, 'gifts').length
            || listOf(d, 'updates').length || listOf(d, 'team').length
            || /^[\w-]{11}$/.test('' + ((d && d.media && d.media.youtube) || '')));
        // Paragraphs, not a block of run-on text, and still escaped: everything here was typed
        // by the organiser but arrives through a document anyone could in principle write to.
        const paras = (t) => ('' + (t || '')).split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)
            .map((x) => '<p style="margin:0 0 12px;">' + esc(x).replace(/\n/g, '<br>') + '</p>').join('');

        // ---- giving ----------------------------------------------------------------------
        const donCfg = (d) => {
            const c = (d && d.donate && typeof d.donate === 'object') ? d.donate : null;
            if (!c || !c.on) return null;
            const mode = (c.mode === 'link') ? 'link' : 'checkout';
            if (mode === 'link' && !/^https:\/\//i.test('' + (c.url || ''))) return null;
            const amounts = (Array.isArray(c.amounts) ? c.amounts : [])
                .map((v) => +v).filter((v) => isFinite(v) && v > 0).slice(0, 6);
            const custom = c.custom !== false;
            if (mode === 'checkout' && !amounts.length && !custom) return null;
            return { mode: mode, url: '' + (c.url || ''), label: ('' + (c.label || 'Donate')).slice(0, 40), amounts: amounts, custom: custom };
        };
        // Is a photograph sitting behind the whole display? Everything that has to stay
        // readable asks this, because over a picture the answer is more contrast, not less.
        const overPic = (d) => !!(pictureUri && medOf(d).imageMode === 'background');
        // A padlock drawn rather than fetched, and in currentColor so it is the same ink as
        // the words beside it. Trust marks that arrive over the network are the first thing
        // to fail on a hall's wifi, and a broken padlock is worse than none.
        const LOCK = (px, op) => '<svg viewBox="0 0 24 24" width="' + px + '" height="' + px + '" aria-hidden="true" '
            + 'style="vertical-align:-0.14em;margin-right:7px;opacity:' + (op || 1) + ';" fill="none" stroke="currentColor" '
            + 'stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'
            + '<rect x="4" y="10.5" width="16" height="10.5" rx="2.4"></rect>'
            + '<path d="M8 10.5V7.2a4 4 0 0 1 8 0v3.3"></path></svg>';

        const donateBtn = (d, big) => {
            const c = donCfg(d);
            if (!c) return '';
            return '<button id="fd-give" style="cursor:pointer;border:0;border-radius:999px;color:#04210f;'
                + 'background:linear-gradient(180deg,#36dd77,#16a34a);'
                + (big ? 'padding:16px 44px;font:800 clamp(16px,2.5vmin,24px) system-ui;letter-spacing:.01em;'
                    + 'animation:fdBreathe 3.4s ease-in-out infinite;'
                    : 'padding:10px 24px;font:800 14px system-ui;box-shadow:0 8px 24px rgba(34,197,94,0.3);')
                + (big ? 'outline:2px solid rgba(255,255,255,0.22);outline-offset:3px;' : '')
                + '">' + LOCK(big ? 19 : 14) + esc(c.label) + '</button>';
        };
        // One line, under the button, in the words that actually matter to someone about to
        // type a card number: where it goes, and what is kept here.
        const safeLine = (d) => donCfg(d)
            ? '<div style="margin-top:10px;font:500 clamp(11.5px,1.5vmin,14px) system-ui;color:#9fc4d4;">'
                + LOCK(13, 0.85) + 'Secure payment. Card details are never typed on this page, '
                + 'and nothing about you is used for anything but this campaign.</div>'
            : '';

        // The sheet: pick an amount, then Stripe. Nothing is typed here that belongs to a
        // card -- the only field is how much.
        let sheet = null;
        let pending = null;
        const closeSheet = () => {
            try { if (sheet && sheet.parentNode) sheet.parentNode.removeChild(sheet); } catch (e) { }
            sheet = null;
            if (pending) { const d = pending; pending = null; draw(d, false, true); }
        };
        const openSheet = (d) => {
            const c = donCfg(d);
            if (!c) return;
            const cur = d.currency || 'USD';
            closeSheet();
            sheet = document.createElement('div');
            sheet.style.cssText = 'position:fixed;inset:0;z-index:2147483100;background:rgba(3,11,22,0.72);display:flex;'
                + 'align-items:center;justify-content:center;padding:4vmin;box-sizing:border-box;';
            const fld = 'width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;'
                + 'border:1px solid rgba(255,255,255,0.18);border-radius:10px;padding:11px 13px;font:15px system-ui;';
            const chip = (v) => '<button class="fd-amt" data-amt="' + v + '" style="cursor:pointer;border:1px solid rgba(255,255,255,0.25);'
                + 'background:rgba(255,255,255,0.06);color:#eaf6f9;border-radius:10px;padding:12px 6px;font:700 15px system-ui;">'
                + esc(money(v, cur)) + '</button>';
            sheet.innerHTML = '<div style="width:min(430px,94vw);background:#0b2545;border:1px solid rgba(255,255,255,0.14);'
                + 'border-radius:16px;padding:22px;color:#eaf6f9;box-shadow:0 30px 80px rgba(0,0,0,0.5);">'
                + '<div style="display:flex;align-items:baseline;gap:10px;">'
                + '<div style="font:800 19px system-ui;">' + esc(c.label) + '</div>'
                + '<button id="fd-x" style="margin-left:auto;cursor:pointer;border:0;background:transparent;color:#9fc4d4;font:700 18px system-ui;">×</button></div>'
                + '<div style="margin-top:4px;font:13px system-ui;color:#9fc4d4;">' + esc(d.title || 'this campaign') + '</div>'
                + (c.amounts.length ? '<div style="margin-top:16px;display:grid;grid-template-columns:repeat(' + Math.min(3, c.amounts.length)
                    + ',1fr);gap:9px;">' + c.amounts.map(chip).join('') + '</div>' : '')
                + (c.custom ? '<div style="margin-top:12px;"><input id="fd-own" inputmode="decimal" placeholder="another amount" '
                    + 'style="' + fld + '"/></div>' : '')
                // Optional, and said so twice: a donor who wants to stay out of it should
                // not have to wonder what happens if they leave these alone.
                + '<div style="margin-top:12px;"><input id="fd-name" maxlength="40" placeholder="your name (optional)" style="' + fld + '"/></div>'
                + '<div style="margin-top:8px;"><input id="fd-msg" maxlength="140" placeholder="a message with it (optional)" style="' + fld + '"/></div>'
                + '<div style="margin-top:6px;font:11.5px system-ui;color:#7fb0c4;">Both appear on the campaign\'s page. '
                + 'Leave the name empty to give as Anonymous.</div>'
                + '<button id="fd-go" style="margin-top:14px;width:100%;cursor:pointer;border:0;background:#22c55e;color:#04210f;'
                + 'border-radius:10px;padding:13px;font:800 15px system-ui;">' + LOCK(15) + 'Continue to payment</button>'
                + '<div id="fd-err" style="margin-top:10px;font:12.5px system-ui;color:#fca5a5;min-height:16px;"></div>'
                // WHAT ACTUALLY HAPPENS TO WHAT: one line, and the detail behind it.
                //
                // Every one of these is a statement about this code rather than a reassuring
                // noise, and that is exactly why they were all on screen at once. But four
                // paragraphs of privacy text between "how much" and "pay" is four paragraphs
                // a donor has to get past, and the ones who want them are not the ones who
                // are mid-donation. So the promise is one line, and the detail opens under
                // it for whoever wants to read it.
                //
                // It is in the page, not behind a request: no network, nothing to fail, and
                // it works the same on a display in a hall with no connection to spare.
                + '<div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.12);'
                + 'font:12px/1.6 system-ui;color:#9fc4d4;">'
                + '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">'
                + '<span style="font:700 11px system-ui;letter-spacing:.09em;text-transform:uppercase;color:#86efac;">'
                + LOCK(13) + 'A secure donation</span>'
                + '<button id="fd-more" type="button" style="cursor:pointer;border:0;background:none;padding:0;'
                + 'font:12px system-ui;color:#7fd7ea;text-decoration:underline;">What is kept, and what is not</button>'
                + '</div>'
                + '<div id="fd-detail" style="display:none;margin-top:8px;">'
                + '<div>' + LOCK(11, 0.5) + 'Card details are entered on the payment page, never on this one.</div>'
                + '<div>' + LOCK(11, 0.5) + 'This campaign records the amount and the time, and nothing else.</div>'
                + '<div>' + LOCK(11, 0.5) + 'Your email goes to the payment provider for the receipt. It is never shown here.</div>'
                + '<div>' + LOCK(11, 0.5) + 'Nothing is used for marketing, and nothing is passed on.</div>'
                + '<div style="margin-top:7px;color:#7fb0c4;">Card, Apple Pay, Google Pay and the account\'s other methods '
                + 'all appear at checkout.</div></div></div>'
                + '</div>';
            document.body.appendChild(sheet);

            // The detail opens in place and stays open: someone who asked to read it is not
            // helped by having to ask again, and the sheet scrolls.
            const more = sheet.querySelector('#fd-more');
            if (more) more.onclick = () => {
                const d = sheet.querySelector('#fd-detail');
                if (!d) return;
                const open = d.style.display !== 'none';
                d.style.display = open ? 'none' : '';
                more.textContent = open ? 'What is kept, and what is not' : 'Hide';
                if (!open) { try { d.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { } }
            };

            let picked = c.amounts.length ? c.amounts[Math.min(1, c.amounts.length - 1)] : 0;
            const paint = () => {
                for (const b of sheet.querySelectorAll('.fd-amt')) {
                    const on = (+b.getAttribute('data-amt') === picked);
                    b.style.borderColor = on ? '#22c55e' : 'rgba(255,255,255,0.25)';
                    b.style.background = on ? 'rgba(34,197,94,0.18)' : 'rgba(255,255,255,0.06)';
                }
            };
            paint();
            for (const b of sheet.querySelectorAll('.fd-amt')) {
                b.onclick = () => { picked = +b.getAttribute('data-amt'); const o = sheet.querySelector('#fd-own'); if (o) o.value = ''; paint(); };
            }
            const own = sheet.querySelector('#fd-own');
            if (own) own.addEventListener('input', () => {
                const t = ('' + own.value).replace(/[^0-9.]/g, '');
                const v = parseFloat(t);
                picked = isFinite(v) ? v : 0;
                paint();
            });
            sheet.querySelector('#fd-x').onclick = closeSheet;
            sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

            sheet.querySelector('#fd-go').onclick = async () => {
                const err = sheet.querySelector('#fd-err'), go = sheet.querySelector('#fd-go');
                // A Payment Link carries its own amount (or asks for one), so an amount here
                // is only needed for a session this server creates.
                if (c.mode === 'checkout' && !(picked > 0)) { err.textContent = 'Choose an amount first.'; return; }
                if (c.mode === 'link') { closeSheet(); try { window.open(c.url, '_blank', 'noopener'); } catch (e) { window.location.href = c.url; } return; }
                go.disabled = true; err.textContent = ''; go.innerHTML = LOCK(15) + 'Taking you to checkout…';
                try {
                    const back = window.location.href.split('#')[0];
                    const val = (id) => { const el = sheet.querySelector('#' + id); return el ? ('' + el.value).trim() : ''; };
                    const r = await POSTJSON({
                        amount: picked, currency: cur, campaign: ('' + (d.title || '')).slice(0, 120),
                        path: docPath, returnUrl: back,
                        // Typed here, so publishing them is the donor's own decision. A name
                        // taken off a card is a different thing and stays behind the
                        // campaign's own setting.
                        donorName: val('fd-name').slice(0, 40), donorNote: val('fd-msg').slice(0, 140)
                    }, host + '/stripe/donation-session');
                    if (r && r.url) { window.location.href = r.url; return; }
                    throw new Error((r && (r.error_description || r.error)) || 'the payment page could not be opened');
                } catch (e) {
                    go.disabled = false; go.innerHTML = LOCK(15) + 'Continue to payment';
                    err.textContent = 'Could not open checkout: ' + ((e && e.message) ? e.message : e)
                        + '. Try again, or tell the organiser.';
                }
            };
        };

        let view = 'main', lastDoc = null;
        const go = (v) => {
            view = v;
            try { el.style.alignItems = (v === 'detail') ? 'flex-start' : 'center'; } catch (e) { }
            if (lastDoc) draw(lastDoc, false, true);
            if (v === 'detail') { try { el.scrollTop = 0; } catch (e) { } }
        };

        const renderDetail = (d) => {
            const cur = d.currency || 'USD';
            const goal = Math.max(0, +d.goal || 0), raised = Math.max(0, +d.raised || 0);
            const pct = goal > 0 ? Math.max(0, Math.min(100, (raised / goal) * 100)) : 0;
            const gifts = listOf(d, 'gifts'), updates = listOf(d, 'updates');
            // One line of context under the amount, joined by one separator: two spans each
            // carrying their own "·" left a gap with a dot floating in it.
            const meta = [];
            if (goal > 0) meta.push('of ' + esc(money(goal, cur)) + ' · ' + pct.toFixed(pct < 10 ? 1 : 0) + '%');
            if (d.donors) meta.push(esc((+d.donors).toLocaleString()) + ' ' + (Math.abs(+d.donors) === 1 ? 'donor' : 'donors'));
            // One section ran into the next: a label in small caps is not enough of a break
            // between a row of faces and a list of donations. Every section after the first
            // opens with a rule and a good deal more air above it, so the page reads as
            // parts rather than as one column of text. Counted rather than hard-coded,
            // since which sections exist depends on what the campaign has filled in.
            let sectN = 0;
            const sect = (t) => {
                sectN++;
                return '<div style="' + (sectN > 1
                    ? 'margin-top:40px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.13);'
                    : 'margin-top:30px;') + '">'
                    + '<div style="font:700 12px system-ui;letter-spacing:.11em;text-transform:uppercase;color:#8fc0d4;'
                    + 'margin-bottom:14px;">' + esc(t) + '</div></div>';
            };
            const money_ = (v) => esc(money(v, cur));

            card().innerHTML = '<div style="text-align:left;max-width:820px;margin:0 auto;padding:2vmin 0 6vmin;">'
                + '<button id="fd-back" style="cursor:pointer;border:1px solid rgba(255,255,255,0.22);background:transparent;'
                + 'color:#cfe6ef;border-radius:999px;padding:7px 15px;font:600 12.5px system-ui;">← Back to the total</button>'
                + bannerHtml(d, false)
                + '<div style="margin-top:18px;font:800 clamp(22px,3.4vmin,36px) system-ui;letter-spacing:-0.02em;">' + esc(d.title || 'Campaign') + '</div>'
                + (d.subtitle ? '<div style="margin-top:4px;font:400 15px system-ui;color:#9fc4d4;">' + esc(d.subtitle) + '</div>' : '')
                + '<div style="margin-top:16px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;">'
                + '<span style="font:800 30px system-ui;letter-spacing:-0.02em;">' + money_(raised) + '</span>'
                + (meta.length ? '<span style="font:500 14px system-ui;color:#9fc4d4;">' + meta.join(' · ') + '</span>' : '')
                + '</div>'
                + (goal > 0 ? '<div style="margin-top:12px;height:10px;border-radius:999px;background:rgba(255,255,255,0.10);'
                    + 'border:1px solid rgba(255,255,255,0.16);overflow:hidden;"><div style="height:100%;width:' + pct.toFixed(2) + '%;'
                    + 'background:linear-gradient(90deg,#1aa3bd,#22c55e);transition:width .9s cubic-bezier(.22,.9,.26,1);"></div></div>' : '')
                + (donateBtn(d, false) ? '<div style="margin-top:16px;">' + donateBtn(d, false)
                    + '<div style="margin-top:8px;font:12px system-ui;color:#8fb6c6;">' + LOCK(12, 0.85)
                    + 'Card details are never typed on this page.</div></div>' : '')

                + (('' + (d.story || '')).trim() ? sect('About this campaign')
                    + '<div style="font:400 15.5px/1.6 system-ui;color:#dceef5;">' + paras(d.story) + '</div>' : '')
                + (filmHtml(d) ? sect('Watch') + filmHtml(d) : '')

                + (updates.length ? sect('Updates') + updates.map((u) => ''
                    + '<div style="border-left:2px solid rgba(79,208,230,0.5);padding:2px 0 2px 14px;margin:0 0 18px;">'
                    + '<div style="font:600 12px system-ui;color:#7fb0c4;">' + esc(ago(u.at)) + '</div>'
                    + (u.title ? '<div style="margin-top:3px;font:700 15px system-ui;">' + esc(u.title) + '</div>' : '')
                    + '<div style="margin-top:5px;font:400 15px/1.55 system-ui;color:#dceef5;">' + paras(u.text) + '</div>'
                    + '</div>').join('') : '')

                + (listOf(d, 'team').length ? sect('The team')
                    + '<div style="display:flex;flex-wrap:wrap;gap:18px 26px;">'
                    + listOf(d, 'team').map((m) => '<div style="display:flex;gap:11px;align-items:center;flex:1 1 260px;min-width:0;">'
                        + (faces[m.id]
                            ? '<img src="' + esc(faces[m.id]) + '" alt="" style="width:54px;height:54px;border-radius:50%;'
                                + 'object-fit:cover;flex:0 0 auto;border:1px solid rgba(255,255,255,0.18);"/>'
                            : '<div style="width:54px;height:54px;border-radius:50%;flex:0 0 auto;background:rgba(255,255,255,0.10);'
                                + 'border:1px solid rgba(255,255,255,0.14);display:flex;align-items:center;justify-content:center;'
                                + 'font:700 18px system-ui;color:#9fc4d4;">'
                                + esc((('' + (m.name || '?')).trim()[0] || '?').toUpperCase()) + '</div>')
                        + '<div style="min-width:0;">'
                        + '<div style="font:600 15px system-ui;">' + esc(m.name || '') + '</div>'
                        + (m.role ? '<div style="font:13px system-ui;color:#9fc4d4;">' + esc(m.role) + '</div>' : '')
                        + (m.note ? '<div style="margin-top:3px;font:13px/1.45 system-ui;color:#bcd9e4;">' + esc(m.note) + '</div>' : '')
                        + '</div></div>').join('')
                    + '</div>' : '')

                + (gifts.length ? sect('Recent donations') + '<div>' + gifts.map((g) => ''
                    + '<div style="display:flex;gap:12px;align-items:baseline;padding:9px 0;border-bottom:1px solid rgba(255,255,255,0.08);">'
                    + '<div style="flex:1 1 auto;min-width:0;">'
                    + '<div style="font:600 14.5px system-ui;">' + esc(('' + (g.name || '')).trim() || 'Anonymous') + '</div>'
                    + (g.note ? '<div style="margin-top:2px;font:400 13px system-ui;color:#bcd9e4;">' + esc(g.note) + '</div>' : '')
                    + '</div>'
                    + '<div style="text-align:right;white-space:nowrap;">'
                    + (d.hideGiftAmounts ? '' : '<div style="font:700 14.5px system-ui;color:#86efac;">' + money_(+g.amount || 0) + '</div>')
                    + '<div style="font:400 11.5px system-ui;color:#7fb0c4;">' + esc(ago(g.at)) + '</div></div>'
                    + '</div>').join('') + '</div>' : '')

                + '<div style="margin-top:28px;font:400 12.5px system-ui;color:#6f93a6;">'
                // WHO PUBLISHED IT is not shown. This page is open to anyone with the
                // link, and the organiser's sign-in address used to be printed under the
                // total: an email address handed to every visitor, every crawler and
                // every scraper that follows a shared campaign link.
                + (d.updated ? 'Updated ' + esc(ago(d.updated)) : '')
                + (every ? '<span style="margin-left:10px;animation:fdPulse 2.4s ease-in-out infinite;">live</span>' : '')
                + '</div></div>';
            const b = document.getElementById('fd-back');
            if (b) b.onclick = () => go('main');
            const give = document.getElementById('fd-give');
            if (give) give.onclick = () => openSheet(d);
        };

        const renderMain = (d, firstTime) => {
            // Over a photograph the whole block sits on its own panel: a dark pane with the
            // picture blurred behind it. A text shadow alone survives a plain sky and fails
            // the moment someone uploads a crowd shot, and the number is the one thing on
            // this screen that has to be legible from the back of the room.
            const pic = overPic(d);
            const panel = pic
                ? 'background:rgba(6,16,28,0.56);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);'
                    + 'border:1px solid rgba(255,255,255,0.14);border-radius:26px;padding:clamp(20px,4vmin,46px) clamp(18px,4vmin,54px);'
                    + 'box-shadow:0 30px 90px rgba(0,0,0,0.45);'
                : '';
            const shadow = pic ? 'text-shadow:0 2px 18px rgba(0,0,0,0.55);' : '';
            const cur = d.currency || 'USD';
            const goal = Math.max(0, +d.goal || 0);
            const raised = Math.max(0, +d.raised || 0);
            const pct = goal > 0 ? Math.max(0, Math.min(100, (raised / goal) * 100)) : 0;
            const over = goal > 0 && raised >= goal;
            const upd = d.updated ? new Date(d.updated) : null;
            const when = upd && !isNaN(+upd) ? upd.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
            card().innerHTML = '<div style="' + panel + '">'
                + bannerHtml(d, true)
                + (d.title ? '<div style="font:800 clamp(24px,5vmin,56px) system-ui;letter-spacing:-0.02em;' + shadow + '">' + esc(d.title) + '</div>' : '')
                + (d.subtitle ? '<div style="margin-top:6px;font:400 clamp(14px,2.2vmin,22px) system-ui;color:' + (pic ? '#d7ebf3' : '#9fc4d4') + ';' + shadow + '">' + esc(d.subtitle) + '</div>' : '')
                + '<div id="fd-amount" style="margin:clamp(14px,3vmin,34px) 0 6px;font:800 clamp(40px,12vmin,140px) system-ui;letter-spacing:-0.03em;'
                + 'color:' + (over ? '#86efac' : '#ffffff') + ';line-height:1;'
                + (pic ? 'text-shadow:0 4px 30px rgba(0,0,0,0.6);' : '') + '">' + esc(money(raised, cur)) + '</div>'
                + (goal > 0 ? '<div style="font:500 clamp(13px,2vmin,20px) system-ui;color:' + (pic ? '#d7ebf3' : '#9fc4d4') + ';' + shadow + '">raised of ' + esc(money(goal, cur)) + ' goal</div>' : '')
                + (goal > 0 ? ('<div style="margin:clamp(14px,3vmin,30px) auto 0;max-width:900px;">'
                    + '<div style="height:clamp(16px,3vmin,30px);border-radius:999px;'
                    + (pic ? 'background:rgba(2,8,16,0.62);border:1px solid rgba(255,255,255,0.34);'
                        + 'box-shadow:inset 0 1px 6px rgba(0,0,0,0.5);'
                        : 'background:rgba(255,255,255,0.10);border:1px solid rgba(255,255,255,0.16);') + 'overflow:hidden;">'
                    + '<div id="fd-bar" style="height:100%;width:' + pct.toFixed(2) + '%;border-radius:999px;'
                    + 'background:linear-gradient(90deg,#1aa3bd,#22c55e);transition:width .9s cubic-bezier(.22,.9,.26,1);"></div></div>'
                    + '<div id="fd-pct" style="margin-top:8px;font:700 clamp(14px,2.2vmin,22px) system-ui;color:' + (over ? '#86efac' : '#bfe6f0') + ';">'
                    + pct.toFixed(pct < 10 ? 1 : 0) + '%' + (over ? ' — goal reached' : '') + '</div></div>') : '')
                + (d.donors ? '<div style="margin-top:clamp(10px,2vmin,20px);font:500 clamp(13px,1.9vmin,19px) system-ui;color:#9fc4d4;">'
                    + esc((+d.donors).toLocaleString()) + ' ' + (Math.abs(+d.donors) === 1 ? 'donor' : 'donors') + '</div>' : '')
                + (d.note ? '<div style="margin-top:clamp(12px,2.4vmin,24px);font:400 clamp(13px,1.9vmin,19px) system-ui;color:#cfe6ef;max-width:60ch;margin-left:auto;margin-right:auto;">' + esc(d.note) + '</div>' : '')
                + '<div style="margin-top:clamp(16px,3vmin,30px);font:400 12.5px system-ui;color:#6f93a6;">'
                + (when ? 'Updated ' + esc(when) : '')          // not who: see renderDetail
                + (every ? '<span id="fd-live" style="margin-left:10px;animation:fdPulse 2.4s ease-in-out infinite;">live</span>' : '')
                + '</div></div>'
                + (thanked ? '<div style="margin-top:clamp(12px,2vmin,20px);display:inline-block;border:1px solid rgba(134,239,172,0.5);'
                    + 'background:rgba(34,197,94,0.14);color:#bbf7d0;border-radius:999px;padding:9px 20px;font:600 clamp(12px,1.7vmin,16px) system-ui;">'
                    + 'Thank you. Your receipt is on its way from VRI.</div>' : '')
                + (donateBtn(d, true) ? '<div style="margin-top:clamp(14px,2.6vmin,26px);">' + donateBtn(d, true)
                    + safeLine(d) + '</div>' : '')
                + (hasDetail(d) ? '<div style="margin-top:clamp(12px,2.4vmin,22px);">'
                    + '<button id="fd-more" style="cursor:pointer;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.06);'
                    + 'color:#eaf6f9;border-radius:999px;padding:9px 20px;font:600 clamp(12px,1.6vmin,15px) system-ui;">'
                    + 'Campaign details' + (listOf(d, 'updates').length ? ' · ' + listOf(d, 'updates').length + ' update'
                        + (listOf(d, 'updates').length === 1 ? '' : 's') : '') + '</button></div>' : '');
            const more = document.getElementById('fd-more');
            if (more) more.onclick = () => go('detail');
            const give = document.getElementById('fd-give');
            if (give) give.onclick = () => openSheet(d);
            const amt = document.getElementById('fd-amount');
            if (!firstTime && shownRaised != null && shownRaised !== raised && amt) {
                amt.style.animation = 'fdPop .5s ease';
                animateTo(shownRaised, raised, cur, (v) => { amt.textContent = money(Math.round(v), cur); });
            }
            shownRaised = raised;
        };

        // One entry point for both views, so a refresh that arrives while the details page is
        // open redraws THAT page rather than throwing the reader back to the total.
        const draw = (d, firstTime, keepView) => {
            lastDoc = d;
            paintBackground(d);
            // A redraw while the donate sheet is open would throw away the amount someone is
            // part way through choosing, so the refresh waits for them.
            if (sheet) { pending = d; return; }
            if (view === 'detail' && hasDetail(d)) { renderDetail(d); return; }
            if (view === 'detail') view = 'main';
            renderMain(d, firstTime && !keepView);
        };

        // Ask the server to fold in anything Stripe has been paid for this campaign. Fire and
        // forget: it is an optimisation on the read that follows, never a reason not to read.
        let syncing = false;
        const syncDonations = async () => {
            if (syncing || !docPath) return;
            const c = lastDoc && donCfg(lastDoc);
            if (!c || c.mode !== 'checkout') return;     // a Payment Link has no session to match
            syncing = true;
            try { await POSTJSON({ path: docPath }, host + '/stripe/donation-sync'); } catch (e) { }
            syncing = false;
        };

        const load = async (firstTime) => {
            if (!docPath) { fail('This display has no campaign link. Open it from the fundraising console, or use the link the organiser sent you.'); return; }
            let rs = null;
            try { rs = await POSTJSON({ path: docPath, user: 'public' }, host + '/load-file'); } catch (e) { rs = null; }
            // A share pointer is followed, exactly as the genome viewer follows one.
            if (rs && rs.shared_from) {
                try { rs = await POSTJSON({ path: ('' + rs.shared_from).startsWith('/') ? rs.shared_from : ('/' + rs.shared_from), user: 'public' }, host + '/load-file'); } catch (e) { }
            }
            let d = rs;
            if (d && typeof d.value === 'string') { try { d = JSON.parse(d.value); } catch (e) { } }
            if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
            if (!d || typeof d !== 'object' || (d.kind && d.kind !== 'fundraise')) {
                if (firstTime) fail('That link does not point at a fundraising campaign, or it has been taken down.');
                return;
            }
            const stamp = JSON.stringify([d.title, d.subtitle, d.goal, d.raised, d.donors, d.note, d.updated,
                d.story, d.hideGiftAmounts, d.gifts, d.updates, d.donate, d.media, d.team, d.teamV]);
            if (stamp !== lastStamp) { lastStamp = stamp; await readPicture(d); await readFaces(d); draw(d, firstTime); }
        };

        try {
            document.addEventListener('keydown', (e) => {
                if (!e || e.key !== 'Escape') return;
                if (sheet) { try { e.stopPropagation(); } catch (e2) { } closeSheet(); return; }
                if (view === 'detail') { try { e.stopPropagation(); } catch (e2) { } go('main'); }
            }, true);
        } catch (e) { }

        await load(true);
        // Someone just came back from paying: reconcile at once rather than at the next tick,
        // so they see their own donation land.
        if (thanked) { await syncDonations(); await load(false); }
        if (every > 0) setInterval(async () => { await syncDonations(); await load(false); }, every * 1000);
        // Nothing else belongs on this screen: no toolbar, no menus, no graph.
        try { document.title = 'Fundraising'; } catch (e) { }
        return true;
    })();
}
