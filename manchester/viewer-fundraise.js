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

        // The program plan's picture (fundraise/plan-view.js), the same one the console
        // previews. A campaign without a plan never needs it, and one whose module does not
        // load simply shows no plan section.
        let PV = null;
        try { PV = await exec('fundraise/plan-view.js'); } catch (e) { PV = null; }
        const planOf = (d) => {
            try { return (PV && d && d.plan) ? PV.clean(d.plan) : null; } catch (e) { return null; }
        };

        // A PREVIEW FROM THE CONSOLE: the campaign as it stands on the organiser's screen,
        // published or not, drawn by this same page so it is exactly what a visitor will see.
        //   exec('manchester/viewer-fundraise', '', { preview: { doc, picture, faces, docPath, onClose } })
        // Nothing is read from or written to the server for the campaign itself, it never
        // refreshes, the address bar is left alone, and the donate button explains instead of
        // taking money. A bar across the top says it is a preview and closes it.
        const P = (config && config.preview && typeof config.preview === 'object' && config.preview.doc) ? config.preview : null;

        let every = P ? 0 : 10;
        const rq = P ? null : qp('refresh');
        if (rq != null && rq !== '') { const v = parseFloat(rq); if (isFinite(v)) every = Math.max(0, Math.min(3600, v)); }

        // Where the document lives: a share code first, so the owner's email -- which is part
        // of the stored path -- never appears in the address bar of a screen in a room.
        let docPath = P ? ('' + (P.docPath || '')) : '';
        const code = P ? '' : (qp('s') || qp('share') || '');
        if (code) {
            try {
                const r = await GETJSON(host + '/share-resolve?code=' + encodeURIComponent(code));
                if (r && r.path) docPath = '' + r.path;
            } catch (e) { }
        }
        if (!docPath && !P) docPath = '' + (qp('path') || (config && config.path) || path || '');

        // ---- the screen ------------------------------------------------------------------
        try { const old = document.getElementById('baja-fundraise-display'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const el = document.createElement('div');
        el.id = 'baja-fundraise-display';
        el.style.cssText = 'position:fixed;inset:0;z-index:' + (P ? '2147483300' : '2147483000') + ';overflow:auto;'
            + 'background:radial-gradient(1200px 700px at 50% -10%,#123a63 0%,#0a1e3a 55%,#071526 100%);'
            + 'color:#eaf6f9;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;'
            // CENTRED, BUT NEVER ABOVE THE TOP OF THE SCREEN.
            //
            // A flex item centred in a box it is taller than overflows BOTH ways, and the
            // half that goes off the top cannot be scrolled back to: the scrollbar starts
            // at the top of the box, and the card starts above it. On a laptop the card
            // fits and nobody sees this; on a phone the details page is twice the height
            // of the screen and the title was simply gone. `safe center` keeps the
            // centring when it fits and falls back to the top when it does not. The plain
            // value is declared first for anything that does not know the safe one.
            + 'display:flex;align-items:center;align-items:safe center;justify-content:center;'
            // 4vmin is fifteen pixels on a phone, and under a notch it is none. A real
            // margin, and the inset the device asks for on top of it.
            + 'padding:max(20px,4vmin) max(14px,4vmin) max(28px,4vmin);'
            + 'padding-top:max(28px,4vmin,calc(env(safe-area-inset-top,0px) + 20px));'
            + 'padding-bottom:max(28px,4vmin,calc(env(safe-area-inset-bottom,0px) + 18px));'
            + 'box-sizing:border-box;';
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
            if (P && P.picture !== undefined) {
                const u = '' + (P.picture || '');
                pictureUri = /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(u) ? u : '';
                return;
            }
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
            if (P && P.faces && typeof P.faces === 'object') {
                const clean = {};
                for (const k of Object.keys(P.faces)) {
                    const u = '' + P.faces[k];
                    if (/^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(u)) clean[k] = u;
                }
                faces = clean;
                return;
            }
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
        // THE PRESENTATION, which is fetched only when somebody asks for it.
        //
        // It is megabytes, and this page re-reads the campaign every few seconds for a room
        // watching a total go up. Pulling a deck down on that schedule, or even once on
        // arrival for the many readers who never open it, is the wrong trade. So: a button
        // that says what it is and how big, and the file comes over on the press.
        //
        // A PDF is shown through a BLOB url rather than the data: url it arrives as, because
        // browsers refuse to render a data: document in a frame. A PowerPoint is offered as a
        // download, since no browser renders one; the console says so when it is chosen.
        let deckUrl = '', deckKey = '';
        const deckInfo = (d) => {
            const m = medOf(d);
            const file = ('' + (m.docFile || '')).trim();
            if (!file) return null;
            return {
                file: file,
                name: ('' + (m.docName || file)).trim(),
                kind: (m.docKind === 'ppt') ? 'ppt' : 'pdf',
                bytes: +m.docBytes || 0,
                key: file + '@' + ('' + (m.docV || '')),
            };
        };
        const deckSize = (n) => (n >= 1024 * 1024 ? ((n / 1024 / 1024).toFixed(1) + 'MB')
            : (n > 0 ? (Math.max(1, Math.round(n / 1024)) + 'KB') : ''));
        const fetchDeck = async (d) => {
            const info = deckInfo(d);
            if (!info) return '';
            if (deckUrl && deckKey === info.key) return deckUrl;
            const base = ('' + docPath).replace(/[^/]*$/, '');
            if (!base) return '';
            const rs = await POSTJSON({ path: base + info.file, user: 'public' }, host + '/load-file');
            let v = rs;
            if (v && typeof v.value === 'string') { try { v = JSON.parse(v.value); } catch (e) { } }
            if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
            const uri = (v && v.dataUri) ? ('' + v.dataUri) : '';
            if (!uri) throw new Error('the presentation could not be read');
            // data: into a Blob, because a frame will not render a data: document.
            const comma = uri.indexOf(',');
            const head = uri.slice(0, comma);
            const mime = (head.split(':')[1] || '').split(';')[0] || 'application/octet-stream';
            const bin = atob(uri.slice(comma + 1));
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            try { if (deckUrl) URL.revokeObjectURL(deckUrl); } catch (e) { }
            deckUrl = URL.createObjectURL(new Blob([bytes], { type: mime }));
            deckKey = info.key;
            return deckUrl;
        };
        const deckHtml = (d) => {
            const info = deckInfo(d);
            if (!info) return '';
            const size = deckSize(info.bytes);
            return '<div id="fd-deck">'
                + '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">'
                + '<button id="fd-deck-go" type="button" style="cursor:pointer;border-radius:10px;padding:11px 18px;'
                + 'font:700 13px system-ui;border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.06);'
                + 'color:#eaf6f9;">' + (info.kind === 'pdf' ? 'Open the presentation' : 'Download the presentation')
                + '</button>'
                + '<span style="font:12.5px system-ui;color:#8fb6c6;">' + esc(info.name)
                + (size ? ' · ' + size : '') + (info.kind === 'ppt' ? ' · PowerPoint' : '') + '</span></div>'
                + '<div id="fd-deck-out" style="margin-top:8px;font:12.5px system-ui;color:#8fb6c6;"></div>'
                + '<div id="fd-deck-box" style="margin-top:12px;"></div></div>';
        };
        // ---- LITERATURE ------------------------------------------------------------------
        //
        // The papers behind the work. The card -- title, authors, institution, what it found
        // -- is in the campaign document, so the list reads without fetching anything; the
        // PDF itself is only fetched when somebody asks for that paper, because a reading
        // list of twenty is twenty megabytes nobody asked to download.
        // The id is used to find the button again, so it has to be a plain token: the
        // document is the organiser's, but this code reads it as it would any other file
        // off the network, and an id with a quote in it would break the selector.
        const litOf = (d) => listOf(d, 'literature').filter((p) => ('' + (p.file || '')).trim()
            && /^[A-Za-z0-9_-]{1,64}$/.test('' + (p.id || '')));
        const litUrls = {};
        const fetchLit = async (p) => {
            if (litUrls[p.id]) return litUrls[p.id];
            const base = ('' + docPath).replace(/[^/]*$/, '');
            if (!base) throw new Error('that paper could not be found');
            const rs = await POSTJSON({ path: base + p.file, user: 'public' }, host + '/load-file');
            let v = rs;
            if (v && typeof v.value === 'string') { try { v = JSON.parse(v.value); } catch (e) { } }
            if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
            const uri = (v && v.dataUri) ? ('' + v.dataUri) : '';
            if (!uri) throw new Error('that paper could not be read');
            const comma = uri.indexOf(',');
            const bin = atob(uri.slice(comma + 1));
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            litUrls[p.id] = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
            return litUrls[p.id];
        };
        const litHtml = (d) => {
            const ps = litOf(d);
            if (!ps.length) return '';
            return '<div style="display:flex;flex-direction:column;gap:16px;">'
                + ps.map((p) => {
                    const names = Array.isArray(p.authors) ? p.authors : [];
                    const who = names.slice(0, 4).join(', ') + (names.length > 4 ? ' and others' : '');
                    const where = [p.institution, p.journal, p.year].filter(Boolean).join(' · ');
                    // Who / where / what, each on its own line with the field named, so the
                    // list reads as a set of answers rather than a run of grey text.
                    const field = (label, value) => (value
                        ? '<div style="margin-top:4px;font:13px/1.5 system-ui;color:#bcd9e4;">'
                        + '<span style="color:#7fb0c4;">' + label + '</span> ' + esc(value) + '</div>' : '');
                    return '<div style="border-left:2px solid rgba(79,208,230,0.5);padding:2px 0 2px 14px;">'
                        + '<div style="font:700 15px/1.4 system-ui;color:#eaf6f9;">'
                        + esc(p.title || p.name || 'Untitled') + '</div>'
                        + field('Who', who)
                        + field('Where', where)
                        + (p.summary ? '<div style="margin-top:6px;font:400 14.5px/1.55 system-ui;color:#dceef5;">'
                            + '<span style="color:#7fb0c4;font:13px system-ui;">What</span> '
                            + esc(p.summary) + '</div>' : '')
                        + (!who && !where && !p.summary
                            ? '<div data-lit-pending="' + esc(p.id) + '" style="margin-top:4px;font:13px system-ui;'
                            + 'color:#7fb0c4;">Reading the paper…</div>' : '')
                        + '<div style="margin-top:9px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">'
                        + '<button type="button" data-lit="' + esc(p.id) + '" style="cursor:pointer;border-radius:9px;'
                        + 'padding:8px 14px;font:700 12.5px system-ui;border:1px solid rgba(255,255,255,0.28);'
                        + 'background:rgba(255,255,255,0.06);color:#eaf6f9;">Read the paper</button>'
                        + (/^10\.\d{4,9}\/[^\s"<>]+$/.test('' + (p.doi || ''))
                            ? '<a href="https://doi.org/' + esc(p.doi) + '" target="_blank" rel="noopener noreferrer" '
                            + 'style="font:12.5px system-ui;color:#4fd0e6;">doi.org/' + esc(p.doi) + '</a>' : '')
                        + '<span data-lit-out="' + esc(p.id) + '" style="font:12px system-ui;color:#8fb6c6;"></span>'
                        + '</div></div>';
                }).join('') + '</div>';
        };
        // A PAPER WITH NO CARD GETS ONE, ON LOAD. An entry added before the reader existed,
        // or one whose reading failed at the time, carries a filename and nothing else; the
        // page asks for it rather than showing a bare line.
        //
        // The reading itself is cached beside the PDF on the server, so this costs one
        // reading per paper in total, not one per visitor -- which matters here, because
        // this page is public and the route it calls does not ask who is asking.
        const litFill = async (d) => {
            const base = ('' + docPath).replace(/[^/]*$/, '').replace(/^\/+/, '');
            if (!base) return;
            let changed = false;
            for (const p of litOf(d)) {
                const bare = !(Array.isArray(p.authors) && p.authors.length)
                    && !p.institution && !p.summary;
                if (!bare) continue;
                try {
                    const em = new EngineMonitor(() => { });
                    const card = await exec(host + '/py/extract/paper-card.py', em, base + p.file);
                    if (!card || !card.ok) throw new Error((card && card.error) || 'no answer');
                    let names = [];
                    try { names = JSON.parse(card.authors || '[]'); } catch (e) { names = []; }
                    p.title = p.title || ('' + (card.title || ''));
                    p.authors = Array.isArray(names) ? names : [];
                    p.institution = '' + (card.institution || '');
                    p.year = p.year || ('' + (card.year || ''));
                    p.journal = p.journal || ('' + (card.journal || ''));
                    p.doi = p.doi || ('' + (card.doi || ''));
                    p.summary = '' + (card.summary || '');
                    changed = true;
                } catch (e) {
                    const note = document.querySelector('[data-lit-pending="' + p.id + '"]');
                    // Nothing is hidden on a failure: the paper is still listed and still
                    // opens, and the line says the details could not be read.
                    if (note) note.textContent = 'The details could not be read.';
                }
            }
            // One repaint at the end rather than one per paper, so the list does not jump
            // about while several are being read.
            if (changed && view === 'detail') renderDetail(d);
        };
        const wireLit = (d) => {
            for (const p of litOf(d)) {
                const go = document.querySelector('[data-lit="' + p.id + '"]');
                if (!go) continue;
                go.onclick = async () => {
                    const out = document.querySelector('[data-lit-out="' + p.id + '"]');
                    if (out) out.textContent = 'Fetching it…';
                    go.disabled = true;
                    try {
                        const url = await fetchLit(p);
                        if (out) out.textContent = '';
                        window.open(url, '_blank', 'noopener');
                    } catch (e) {
                        if (out) out.textContent = (e && e.message) ? e.message : ('' + e);
                    }
                    go.disabled = false;
                };
            }
        };
        const wireDeck = (d) => {
            const go = document.getElementById('fd-deck-go');
            if (!go) return;
            const info = deckInfo(d);
            go.onclick = async () => {
                const out = document.getElementById('fd-deck-out');
                out.textContent = 'Fetching it…';
                go.disabled = true;
                try {
                    const url = await fetchDeck(d);
                    out.textContent = '';
                    go.disabled = false;
                    if (info.kind === 'pdf') {
                        document.getElementById('fd-deck-box').innerHTML =
                            '<iframe src="' + esc(url) + '" title="' + esc(info.name) + '" '
                            + 'style="width:100%;height:min(74vh,720px);border:1px solid rgba(255,255,255,0.16);'
                            + 'border-radius:12px;background:#0b1b2c;"></iframe>'
                            + '<div style="margin-top:8px;"><a href="' + esc(url) + '" download="' + esc(info.name) + '" '
                            + 'style="color:#4fd0e6;font:12.5px system-ui;">Download it instead</a></div>';
                        go.style.display = 'none';
                    } else {
                        // A download cannot be started from a frame the way a PDF is shown,
                        // so this is a real link, clicked.
                        const a = document.createElement('a');
                        a.href = url; a.download = info.name;
                        document.body.appendChild(a); a.click();
                        setTimeout(() => { try { a.remove(); } catch (e) { } }, 500);
                        out.textContent = 'Downloading ' + info.name + '.';
                    }
                } catch (e) {
                    go.disabled = false;
                    out.textContent = 'Could not open it: ' + ((e && e.message) ? e.message : e);
                }
            };
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
        const thanked = !P && (qp('donated') === '1');
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
            || listOf(d, 'updates').length || listOf(d, 'team').length || listOf(d, 'timeline').length
            || listOf(d, 'literature').length
            || !!planOf(d)
            || ('' + ((d && d.media && d.media.docFile) || '')).trim()
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

        // A QR encoder, byte mode, error correction level M, versions 1 to 12.
        // Written out because the campaign display is a public page that must work with nothing
        // loaded from anywhere else: a <script src> to a CDN is a third party watching every
        // donor, and a request that can fail is a barcode that sometimes is not there.
        const makeQr = (text) => {
            // ---- the bytes to encode -------------------------------------------------------
            const utf8 = [];
            for (const ch of unescape(encodeURIComponent('' + text))) utf8.push(ch.charCodeAt(0) & 255);

            // Per version, at level M: error-correction codewords in each block, then the blocks
            // as (count, data codewords each). Two groups, because most versions have blocks of
            // two sizes.
            const SPEC = {
                1: [10, [[1, 16]]], 2: [16, [[1, 28]]], 3: [26, [[1, 44]]],
                4: [18, [[2, 32]]], 5: [24, [[2, 43]]], 6: [16, [[4, 27]]],
                7: [18, [[4, 31]]], 8: [22, [[2, 38], [2, 39]]], 9: [22, [[3, 36], [2, 37]]],
                10: [26, [[4, 43], [1, 44]]], 11: [30, [[1, 50], [4, 51]]], 12: [22, [[6, 36], [2, 37]]]
            };
            const ALIGN = {
                1: [], 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34],
                7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
                11: [6, 30, 54], 12: [6, 32, 58]
            };
            const capacity = (v) => {
                let n = 0;
                for (const [count, each] of SPEC[v][1]) n += count * each;
                return n;
            };
            // The character count is eight bits up to version 9 and sixteen from version 10, so
            // the header is two bytes longer in the larger versions and the fit must allow for it.
            const need = (v) => utf8.length + 2 + (v >= 10 ? 1 : 0);
            let version = 0;
            for (let v = 1; v <= 12; v++) { if (capacity(v) >= need(v)) { version = v; break; } }
            if (!version) return null;                      // far longer than any link we make

            // ---- the data bits -------------------------------------------------------------
            const bits = [];
            const push = (value, len) => { for (let i = len - 1; i >= 0; i--) bits.push((value >> i) & 1); };
            push(4, 4);                                      // byte mode
            push(utf8.length, version >= 10 ? 16 : 8);
            for (const b of utf8) push(b, 8);
            const total = capacity(version) * 8;
            for (let i = 0; i < 4 && bits.length < total; i++) bits.push(0);   // terminator
            while (bits.length % 8) bits.push(0);
            const data = [];
            for (let i = 0; i < bits.length; i += 8) {
                let b = 0;
                for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
                data.push(b);
            }
            for (let i = 0; data.length < capacity(version); i++) data.push(i % 2 ? 0x11 : 0xEC);

            // ---- Reed-Solomon over GF(256), the polynomial x^8 + x^4 + x^3 + x^2 + 1 --------
            const EXP = new Array(512), LOG = new Array(256);
            for (let i = 0, x = 1; i < 255; i++) {
                EXP[i] = x; LOG[x] = i;
                x <<= 1; if (x & 0x100) x ^= 0x11D;
            }
            for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
            const mul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];
            const generator = (n) => {
                let g = [1];
                for (let i = 0; i < n; i++) {
                    const next = new Array(g.length + 1).fill(0);
                    for (let j = 0; j < g.length; j++) {
                        next[j] ^= mul(g[j], 1);
                        next[j + 1] ^= mul(g[j], EXP[i]);
                    }
                    g = next;
                }
                return g;
            };
            const ecc = (block, n) => {
                const g = generator(n);
                const rest = block.concat(new Array(n).fill(0));
                for (let i = 0; i < block.length; i++) {
                    const lead = rest[i];
                    if (!lead) continue;
                    for (let j = 0; j < g.length; j++) rest[i + j] ^= mul(g[j], lead);
                }
                return rest.slice(block.length);
            };

            const ecLen = SPEC[version][0];
            const blocks = [], checks = [];
            let at = 0;
            for (const [count, each] of SPEC[version][1]) {
                for (let i = 0; i < count; i++) {
                    const b = data.slice(at, at + each); at += each;
                    blocks.push(b);
                    checks.push(ecc(b, ecLen));
                }
            }
            // Interleaved: the first codeword of every block, then the second, and so on; then
            // the same through the error-correction codewords.
            const out = [];
            const longest = Math.max.apply(null, blocks.map((b) => b.length));
            for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.length) out.push(b[i]);
            for (let i = 0; i < ecLen; i++) for (const c of checks) out.push(c[i]);

            // ---- the matrix ----------------------------------------------------------------
            const size = version * 4 + 17;
            const grid = [], fixed = [];
            for (let r = 0; r < size; r++) {
                grid.push(new Array(size).fill(0));
                fixed.push(new Array(size).fill(false));
            }
            const put = (r, c, dark) => { grid[r][c] = dark ? 1 : 0; fixed[r][c] = true; };
            const finder = (top, left) => {
                for (let r = -1; r <= 7; r++) for (let c = -1; c <= 7; c++) {
                    const rr = top + r, cc = left + c;
                    if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
                    const edge = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6));
                    const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
                    put(rr, cc, edge || core);
                }
            };
            finder(0, 0); finder(0, size - 7); finder(size - 7, 0);
            for (let i = 8; i < size - 8; i++) {             // timing
                put(6, i, i % 2 === 0);
                put(i, 6, i % 2 === 0);
            }
            for (const r of ALIGN[version]) for (const c of ALIGN[version]) {
                if ((r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8)) continue;
                for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
                    put(r + dr, c + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
                }
            }
            // The format area is reserved now and written once the mask is chosen. Row 8 and
            // column 8 skip index 6, which belongs to the timing patterns and not to the format.
            for (let i = 0; i <= 8; i++) {
                if (i !== 6) { put(8, i, false); put(i, 8, false); }
            }
            for (let i = 0; i < 8; i++) put(8, size - 1 - i, false);
            for (let i = 0; i < 7; i++) put(size - 1 - i, 8, false);
            // The one module that is always dark. It sits at the end of the format run down
            // column 8 and is NOT part of it, so it goes in after that run is reserved.
            put(size - 8, 8, true);
            if (version >= 7) {
                let v = version << 12;
                for (let i = 0; i < 6; i++) { if (v >> (17 - i) & 1) v ^= 0x1F25 << (5 - i); }
                const info = (version << 12) | (v & 0xFFF);
                for (let i = 0; i < 18; i++) {
                    const bit = (info >> i) & 1;
                    put(Math.floor(i / 3), size - 11 + (i % 3), bit);
                    put(size - 11 + (i % 3), Math.floor(i / 3), bit);
                }
            }

            // The data, up each pair of columns and then down the next, skipping column 6.
            let bi = 0;
            const bitAt = (i) => (i >> 3) < out.length ? (out[i >> 3] >> (7 - (i & 7))) & 1 : 0;
            for (let right = size - 1; right > 0; right -= 2) {
                if (right === 6) right = 5;
                for (let step = 0; step < size; step++) {
                    const up = ((size - 1 - right) >> 1) % 2 === 0;
                    const r = up ? size - 1 - step : step;
                    for (const c of [right, right - 1]) {
                        if (fixed[r][c]) continue;
                        grid[r][c] = bitAt(bi++);
                    }
                }
            }

            // ---- the mask ------------------------------------------------------------------
            const RULE = [
                (r, c) => (r + c) % 2 === 0,
                (r) => r % 2 === 0,
                (r, c) => c % 3 === 0,
                (r, c) => (r + c) % 3 === 0,
                (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
                (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
                (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
                (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
            ];
            const formatBits = (mask) => {
                const spec = (0 << 3) | mask;                // 00 is level M
                let v = spec << 10;
                for (let i = 0; i < 5; i++) { if (v >> (14 - i) & 1) v ^= 0x537 << (4 - i); }
                return ((spec << 10) | (v & 0x3FF)) ^ 0x5412;
            };
            const penalty = (m) => {
                let score = 0;
                // Runs of five or more of one colour, in both directions.
                for (let i = 0; i < size; i++) {
                    for (const row of [true, false]) {
                        let run = 1;
                        for (let j = 1; j < size; j++) {
                            const a = row ? m[i][j] : m[j][i], b = row ? m[i][j - 1] : m[j - 1][i];
                            if (a === b) { run++; continue; }
                            if (run >= 5) score += run - 2;
                            run = 1;
                        }
                        if (run >= 5) score += run - 2;
                    }
                }
                // Any two-by-two block of one colour.
                for (let r = 0; r < size - 1; r++) for (let c = 0; c < size - 1; c++) {
                    const v = m[r][c];
                    if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
                }
                // The finder-like run, with four light modules either side of it.
                const PAT1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0], PAT2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
                const look = (get) => {
                    for (let i = 0; i + 11 <= size; i++) {
                        let a = true, b = true;
                        for (let k = 0; k < 11; k++) {
                            const v = get(i + k);
                            if (v !== PAT1[k]) a = false;
                            if (v !== PAT2[k]) b = false;
                        }
                        if (a || b) score += 40;
                    }
                };
                for (let i = 0; i < size; i++) { look((j) => m[i][j]); look((j) => m[j][i]); }
                // How far from half the modules are dark.
                let dark = 0;
                for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) dark += m[r][c];
                score += Math.floor(Math.abs((dark * 100) / (size * size) - 50) / 5) * 10;
                return score;
            };

            let best = null, bestScore = Infinity;
            for (let mask = 0; mask < 8; mask++) {
                const m = grid.map((row) => row.slice());
                for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
                    if (!fixed[r][c] && RULE[mask](r, c)) m[r][c] ^= 1;
                }
                const f = formatBits(mask);
                for (let i = 0; i < 15; i++) {
                    // The run below goes most significant bit first: the module beside the
                    // top-left finder at (8,0) carries bit 14, not bit 0. Writing it the other way
                    // round produces a code that every reader rejects, and the only way to tell is
                    // to compare against a reader, which is what the test does.
                    const bit = (f >> (14 - i)) & 1;
                    // The copy beside the top-left finder, which runs along row 8 then up column 8.
                    if (i < 6) m[8][i] = bit;
                    else if (i === 6) m[8][7] = bit;
                    else if (i === 7) m[8][8] = bit;
                    else if (i === 8) m[7][8] = bit;
                    else m[14 - i][8] = bit;
                    // And the copy split between the other two finders: seven modules up from the
                    // bottom-left, stopping short of the always-dark one, then eight across to the
                    // right-hand edge.
                    if (i < 7) m[size - 1 - i][8] = bit;
                    else m[8][size - 15 + i] = bit;
                }
                const s = penalty(m);
                if (s < bestScore) { bestScore = s; best = m; }
            }
            return { size: size, version: version, modules: best };
        };

        // A barcode of the campaign's link, as SVG rather than a canvas: it stays sharp on
        // a projector and in a screenshot, and one <path> of squares is a fraction of the
        // markup of one <rect> per module. The quiet zone is four modules of white on every
        // side and is not decoration: a reader will not see the code without it. The drawn
        // size follows how dense the code turned out, because what a camera needs is pixels
        // per module, not pixels overall, and a long link at a fixed size stops being
        // readable from across a room.
        const qrSvg = (text) => {
            const q = makeQr(text);
            if (!q) return '';
            const pad = 4, side = q.size + pad * 2;
            const px = 'min(68vmin, ' + Math.min(640, Math.max(320, side * 12)) + 'px)';
            let d = '';
            for (let r = 0; r < q.size; r++) {
                for (let c = 0; c < q.size; c++) {
                    if (q.modules[r][c]) d += 'M' + (c + pad) + ' ' + (r + pad) + 'h1v1h-1z';
                }
            }
            return '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px + '" '
                + 'viewBox="0 0 ' + side + ' ' + side + '" shape-rendering="crispEdges" '
                + 'role="img" aria-label="Barcode for this campaign">'
                + '<rect width="' + side + '" height="' + side + '" fill="#ffffff"/>'
                + '<path d="' + d + '" fill="#000000"/></svg>';
        };

        // ---- SHARING ---------------------------------------------------------------------
        //
        // The thing that moves a campaign most is people telling people. So: a Share button on
        // the display and on the details page for anyone, and -- straight after a donation --
        // a sheet that opens by itself and asks the donor to say they gave, with the words
        // already written. A donor naming the campaign to their own friends is worth more than
        // anything this page can say for itself.
        //
        // The link is the campaign's short /f/<code> link, which carries the campaign's own
        // title, picture and description as a preview card on Facebook, X, LinkedIn,
        // WhatsApp, iMessage and Slack. The phone's own share menu comes first where there is
        // one; the named services and Copy are there everywhere. Nothing is posted by this
        // page: each button opens the service with the words in place, for the person to send.
        let shareEl = null, sharedPrompted = false;
        const shareUrl = () => {
            try {
                if (code) return window.location.origin + '/f/' + encodeURIComponent(code);
                if (docPath) return window.location.origin + '/app/manchester/viewer-fundraise?path=' + encodeURIComponent(docPath);
                return window.location.href;
            } catch (e) { return ''; }
        };
        const shareText = (d, gave) => {
            const t = ('' + ((d && d.title) || 'this campaign')).trim();
            const sub = ('' + ((d && d.subtitle) || '')).trim();
            return gave
                ? 'I just gave to ' + t + '. Every gift moves it closer to the goal. Will you join me?'
                : t + (sub ? ': ' + sub + '.' : '.') + ' Every gift helps. Please take a look and share it.';
        };
        const closeShare = () => {
            try { if (shareEl && shareEl.parentNode) shareEl.parentNode.removeChild(shareEl); } catch (e) { }
            shareEl = null;
        };
        const ICON = {
            share: '<path d="M12 3v13"/><path d="m7 8 5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
            link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
            mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
            sms: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
            qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>'
                + '<rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3z"/><path d="M20 14v3"/>'
                + '<path d="M14 20h3"/><path d="M20 20v1"/>',
        };
        const svg = (k) => '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" '
            + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[k] + '</svg>';
        const openShare = (d, gave) => {
            closeShare();
            const url = shareUrl();
            shareEl = document.createElement('div');
            shareEl.id = 'fd-share-sheet';
            // Centred in the window, on every screen.
            shareEl.style.cssText = 'position:fixed;inset:0;z-index:2147483400;background:rgba(2,8,16,0.66);display:flex;'
                + 'align-items:center;justify-content:center;padding:16px;box-sizing:border-box;'
                + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;';
            const svc = [
                ['fb', 'Facebook', '#1877f2'], ['x', 'X', '#000000'], ['li', 'LinkedIn', '#0a66c2'],
                ['wa', 'WhatsApp', '#25d366'], ['bs', 'Bluesky', '#1185fe'], ['sms', 'Text message', '#0f766e'],
                ['mail', 'Email', '#475569'],
            ];
            const tile = (k, label, bg) => '<button type="button" data-share="' + k + '" style="cursor:pointer;display:flex;align-items:center;'
                + 'gap:9px;justify-content:center;border:0;border-radius:12px;padding:12px 10px;min-height:48px;background:' + bg + ';color:#fff;'
                + 'font:700 14px system-ui;">' + (ICON[k] ? svg(k) : '') + esc(label) + '</button>';
            shareEl.innerHTML = '<div role="dialog" aria-label="Share" style="width:min(560px,100%);max-height:calc(100vh - 32px);overflow:auto;background:#0b2545;'
                + 'color:#eaf6f9;border:1px solid rgba(255,255,255,0.16);border-radius:18px;'
                + 'padding:20px;box-shadow:0 24px 70px rgba(0,0,0,0.55);">'
                + '<div style="display:flex;align-items:flex-start;gap:12px;">'
                + '<div style="flex:1 1 auto;"><div style="font:800 20px system-ui;">' + (gave ? 'Thank you. Now tell people.' : 'Share this campaign') + '</div>'
                + '<div style="margin-top:5px;font:14px/1.5 system-ui;color:#bcd9e4;">' + (gave
                    ? 'Saying that you gave is the most powerful thing you can do for this campaign: people give when someone they know already has.'
                    : 'One message to your friends reaches people this page never will.') + '</div></div>'
                + '<button type="button" data-share="close" aria-label="Close" style="cursor:pointer;border:0;background:none;color:#9fc4d4;'
                + 'font:700 22px system-ui;line-height:1;padding:2px 4px;">×</button></div>'
                + '<label style="display:block;margin-top:14px;font:600 12px system-ui;color:#9fc4d4;">Your message (change it if you like)</label>'
                + '<textarea id="fd-share-msg" rows="3" style="width:100%;box-sizing:border-box;margin-top:6px;background:#0a1e3a;color:#eaf6f9;'
                + 'border:1px solid rgba(255,255,255,0.18);border-radius:10px;padding:10px 12px;font:15px/1.45 system-ui;resize:vertical;">'
                + esc(shareText(d, gave)) + '</textarea>'
                + (P ? '<div style="margin-top:10px;font:13px system-ui;color:#fde68a;">Sharing is off in a preview. On the published display these buttons open each service.</div>' : '')
                + ((typeof navigator !== 'undefined' && navigator.share)
                    ? '<button type="button" data-share="native" style="margin-top:14px;width:100%;cursor:pointer;display:flex;align-items:center;'
                        + 'justify-content:center;gap:10px;border:0;border-radius:12px;padding:14px;min-height:52px;background:#22c55e;color:#04210f;'
                        + 'font:800 16px system-ui;">' + svg('share') + 'Share…</button>' : '')
                + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:12px;">'
                + svc.map((x) => tile(x[0], x[1], x[2])).join('') + '</div>'
                + '<div style="display:flex;gap:8px;margin-top:12px;align-items:stretch;">'
                + '<input id="fd-share-url" readonly value="' + esc(url) + '" style="flex:1 1 auto;min-width:0;background:#0a1e3a;color:#cfe6ef;'
                + 'border:1px solid rgba(255,255,255,0.18);border-radius:10px;padding:10px 12px;font:14px system-ui;"/>'
                + '<button type="button" data-share="copy" style="cursor:pointer;display:flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,0.28);'
                + 'background:transparent;color:#fff;border-radius:10px;padding:10px 14px;font:700 14px system-ui;white-space:nowrap;">' + svg('link') + 'Copy</button></div>'
                + '<div id="fd-share-out" style="margin-top:8px;min-height:18px;font:13px system-ui;color:#86efac;"></div>'
                // IN THE ROOM, rather than on the internet. Everything above sends the link
                // somewhere; this hands it to whoever is looking at the screen. It stays
                // folded away because most people sharing a campaign are not standing in
                // front of the person they are sharing it with, and an unfolded barcode
                // would push the services off a phone.
                + '<div style="margin-top:10px;border-top:1px solid rgba(255,255,255,0.12);padding-top:12px;">'
                + '<button type="button" data-share="qr" aria-expanded="false" aria-controls="fd-qr-box" '
                + 'style="cursor:pointer;display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(255,255,255,0.28);'
                + 'background:transparent;color:#eaf6f9;border-radius:999px;padding:9px 16px;font:700 13.5px system-ui;">'
                + svg('qr') + 'Show a barcode to scan</button>'
                + '<div id="fd-qr-box" hidden style="margin-top:12px;text-align:center;">'
                + '<div style="display:inline-block;background:#fff;border-radius:14px;padding:12px;line-height:0;"></div>'
                + '<div style="margin-top:9px;font:13px/1.5 system-ui;color:#bcd9e4;">'
                + 'Someone looking at this screen can point a phone camera at it.</div></div></div>'
                + '</div>';
            document.body.appendChild(shareEl);
            const say = (t, bad) => { const o = document.getElementById('fd-share-out'); if (o) { o.textContent = t; o.style.color = bad ? '#fca5a5' : '#86efac'; } };
            const msg = () => ('' + ((document.getElementById('fd-share-msg') || {}).value || '')).trim();
            const copy = async (text) => {
                try { await navigator.clipboard.writeText(text); return true; } catch (e) { }
                try {
                    const ta = document.createElement('textarea');
                    ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
                    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
                } catch (e) { return false; }
            };
            const go = (u) => { try { window.open(u, '_blank', 'noopener,noreferrer,width=680,height=620'); } catch (e) { window.location.href = u; } };
            shareEl.addEventListener('click', async (e) => {
                if (e.target === shareEl) { closeShare(); return; }
                const b = e.target && e.target.closest ? e.target.closest('[data-share]') : null;
                if (!b) return;
                const k = b.getAttribute('data-share');
                if (k === 'close') { closeShare(); return; }
                if (P) { say('Sharing is off in a preview.', true); return; }
                const m = msg(), U = encodeURIComponent(url), T = encodeURIComponent(m);
                if (k === 'native') {
                    try { await navigator.share({ title: ('' + (d.title || 'Campaign')), text: m, url: url }); say('Shared. Thank you.'); }
                    catch (err) { /* cancelled: nothing to say */ }
                    return;
                }
                if (k === 'copy') { say((await copy(m ? m + ' ' + url : url)) ? 'Copied. Paste it anywhere.' : 'Could not copy. Select the link and copy it.', false); return; }
                if (k === 'qr') {
                    const box = document.getElementById('fd-qr-box');
                    if (!box) return;
                    const open = box.hasAttribute('hidden');
                    // Drawn the first time it is asked for, not on every open of this
                    // window: encoding is real work and most people never press this.
                    if (open && !box.getAttribute('data-drawn')) {
                        const art = qrSvg(url);
                        if (!art) { say('This link is too long to put in a barcode.', true); return; }
                        box.firstChild.innerHTML = art;
                        box.setAttribute('data-drawn', '1');
                    }
                    if (open) box.removeAttribute('hidden'); else box.setAttribute('hidden', '');
                    b.setAttribute('aria-expanded', open ? 'true' : 'false');
                    b.lastChild.textContent = open ? 'Hide the barcode' : 'Show a barcode to scan';
                    if (open) { try { box.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) { } }
                    return;
                }
                if (k === 'fb') return go('https://www.facebook.com/sharer/sharer.php?u=' + U);
                if (k === 'x') return go('https://twitter.com/intent/tweet?text=' + T + '&url=' + U);
                if (k === 'li') return go('https://www.linkedin.com/sharing/share-offsite/?url=' + U);
                if (k === 'wa') return go('https://wa.me/?text=' + encodeURIComponent(m + ' ' + url));
                if (k === 'bs') return go('https://bsky.app/intent/compose?text=' + encodeURIComponent(m + ' ' + url));
                if (k === 'sms') { window.location.href = 'sms:?&body=' + encodeURIComponent(m + ' ' + url); return; }
                if (k === 'mail') {
                    window.location.href = 'mailto:?subject=' + encodeURIComponent('' + (d.title || 'A campaign worth a look'))
                        + '&body=' + encodeURIComponent(m + '\n\n' + url);
                }
            });
            for (const ev of ['mousedown', 'wheel', 'touchstart']) shareEl.addEventListener(ev, (e) => e.stopPropagation(), { passive: true });
        };
        const shareBtn = (id, label, big) => '<button id="' + id + '" type="button" style="cursor:pointer;display:inline-flex;align-items:center;gap:8px;'
            + 'border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.06);color:#eaf6f9;border-radius:999px;'
            + 'padding:9px 18px;font:600 ' + (big ? 'clamp(12px,1.6vmin,15px)' : '13px') + ' system-ui;white-space:nowrap;">'
            + svg('share') + esc(label) + '</button>';

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
            // The same rule as the display behind it: a donate sheet taller than the
            // phone must scroll to its own top, not off it. Asking for an amount is the
            // one moment where losing the top of the panel costs the campaign the money.
            sheet.style.cssText = 'position:fixed;inset:0;z-index:2147483100;background:rgba(3,11,22,0.72);'
                + 'overflow:auto;display:flex;align-items:center;align-items:safe center;'
                + 'justify-content:center;'
                + 'padding:max(20px,4vmin) max(14px,4vmin) max(28px,4vmin);'
                + 'padding-top:max(28px,4vmin,calc(env(safe-area-inset-top,0px) + 20px));'
                + 'padding-bottom:max(28px,4vmin,calc(env(safe-area-inset-bottom,0px) + 18px));'
                + 'box-sizing:border-box;';
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
                + '<div style="margin-top:14px;">' + shareBtn('fd-share2', 'Share this campaign', false) + '</div>'

                + (('' + (d.story || '')).trim() ? sect('About this campaign')
                    + '<div style="font:400 15.5px/1.6 system-ui;color:#dceef5;">' + paras(d.story) + '</div>' : '')
                + (filmHtml(d) ? sect('Watch') + filmHtml(d) : '')
                + (listOf(d, 'timeline').length ? sect('What happens next')
                    + '<div style="position:relative;padding-left:26px;">'
                    // One line down the left, and a dot per stage sitting on it. Drawn
                    // rather than listed because the order is the content.
                    + '<div style="position:absolute;left:5px;top:6px;bottom:6px;width:2px;'
                    + 'background:linear-gradient(#1aa3bd,rgba(34,197,94,0.25));"></div>'
                    + listOf(d, 'timeline').map((m) => ''
                        + '<div style="position:relative;margin:0 0 20px;">'
                        + '<div style="position:absolute;left:-26px;top:5px;width:12px;height:12px;'
                        + 'border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,0.18);"></div>'
                        + (m.when ? '<div style="font:600 12px system-ui;color:#7fb0c4;letter-spacing:.04em;'
                            + 'text-transform:uppercase;">' + esc(m.when) + '</div>' : '')
                        + (m.title ? '<div style="margin-top:3px;font:700 15.5px system-ui;">' + esc(m.title) + '</div>' : '')
                        + (m.text ? '<div style="margin-top:4px;font:400 15px/1.55 system-ui;color:#dceef5;">'
                            + esc(m.text) + '</div>' : '')
                        + '</div>').join('')
                    + '</div>' : '')
                // THE PLAN: the budget and timeline, drawn against this campaign's goal and what it
                // has raised so far. The one section a donor is weighing the campaign by, so it is
                // set apart: a larger heading, and a solid card rather than text floating over the
                // campaign's background (or its photograph).
                + ((() => {
                    const pl = planOf(d);
                    if (!pl) return '';
                    sectN++;
                    return '<div style="' + (sectN > 1 ? 'margin-top:44px;padding-top:26px;border-top:1px solid rgba(255,255,255,0.13);' : 'margin-top:32px;') + '">'
                        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:14px;">'
                        + '<span style="width:6px;height:22px;border-radius:3px;background:linear-gradient(#4fd0e6,#22c55e);"></span>'
                        + '<span style="font:800 17px system-ui;letter-spacing:.12em;text-transform:uppercase;color:#eaf6f9;">The plan</span>'
                        // The plan as a PDF to keep, print or forward (fundraise/plan-pdf.js).
                        + '<button id="fd-plan-pdf" type="button" style="margin-left:auto;cursor:pointer;display:inline-flex;align-items:center;gap:7px;'
                        + 'border:1px solid rgba(255,255,255,0.28);background:rgba(255,255,255,0.06);color:#eaf6f9;border-radius:999px;'
                        + 'padding:7px 14px;font:700 12.5px system-ui;white-space:nowrap;">'
                        + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" '
                        + 'stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>'
                        + 'Download PDF</button></div>'
                        + '<div style="background:#0b1c33;border:1px solid rgba(143,192,212,0.28);border-radius:14px;'
                        + 'padding:clamp(14px,2.4vmin,24px);box-shadow:0 14px 40px rgba(0,0,0,0.45);">'
                        + PV.html(pl, { goal: d.goal, raised: d.raised }) + '</div></div>';
                })())
                + (deckHtml(d) ? sect('The presentation') + deckHtml(d) : '')
                + (litHtml(d) ? sect('Literature') + litHtml(d) : '')

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
            wireDeck(d);
            wireLit(d);
            // Not awaited: the page is already drawn, and the cards fill in behind it.
            litFill(d);
            const sh2 = document.getElementById('fd-share2');
            if (sh2) sh2.onclick = () => openShare(d, thanked);
            const pdfB = document.getElementById('fd-plan-pdf');
            if (pdfB) pdfB.onclick = async () => {
                const was = pdfB.innerHTML;
                pdfB.disabled = true; pdfB.textContent = 'Making the PDF\u2026';
                try {
                    const PDF = await exec('fundraise/plan-pdf.js');
                    await PDF.download(d.plan, {
                        title: d.title, goal: d.goal, raised: d.raised,
                        link: code ? (window.location.origin + '/f/' + code) : '',
                    });
                    pdfB.innerHTML = was;
                } catch (e) {
                    pdfB.textContent = 'Could not make the PDF';
                    setTimeout(() => { try { pdfB.innerHTML = was; } catch (e2) { } }, 3000);
                }
                pdfB.disabled = false;
            };
            const b = document.getElementById('fd-back');
            if (b) b.onclick = () => go('main');
            const give = document.getElementById('fd-give');
            if (give) give.onclick = () => (P ? previewNote() : openSheet(d));
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
            // THE WAY IN TO THE REST OF IT. Under the thermometer, which is where
            // somebody's eye already is once they have read the number, rather than at the
            // bottom of the card under the Donate button where it was competing with it.
            const moreBtn = '<div style="margin-top:clamp(12px,2.2vmin,20px);display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">'
                + (hasDetail(d)
                    ? '<button id="fd-more" style="cursor:pointer;border:1px solid rgba(255,255,255,0.28);'
                        + 'background:rgba(255,255,255,0.06);color:#eaf6f9;border-radius:999px;'
                        + 'padding:9px 20px;font:600 clamp(12px,1.6vmin,15px) system-ui;">'
                        + 'Campaign details'
                        + (listOf(d, 'updates').length ? ' \u00b7 ' + listOf(d, 'updates').length + ' update'
                            + (listOf(d, 'updates').length === 1 ? '' : 's') : '')
                        + '</button>'
                    : '')
                + shareBtn('fd-share', 'Share', true)
                + '</div>';
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
                + moreBtn
                + (d.donors ? '<div style="margin-top:clamp(10px,2vmin,20px);font:500 clamp(13px,1.9vmin,19px) system-ui;color:#9fc4d4;">'
                    + esc((+d.donors).toLocaleString()) + ' ' + (Math.abs(+d.donors) === 1 ? 'donor' : 'donors') + '</div>' : '')
                + (d.note ? '<div style="margin-top:clamp(12px,2.4vmin,24px);font:400 clamp(13px,1.9vmin,19px) system-ui;color:#cfe6ef;max-width:60ch;margin-left:auto;margin-right:auto;">' + esc(d.note) + '</div>' : '')
                + '<div style="margin-top:clamp(16px,3vmin,30px);font:400 12.5px system-ui;color:#6f93a6;">'
                + (when ? 'Updated ' + esc(when) : '')          // not who: see renderDetail
                + (every ? '<span id="fd-live" style="margin-left:10px;animation:fdPulse 2.4s ease-in-out infinite;">live</span>' : '')
                + '</div></div>'
                + (thanked ? '<div style="margin:clamp(12px,2vmin,20px) auto 0;max-width:560px;border:1px solid rgba(134,239,172,0.5);'
                    + 'background:rgba(34,197,94,0.14);color:#bbf7d0;border-radius:16px;padding:14px 18px;text-align:center;">'
                    + '<div style="font:700 clamp(14px,2vmin,18px) system-ui;">Thank you. Your receipt is on its way from VRI.</div>'
                    + '<div style="margin-top:6px;font:400 clamp(12.5px,1.7vmin,15px)/1.5 system-ui;color:#d9f7e3;">Tell people you gave: '
                    + 'it is the most powerful thing you can do for this campaign.</div>'
                    + '<button id="fd-share-gave" type="button" style="margin-top:10px;cursor:pointer;display:inline-flex;align-items:center;gap:8px;'
                    + 'border:0;border-radius:999px;padding:11px 22px;background:#22c55e;color:#04210f;font:800 clamp(13px,1.8vmin,16px) system-ui;">'
                    + svg('share') + 'Share that you gave</button></div>' : '')
                + (donateBtn(d, true) ? '<div style="margin-top:clamp(14px,2.6vmin,26px);">' + donateBtn(d, true)
                    + safeLine(d) + '</div>' : '')
                ;
            const more = document.getElementById('fd-more');
            if (more) more.onclick = () => go('detail');
            const sh = document.getElementById('fd-share');
            if (sh) sh.onclick = () => openShare(d, false);
            const shg = document.getElementById('fd-share-gave');
            if (shg) shg.onclick = () => openShare(d, true);
            // Straight after a donation the sheet opens by itself, once.
            if (thanked && !sharedPrompted) {
                sharedPrompted = true;
                setTimeout(() => { if (!shareEl && !sheet) openShare(d, true); }, 1200);
            }
            const give = document.getElementById('fd-give');
            if (give) give.onclick = () => (P ? previewNote() : openSheet(d));
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
            if (P || syncing || !docPath) return;
            const c = lastDoc && donCfg(lastDoc);
            if (!c || c.mode !== 'checkout') return;     // a Payment Link has no session to match
            syncing = true;
            try { await POSTJSON({ path: docPath }, host + '/stripe/donation-sync'); } catch (e) { }
            syncing = false;
        };

        // How many re-reads in a row have come back with nothing usable. Shown only after
        // a few, because one is normal and three means something is actually wrong.
        let missed = 0;
        const load = async (firstTime) => {
            if (P) {
                const d = JSON.parse(JSON.stringify(P.doc));
                await readPicture(d); await readFaces(d); draw(d, firstTime);
                return;
            }
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
            // WHAT COUNTS AS AN ANSWER.
            //
            // /load-file replies 200 with { msg: 'Failed to load the file' } when it cannot
            // read one, and the test here used to be "is it an object with no foreign
            // kind", which that passes. So a read that failed for a second -- a campaign
            // caught mid-save, a server restarting under a deploy -- was drawn as a
            // campaign with no name and no money, and a display in a room went to $0 while
            // people were looking at it. Ten seconds later it came back.
            //
            // A campaign has to look like one: the kind this console writes, or at least a
            // name or a figure. Anything else is a read that did not work.
            const isCampaign = !!(d && typeof d === 'object' && !d.msg && !d.error
                && (d.kind === 'fundraise'
                    || (typeof d.title === 'string' && d.title.trim())
                    || +d.goal > 0 || +d.raised > 0)
                && (!d.kind || d.kind === 'fundraise'));
            if (!isCampaign) {
                // The first read is different: there is nothing on screen to protect, and
                // somebody is looking at a link that did not work.
                if (firstTime) { fail('That link does not point at a fundraising campaign, or it has been taken down.'); return; }
                // Otherwise keep what is on the screen. It was right ten seconds ago and is
                // very nearly right now, which is better than nothing at all.
                missed++;
                if (missed >= 3) {
                    const el = document.getElementById('fd-live');
                    if (el) el.textContent = 'reconnecting';
                }
                return;
            }
            missed = 0;
            const stamp = JSON.stringify([d.title, d.subtitle, d.goal, d.raised, d.donors, d.note, d.updated,
                d.story, d.hideGiftAmounts, d.gifts, d.updates, d.donate, d.media, d.team, d.teamV, d.timeline, d.plan]);
            if (stamp !== lastStamp) { lastStamp = stamp; await readPicture(d); await readFaces(d); draw(d, firstTime); }
        };

        // The preview's own bar, and its way out.
        let bar = null;
        const closePreview = () => {
            closeShare();
            try { document.removeEventListener('keydown', onEsc, true); } catch (e) { }
            try { if (bar) bar.remove(); } catch (e) { }
            try { el.remove(); } catch (e) { }
            try { if (P && typeof P.onClose === 'function') P.onClose(); } catch (e) { }
        };
        const previewNote = () => {
            const n = document.getElementById('fd-pv-note');
            if (n) { n.textContent = 'Donations are off in a preview. On the published display this opens the giving sheet.'; n.style.color = '#fde68a'; }
        };
        if (P) {
            bar = document.createElement('div');
            bar.id = 'fd-pv-bar';
            bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483301;display:flex;align-items:center;gap:12px;'
                + 'flex-wrap:wrap;padding:9px 16px;background:rgba(120,83,10,0.92);border-bottom:1px solid rgba(251,191,36,0.6);'
                + 'color:#fde68a;font:600 13px system-ui,-apple-system,"Segoe UI",Arial,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,0.4);';
            bar.innerHTML = '<span style="padding:2px 9px;border-radius:999px;background:#fbbf24;color:#3a2600;font:800 10.5px system-ui;'
                + 'letter-spacing:.08em;text-transform:uppercase;">Preview</span>'
                + '<span id="fd-pv-note">What visitors will see once you publish. Nothing here is published yet.</span>'
                + '<button id="fd-pv-close" style="margin-left:auto;cursor:pointer;border:1px solid rgba(253,230,138,0.6);background:transparent;'
                + 'color:#fff;border-radius:8px;padding:6px 14px;font:700 12.5px system-ui;white-space:nowrap;">Close preview</button>';
            document.body.appendChild(bar);
            document.getElementById('fd-pv-close').onclick = closePreview;
            el.style.paddingTop = 'calc(4vmin + 44px)';
        }
        const onEsc = (e) => {
            if (!e || e.key !== 'Escape') return;
            if (shareEl) { try { e.stopPropagation(); } catch (e2) { } closeShare(); return; }
            if (sheet) { try { e.stopPropagation(); } catch (e2) { } closeSheet(); return; }
            if (view === 'detail') { try { e.stopPropagation(); } catch (e2) { } go('main'); return; }
            if (P) { try { e.stopPropagation(); } catch (e2) { } closePreview(); }
        };
        try { document.addEventListener('keydown', onEsc, true); } catch (e) { }

        await load(true);
        if (P) return { close: closePreview };
        // Someone just came back from paying: reconcile at once rather than at the next tick,
        // so they see their own donation land.
        if (thanked) { await syncDonations(); await load(false); }
        if (every > 0) setInterval(async () => { await syncDonations(); await load(false); }, every * 1000);
        // Nothing else belongs on this screen: no toolbar, no menus, no graph.
        try { document.title = 'Fundraising'; } catch (e) { }
        return true;
    })();
}
