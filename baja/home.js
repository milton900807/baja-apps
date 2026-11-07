function () {

    // THE HOME SCREEN: three doors, and nothing else to read first.
    //
    //   Funds      start a campaign, or open one already running
    //   Design     the design and analysis tools
    //   Tools      My Files (the file browser, which is what this page used to be),
    //              Project, Analytics, Financial Modeling, Library, and Rare Disease DB
    //
    // WHY THIS IS A PAGE AND NOT A STRIP ABOVE THE FILE LIST. It was that first: the
    // launcher was handed to manchester/fb.js as a header row. The browser's layout gives
    // that row almost no height and draws the file list over it, so all anyone ever saw of
    // it was about twenty pixels of white -- which is also why the nine-tile launcher that
    // lived there for months was invisible. Setting a height on the row did not move it.
    // A page of our own has no such argument with the layout, and the choice between
    // raising money and designing a drug is worth a screen anyway.
    //
    // My Files opens the browser exactly as it was, with no header passed to it.
    return (async () => {
        try { clear(); } catch (e) { }
        try { window.history.pushState({}, '', '/app/baja/init'); } catch (e) { }

        const esc = (t) => ('' + (t == null ? '' : t)).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
        const who = ('' + ((typeof getUser === 'function' ? getUser() : '') || '')).trim();

        // Everything that can be opened cold. Fundraising is not in here: it has a door.
        // Neoantigen Design (liverpool/editor), mRNA Design (tottenham/editor) and Library
        // were taken off the home screen; the modules are still there. Library came back,
        // under Tools, where the reference shelf belongs rather than beside the design apps.
        const APPS = [
            { label: 'Oligo Design', icon: 'icons/svg/oligo-design', path: 'manchester/editor', args: ['', { mode: 'editor' }],
              note: 'Antisense, siRNA, steric-blocking and allele-selective compounds against a transcript.' },
            { label: 'Assay Design', icon: 'icons/svg/assay-design', path: 'manchester/assay-design',
              note: 'The short path: pick a target, get a compound set, without the full screening canvas.' },
            { label: 'Genome Viewer', icon: 'icons/svg/chromosomes', path: 'manchester/karyotype',
              note: 'Every chromosome at one true scale. Load a VCF, then open a region as tracks.' },
            { label: 'Project', tools: true, icon: 'icons/svg/programme', path: 'cpd/baja-project', args: ['', { silent: true, user: who, mode: 'editor' }, '/app/cpd/baja-project'],
              note: 'Development timelines, milestones and capital models from plain-language descriptions.' },
            { label: 'Analytics', tools: true, icon: 'icons/svg/analytics', path: 'cpd/baja-analytics', args: ['', { silent: true, user: who, mode: 'editor' }, '/app/cpd/baja-analytics'],
              note: 'Experimental data: tables with a formula engine, dose-response and plate layouts.' },
            { label: 'Financial Modeling', tools: true, icon: 'icons/svg/financial-modeling', path: 'cpd/baja-analytics', args: ['', { silent: true, user: who, mode: 'editor' }, '/app/cpd/baja-analytics'],
              note: 'Assumptions, profit-and-loss and capital models, with a formula engine and timelines.' },
            { label: 'Library', tools: true, icon: 'icons/svg/library-shelf', path: 'manchester/library',
              note: 'The RNA therapeutics reference shelf: chemistry and modality references, read in place.' },
            { label: 'Splice Acceptor Model', tools: true, icon: 'icons/svg/ssam', path: 'baja/ssam.js',
              note: 'Score every candidate 3′ acceptor around one exon, ranked against the annotated one.' },
        ];
        // An icon store that cannot be reached must not cost anyone the page.
        for (const a of APPS) { try { a.svg = await exec(a.icon); } catch (e) { a.svg = null; } }

        // "OPENING PROJECT…" THE MOMENT A TILE IS PRESSED. Project and Analytics are megabytes
        // of code; before this, pressing one cleared the page and left it blank until their own
        // progress bar arrived, seconds later, and people decided nothing was happening. This
        // card goes up first, on the body (clear() empties the app's area, not the body), and
        // comes down when the app says its own bar is showing (window.__bajaOpening.done(),
        // called by cpd/baja-project.js and cpd/baja-analytics.js). An app that does not say
        // so takes it down when its module has run; and nothing leaves it up past 30 seconds.
        const SIGNALS = { 'cpd/baja-project': 1, 'cpd/baja-analytics': 1 };
        const opening = (label, path) => {
            try { const old = document.getElementById('baja-opening'); if (old) old.remove(); } catch (e) { }
            if (!document.getElementById('baja-opening-css')) {
                const st = document.createElement('style');
                st.id = 'baja-opening-css';
                st.textContent = '@keyframes bajaOpenSlide{0%{left:-40%}100%{left:100%}}'
                    + '@keyframes bajaOpenSpin{to{transform:rotate(360deg)}}';
                document.head.appendChild(st);
            }
            const el = document.createElement('div');
            el.id = 'baja-opening';
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            el.style.cssText = 'position:fixed;inset:0;z-index:2147482500;display:flex;align-items:center;justify-content:center;'
                + 'background:rgba(244,247,249,0.96);font-family:Arial,Helvetica,sans-serif;transition:opacity .25s ease;';
            el.innerHTML = '<div style="width:min(360px,86vw);background:#fff;border:1px solid #dbe4ea;border-radius:14px;'
                + 'padding:22px 22px 20px;box-shadow:0 18px 50px rgba(16,40,56,0.16);text-align:left;">'
                + '<div style="display:flex;align-items:center;gap:12px;">'
                + '<span style="width:22px;height:22px;border-radius:50%;border:3px solid #dbe4ea;border-top-color:#0f6e7a;'
                + 'animation:bajaOpenSpin .8s linear infinite;flex:0 0 auto;"></span>'
                + '<span style="font:700 16px Arial;color:#12242c;">Opening ' + esc(label || 'the app') + '\u2026</span></div>'
                + '<div style="position:relative;height:6px;margin-top:16px;border-radius:3px;background:#e7eef2;overflow:hidden;">'
                + '<span style="position:absolute;top:0;bottom:0;width:40%;border-radius:3px;'
                + 'background:linear-gradient(90deg,#4fd0e6,#0f6e7a);animation:bajaOpenSlide 1.1s ease-in-out infinite;"></span></div>'
                + '<div style="margin-top:10px;font:12.5px Arial;color:#6b8793;">Loading the tools. This takes a few seconds the first time.</div>'
                + '</div>';
            document.body.appendChild(el);
            let gone_ = false;
            const close = () => {
                if (gone_) return;
                gone_ = true;
                try { el.style.opacity = '0'; } catch (e) { }
                setTimeout(() => { try { el.remove(); } catch (e) { } }, 260);
                if (window.__bajaOpening === handle) window.__bajaOpening = null;
            };
            const handle = { done: close, waits: !!SIGNALS[('' + path).replace(/\.js$/, '')] };
            window.__bajaOpening = handle;
            setTimeout(close, 30000);
            return handle;
        };
        const open = async (path, url, args, label) => {
            const h = opening(label, path);
            try { clear(); } catch (e) { }
            // AN APP THAT DOES NOT SIGNAL: the card goes when the app puts something on the
            // screen. Not when its module returns -- some never do: manchester/library.js
            // returns a promise it never resolves, so the card used to stay up the whole
            // 30 seconds over a library that was already showing. Anything added to the page
            // outside the card counts, once things have been quiet for a moment, so a screen
            // drawn in several steps is not uncovered half-built.
            let obs = null, quiet = null;
            const stopWatching = () => { try { if (obs) obs.disconnect(); } catch (e) { } obs = null; clearTimeout(quiet); };
            if (!h.waits) {
                try {
                    const card = document.getElementById('baja-opening');
                    obs = new MutationObserver((list) => {
                        const drawn = list.some((m) => m.addedNodes && m.addedNodes.length
                            && !(card && (card === m.target || card.contains(m.target))));
                        if (!drawn) return;
                        clearTimeout(quiet);
                        quiet = setTimeout(() => { stopWatching(); h.done(); }, 350);
                    });
                    obs.observe(document.body, { childList: true, subtree: true });
                } catch (e) { obs = null; }
            }
            const done0 = h.done;
            h.done = () => { stopWatching(); done0(); };
            try { if (url) window.history.pushState({}, '', url); } catch (e) { }
            try { await exec.apply(null, [path].concat(args || [])); }
            catch (e) { h.done(); try { if (url) window.location.href = url; } catch (e2) { } return; }
            // Returned without drawing anything we could see: nothing more to wait for.
            if (!h.waits) setTimeout(h.done, 250);
        };

        const door = (k, label, line, accent) => '<button data-door="' + k + '" class="baja-home-door" style="flex:1 1 260px;cursor:pointer;'
            + 'text-align:left;border:1px solid #cfdbe2;border-top:4px solid ' + accent + ';background:#fff;border-radius:14px;'
            + 'padding:20px 22px;box-shadow:0 3px 14px rgba(16,40,56,0.09);">'
            + '<div style="font:800 23px Arial;color:#12242c;">' + esc(label) + '</div>'
            + '<div style="font:13.5px Arial;color:#6b8793;margin-top:5px;">' + esc(line) + '</div></button>';

        const tile = (a, i) => '<button data-app="' + i + '" class="baja-home-app" style="flex:1 1 300px;max-width:430px;cursor:pointer;text-align:left;'
            + 'display:flex;gap:12px;align-items:flex-start;border:1px solid #dbe4ea;background:#fff;border-radius:10px;padding:13px 15px;">'
            + (a.svg ? '<img src="' + esc(a.svg) + '" alt="" width="40" height="40" style="flex:0 0 auto;"/>' : '')
            + '<span style="min-width:0;"><span style="display:block;font:700 15px Arial;color:#12242c;">' + esc(a.label) + '</span>'
            + '<span style="display:block;font:12.5px/1.45 Arial;color:#6b8793;margin-top:2px;">' + esc(a.note) + '</span></span></button>';

        const FUNDS = '<div style="display:flex;gap:14px;flex-wrap:wrap;">'
            + '<button data-fund="new" class="baja-home-fund" style="flex:1 1 300px;cursor:pointer;text-align:left;border:1px solid #16a34a;'
            + 'background:#16a34a;color:#fff;border-radius:12px;padding:16px 18px;">'
            + '<span style="display:block;font:800 16px Arial;">Start a new campaign</span>'
            + '<span style="display:block;font:13px Arial;opacity:.93;margin-top:4px;">A total, a goal and a link to share. '
            + 'No charge to run it, and we do not take a share of what you raise.</span></button>'
            + '<button data-fund="mine" class="baja-home-fund" style="flex:1 1 300px;cursor:pointer;text-align:left;border:1px solid #cfdbe2;'
            + 'background:#fff;border-radius:12px;padding:16px 18px;">'
            + '<span style="display:block;font:800 16px Arial;color:#12242c;">Campaigns already running</span>'
            + '<span style="display:block;font:13px Arial;color:#6b8793;margin-top:4px;">Open one to edit it, see what it has '
            + 'raised, or pull in donations.</span></button></div>';

        // An app marked `tools` is listed under Tools rather than Design. Every tile keeps its
        // index in APPS, which is what its data-app hook opens.
        const DESIGN = '<div style="display:flex;gap:12px;flex-wrap:wrap;">'
            + APPS.map((a, i) => (a.tools ? '' : tile(a, i))).join('') + '</div>';

        // TOOLS: My Files and Rare Disease DB. Both carry a data-door hook, which the
        // document listener already answers, so they work in a window whose listener was
        // wired by an older copy of this page. The hook is still "research", which is the
        // module behind it; only what the tile is called has changed.
        const toolIcon = (path) => '<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" style="flex:0 0 auto;">'
            + '<rect x="1" y="1" width="38" height="38" rx="9" fill="#eef4f7" stroke="#cfdbe2"/>' + path + '</svg>';
        const TOOLS = '<div style="display:flex;gap:12px;flex-wrap:wrap;">'
            + '<button data-door="files" class="baja-home-app" style="flex:1 1 300px;max-width:430px;cursor:pointer;text-align:left;'
            + 'display:flex;gap:12px;align-items:flex-start;border:1px solid #dbe4ea;background:#fff;border-radius:10px;padding:13px 15px;">'
            + toolIcon('<path d="M9 14a2 2 0 0 1 2-2h6l2 3h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2z" fill="#5b7d86"/>')
            + '<span style="min-width:0;"><span style="display:block;font:700 15px Arial;color:#12242c;">My Files</span>'
            + '<span style="display:block;font:12.5px/1.45 Arial;color:#6b8793;margin-top:2px;">Everything you have saved: '
            + 'workbooks, designs, data and campaigns.</span></span></button>'
            + APPS.map((a, i) => (a.tools ? tile(a, i) : '')).join('')
            + '<button data-door="research" class="baja-home-app" style="flex:1 1 300px;max-width:430px;cursor:pointer;text-align:left;'
            + 'display:flex;gap:12px;align-items:flex-start;border:1px solid #dbe4ea;background:#fff;border-radius:10px;padding:13px 15px;">'
            + toolIcon('<circle cx="18" cy="18" r="7" fill="none" stroke="#5b7d86" stroke-width="2.6"/>'
                + '<path d="M23.5 23.5 30 30" stroke="#5b7d86" stroke-width="2.8" stroke-linecap="round"/>')
            + '<span style="min-width:0;"><span style="display:block;font:700 15px Arial;color:#12242c;">Rare Disease DB</span>'
            + '<span style="display:block;font:12.5px/1.45 Arial;color:#6b8793;margin-top:2px;">Market research this team has '
            + 'already done, with the sources behind it.</span></span></button>'
            + '</div>';

        const ID = 'baja-home';

        // ON A PHONE, A DOOR IS A PAGE. On a desktop the choices drop down under the three
        // doors, which works because there is room beside them for the doors to stay in
        // view. On a phone there is no beside: a panel hanging under the doors pushes them
        // off the top, leaves the choices half on screen, and has to be dismissed by
        // tapping somewhere that is not anything. A page is the shape a phone already
        // knows -- it fills the screen, it has a way back at the top, and the back button
        // is a thing to press rather than a patch of nothing to find.
        const phone = (() => {
            try { return typeof isMobile === 'function' && !!isMobile(); } catch (e) { return false; }
        })();

        const shell = (inner) => '<div id="' + ID + '" style="font-family:Arial,Helvetica,sans-serif;'
            + 'max-width:1180px;margin:0 auto;padding:' + (phone ? '16px 14px 36px' : '26px 18px 40px') + ';">' + inner + '</div>';

        // clear() FIRST, EVERY TIME. showWidget does not replace what is on the screen: it
        // appends (dash.component's loadWidget calls viewContainerRef.createComponent and
        // never clears), so drawing a second screen without clearing leaves both, with the
        // new one below the old. On a desktop that reads as a page that grew; on a phone
        // the new page is off the bottom and the doors are still there, which looks exactly
        // like a button that does nothing. That is what it looked like.
        const draw = (inner) => {
            try { clear(); } catch (e) { }
            return showWidget({
                wid: 'card', width: '100%', height: '100%',
                data: { cards: [[{ 'width': '100%', 'height': '100%', 'component': { wid: 'html', data: shell(inner) } }]] }
            });
        };

        const DOORS = '<div style="font:800 ' + (phone ? '22px' : '26px') + ' Arial;color:#12242c;">'
            + (who ? 'Welcome back' : 'Welcome') + '</div>'
            + '<div style="font:14px Arial;color:#6b8793;margin:6px 0 20px;word-break:break-word;">' + esc(who) + '</div>'
            + '<div style="display:flex;gap:14px;flex-wrap:wrap;">'
            + door('funds', 'Funds', 'Raise money for a rare disease', '#16a34a')
            + door('design', 'Design', 'The tools for designing a therapy', '#0f6e7a')
            + door('tools', 'Tools', 'Files, project planning, analytics and more', '#5b7d86')
            + '</div>'
            + (phone ? '' : '<div data-panel style="display:none;margin-top:18px;padding:18px;'
                + 'border:1px solid #e1e8ed;border-radius:14px;background:#f7fafc;"></div>');

        // The sub-page: a way back, a title, and the same choices the panel would have
        // shown. The back button is first in the markup as well as first on the screen, so
        // it is also the first thing a screen reader reaches.
        const SUB = {
            funds: { title: 'Funds', line: 'Raise money for a rare disease', body: () => FUNDS },
            design: { title: 'Design', line: 'The tools for designing a therapy', body: () => DESIGN },
            tools: { title: 'Tools', line: 'Files, project planning, analytics and more', body: () => TOOLS },
        };
        const subPage = (k) => {
            const d = SUB[k];
            return '<button data-back="1" style="cursor:pointer;border:1px solid #cfdbe2;background:#fff;'
                + 'border-radius:10px;padding:9px 14px 9px 10px;font:700 14px Arial;color:#2a4551;'
                + 'display:inline-flex;align-items:center;gap:7px;margin-bottom:14px;">'
                + '<span style="font:800 16px Arial;line-height:1;">\u2190</span> Home</button>'
                + '<div style="font:800 22px Arial;color:#12242c;">' + esc(d.title) + '</div>'
                + '<div style="font:13.5px Arial;color:#6b8793;margin:5px 0 16px;">' + esc(d.line) + '</div>'
                + d.body();
        };

        let page = '';                       // '' is the doors; otherwise the door being shown
        const showDoors = () => { page = ''; draw(DOORS); };
        const showSub = (k) => { page = k; draw(subPage(k)); };

        showDoors();

        // POINTERDOWN ON THE DOCUMENT. NOT CLICK, AND NOT ON THE BUTTONS.
        //
        // Three things had to be true at once for a door to answer, and the third is the
        // one that kept this page dead:
        //
        //   1. Nothing is attached to the buttons. The framework owns this markup and puts
        //      it back whenever it redraws, and a fresh node carries none of the handlers
        //      the old one was given. One listener on the document survives that.
        //   2. One listener, one path. A direct handler as well as this one fired twice
        //      per press and toggled each door straight back shut.
        //   3. THERE IS NO CLICK EVENT ON THIS PAGE. html-field binds [innerHTML] to a
        //      value that is a new object on every change-detection pass, so the subtree is
        //      rebuilt constantly -- including between the press and the release of a
        //      click. A click is only dispatched when press and release land on the same
        //      element, so the browser dispatches it on the surviving parent instead, and
        //      a listener looking for the button never sees one. Measured, not guessed:
        //      with the markup replaced on pointerdown, the mousedown already reports the
        //      parent div and no click event is dispatched at all.
        //
        // pointerdown is the one event that still reports the button, because it is
        // dispatched before anything has had the chance to replace it. mousedown and click
        // are kept as a fallback for a browser without pointer events, with a short guard
        // so a browser that sends all three does not act on it three times.
        //
        // The panel hangs off the page for the same reason -- it has to survive a redraw
        // of the block it sits under -- and is taken down when this page is left.
        const PANEL_ID = ID + '-panel';
        let openDoor = '';

        const panelEl = () => {
            let el = document.getElementById(PANEL_ID);
            if (!el) {
                el = document.createElement('div');
                el.id = PANEL_ID;
                el.style.cssText = 'position:fixed;z-index:2147482000;display:none;box-sizing:border-box;'
                    + 'background:#f7fafc;border:1px solid #cfdbe2;border-radius:14px;padding:18px;'
                    + 'box-shadow:0 18px 50px rgba(16,40,56,0.22);font-family:Arial,Helvetica,sans-serif;'
                    + 'max-height:72vh;overflow:auto;';
                document.body.appendChild(el);
            }
            return el;
        };
        const gone = () => { try { const el = document.getElementById(PANEL_ID); if (el) el.remove(); } catch (e) { } };
        const place = () => {
            const any = document.querySelector('[data-door]');
            const row = any ? any.parentElement : null;
            if (!row) return;
            try {
                const r = row.getBoundingClientRect(), el = panelEl();
                el.style.left = Math.max(8, r.left) + 'px';
                el.style.top = (r.bottom + 10) + 'px';
                el.style.width = Math.max(320, Math.min(r.width, window.innerWidth - 16)) + 'px';
            } catch (e) { }
        };
        const paint = () => {
            // On a phone there is no panel to paint: a door is a page of its own, and
            // panelEl() would put an element on the body that nothing ever shows.
            if (phone) return;
            for (const b of document.querySelectorAll('[data-door]')) {
                if (b.classList && b.classList.contains('baja-home-app')) continue;   // a tile, not a door
                const on = b.getAttribute('data-door') === openDoor;
                b.style.background = on ? '#eef6fb' : '#fff';
                b.style.boxShadow = on ? '0 4px 18px rgba(16,40,56,0.16)' : '0 3px 14px rgba(16,40,56,0.09)';
            }
            const el = panelEl();
            const want = openDoor === 'funds' ? FUNDS : (openDoor === 'design' ? DESIGN : (openDoor === 'tools' ? TOOLS : ''));
            if (el.innerHTML !== want) el.innerHTML = want;
            el.style.display = openDoor ? '' : 'none';
            if (openDoor) place();
        };
        const leaveFor = async (path, url, args, label) => {
            openDoor = ''; gone();
            window.__bajaHomeHandlers = null;
            await open(path, url, args, label);
        };

        // One set of listeners for the life of the window, pointed at whichever home page
        // is current. A page that has been left sets the handlers to null and its clicks
        // stop being acted on.
        if (!window.__bajaHomeWired) {
            window.__bajaHomeWired = true;
            let pressed = 0;
            const hit = (e) => {
                const h = window.__bajaHomeHandlers;
                const t = e && e.target;
                if (!h || !t || !t.closest) return;
                // One press, one action. A pointerdown is always a new press, so it is always
                // acted on; the mousedown and click a browser sends after it are not, and are
                // ignored while they are still part of that same press. A browser with no
                // pointer events never sets the stamp, so its mousedown is the press.
                const now = Date.now();
                if (e.type !== 'pointerdown' && now - pressed < 700) return;
                const act = (fn) => {
                    pressed = now;
                    try { e.preventDefault(); } catch (x) { }
                    fn();
                };
                const bk = t.closest('[data-back]');
                if (bk) return act(() => h.back());
                const d = t.closest('[data-door]');
                if (d) return act(() => h.door(d.getAttribute('data-door')));
                const a = t.closest('[data-app]');
                if (a) return act(() => h.app(+a.getAttribute('data-app')));
                const f = t.closest('[data-fund]');
                if (f) return act(() => h.fund(f.getAttribute('data-fund')));
                if (!t.closest('#' + PANEL_ID)) h.away();
            };
            document.addEventListener('pointerdown', hit, true);
            document.addEventListener('mousedown', hit, true);
            document.addEventListener('click', hit, true);
            document.addEventListener('keydown', (e) => {
                const h = window.__bajaHomeHandlers;
                if (h && e && e.key === 'Escape') h.away();
            }, true);
            window.addEventListener('resize', () => { const h = window.__bajaHomeHandlers; if (h) h.moved(); });
            window.addEventListener('scroll', () => { const h = window.__bajaHomeHandlers; if (h) h.moved(); }, true);
        }
        window.__bajaHomeHandlers = {
            door: async (k) => {
                // My Files is the file browser, a page of its own, so it goes there on any
                // screen; it is a tile under Tools now, with the same hook. The doors are a
                // page on a phone and a panel otherwise.
                if (k === 'files') { await leaveFor('manchester/fb.js', '/app/baja/fb', null, 'My Files'); return; }
                if (k === 'research') { await leaveFor('baja/research.js', '/app/baja/research', null, 'Rare Disease DB'); return; }
                if (phone) {
                    if (page === k) { showDoors(); return; }
                    showSub(k);
                    return;
                }
                openDoor = (k === openDoor) ? '' : k;
                paint();
            },
            // The way back from a sub-page. It redraws the doors rather than going through
            // the router: this is the same module and the same screen, and a history entry
            // per door would make the phone's own back button walk through them one at a
            // time before it ever left the home screen.
            back: () => { if (page) showDoors(); },
            app: async (i) => { const a = APPS[i]; if (a) await leaveFor(a.path, '/app/' + a.path, a.args, a.label); },
            fund: async (w) => {
                if (w === 'new') await leaveFor('fundraise/console', '/app/fundraise/console', null, 'Fundraising');
                else await leaveFor('fundraise/admin', '/app/fundraise/admin', null, 'your campaigns');
            },
            away: () => { if (!phone && openDoor) { openDoor = ''; paint(); } },
            moved: () => { if (openDoor) place(); },
        };

        const wire = () => {
            if (!document.querySelector('[data-door]')) return false;
            paint();
            return true;
        };
        // Kept up for half a minute rather than stopping at the first success: the markup
        // can be redrawn at any point in that window, and only a repaint puts the open
        // door's highlight back. Clicks do not depend on this -- they are handled on the
        // document -- so nothing breaks when it stops.
        let tries = 0;
        const tick = () => { wire(); if (++tries > 300 || !window.__bajaHomeHandlers) return; setTimeout(tick, 100); };
        setTimeout(tick, 0);
        return true;
    })();
}
