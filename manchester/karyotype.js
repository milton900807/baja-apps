function (path, config) {
    // THE CHROMOSOME VIEW. A whole genome as a row of vertical ideograms, smallest on the
    // left, and the graph's own world coordinates underneath so a region can be picked off a
    // chromosome by dragging on it.
    //
    // It is built on the same graph as manchester/editor.js and draws through the same world
    // -> screen converter, which is the point: the zoom, the pan and the selection rectangle
    // are the ones the editor already has, so a region chosen here is in the same coordinate
    // space as everything else and can be handed straight to the transcript loader.
    //
    // WORLD SPACE.
    //   x   one unit per chromosome, in ascending size, centred at i + 0.5. Order is the
    //       whole idea: the eye reads a ramp, and a chromosome that is out of place in a ramp
    //       is visible in a way that one out of place in a numbered row is not.
    //   y   megabases, drawn DOWNWARD from 0, at true scale and shared across every
    //       chromosome. Sharing it is what makes the picture worth looking at -- chr1 really
    //       is eight times chr21, and an ideogram that normalises each chromosome to the same
    //       height throws that away.
    //
    // Nothing is scaled per chromosome and nothing is stretched to fit. A genome drawn to one
    // scale is a genome you can compare.
    if (Array.isArray(path)) path = path[0];

    return (async () => {
        // A shared karyotype opens two ways, both before the subscription gate:
        //   config.shared     the public viewer (manchester/viewer.js) launched us with an
        //                     already-resolved public path — no login, view-only.
        //   ?share=<code>     a per-person share: resolve it against the signed-in user via
        //                     /share-open; a signed-out recipient is sent to the free sign-in
        //                     first, the same as the editor.
        let __karyoShared = false;
        let __karyoShareInfo = null;
        try {
            if (config && config.shared) { __karyoShared = true; try { window.__bajaFreeTier = true; } catch (e) { } }
            let __sc = '';
            try { __sc = ('' + (new URL(window.location.href).searchParams.get('share') || '')).trim(); } catch (e) { }
            if (__sc) {
                const __who = (typeof getUser === 'function') ? ('' + (getUser() || '')).trim() : '';
                if (!__who) {
                    try { sessionStorage.setItem('oidc.returnTo', window.location.pathname + window.location.search); } catch (e) { }
                    window.location.href = window.location.origin + '/login?free=1';
                    return;
                }
                let __r = null;
                try { __r = await GETJSON(window['env']['apiUrl'] + '/share-open?code=' + encodeURIComponent(__sc) + '&user=' + encodeURIComponent(__who)); } catch (e) { __r = { error: { message: '' + e } }; }
                const __b = (__r && __r.error && typeof __r.error === 'object') ? __r.error : __r;
                if (__b && __b.path) { path = '' + __b.path; __karyoShared = true; __karyoShareInfo = __b; try { window.__bajaFreeTier = true; } catch (e) { } }
                else { __karyoShareInfo = { failed: true, message: (__b && (__b.message || (typeof __b.error === 'string' ? __b.error : ''))) || 'This share link could not be opened.' }; }
            }
        } catch (e) { }
        if (!window.__bajaFreeTier && !__karyoShared) {
            let __sub = await exec('lib/subscription.js');
            if ((await __sub.enforce(true)) === false) return;
        }

        // EVERY STAGE SAYS SO. This view has now failed twice in ways that look identical
        // from the outside -- an empty screen with no exception -- once for a canvas that was
        // never mounted and once for a hook that threw only on mouse events. A blank screen
        // is not a diagnosis, and these lines are what turned both of those into one-step
        // fixes.
        const step = (m) => { try { console.log('[karyotype] ' + m); } catch (e) { } };
        step('start; path=' + JSON.stringify(path));

        const server = (window['env'] && window['env']['apiUrl']) || '';
        const MB = 1e6;                 // one world unit per megabase
        const BAR_W = 0.62;             // chromosome bar width, in world units (of the 1.0 slot)
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        // Giemsa stains as everyone draws them: the darker the band, the darker the grey.
        // acen is the centromere and is drawn as the pinch rather than as a band; stalk and
        // gvar are the satellite/variable regions and get their own tint so they do not read
        // as ordinary heterochromatin.
        const STAIN = {
            gneg: '#f7f9fc', gpos25: '#c7d0da', gpos50: '#9aa7b4',
            gpos75: '#6b7a89', gpos100: '#44515e', gvar: '#b9c9e6', stalk: '#8fb8d6',
        };

        // ---- which species -------------------------------------------------------------------
        const ask = () => new Promise((resolve) => {
            const panel = document.createElement('div');
            panel.id = 'baja-karyotype-ask';
            panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#fff;'
                + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';
            panel.innerHTML = ''
                + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:16px 22px 14px;'
                + 'background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);">'
                + '<div style="min-width:0;"><div style="font:700 20px Arial;">Chromosomes</div>'
                + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">'
                + 'Every chromosome of a genome, drawn to one scale.</div></div>'
                + '<div style="margin-left:auto;display:flex;gap:10px;">'
                + '<button id="ky-cancel" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;'
                + 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Cancel</button>'
                + '<button id="ky-go" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 12.5px Arial;'
                + 'border:1px solid #22c55e;background:#22c55e;color:#04210f;">Draw</button>'
                + '</div></div>'
                + '<div style="flex:1 1 auto;overflow:auto;padding:24px 22px 32px;">'
                + '<div style="width:100%;max-width:640px;margin:0 auto;">'
                + '<label style="display:block;font:600 12px Arial;color:#9fb3c8;margin:0 0 6px;">Species</label>'
                + '<input id="ky-q" value="human" style="width:100%;box-sizing:border-box;background:#0a1e3a;'
                + 'color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:9px 11px;font:13px Arial;"/>'
                + '<div style="font:12px Arial;color:#9fb3c8;margin-top:6px;">'
                + '<b>human</b> &middot; <b>mouse</b> &middot; <b>rat</b> &middot; <b>dog</b> &middot; <b>yeast</b></div>'
                + '</div></div>';
            document.body.appendChild(panel);
            for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
                panel.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
            }
            const q = (s) => panel.querySelector(s);
            const close = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
            panel.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') { close(); resolve(null); }
                else if (e.key === 'Enter') q('#ky-go').click();
            });
            q('#ky-cancel').onclick = () => { close(); resolve(null); };
            q('#ky-go').onclick = () => { const v = ('' + q('#ky-q').value).trim(); if (!v) return; close(); resolve(v); };
            // focusUnlessMobile is a GLOBAL -- lib/core.js is the standard library and is
            // already in scope. exec('lib/core.js') fetches and compiles it a second time
            // into the same scope, which fails on its very first line:
            // "Identifier 'host' has already been declared". Every other caller in the
            // repository just calls it.
            try { focusUnlessMobile(q('#ky-q')); } catch (e) { }
        });

        // A PATH IS NOT A SPECIES. On a browser reload the engine binds `path` to the URL
        // argument map, which arrives as junk for an app that takes no file --
        // ["/<folder>/<file>.baja", "undefined"], or the literal string "undefined". Treating
        // that as the species skipped the dialog and asked the server about a filename, which
        // fails silently behind a modal. Only something that could actually BE a species name
        // -- a few letters and spaces -- is taken as one.
        const asSpecies = (v) => {
            const t = ('' + (v == null ? '' : v)).trim();
            if (!t || t.length > 40) return '';
            if (/^undefined$/i.test(t) || t.indexOf('/') >= 0 || t.indexOf('.') >= 0) return '';
            return /^[A-Za-z][A-Za-z .'-]*$/.test(t) ? t : '';
        };
        // A SAVED KARYOTYPE, not a species. open-obj.js hands this module the file the
        // user clicked, and the species is INSIDE the document -- so the file is read
        // first and its own species drives the chromosome table. Asking "which species?"
        // about a file that already says is a question with a known answer.
        // THE PATH MAY ARRIVE PERCENT-ENCODED. Some routes in hand this module the path
        // straight off a URL, where '/' is '%2F' -- so splitting it on '/' to get a file
        // name found no separator and returned the whole thing, and the loading panel read
        //     Reading %2F%2F%2F36422442b36c…%2Fhuman-5795075variants.karyotype from My Files.
        // Decoded once, here, so everything downstream works on a real path: the display,
        // the /load-file request, and the URL written back on success.
        const decodePath = (v) => {
            let t = ('' + (v == null ? '' : v)).trim();
            if (!t) return '';
            // Only if it looks encoded, and never fatally: a stray '%' in a file name is a
            // malformed escape, and a name is not worth an exception.
            if (/%[0-9A-Fa-f]{2}/.test(t)) {
                try { t = decodeURIComponent(t); } catch (e) { }
            }
            t = t.replace(/\/{2,}/g, '/');       // '///user/file' is '/user/file'
            return t;
        };
        // Just the file name. What a person calls the thing they opened.
        const baseName = (v) => {
            const t = decodePath(v);
            const i = t.lastIndexOf('/');
            return (i >= 0 ? t.slice(i + 1) : t) || t;
        };
        const asSavedFile = (v) => {
            const t = decodePath(v);
            // Also .karyotype.json: what these were saved as before the extension
            // changed. Same format, still in people's folders.
            return /\.karyotype(\.json)?$/i.test(t) ? t : '';
        };
        // THE URL FOLLOWS THE OPEN FILE. Set wherever a document becomes the current
        // one -- opened from a file browser, opened from this view's own Open, or
        // just saved -- so a reload comes back to that file rather than to an empty
        // karyotype. Doing it here rather than only at the browsers' click handlers
        // means every route into a file is covered by one line, including the ones
        // that never touch a browser.
        //
        // replaceState, not push: this annotates the view rather than navigating to
        // it. Raw path, matching the browsers, because dash.component's
        // parseArguments splits on '&' and '=' without decoding. The save response
        // returns a doubled slash, so the path is collapsed first.
        const rememberFile = (p) => {
            let t = ('' + (p == null ? '' : p)).trim().replace(/\/{2,}/g, '/');
            if (!t) return;
            // /load-file resolves the path by concatenation, so it needs the leading
            // slash: without one it answers "Failed to load the file" and a reload
            // lands on an empty karyotype. Added rather than assumed.
            if (t.charAt(0) !== '/') t = '/' + t;
            try {
                window.history.replaceState({ 'karyotype': t }, 'karyotype',
                    '/app/manchester/karyotype?path=' + t);
                step('url now points at ' + t);
            } catch (e) { step('could not set the url: ' + e); }
        };

        // ---- the loading bar ----------------------------------------------------
        //
        // Opening a saved karyotype is the slow part of this view -- a whole VCF is a
        // hundred megabytes over the wire and millions of variants to place -- and it
        // used to happen behind a blank panel.
        //
        // WHAT THE BAR ACTUALLY MEASURES. The download cannot be measured: the server
        // sends it gzipped over HTTP/2 with no Content-Length, so there is no total to
        // divide by and any percentage during the transfer would be invented. The bar
        // therefore steps at phase boundaries there, and reports REAL progress for the
        // phase that has a total and blocks the browser -- placing the variants, which
        // is counted against doc.variants.length.
        let progressBar = null;
        const progress_widget = {
            wid: 'progress',
            componentRef: 'karyoProgress',
            data: {
                progress: 0,
                progressBar: createIonFunction((pb) => { progressBar = pb; }),
            }
        };
        const setProgress = (pct) => {
            try {
                if (progressBar) progressBar(Math.max(0, Math.min(100, Math.round(pct))));
            } catch (e) { }
        };
        const fmtBytes = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB'
            : n >= 1024 ? Math.round(n / 1024) + ' kB' : n + ' B');

        // The note under the title is written directly rather than by re-setting the
        // component: re-setting it would remount the progress widget and lose the
        // handle to it, which is the whole reason the bar exists.
        const setLoadingNote = (t) => {
            try {
                const el = document.getElementById('karyo-load-note');
                if (el) el.textContent = t;
            } catch (e) { }
        };

        // ---- THE COUNTER THAT OUTLIVES THE LOADING PANEL --------------------------
        //
        // The loading panel IS the mainPanel component, so it is gone the moment the
        // karyotype is mounted -- and on a big file the slowest phases come after that:
        // placing five million variants, then sorting them. Those were reported as a bare
        // sentence on the status line, and through the sort not at all, so a two minute
        // open looked like a stall on whatever the last message happened to be.
        //
        // This is a small overlay drawn over the canvas instead, so the same bar and the
        // same count carry on to the end. Plain DOM, because it has to outlive the layout
        // swap that removes the panel; pointer-events:none, because it sits over a canvas
        // that is still meant to be usable.
        let placeEl = null;
        const placeHide = () => {
            try {
                const old2 = document.getElementById('baja-karyo-placing');
                if (old2 && old2.parentNode) old2.parentNode.removeChild(old2);
            } catch (e) { }
            placeEl = null;
        };
        const placeSay = (title, note, pct) => {
            if (!placeEl) return;
            try {
                if (title != null) placeEl.querySelector('#bkp-t').textContent = title;
                if (note != null) placeEl.querySelector('#bkp-n').textContent = note;
                const b = placeEl.querySelector('#bkp-b');
                // No percentage means a phase with no total to divide by -- the sort --
                // so the bar is filled rather than left at whatever it last showed.
                if (b) b.style.width = (pct == null ? 100 : Math.max(0, Math.min(100, pct))) + '%';
            } catch (e) { }
        };
        const placeShow = (title, note) => {
            try {
                placeHide();
                const el = document.createElement('div');
                el.id = 'baja-karyo-placing';
                el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:26px;'
                    + 'z-index:2147482000;pointer-events:none;background:#0b2545;color:#fff;'
                    + 'font-family:Arial,Helvetica,sans-serif;border-radius:10px;'
                    + 'padding:13px 18px 15px;min-width:320px;'
                    + 'box-shadow:0 10px 30px rgba(0,0,0,0.35);'
                    + 'border:1px solid rgba(255,255,255,0.14);';
                el.innerHTML = '<div id="bkp-t" style="font:700 13px Arial;"></div>'
                    + '<div id="bkp-n" style="font:12px Arial;color:#9fb3c8;margin-top:3px;"></div>'
                    + '<div style="margin-top:9px;height:5px;border-radius:3px;'
                    + 'background:rgba(255,255,255,0.16);overflow:hidden;">'
                    + '<div id="bkp-b" style="height:100%;width:0%;background:#38bdf8;'
                    + 'transition:width .12s linear;"></div></div>';
                document.body.appendChild(el);
                placeEl = el;
                placeSay(title, note, 0);
            } catch (e) { placeEl = null; }
        };
        // Let the browser paint before a phase that will block it. Without this the note
        // saying "sorting" is written and then not shown until the sort it was warning
        // about has finished, which is the one moment it was for.
        const paintTick = () => new Promise((res) => setTimeout(res, 0));

        // GETJSON hands back a parsed body and nothing else, so there is no way to see
        // it arrive. This reads the stream so the bytes can be counted on the way past.
        // A plain fetch is enough: /load-file authorises from its query parameters, not
        // from a header, which is why it can be streamed without a token.
        //
        // The count is of DECOMPRESSED bytes -- the browser gunzips transparently -- so
        // it matches the size of the file as saved, not what crossed the wire.
        const getJsonCounting = async (url, onBytes, onPhase) => {
            const res = await fetch(url);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            if (!res.body || !res.body.getReader) return await res.json();   // old browser
            const reader = res.body.getReader();
            const dec = new TextDecoder('utf-8');
            let text = '', got = 0, reported = 0;
            for (; ;) {
                const chunk = await reader.read();
                if (chunk.done) break;
                got += chunk.value.length;
                text += dec.decode(chunk.value, { stream: true });
                // At most every quarter megabyte. The counter is for reassurance, not
                // for counting packets, and a DOM write per chunk would cost more than
                // the download it is reporting on.
                if (onBytes && (got - reported) >= 262144) { reported = got; onBytes(got); }
            }
            text += dec.decode();
            if (onBytes) onBytes(got);
            // JSON.parse of a hundred megabytes blocks for seconds and cannot report
            // anything while it runs, so it is at least named before it starts.
            if (onPhase) { onPhase('parsing', got); await paintTick(); }
            return JSON.parse(text);
        };

        let loadingShown = false;
        // THE NAME OF THE THING BEING OPENED, then what is happening to it.
        //
        // This used to be one line of prose carrying the whole path -- and when that path
        // arrived percent-encoded it read as a wall of %2F. A file name is a name: it goes
        // at the top, on its own, and the phase underneath changes while it stays put. So
        // the panel reads the way an application opening a document reads, and nothing in
        // it moves except the words that are meant to.
        const showLoading = (title) => {
            if (loadingShown) return;
            loadingShown = true;
            const t = ('' + (title || '')).trim() || 'Karyotype';
            const isFile = /\.karyotype(\.json)?$/i.test(t);
            const lay = {
                wid: 'card', height: '100%', componentRef: 'mainPanel',
                data: {
                    cards: [[
                        {
                            'width': '100%',
                            'component': {
                                wid: 'html', width: '100%',
                                data: '<div style="max-width:560px;margin:12vh auto 0;'
                                    + 'padding:0 24px;font-family:system-ui,-apple-system,'
                                    + '\'Segoe UI\',Roboto,Arial,sans-serif;">'
                                    // The eyebrow says what kind of thing this is, so the
                                    // big line below is free to be only the name.
                                    + '<div style="font:600 11px/1.4 inherit;letter-spacing:.09em;'
                                    + 'text-transform:uppercase;color:#8296ab;">'
                                    + (isFile ? 'Opening karyotype' : 'Karyotype') + '</div>'
                                    + '<div id="karyo-load-title" style="font:600 21px/1.35 inherit;'
                                    + 'color:#0f172a;margin-top:7px;word-break:break-word;">'
                                    + esc(isFile ? t : 'Loading') + '</div>'
                                    + '<div id="karyo-load-note" style="font:13.5px/1.5 inherit;'
                                    + 'color:#5b6b7a;margin-top:8px;">'
                                    + esc(isFile ? 'Starting…' : t) + '</div></div>'
                            }
                        },
                        {
                            'width': '100%',
                            'component': {
                                wid: 'html', width: '100%',
                                data: '<div style="max-width:560px;margin:14px auto 0;padding:0 24px;"></div>'
                            }
                        },
                        { 'width': '90%', 'component': progress_widget },
                    ]]
                }
            };
            try { showWidget(lay); } catch (e) { step('loading panel failed: ' + e); }
        };

        const savedPath = asSavedFile(path);
        let pendingDoc = null;
        if (savedPath) {
            showLoading(baseName(savedPath));
            setProgress(8);
            try {
                const shortName = baseName(savedPath);
                const raw = await getJsonCounting(
                    window['env']['apiUrl'] + '/load-file?path='
                    + savedPath + '&key=user&user=' + getUser(),
                    (n) => {
                        setLoadingNote('Downloading — ' + fmtBytes(n) + ' read');
                        // The download has no total to divide by -- gzipped, no
                        // Content-Length -- so the bar creeps across its own share of the
                        // way instead of inventing a percentage. Ten megabytes is most of
                        // the way; nothing here pretends to know the size.
                        setProgress(8 + 30 * (1 - Math.exp(-n / 10485760)));
                    },
                    (phase, n) => {
                        if (phase === 'parsing') {
                            setLoadingNote('Reading ' + fmtBytes(n) + ' into memory…');
                            setProgress(40);
                        }
                    });
                pendingDoc = (typeof raw === 'string') ? JSON.parse(raw) : raw;
                setLoadingNote('Fetching the chromosomes…');
                setProgress(45);            // file down and parsed
                step('opening saved karyotype ' + savedPath
                    + ' (species ' + JSON.stringify(pendingDoc && pendingDoc.species) + ')');
            } catch (e) {
                pendingDoc = null;
                step('could not read ' + savedPath + ': ' + (e && e.message ? e.message : e));
            }
        }

        // The document's species wins; the path is only a species when it is not a file.
        const preset = (pendingDoc && asSpecies(pendingDoc.species)) || asSpecies(path);
        step(preset ? ('species from the ' + (pendingDoc ? 'saved file' : 'path') + ': ' + preset)
            : 'asking for a species');
        if (savedPath && !pendingDoc) {
            // Say why the file did not open rather than silently showing a species prompt
            // that looks like the app ignored the click. Through step(), not the graph:
            // the graph is not built until further down, so naming it here threw a
            // ReferenceError that the catch swallowed -- the message never appeared, which
            // is the silence this line exists to prevent.
            step('that karyotype file could not be read');
        }
        const wanted = preset || await ask();
        step('species: ' + JSON.stringify(wanted));
        if (!wanted) {
            // Cancelling the species picker is cancelling the whole view. Nothing has been
            // drawn yet, so simply returning left the user on a blank screen with no way
            // forward -- the one place in this application where backing out stranded you.
            //
            // NO CONFIRMATION: nothing has been created, so there is nothing to lose. The
            // Species button's own ask() further down is a different case, because there IS
            // a karyotype behind it, and cancelling that one correctly stays where it is.
            step('species picker cancelled: returning to the home screen');
            try { await exec('baja/init'); }
            catch (e) { step('returning to the home screen failed: ' + e); }
            return false;
        }

        // ---- the table -----------------------------------------------------------------------
        showLoading('Fetching the chromosomes.');
        setProgress(pendingDoc ? 50 : 15);
        let r = null;
        try {
            const em = new EngineMonitor((m) => { try { log(m); } catch (e) { } });
            r = await exec(server + '/py/bio/karyotype.py', em, wanted);
        } catch (e) { r = null; step('the karyotype call threw: ' + (e && e.message ? e.message : e)); }
        step('table: ' + (r ? ((r.error ? ('error ' + r.error) : (r.assembly || 'no assembly'))) : 'no result'));
        let chroms = [];
        try { chroms = JSON.parse((r && r.chromosomes) || '[]'); } catch (e) { chroms = []; }
        if (!r || r.error || !chroms.length) {
            step('stopping: ' + ((r && r.error) || 'no chromosomes came back'));
            try { showModal({ wid: 'html', data: '<div style="padding:18px;font:14px Arial;">' + esc((r && r.error) || 'No chromosomes could be loaded.') + '</div>' }); } catch (e) { }
            return false;
        }

        // SMALLEST FIRST. Not chr1..chrY: the size order is the thing being shown, and the
        // numbering is only approximately the size order anyway -- chr21 is smaller than
        // chr22, which is why the numbering has been known to be wrong since 1971.
        // THE MITOCHONDRIAL GENOME IS HERE, AND IT IS NOT A BAR.
        //
        // chrM is 16,569 bases: fifteen thousand times shorter than chr1. Drawn to the shared
        // scale it is a sixtieth of a pixel, which is why it was left out to begin with -- and
        // leaving out the genome that carries its own diseases because it does not fit a
        // linear scale is the wrong answer to the wrong problem.
        //
        // So it is drawn as what it is: a circle. Mitochondrial DNA is genuinely circular, the
        // ring is the way it is always shown, and a ring has no length to be crushed by the
        // scale beside it. It is marked as not-to-scale where it is drawn, because it is the
        // one thing on this picture that is not.
        const isCircular = (c) => /^(chrM|chrMT|MT|M|Mito|chrMito)$/i.test('' + c.name);
        const drawn = chroms.filter((c) => +c.length > 0)
            .slice().sort((a, b) => a.length - b.length);
        for (const c of drawn) c.circular = isCircular(c);
        const isYeast = /yeast|cerevisiae|saccer/i.test('' + (r.species || '') + ' ' + (r.assembly || ''));
        // The linear scale comes from the linear chromosomes: one 16 kb ring must not decide
        // how tall 249 Mb is drawn.
        const maxMb = drawn.reduce((m, c) => (c.circular ? m : Math.max(m, c.length / MB)), 0);

        // ---- the graph, AND ITS CANVAS ---------------------------------------------------------
        //
        // exec('flexigraph/gene.js') builds the graph object. It does not put anything on the
        // screen: the canvas is a component the graph makes on request, and until it is
        // mounted into a widget there is nothing to draw on. The first version of this file
        // skipped that and drew a whole karyotype onto a canvas that was never in the
        // document -- the status line reported 25 chromosomes and the screen stayed empty,
        // which is exactly what a correct program with no canvas looks like.
        step('building the graph');
        const graph = await exec('flexigraph/gene.js');
        step('graph ready: ' + (graph ? typeof graph.createComponent : 'NO GRAPH'));

        const geneGraph = await graph.createComponent();
        step('canvas component: ' + (geneGraph && geneGraph.wid));
        geneGraph.height = '100%';
        // THE CANVAS "Select sequence" BUTTON IS THIS VIEW'S. Left alone it opens the
        // track sequence menu -- which needs tracks, and there are none here -- after
        // wiping the drag handlers this view installs, so the gesture panned instead of
        // selecting. arm() is what the gesture means on a karyotype: drag down a
        // chromosome, release, and the range that comes out is looked up and offered as
        // transcripts to open. The toolbar button of the same name calls the same thing,
        // so the two are one behaviour and not two.
        try { graph.__selectSeqOverride = () => { arm(); }; } catch (e) { }

        // AND THE BOX ZOOM IS THIS VIEW'S TOO.
        //
        // Box zoom ends in zoomRect -> animateTo, which reshapes the rectangle by the two
        // rules goView already exists to avoid (see animWouldReshape, below): y is discarded
        // under a world height of 1, and the aspect is then forced to 10:1 by widening x.
        // Those are absolute numbers over a y unit of ONE MEGABASE, so they are assumptions
        // about the size of a human genome. A yeast genome is 1.53 Mb from end to end, so
        // every box drawn on one is under a single world unit tall: y was replaced by the
        // current view and x expanded to about 95% of the whole width, which put the camera
        // back where it started. The same rectangle on a human chromosome is tens of units
        // tall, so the rule never fired there and the gesture looked fine.
        //
        // goView takes the rectangle at its word, animating only when animateTo would have
        // left it alone. Installed late enough that goView is defined by the time a drag can
        // reach it -- it is called from a mouse-up, not from here.
        try {
            graph.__zoomRectOverride = async (xmin, xmax, ymin, ymax) => {
                if (![xmin, xmax, ymin, ymax].every((v) => isFinite(v))) return false;
                await goView({
                    x0: Math.min(xmin, xmax), x1: Math.max(xmin, xmax),
                    y0: Math.min(ymin, ymax), y1: Math.max(ymin, ymax)
                });
                return true;
            };
        } catch (e) { }

        // HOW FAR OUT IS FAR ENOUGH.
        //
        // The chromosomes sit at fixed world positions, a slot apart, with the bar taking
        // 0.62 of each slot and the gap the rest. Zoom out and the slot shrinks in pixels
        // until the gap closes and the chromosomes read as one grey mass -- and the things
        // drawn beside a bar at a fixed pixel offset (the variant marks, the name, the
        // region number) start landing on its neighbour. There is nothing further out to
        // see, either: the whole genome is already framed at fit.
        //
        // So the x span is capped at the point where a slot is still MIN_SLOT_PX wide, and
        // y is brought in by the same factor so the shape of the view never changes -- a
        // clamp that held x while y kept going would be the stretch this is here to stop.
        const MIN_SLOT_PX = 14;       // bar ~8.7 px, gap ~5.3 px: still two separate things
        // The shape this view is built around: the rectangle fit() frames. Everything that
        // looks right on a karyotype -- the bars in proportion, the gaps even -- is this
        // ratio, and SLOT below is DERIVED from it, so the two cannot drift.
        //
        // Written as the literal rather than measured back out of SLOT and frameH. Those
        // are declared further down and this line runs at setup, so reading them here threw
        // before either existed and took the whole viewer down with it. The measurement was
        // only ever this number anyway: SLOT is (frameH * FIT_ASPECT) / (drawn.length+0.8),
        // so ((drawn.length+0.8) * SLOT) / frameH cancels to FIT_ASPECT exactly.
        const FIT_ASPECT = 10.5;
        graph.__clampView = (x0, x1, y0, y1) => {
            let wpx = 0, curSpan = 0;
            try {
                const gr = graph.graph && graph.graph.grid;
                wpx = (gr && gr.width) || 0;
                curSpan = gr ? (gr.xmax - gr.xmin) : 0;
            } catch (e) { wpx = 0; curSpan = 0; }
            if (!(wpx > 0) || !(SLOT > 0)) return [x0, x1, y0, y1];

            let span = x1 - x0, ySpan = y1 - y0;
            let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;

            // ZOOMING OUT SHOULD COME BACK TO THE SHAPE IT STARTED FROM.
            //
            // Going TO somewhere -- a gene, a bookmark, a dragged region -- sets a rectangle
            // of whatever shape that thing is: a 9 kb gene inside one chromosome slot is
            // nothing like 10.5:1. Zooming out from there scales both axes equally, which is
            // right for a zoom and means the stretch is preserved forever: every step out
            // keeps the shape of the gene you were looking at, so the genome never comes
            // back and Fit is the only way home.
            //
            // So on the way out, and only on the way out, the aspect is eased back toward
            // the fitted one. A third of the discrepancy per step: enough that a few presses
            // land on the right shape, gentle enough that one press is still a zoom rather
            // than a jump.
            if (span > curSpan * 1.001 && ySpan > 0 && isFinite(FIT_ASPECT) && FIT_ASPECT > 0) {
                const want = span / FIT_ASPECT;      // the height that would make it fit-shaped
                let eased = ySpan + (want - ySpan) * 0.34;
                // BOUNDED, or the first press is not a zoom. From a gene the discrepancy is
                // four orders of magnitude, and a third of that in one step moves y by a
                // thousandfold -- the screen simply changes rather than pulls back. Held to
                // 8x the step that was asked for, the shape still recovers in a handful of
                // presses and every one of them reads as a zoom out.
                const cap = ySpan * 8;
                if (eased > cap) { eased = cap; }
                if (eased < ySpan) { eased = ySpan; }   // never shrink y on the way out
                if (eased > 0 && isFinite(eased)) { ySpan = eased; }
            }

            // AND NOT PAST THE POINT WHERE THE CHROMOSOMES TOUCH.
            const maxSpan = SLOT * (wpx / MIN_SLOT_PX);
            if (span > maxSpan) {
                const k = maxSpan / span;
                span *= k;
                ySpan *= k;
            }
            return [cx - span / 2, cx + span / 2, cy - ySpan / 2, cy + ySpan / 2];
        };
        // ---- the tour ---------------------------------------------------------------------
        //
        // What the Help button at the end of the toolbar walks through. Every toolbar stop
        // is anchored by the button's TOOLTIP -- the same string the template puts in the
        // title attribute, so the name a person hovers to learn is the name the tour matches
        // on -- with the icon as the fallback. A stop whose button is not on screen drops out
        // of the tour rather than breaking it: the 1011 genomes button is only offered on a
        // yeast genome, and its step goes with it. See baja/manchester/menu/ui-tour.js.
        const TOUR_STEPS = [
            {
                title: 'A quick tour',
                text: '{stops} stops around the chromosome view, saying what each control is '
                    + 'for. Nothing here changes your karyotype — use Next and Back, or press '
                    + 'Escape to leave at any point.',
            },
            {
                title: 'The toolbar',
                sel: '.button-menu__grid',
                text: 'Everything you can do to a karyotype is in this row. The buttons are '
                    + 'icons only; hover one to see its name.',
            },
            {
                title: 'Files — open, save, remove',
                byTitle: 'Open, save or remove a karyotype in My Files',
                byIcon: 'folder_open',
                text: 'Keep this karyotype in My Files — the view, the bookmarks and the '
                    + 'variants you have loaded go with it — reopen one you kept earlier, or '
                    + 'remove one you no longer need.',
            },
            {
                title: 'Search — look something up',
                byTitle: 'Find a gene, act on the selected regions, or show patents',
                byIcon: 'search',
                text: 'Jump to a gene by name, see the genes inside the regions you have '
                    + 'selected and open their transcripts in the editor, or show the patents.',
            },
            {
                title: 'Patents — the whole landscape',
                byTitle: 'Show where patented sequences fall across the whole genome; press again to hide',
                byIcon: 'gavel',
                text: 'Draws a strip down every chromosome showing where patented sequences '
                    + 'fall, so you can see the crowded and the open ground at once. Press it '
                    + 'again to hide the strip.',
            },
            {
                title: 'Upload — put a file on the genome',
                byTitle: 'Read a VCF, a genetic report, or any file carrying genetic information onto the karyotype, and keep it in My Files',
                byIcon: 'upload_file',
                text: 'A VCF is read directly. Anything else — a genetic report, a lab PDF, a '
                    + '23andMe export, a gene panel — is read for whatever genetic information '
                    + 'it carries, and that is placed on the chromosomes. Pasting a VCF onto '
                    + 'this screen does the same.',
            },
            {
                title: '1011 genomes — a population',
                byTitle: 'Add variants from the 1011 yeast genomes (Peter et al. 2018)',
                byIcon: 'biotech',
                text: 'Adds variants from the 1011 yeast genomes collection by strain, by '
                    + 'region or by how common they are, without downloading the whole set.',
            },
            {
                title: 'Bookmarks — keep a view',
                byTitle: 'Keep this view, or go back to one you kept',
                byIcon: 'photo_camera',
                text: 'Keep the view you are looking at, and come back to it later from the '
                    + 'same button.',
            },
            {
                title: 'Fit — see everything again',
                byTitle: 'Frame the whole genome again',
                byIcon: 'fit_screen',
                text: 'Frames the whole genome after you have zoomed in, all chromosomes at '
                    + 'one scale, smallest on the left.',
            },
            {
                title: 'The chromosomes',
                sel: 'canvas',
                text: 'Drag to move and scroll to zoom. To choose a region, press Select '
                    + 'sequence on the canvas, then drag down a chromosome: the genes in that '
                    + 'range are looked up and offered as transcripts to open in the editor. '
                    + 'Variants you have loaded are drawn on the bars, and clicking one says '
                    + 'what it is.',
            },
            {
                title: 'Leaving',
                sel: '#baja-karyotype-close',
                text: 'The cross in the corner closes the chromosome view. Anything you saved '
                    + 'to My Files is still there; anything you did not is not.',
            },
            {
                title: 'That is the tour',
                byTitle: 'A quick tour of this screen',
                byIcon: 'help_outline',
                text: 'Help lives here whenever you want to see this again.',
            },
        ];

        // The SAME nesting editor.js uses: a geneGraphPanel card holding the toolbar row and
        // the canvas row, wrapped in a mainPanel card. Flattening the two into one card is
        // the obvious simplification and it is not what the renderer is fed anywhere else, so
        // it is not the thing to be original about while the screen is blank.
        const genegraph_panel_layout = {
            wid: 'card',
            componentRef: 'geneGraphPanel',
            data: {
                cards: [[
                    {
                        'width': '100%',
                        'component': {
                            wid: 'button-menu',
                            data: {
                                buttons: [
                                    {
                                        // THE FOLDER IS THE WHOLE FILE MENU NOW: open, save,
                                        // remove. Save had its own button beside this one, which
                                        // left the two halves of one job in two places and no
                                        // way to delete a karyotype at all without leaving for
                                        // the file browser.
                                        label: 'Files', icon: 'folder_open',
                                        tooltip: 'Open, save or remove a karyotype in My Files',
                                        ionFunction: createIonFunction(() => { if (armed) pan(); filesMenu(); })
                                    },
                                    {
                                        // Find gene, Regions and Patents were three buttons
                                        // asking one question -- what do you want to look up,
                                        // and where -- so they are one button and a menu.
                                        label: 'Search', icon: 'search',
                                        tooltip: 'Find a gene, act on the selected regions, or show patents',
                                        ionFunction: createIonFunction(() => { if (armed) pan(); searchMenu(); })
                                    },
                                    {
                                        // PATENTS ARE A GENOME-WIDE QUESTION, so they get a
                                        // button rather than living two levels down a menu
                                        // that is otherwise about looking one thing up. The
                                        // strip is drawn down every chromosome at once, which
                                        // is the whole point of asking, and the answer is not
                                        // something you search FOR: you either want the
                                        // landscape or you do not. Search still offers it, for
                                        // anyone who learned it there.
                                        //
                                        // patLoad() reads the density on the first press and
                                        // toggles the strip on every press after, so this is
                                        // one button for show and hide.
                                        label: 'Patents', icon: 'gavel',
                                        tooltip: 'Show where patented sequences fall across the whole '
                                            + 'genome; press again to hide',
                                        ionFunction: createIonFunction(() => { if (armed) pan(); patLoad(); })
                                    },
                                    {
                                        // ANY FILE, NOT ONLY A VCF. A VCF is read directly;
                                        // anything else -- a genetic report, a lab PDF, a
                                        // 23andMe export, a gene panel, a screenshot -- is
                                        // asked about first, and whatever genetic information
                                        // it carries is placed on the genome.
                                        label: 'Upload', icon: 'upload_file',
                                        tooltip: 'Read a VCF, a genetic report, or any file carrying genetic '
                                            + 'information onto the karyotype, and keep it in My Files',
                                        ionFunction: createIonFunction(() => { if (armed) pan(); uploadMenu(); })
                                    },
                                    // A POPULATION, NOT A FILE. The 1011 yeast genomes are
                                    // one 5.4 GB VCF that no browser should be handed, so the
                                    // server holds a repacked copy and this asks it for a
                                    // strain, a region or a frequency band. Only offered for
                                    // the genome it is called against.
                                    ...(isYeast ? [{
                                        label: '1011 genomes', icon: 'biotech',
                                        tooltip: 'Add variants from the 1011 yeast genomes (Peter et al. 2018)',
                                        ionFunction: createIonFunction(() => { if (armed) pan(); yeast1011Menu(); })
                                    }] : []),
                                    {
                                        // WHICH SAMPLE, WHICH HAPLOTYPE, OR WHICH CLASS. A
                                        // VCF says more than where its variants are, and
                                        // the color of a mark is the one channel that can
                                        // show it across a whole genome at once.
                                        label: 'Color', icon: 'palette',
                                        tooltip: 'Color variants by class, sample or haplotype, and toggle annotation highlights',
                                        ionFunction: createIonFunction(() => { if (armed) pan(); colorMenu(); })
                                    },
                                    {
                                        label: 'Bookmarks', icon: 'photo_camera',
                                        tooltip: 'Keep this view, or go back to one you kept',
                                        ionFunction: createIonFunction(() => { if (armed) pan(); bookmarkMenu(false); })
                                    },
                                    {
                                        label: 'Download', icon: 'file_download', color: '#16a34a',
                                        tooltip: 'Download variants as BED, JSON, CSV, XLSX or PDF',
                                        ionFunction: createIonFunction(() => { if (armed) pan(); downloadMenu(); })
                                    },
                                    {
                                        label: 'Share', icon: 'share',
                                        tooltip: 'Share this karyotype with named people, or as a public view-only link',
                                        ionFunction: createIonFunction(() => { if (armed) pan(); shareMenu(); })
                                    },
                                    {
                                        label: 'Info', icon: 'info_outline',
                                        tooltip: 'What is loaded: variants, samples, regions, highlights, patents',
                                        ionFunction: createIonFunction(() => { if (armed) pan(); infoPanel(); })
                                    },
                                    {
                                        label: 'Fit', icon: 'fit_screen',
                                        tooltip: 'Frame the whole genome again',
                                        ionFunction: createIonFunction(async () => { await fit(); pan(); })
                                    },
                                    {
                                        // LAST IN THE ROW ON PURPOSE, as in the editor: help is
                                        // not something you do to a karyotype, so it sits after
                                        // the things that are. Straight to the tour rather than
                                        // through a shelf -- the editor's Help opens a library
                                        // because it has more than one thing to offer, and this
                                        // view has one. The tour describes and never drives:
                                        // nothing in it opens a menu or moves the camera, so it
                                        // can be taken with a karyotype open and left at any step.
                                        label: 'Help', icon: 'help_outline',
                                        tooltip: 'A quick tour of this screen',
                                        ionFunction: createIonFunction(() => {
                                            if (armed) pan();
                                            try { graph.hideMenu(); } catch (e) { }
                                            try { graph.showSideMenu(null); } catch (e) { }
                                            try { hideAllModal(); } catch (e) { }
                                            Promise.resolve(exec('baja/manchester/menu/ui-tour.js', graph, { steps: TOUR_STEPS }))
                                                .catch((e) => {
                                                    try { graph.setError(' The tour could not start: ' + (e && e.message ? e.message : e) + ' '); } catch (e2) { }
                                                });
                                        })
                                    },
                                ]
                            }
                        }
                    }
                ], [
                    { 'width': '100%', 'height': '100%', 'component': geneGraph }
                ]]
            }
        };
        const main_layout = {
            wid: 'card',
            height: '100%',
            componentRef: 'mainPanel',
            data: {
                cards: [[
                    { 'width': '100%', 'height': '100%', 'component': genegraph_panel_layout }
                ]]
            }
        };
        graph.genegraph_panel_layout = genegraph_panel_layout;
        try { clear(); } catch (e) { }
        setProgress(100);
        loadingShown = false;          // the bar is gone; a later load can show it again
        showWidget(main_layout);
        try { CurrentLayout.stash('mainPanel', main_layout); } catch (e) { }
        try { CurrentLayout.stash('graph', graph); } catch (e) { }
        step('canvas mounted');

        // ---- close ----------------------------------------------------------------------
        //
        // This view fills the screen and has no other way out, so it needs one. A fixed ✕
        // rather than another entry on the toolbar: the toolbar is a row of things to DO to
        // the karyotype, and leaving it is not one of them.
        //
        // Top-RIGHT, unlike the library's ✕ which sits top-left, because the toolbar runs
        // from the left edge and would sit underneath it. The 44px offset is the same, and
        // clears the application's own navigation bar.
        //
        // It removes the window-level paste listener on the way out. That listener is the
        // only thing this view leaves behind, and a paste on the home screen loading a VCF
        // into a karyotype that is no longer on screen is a genuinely confusing bug.
        try {
            const CLOSE_ID = 'baja-karyotype-close';
            const prev = document.getElementById(CLOSE_ID);
            if (prev && prev.parentNode) prev.parentNode.removeChild(prev);
            const xb = document.createElement('div');
            xb.id = CLOSE_ID;
            xb.title = 'Close the chromosome view';
            xb.setAttribute('role', 'button');
            xb.setAttribute('tabindex', '0');
            xb.setAttribute('aria-label', 'Close the chromosome view');
            xb.textContent = '✕';
            xb.style.cssText = 'position:fixed;top:44px;right:14px;z-index:2147483000;'
                + 'width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;'
                + 'background:#0b2545;color:#fff;font:700 15px Arial;cursor:pointer;user-select:none;'
                + 'box-shadow:0 4px 12px rgba(0,0,0,0.32);border:1px solid rgba(255,255,255,0.18);';
            xb.onmouseenter = () => { try { xb.style.filter = 'brightness(1.25)'; } catch (e) { } };
            xb.onmouseleave = () => { try { xb.style.filter = ''; } catch (e) { } };
            const goHome = async () => {
                // Confirm before leaving. This editor holds work that lives only in the page until
                // it is saved, so closing is destructive and is treated as such. The dialog stacks
                // above the editor and defaults to staying.
                let __leave = true;
                try {
                    __leave = await exec('baja/lib/confirm-leave.js', {
                        title: 'Close the chromosome view?',
                        message: 'Anything you have not saved will be lost.',
                        confirmLabel: 'Close without saving'
                    });
                } catch (e2) {
                    // A dialog that failed to appear must not become a silent discard.
                    __leave = false;
                }
                if (!__leave) return;
                // The button comes down first. If the home screen fails to build, the user
                // is out of this view rather than looking at a dead ✕ over a canvas.
                try { if (xb.parentNode) xb.parentNode.removeChild(xb); } catch (e) { }
                legendHide();
                try {
                    if (window.__karyotypePaste) {
                        window.removeEventListener('paste', window.__karyotypePaste, true);
                        window.__karyotypePaste = null;
                    }
                } catch (e) { }
                try { await exec('baja/init'); }
                catch (e) { step('returning to the home screen failed: ' + e); }
            };
            xb.onclick = goHome;
            xb.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHome(); } };
            document.body.appendChild(xb);
            step('close button mounted');
        } catch (e) { step('close button failed: ' + e); }

        // TWO THRESHOLDS, because there are two useful answers to "where is this".
        //
        // Every chromosome is drawn at the SAME scale from the same top line -- that is the
        // whole design -- so one axis down the side gives the genomic coordinate for all of
        // them at once. That appears as soon as a chromosome is a hundredth of the canvas,
        // which is to say almost always.
        //
        // Per-chromosome rulers appear only when one chromosome fills a fifth of the screen.
        // Drawing twenty-four of them at the whole-genome fit is a picket fence: the bars are
        // 31 px apart and a "150 Mb" label is 40 px wide, so every label would sit on its
        // neighbour and none would be readable. The shared axis says the same thing and says
        // it once.
        const COORD_FRACTION = 0.01;        // the shared axis
        const COORD_PER_CHROM = 0.20;       // a ruler beside one chromosome
        // The nucleus is drawn while the whole genome still reads as one object -- when the
        // widest chromosome is a small fraction of the canvas. Zoomed into one chromosome it
        // would be a meaningless arc through the picture.
        const NUCLEUS_MAX_BAR = 0.09;
        // The cell body appears further out still: absent at the default fit, where the bars
        // are about 1.6% of the canvas.
        const NEURON_MAX_BAR = 0.012;
        // THE SEQUENCE ITSELF, once a base is tall enough to carry a letter.
        //
        // y is the genomic axis here, so bases stack DOWNWARD and consecutive letters
        // collide unless a base is at least a line-height tall. That is the whole rule --
        // the threshold IS "close enough to show the characters without overrunning" -- and
        // it is a property of the font, not a taste. Below it nothing is drawn; there is no
        // halfway rendering of a sequence.
        const SEQ_MIN_PX = 9;        // px per base before any letter is drawn
        const SEQ_FONT_MAX = 13;     // past this a taller base does not need a bigger letter
        // Vertical room decides WHETHER there is a sequence to show; horizontal room only
        // decides how big it is drawn. A narrow bar gets a smaller letter, not no letter --
        // right down to the size below which a base is no longer legible at all.
        const SEQ_FONT_MIN = 6.5;    // below this a letter is a smudge, so draw nothing
        const SEQ_ASPECT = 0.62;     // advance width of a monospace glyph, per px of size
        const SEQ_CHUNK = 2048;      // bases per request
        const SEQ_MAX_CHUNKS = 8;    // at ~9 px a base, a screen is one or two of these
        // The four bases in the colors sequence viewers have used for decades. Someone
        // arriving from IGV or a chromatogram should not have to learn a second key.
        const BASE_COLOR = { A: '#15803d', C: '#1d4ed8', G: '#b45309', T: '#be123c', N: '#94a3b8' };

        // A TICK INTERVAL SOMEONE CAN READ. 1, 2 or 5 times a power of ten -- the intervals
        // people already read axes in. A step of 3,170,494 is arithmetically fine and nobody
        // has ever wanted it.
        // A rounded rectangle, path only. ctx.roundRect exists in current browsers and
        // not in all of the ones this runs in, so the path is built rather than assumed.
        const roundRect = (ctx2, x, y, w, h, r) => {
            const rr = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
            ctx2.beginPath();
            ctx2.moveTo(x + rr, y);
            ctx2.arcTo(x + w, y, x + w, y + h, rr);
            ctx2.arcTo(x + w, y + h, x, y + h, rr);
            ctx2.arcTo(x, y + h, x, y, rr);
            ctx2.arcTo(x, y, x + w, y, rr);
            ctx2.closePath();
        };

        const niceStep = (raw) => {
            if (!(raw > 0)) return 0;
            const mag = Math.pow(10, Math.floor(Math.log10(raw)));
            const n = raw / mag;
            return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
        };
        // Labelled in the unit the STEP is in, not the position: ticks 1 kb apart read as
        // 117,559.6 kb rather than as 0.1175596 Mb, and the decimals follow the step too, so
        // consecutive labels never print the same number twice.
        const fmtBp = (bp, step) => {
            if (step >= 1e6) return (bp / 1e6).toFixed(step >= 1e7 ? 0 : 1) + ' Mb';
            if (step >= 1e3) return (bp / 1e3).toFixed(step >= 1e4 ? 0 : 1) + ' kb';
            return Math.round(bp).toLocaleString() + ' bp';
        };
        const fmtSpan = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + ' Mb'
            : n >= 1e3 ? (n / 1e3).toFixed(1) + ' kb' : Math.round(n) + ' bp');

        // Base position -> world y. One place, because getting it wrong in one of the five
        // places that need it would put bands on a chromosome they do not belong to.
        const wy = (bp) => -bp / MB;

        // THE WORLD MUST BE AT LEAST TEN TIMES WIDER THAN IT IS TALL.
        //
        // animateTo() enforces a minimum aspect ratio of 10:1 on any frame it is given: below
        // that it widens x to yw * 10 and re-centres. That is right for the tracks this graph
        // was built for, which are long and shallow. A karyotype is the opposite shape, and
        // one chromosome per world unit put 24 units of content beside 294 units of height --
        // an aspect of 0.08, which the rule expanded 118-fold. The chromosomes were still
        // drawn, 0.41 px wide, and the sub-pixel cull in paint() dropped every one of them.
        // A canvas that reports 1920x823 and shows nothing looks like a broken renderer and
        // is a frame the graph quietly refused.
        //
        // So the world x unit is DERIVED from the y extent rather than chosen: one slot is
        // whatever makes the whole picture 10.5 times wider than tall, and the rule never
        // fires. 10.5 rather than 10 so floating point cannot land just under the threshold.
        const frameH = maxMb * 1.18;                       // world height of the fitted view
        const SLOT = (frameH * FIT_ASPECT) / (drawn.length + 0.8);
        const slotOf = (i) => (i + 0.5) * SLOT;
        const barLeft = (i) => slotOf(i) - (BAR_W * SLOT) / 2;
        const barRight = (i) => slotOf(i) + (BAR_W * SLOT) / 2;

        // THE BASES ARE FETCHED ON A FIXED CHUNK GRID, not per viewport. Panning by one
        // pixel changes the visible window by a base or two, and a viewport-keyed cache
        // would miss on every frame and ask the server again for almost exactly what it
        // already had. Aligned chunks mean a pan reuses everything except the chunk it
        // moved onto.
        const seqCache = new Map();            // 'chr|chunk' -> string | PENDING | MISS
        const SEQ_PENDING = '\u0000pending';   // sentinels, not sequence: no base is ever a
        const SEQ_MISS = '\u0000miss';         // NUL, so neither can be mistaken for data
        // A species this server holds no genome for must be asked ONCE. paint() runs every
        // frame, so a failure that clears its own cache entry turns into a request per frame
        // for as long as the view is held -- the whole reason a miss is remembered.
        let seqOff = false;
        const seqKey = (chrom, k) => chrom + '|' + k;
        const seqAsk = async (chrom, k) => {
            const key = seqKey(chrom, k);
            if (seqOff || seqCache.has(key)) return;
            seqCache.set(key, SEQ_PENDING);
            const lo = k * SEQ_CHUNK + 1;
            try {
                const em2 = new EngineMonitor(() => { });
                const rs = await exec(server + '/py/bio/genome-sequence.py', em2,
                    chrom, String(lo), String(lo + SEQ_CHUNK - 1), (r.species || 'human'));
                if (rs && rs.ok && rs.sequence) {
                    seqCache.set(key, String(rs.sequence));
                } else {
                    seqCache.set(key, SEQ_MISS);
                    // No genome for this species at all: stop asking for every chunk of
                    // every chromosome one at a time.
                    const msg = ('' + ((rs && rs.error) || '')).toLowerCase();
                    if (msg.indexOf('no genome') >= 0 || msg.indexOf('not on this server') >= 0) {
                        seqOff = true;
                        step('sequence unavailable: ' + (rs && rs.error));
                    }
                }
            } catch (e) { seqCache.set(key, SEQ_MISS); }
            // Bounded: panning along a chromosome at base resolution would otherwise keep
            // every window it has ever crossed.
            if (seqCache.size > SEQ_MAX_CHUNKS * 3) {
                const drop = seqCache.size - SEQ_MAX_CHUNKS;
                let n = 0;
                for (const kk of Array.from(seqCache.keys())) {
                    if (n++ >= drop) break;
                    if (seqCache.get(kk) !== SEQ_PENDING) seqCache.delete(kk);
                }
            }
            if (graph.wake) graph.wake();
        };
        // The base at a position, or '' when its chunk has not arrived. Never blocks and
        // never asks -- asking is the caller's decision, so paint() stays synchronous.
        const seqBaseAt = (chrom, bp) => {
            const k = Math.floor((bp - 1) / SEQ_CHUNK);
            const str = seqCache.get(seqKey(chrom, k));
            if (!str || str === SEQ_PENDING || str === SEQ_MISS) return '';
            const off = (bp - 1) - k * SEQ_CHUNK;
            return (off >= 0 && off < str.length) ? str.charAt(off) : '';
        };

        // The ideogram, drawn in WORLD coordinates through g.X / g.Y so it pans and zooms
        // with everything else rather than being an overlay that has to be told what the
        // viewport is doing.
        //
        // NOT graph.plots. That list looks like the obvious hook -- the renderer walks it and
        // calls draw() on each entry -- but it is the MPlot family's list, and the mouse
        // handlers call .inside(grid, x, y) and read .grid on everything in it. An object
        // with only a draw() threw "pl.inside is not a function" on every mouse event, which
        // took the whole interaction down with it.
        //
        // highlightmethod(ctx, geneGraph) is the per-frame hook with no other contract --
        // measure-track.js and variant-tools.js both use it exactly this way. The one thing
        // to know is that clearMouseListeners() nulls it, so arm() re-installs it after
        // clearing, every time.
        const paint = (ctx, g) => {
            if (ctx && ctx.canvas) lastCanvas = ctx.canvas;   // the key watches this canvas
            {
                if (!ctx || !g) return;
                ctx.save();
                ctx.textBaseline = 'top';
                ctx.textAlign = 'center';
                const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

                // ---- the nucleus -------------------------------------------------------------
                //
                // FIRST, so everything else sits inside it, and only while the whole genome still
                // reads as one object. Zoomed into a single chromosome an envelope arcing through
                // the picture is not context, it is a line across the middle of the thing being
                // looked at -- so it is tied to how wide a chromosome has become, and fades over
                // that range rather than snapping off, because a hard edge on a decorative
                // element reads as a rendering fault.
                //
                // Its extent comes from the CHROMOSOMES, not from the canvas: the envelope has to
                // enclose the karyotype at whatever zoom, and a fixed ellipse would drift off it
                // the moment anything moved.
                const barPx = g.X(barRight(0)) - g.X(barLeft(0));
                const nucAlpha = Math.max(0, Math.min(1,
                    (NUCLEUS_MAX_BAR * ctx.canvas.width - barPx) / (0.045 * ctx.canvas.width)));
                // THE CELL, one step further out than the nucleus. The nucleus arrives as the
                // genome stops being individual chromosomes; the cell arrives as the nucleus
                // stops being the whole picture. Absent at the default fit -- where the bars
                // are 1.6% of the canvas -- and fading in below 1.2%, so it is something you
                // find by pulling back rather than something you have to dismiss.
                const cellAlpha = Math.max(0, Math.min(1,
                    (NEURON_MAX_BAR * ctx.canvas.width - barPx) / (0.006 * ctx.canvas.width)));
                if ((nucAlpha > 0.01 || cellAlpha > 0.01) && drawn.length) {
                    const lx = g.X(barLeft(0)), rx = g.X(barRight(drawn.length - 1));
                    let ty = g.Y(wy(0)), by = -Infinity;
                    for (let k = 0; k < drawn.length; k++) by = Math.max(by, g.Y(wy(drawn[k].length)));
                    // AN ELLIPSE THROUGH THE CORNERS DOES NOT CONTAIN THEM.
                    //
                    // A box of half-extent (w, h) lies inside an ellipse of semi-axes (a, b)
                    // only where (w/a)^2 + (h/b)^2 <= 1. Padding each axis by a tenth gives
                    // 1.59 -- comfortably outside 1 -- so the end chromosomes and their labels
                    // sat outside the envelope that was supposed to enclose them. Scaling both
                    // axes by sqrt(2) inscribes the box exactly; the extra 6% is the margin
                    // that makes it look like a nucleus rather than a shrink-wrap.
                    //
                    // The box includes the room the names and lengths are drawn in, below the
                    // bars -- they are part of the karyotype and an envelope cutting through
                    // them is the same fault as one cutting through a chromosome.
                    const LABEL_ROOM = 34;
                    const bx = by + LABEL_ROOM;
                    const cx = (lx + rx) / 2, cy = (ty + bx) / 2;
                    const K = Math.SQRT2 * 1.06;
                    const erx = ((rx - lx) / 2) * K, ery = ((bx - ty) / 2) * K;
                    // ---- the neuron, drawn FIRST so the nucleus sits inside it ----------
                    //
                    // Three things separate a neuron from lines poking out of an oval, and the
                    // first version had none of them.
                    //
                    //   TAPER.    A process is thick where it leaves the soma and vanishingly
                    //             thin at its tip. Stroking one curve at a constant width is
                    //             what makes a drawing look like a diagram of a spider.
                    //   BRANCHING that keeps going. Real arbors divide three or four times,
                    //             each generation shorter and thinner. Two children once is a
                    //             fork, not a tree.
                    //   A SOMA that the processes grow OUT of. An ellipse with lines meeting
                    //             its edge always reads as stuck-on; a cell body bulges
                    //             towards each root.
                    //
                    // Every angle, length and wobble comes from a hash of the branch's index,
                    // not from Math.random -- so the cell is elaborate and completely still.
                    // An arbor that regrew each frame would shimmer, and background context
                    // must not move.
                    if (cellAlpha > 0.01 && isFinite(cx) && isFinite(cy) && erx > 4 && ery > 4) {
                        const sx = erx * 1.5, sy = ery * 1.5;      // the soma, around the nucleus
                        const unit = Math.min(sx, sy);
                        ctx.save();
                        ctx.globalAlpha = cellAlpha;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        const edge = 'rgba(100,116,139,0.55)';
                        ctx.strokeStyle = edge;

                        // Stable pseudo-randomness: the same index always gives the same
                        // number, so the arbor is identical on every frame and every zoom.
                        const rnd = (n) => {
                            const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
                            return x - Math.floor(x);
                        };

                        // A tapering, curving branch, walked in steps. Each step is stroked at
                        // its own width, which is what produces the taper -- canvas has no
                        // variable-width stroke, and a filled outline for something this thin
                        // costs more than it shows.
                        const STEPS = 9;
                        const branch = (x0, y0, ang, len, w0, depth, seed) => {
                            if (len < 2 || w0 < 0.35) return;
                            const curve = (rnd(seed) - 0.5) * 0.9;      // how much it bends, and which way
                            let px = x0, py = y0, a = ang;
                            for (let st = 0; st < STEPS; st++) {
                                const t0 = st / STEPS, t1 = (st + 1) / STEPS;
                                a = ang + curve * t1;
                                const nx = x0 + Math.cos(a) * len * t1;
                                const ny = y0 + Math.sin(a) * len * t1;
                                // Width falls off towards the tip, faster at the end than at
                                // the start, which is how a process actually thins.
                                ctx.lineWidth = Math.max(0.35, w0 * (1 - t0 * 0.82));
                                ctx.beginPath();
                                ctx.moveTo(px, py);
                                ctx.lineTo(nx, ny);
                                ctx.stroke();
                                px = nx; py = ny;
                            }
                            if (depth <= 0) return;
                            // Two children, at angles that vary by branch so no two forks in
                            // the tree are the same shape.
                            const spread = 0.34 + rnd(seed + 11) * 0.30;
                            for (let c2 = 0; c2 < 2; c2++) {
                                const sign = c2 ? 1 : -1;
                                branch(px, py, a + sign * spread,
                                    len * (0.56 + rnd(seed + c2 * 7 + 3) * 0.16),
                                    w0 * 0.62, depth - 1, seed * 3 + c2 * 17 + 5);
                            }
                        };

                        // Where the dendrites leave the soma. Spread over the whole circle
                        // except the sector the axon takes, so the two never grow into each
                        // other.
                        const AXON_ANG = Math.PI;
                        const DEND_N = 7;
                        const roots = [];
                        for (let k = 0; k < DEND_N; k++) {
                            // -0.78..+0.78 of a turn, centred away from the axon.
                            const frac = (k + 0.5) / DEND_N;
                            const a0 = (frac * 1.56 - 0.78) * Math.PI + (rnd(k + 91) - 0.5) * 0.14;
                            roots.push(a0);
                        }

                        // The soma: a closed blob that bulges towards every root, so the
                        // processes leave a cell body instead of touching an ellipse.
                        const somaR = (a) => {
                            let bulge = 0;
                            for (const ra of roots.concat([AXON_ANG])) {
                                let d2 = Math.abs(((a - ra + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
                                bulge = Math.max(bulge, Math.max(0, 1 - d2 / 0.55));
                            }
                            return 1 + bulge * 0.16;
                        };
                        const somaPath = () => {
                            ctx.beginPath();
                            const N = 96;
                            for (let k = 0; k <= N; k++) {
                                const a = (k / N) * Math.PI * 2;
                                const rr = somaR(a);
                                const x2 = cx + Math.cos(a) * sx * rr;
                                const y2 = cy + Math.sin(a) * sy * rr;
                                if (k === 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2);
                            }
                            ctx.closePath();
                        };

                        // Dendrites first, from just inside the soma so their roots are
                        // covered by it.
                        for (let k = 0; k < roots.length; k++) {
                            const a0 = roots[k];
                            const rr = somaR(a0) * 0.82;
                            branch(cx + Math.cos(a0) * sx * rr, cy + Math.sin(a0) * sy * rr,
                                a0, unit * (0.9 + rnd(k + 41) * 0.7),
                                Math.max(1.1, unit * 0.055), 3, k * 13 + 1);
                        }

                        // The axon: one, long, thin, and barely branching until it ends -- the
                        // thing that tells it apart from the dendrites around it. Drawn with
                        // the same taper but a much slower one.
                        {
                            const rr = somaR(AXON_ANG) * 0.82;
                            let ax = cx + Math.cos(AXON_ANG) * sx * rr;
                            let ay = cy + Math.sin(AXON_ANG) * sy * rr;
                            const alen = unit * 4.2;
                            const AST = 26;
                            const w0 = Math.max(1.1, unit * 0.045);
                            let pxA = ax, pyA = ay;
                            for (let st = 1; st <= AST; st++) {
                                const t = st / AST;
                                // A long, shallow wave: an axon is not a ruled line.
                                const nx = ax - alen * t;
                                const ny = ay + Math.sin(t * Math.PI * 1.7) * unit * 0.22;
                                ctx.lineWidth = Math.max(0.4, w0 * (1 - t * 0.45));
                                ctx.beginPath();
                                ctx.moveTo(pxA, pyA);
                                ctx.lineTo(nx, ny);
                                ctx.stroke();
                                pxA = nx; pyA = ny;
                            }
                            // A terminal arbor rather than three spokes.
                            for (let k = 0; k < 4; k++) {
                                branch(pxA, pyA, Math.PI + (k - 1.5) * 0.34, unit * 0.42,
                                    Math.max(0.6, w0 * 0.5), 1, 300 + k * 9);
                            }
                        }

                        // The soma last, over the roots, so they join it rather than sit on it.
                        somaPath();
                        ctx.fillStyle = 'rgba(214,225,240,0.55)';
                        ctx.fill();
                        ctx.strokeStyle = edge;
                        ctx.lineWidth = 1.25;
                        ctx.stroke();
                        ctx.restore();
                    }

                    if (nucAlpha > 0.01 && isFinite(cx) && isFinite(cy) && erx > 4 && ery > 4) {
                        ctx.save();
                        ctx.globalAlpha = nucAlpha;
                        // Nucleoplasm: enough to lift the chromosomes off the page without
                        // competing with the Giemsa greys they are drawn in.
                        const grad = ctx.createRadialGradient(cx, cy - ery * 0.25, ery * 0.15, cx, cy, Math.max(erx, ery));
                        grad.addColorStop(0, 'rgba(226,236,250,0.85)');
                        grad.addColorStop(1, 'rgba(198,214,238,0.45)');
                        ctx.beginPath();
                        ctx.ellipse(cx, cy, erx, ery, 0, 0, Math.PI * 2);
                        ctx.fillStyle = grad;
                        ctx.fill();
                        // Two membranes with a perinuclear space between them, which is what makes
                        // it read as a nuclear envelope rather than as an oval.
                        ctx.strokeStyle = 'rgba(71,85,105,0.55)';
                        ctx.lineWidth = 1.25;
                        ctx.stroke();
                        // THE INSET HAS TO FIT INSIDE THE SMALLER RADIUS.
                        //
                        // It was Math.max(3, ery * 0.018) -- a share of the HEIGHT alone --
                        // and the outer ellipse is only guarded as erx > 4. Zoom in far
                        // enough vertically and ery runs to tens of thousands of pixels
                        // while erx stays small, so the inset grew past erx and the inner
                        // membrane was asked for a radius of -334. Canvas throws on that,
                        // out of paint(), which abandoned the rest of the frame -- so the
                        // chromosomes stopped being drawn at all, and the console filled
                        // with one IndexSizeError per frame.
                        //
                        // Bounded by the smaller radius, so the second membrane is always
                        // inside the first whatever shape the nucleus is drawn at.
                        const inset = Math.min(Math.max(3, ery * 0.018),
                            Math.min(erx, ery) * 0.35);
                        ctx.beginPath();
                        ctx.ellipse(cx, cy, Math.max(0.5, erx - inset),
                            Math.max(0.5, ery - inset), 0, 0, Math.PI * 2);
                        ctx.strokeStyle = 'rgba(71,85,105,0.30)';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                        // Pores, spaced evenly FROM THE GEOMETRY. Scattering them randomly would
                        // move every one of them on every frame.
                        ctx.fillStyle = 'rgba(71,85,105,0.45)';
                        const pores = 34;
                        for (let k = 0; k < pores; k++) {
                            const a = (k / pores) * Math.PI * 2;
                            ctx.beginPath();
                            ctx.arc(cx + Math.cos(a) * (erx - inset / 2), cy + Math.sin(a) * (ery - inset / 2), 1.6, 0, Math.PI * 2);
                            ctx.fill();
                        }
                        // A nucleolus, off centre and behind everything: the one organelle inside a
                        // nucleus that shows in a light micrograph, so leaving it out is what would
                        // look wrong.
                        ctx.beginPath();
                        ctx.ellipse(cx + erx * 0.30, cy + ery * 0.26, erx * 0.10, ery * 0.13, 0, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(148,163,184,0.34)';
                        ctx.fill();
                        ctx.restore();
                    }
                }

                // REGIONS TOO SMALL TO LABEL WHERE THEY ARE. Framed on the whole genome a
                // selected region is a couple of pixels of blue on a bar, and the gene names
                // that would explain it have nowhere to go. Collected here and drawn after
                // every chromosome, as callouts in the margin with a leader back to the
                // band -- so a selection is still legible at the zoom where you can see all
                // of them at once, which is the zoom where knowing what you picked matters.
                const callouts = [];
                calloutHits = [];
                patLabelHits = [];
                for (let i = 0; i < drawn.length; i++) {
                    const c = drawn[i];
                    if (c.circular) {
                        // A ring, sized to the slot and hung from the same top line the
                        // linear chromosomes start at, so it sits in the row rather than
                        // floating beside it.
                        const cxr = g.X(slotOf(i));
                        const wSlot = g.X(barRight(i)) - g.X(barLeft(i));
                        const rad = Math.max(3, wSlot * 0.62);
                        const cyr = g.Y(wy(0)) + rad + 6;
                        if (cxr < -60 || cxr > ctx.canvas.width + 60) continue;
                        if (rad < 1.5) continue;
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(cxr, cyr, rad, 0, Math.PI * 2);
                        ctx.fillStyle = '#f2f6fb';
                        ctx.fill();
                        ctx.lineWidth = Math.max(2, rad * 0.22);
                        ctx.strokeStyle = '#8aa0b8';
                        ctx.stroke();
                        ctx.lineWidth = 1;
                        ctx.strokeStyle = 'rgba(15,23,42,0.55)';
                        ctx.stroke();
                        // Its variants, as dots around the ring: position maps to angle from
                        // twelve o'clock, which is how a circular genome is always drawn.
                        const dm = vdata[i];
                        if (dm && dm.n) {
                            for (let k = 0; k < dm.n; k++) {
                                const a2 = (dm.pos[k] / c.length) * Math.PI * 2 - Math.PI / 2;
                                const col = colorOf(dm, k);
                                ctx.beginPath();
                                ctx.arc(cxr + Math.cos(a2) * rad, cyr + Math.sin(a2) * rad,
                                    Math.max(1.6, rad * 0.09), 0, Math.PI * 2);
                                ctx.fillStyle = col;
                                ctx.fill();
                                ctx.lineWidth = 0.8;
                                ctx.strokeStyle = 'rgba(15,23,42,0.7)';
                                ctx.stroke();
                            }
                        }
                        if (wSlot > 8) {
                            ctx.fillStyle = '#0f172a';
                            ctx.font = '600 ' + Math.max(9, Math.min(13, wSlot * 0.42)) + 'px ' + FONT;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'top';
                            ctx.fillText('MT', cxr, cyr + rad + 6);
                            if (wSlot > 26) {
                                ctx.fillStyle = '#64748b';
                                ctx.font = '10px ' + FONT;
                                ctx.fillText('16.6 kb · not to scale', cxr, cyr + rad + 22);
                            }
                        }
                        ctx.restore();
                        continue;
                    }
                    const x0 = g.X(barLeft(i)), x1 = g.X(barRight(i));
                    const w = x1 - x0;
                    if (w < 0.6) continue;                       // narrower than a hairline
                    if (x1 < -40 || x0 > ctx.canvas.width + 40) continue;
                    const yTop = g.Y(wy(0)), yBot = g.Y(wy(c.length));
                    const h = yBot - yTop;
                    if (!isFinite(h) || Math.abs(h) < 0.5) continue;

                    const cen = c.centromere;
                    const rr = Math.min(w * 0.45, Math.abs(h) * 0.02, 14);

                    // A rounded outline for the whole chromosome, used both to clip the bands
                    // and to stroke the edge, so the bands never spill past the arm tips.
                    const outline = () => {
                        ctx.beginPath();
                        ctx.moveTo(x0 + rr, yTop);
                        ctx.arcTo(x1, yTop, x1, yTop + rr, rr);
                        ctx.lineTo(x1, yBot - rr);
                        ctx.arcTo(x1, yBot, x1 - rr, yBot, rr);
                        ctx.lineTo(x0 + rr, yBot);
                        ctx.arcTo(x0, yBot, x0, yBot - rr, rr);
                        ctx.lineTo(x0, yTop + rr);
                        ctx.arcTo(x0, yTop, x0 + rr, yTop, rr);
                        ctx.closePath();
                    };

                    ctx.save();
                    outline();
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                    ctx.clip();

                    const bands = c.bands || [];
                    if (bands.length) {
                        for (const b of bands) {
                            if (b.stain === 'acen') continue;    // drawn as the pinch below
                            const by0 = g.Y(wy(b.start)), by1 = g.Y(wy(b.end));
                            const bh = by1 - by0;
                            if (Math.abs(bh) < 0.35) continue;   // sub-pixel: would only alias
                            ctx.fillStyle = STAIN[b.stain] || '#dfe6ee';
                            ctx.fillRect(x0, by0, w, Math.max(0.35, bh));
                        }
                    } else {
                        // No banding for this assembly. A flat bar is the honest picture: a
                        // decorative pattern here would be an invented cytogenetic map.
                        ctx.fillStyle = '#e8eef5';
                        ctx.fillRect(x0, yTop, w, h);
                    }
                    ctx.restore();

                    // The centromere: a notch cut from both edges, which is how a karyotype
                    // reads at a glance, plus a hairline at the constriction itself.
                    if (cen && isFinite(+cen.start) && isFinite(+cen.end)) {
                        const cy0 = g.Y(wy(cen.start)), cy1 = g.Y(wy(cen.end));
                        const cw = Math.min(w * 0.32, Math.max(1, w * 0.32));
                        ctx.fillStyle = 'rgba(255,255,255,1)';
                        ctx.beginPath();
                        ctx.moveTo(x0, cy0); ctx.lineTo(x0 + cw, (cy0 + cy1) / 2); ctx.lineTo(x0, cy1);
                        ctx.closePath(); ctx.fill();
                        ctx.beginPath();
                        ctx.moveTo(x1, cy0); ctx.lineTo(x1 - cw, (cy0 + cy1) / 2); ctx.lineTo(x1, cy1);
                        ctx.closePath(); ctx.fill();
                        ctx.strokeStyle = 'rgba(190,60,60,0.85)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(x0 + cw * 0.9, (cy0 + cy1) / 2);
                        ctx.lineTo(x1 - cw * 0.9, (cy0 + cy1) / 2);
                        ctx.stroke();
                    }

                    outline();
                    ctx.strokeStyle = 'rgba(15,23,42,0.55)';
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    // GENOMIC COORDINATES, once this chromosome is wide enough to carry them.
                    // A chromosome drawn at a fifth of the screen is being looked at rather
                    // than scanned past, and at that width a position is something to read off
                    // instead of infer. Below it the same labels are a picket fence beside a
                    // 48 px bar, so the threshold is the feature and not a guard on it.
                    if (w >= COORD_PER_CHROM * ctx.canvas.width) {
                        // The visible span of THIS chromosome in bases: the viewport's top and
                        // bottom back through the same mapping, clipped to the chromosome so
                        // no tick is drawn past an end that does not exist.
                        const vTop = Math.max(0, Math.min(c.length, -g.Ywc(0) * MB));
                        const vBot = Math.max(0, Math.min(c.length, -g.Ywc(ctx.canvas.height) * MB));
                        const lo = Math.min(vTop, vBot), hi = Math.max(vTop, vBot);
                        const stepBp = niceStep((hi - lo) / 9);
                        if (stepBp > 0 && hi > lo) {
                            // On the right, unless the bar sits close enough to the edge that
                            // the labels would run off the canvas.
                            const right = (x1 + 96 < ctx.canvas.width);
                            const ax = right ? x1 : x0;
                            const dir = right ? 1 : -1;
                            ctx.save();
                            ctx.textAlign = right ? 'left' : 'right';
                            ctx.textBaseline = 'middle';
                            ctx.strokeStyle = 'rgba(71,85,105,0.55)';
                            ctx.fillStyle = '#475569';
                            ctx.lineWidth = 1;
                            ctx.font = '10.5px ' + FONT;
                            ctx.beginPath();
                            ctx.moveTo(ax + dir * 4, g.Y(wy(lo)));
                            ctx.lineTo(ax + dir * 4, g.Y(wy(hi)));
                            ctx.stroke();
                            for (let bp = Math.ceil(lo / stepBp) * stepBp; bp <= hi + 1; bp += stepBp) {
                                const ty = g.Y(wy(bp));
                                ctx.beginPath();
                                ctx.moveTo(ax + dir * 4, ty);
                                ctx.lineTo(ax + dir * 11, ty);
                                ctx.stroke();
                                ctx.fillText(fmtBp(bp, stepBp), ax + dir * 15, ty);
                            }
                            ctx.restore();
                        }
                    }

                    // THE SELECTED REGIONS on this chromosome, over the banding and under
                    // the variants: a selection is context for what is drawn on top of it.
                    for (let q = 0; q < regions.length; q++) {
                        const rg = regions[q];
                        if (rg.i !== i) continue;
                        const ry0 = g.Y(wy(rg.lo)), ry1 = g.Y(wy(rg.hi));
                        const rt = Math.min(ry0, ry1), rh = Math.max(1.5, Math.abs(ry1 - ry0));
                        const isActive = activeRegion === geneKey(rg);
                        ctx.save();
                        if (isActive) {
                            // Marked out to either side as well as filled: at the zoom the
                            // callouts appear at, a band is a couple of pixels tall and a
                            // change of fill alone would be invisible.
                            ctx.save();
                            ctx.strokeStyle = 'rgba(37,99,235,0.30)';
                            ctx.lineWidth = 1;
                            ctx.setLineDash([3, 3]);
                            ctx.beginPath();
                            ctx.moveTo(x0 - 14, rt + rh / 2); ctx.lineTo(x0 - 3, rt + rh / 2);
                            ctx.moveTo(x1 + 3, rt + rh / 2); ctx.lineTo(x1 + 14, rt + rh / 2);
                            ctx.stroke();
                            ctx.restore();
                        }
                        ctx.fillStyle = isActive ? 'rgba(37,99,235,0.42)' : 'rgba(37,99,235,0.20)';
                        ctx.fillRect(x0, Math.min(rt, rt + rh) - (isActive ? 1 : 0),
                            Math.max(1, x1 - x0), rh + (isActive ? 2 : 0));
                        ctx.strokeStyle = isActive ? '#1d4ed8' : 'rgba(37,99,235,0.85)';
                        ctx.lineWidth = isActive ? 2 : 1.25;
                        ctx.beginPath();
                        ctx.moveTo(x0 - 1, rt); ctx.lineTo(x1 + 1, rt);
                        ctx.moveTo(x0 - 1, rt + rh); ctx.lineTo(x1 + 1, rt + rh);
                        ctx.stroke();
                        // Numbered, because the menu talks about "3 regions" and there has
                        // to be a way to see which three.
                        if (rh > 12 && w > 10) {
                            ctx.fillStyle = '#1d4ed8';
                            ctx.font = '600 10px ' + FONT;
                            ctx.textAlign = 'left';
                            ctx.textBaseline = 'middle';
                            ctx.fillText('' + (q + 1), x1 + 4, rt + rh / 2);
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'top';
                        }
                        ctx.restore();

                        // WHAT IS IN IT, once each gene is tall enough to carry its name.
                        // Drawn past the marks gutter so a name never lands on a variant
                        // mark, and only for a region actually on screen and big enough to
                        // be worth the call.
                        const onScreen = rt < ctx.canvas.height && (rt + rh) > 0;
                        // Below the height where a name fits beside the band, the region
                        // gets a callout instead. Its genes are asked for either way: the
                        // answer is the same one, and it is what the callout is for.
                        if (onScreen && rh < GENE_ASK_PX) {
                            const gcc = geneCache.get(geneKey(rg));
                            if (!gcc) geneAsk(rg);
                            callouts.push({
                                n: q + 1, rg: rg, chrom: c,
                                ax: x1, ay: rt + rh / 2,
                                genes: (gcc && gcc.state === 'done') ? gcc.genes : null,
                            });
                        }
                        if (onScreen && rh >= GENE_ASK_PX) {
                            const gc = geneCache.get(geneKey(rg));
                            if (!gc) { geneAsk(rg); }
                            else if (gc.state === 'done') {
                                ctx.save();
                                ctx.textAlign = 'left';
                                ctx.textBaseline = 'middle';
                                const lx = x1 + 15;
                                let drewG = 0, lastY = -1e9;
                                // THE REPORT'S OWN WORDS for this region, above the
                                // annotation's genes -- the same line the callout card
                                // carries when the region is too small for this. Pinned
                                // to the top of the canvas once the region's top has
                                // scrolled off it, so it stays readable at gene zoom.
                                if (rg.label && rh >= 30) {
                                    ctx.font = '600 10.5px ' + FONT;
                                    ctx.fillStyle = '#9d174d';
                                    const ly0 = Math.max(8, rt + 8);
                                    ctx.fillText(('' + rg.label).slice(0, 70), lx + 7, ly0);
                                    lastY = ly0;
                                }
                                for (const gn of gc.genes) {
                                    if (drewG >= GENE_MAX_LABELS) break;
                                    const a3 = +gn.start, b3 = +gn.end;
                                    if (!isFinite(a3) || !isFinite(b3)) continue;
                                    const ya = g.Y(wy(Math.min(a3, b3)));
                                    const yb = g.Y(wy(Math.max(a3, b3)));
                                    const gt = Math.min(ya, yb), gh = Math.abs(yb - ya);
                                    if (gh < GENE_LABEL_PX) continue;      // no room for a name
                                    const my = gt + gh / 2;
                                    if (my < 6 || my > ctx.canvas.height - 6) continue;
                                    if (my - lastY < GENE_ROW_PX) continue;  // would overlap the one above
                                    lastY = my;
                                    // A bracket for the gene's own extent, so the name is
                                    // attached to a span and not merely near one.
                                    ctx.strokeStyle = gn.coding ? 'rgba(37,99,235,0.85)'
                                        : 'rgba(100,116,139,0.8)';
                                    ctx.lineWidth = 1.3;
                                    ctx.beginPath();
                                    ctx.moveTo(lx, gt); ctx.lineTo(lx, gt + gh);
                                    ctx.moveTo(lx, gt); ctx.lineTo(lx + 4, gt);
                                    ctx.moveTo(lx, gt + gh); ctx.lineTo(lx + 4, gt + gh);
                                    ctx.stroke();
                                    // The strand, as the arrow it is drawn as everywhere
                                    // else: which way the gene is read is half of what its
                                    // name tells you.
                                    const nm = (gn.gene || '') + (gn.strand === '-' ? ' \u25c2' : ' \u25b8');
                                    ctx.font = '600 10.5px ' + FONT;
                                    ctx.fillStyle = gn.coding ? '#1d4ed8' : '#475569';
                                    const two = gh >= 30 && gn.transcript;
                                    ctx.fillText(nm, lx + 7, two ? my - 6 : my);
                                    // The transcript id only where there is room for a
                                    // second line -- it is the thing the editor loads, so
                                    // it is worth showing when it can be shown honestly.
                                    if (two) {
                                        ctx.font = '9.5px ' + FONT;
                                        ctx.fillStyle = '#94a3b8';
                                        ctx.fillText(gn.transcript, lx + 7, my + 6);
                                    }
                                    drewG++;
                                }
                                ctx.restore();
                                ctx.textAlign = 'center';
                                ctx.textBaseline = 'top';
                            }
                        }
                    }

                    // THE SEQUENCE, once a base is tall enough to letter.
                    //
                    // At this zoom the banding is meaningless -- the whole visible strip is
                    // one band -- so the bar is backed in white and the bases are drawn over
                    // it. That backing is also the signal that the view has changed register:
                    // an ideogram above, a sequence here.
                    const pxPerBase = Math.abs(g.Y(wy(1)) - g.Y(wy(0)));
                    // The letter is sized by the vertical room first -- that is the axis the
                    // bases stack on, and the only axis that decides whether they have come
                    // apart -- then trimmed to the horizontal room the slot leaves, so a
                    // narrow bar shows a small sequence instead of none. The slot, not the
                    // bar, is the horizontal budget: the gap either side belongs to this
                    // chromosome and to no other, so the letters may spill into it.
                    const slotPx = Math.abs(g.X(slotOf(i) + SLOT / 2) - g.X(slotOf(i) - SLOT / 2));
                    const fpx = Math.min(SEQ_FONT_MAX, pxPerBase * 0.82,
                        (slotPx * 0.92) / SEQ_ASPECT);
                    if (pxPerBase >= SEQ_MIN_PX && fpx >= SEQ_FONT_MIN) {
                        const sTop = Math.max(1, Math.min(c.length, -g.Ywc(0) * MB));
                        const sBot = Math.max(1, Math.min(c.length, -g.Ywc(ctx.canvas.height) * MB));
                        const bLo = Math.max(1, Math.floor(Math.min(sTop, sBot)));
                        const bHi = Math.min(c.length, Math.ceil(Math.max(sTop, sBot)));
                        if (bHi >= bLo) {
                            // Ask for the chunks this window needs. Whatever has not arrived
                            // simply is not drawn -- no placeholder, so nothing shifts when
                            // it lands.
                            const kLo = Math.floor((bLo - 1) / SEQ_CHUNK);
                            const kHi = Math.floor((bHi - 1) / SEQ_CHUNK);
                            for (let k = kLo; k <= kHi && (k - kLo) < SEQ_MAX_CHUNKS; k++) {
                                if (!seqCache.has(seqKey(c.name, k))) seqAsk(c.name, k);
                            }
                            // The bar is far wider than the screen at this zoom, so the
                            // letters follow the VISIBLE middle of it rather than the middle
                            // of the bar, which would be off-canvas.
                            const vx0 = Math.max(x0, 0), vx1 = Math.min(x1, ctx.canvas.width);
                            const cxm = (vx0 + vx1) / 2;
                            // The white backing has to be at least as wide as a glyph, or a
                            // letter drawn on a bar thinner than itself hangs off its own
                            // background and is read against the banding behind it.
                            const halfW = Math.max((vx1 - vx0) / 2, fpx * SEQ_ASPECT / 2 + 1.5);
                            const wx0 = Math.max(0, cxm - halfW);
                            const wx1 = Math.min(ctx.canvas.width, cxm + halfW);
                            ctx.save();
                            ctx.fillStyle = 'rgba(255,255,255,0.93)';
                            ctx.fillRect(wx0, Math.max(0, g.Y(wy(bLo - 1))),
                                Math.max(0, wx1 - wx0),
                                Math.min(ctx.canvas.height, g.Y(wy(bHi))) - Math.max(0, g.Y(wy(bLo - 1))));
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.font = '600 ' + fpx.toFixed(1) + 'px ui-monospace, SFMono-Regular, '
                                + 'Menlo, Consolas, monospace';
                            let drew = 0;
                            for (let bp = bLo; bp <= bHi; bp++) {
                                const ch = seqBaseAt(c.name, bp);
                                if (!ch) continue;
                                // Centred on the base's OWN span. A base occupies [bp-1, bp)
                                // in this mapping, so lettering its edge would put every
                                // character half a base out of register with the ruler.
                                const ty = g.Y(wy(bp - 0.5));
                                if (ty < -fpx || ty > ctx.canvas.height + fpx) continue;
                                ctx.fillStyle = BASE_COLOR[ch] || '#475569';
                                ctx.fillText(ch, cxm, ty);
                                drew++;
                            }
                            if (!drew && !seqOff) {
                                ctx.fillStyle = '#94a3b8';
                                ctx.font = '11px ' + FONT;
                                ctx.fillText('reading the sequence…', cxm, ctx.canvas.height / 2);
                            }
                            ctx.restore();
                        }
                    }

                    // The name under the long arm, and its length beside it once there is
                    // room for both.
                    if (w > 8) {
                        const cx = (x0 + x1) / 2;
                        ctx.fillStyle = '#0f172a';
                        ctx.font = '600 ' + Math.max(9, Math.min(13, w * 0.42)) + 'px ' + FONT;
                        ctx.fillText(c.name.replace(/^chr/, ''), cx, yBot + 6);
                        if (w > 26) {
                            ctx.fillStyle = '#64748b';
                            ctx.font = '10px ' + FONT;
                            ctx.fillText(Math.round(c.length / MB) + ' Mb', cx, yBot + 22);
                        }
                    }
                }

                // VARIANTS.
                //
                // COST DOES NOT GROW WITH THE FILE. Two modes, chosen per chromosome from how
                // many variants are actually in view:
                //
                //   few    drawn one at a time, with the glow, the edge and the name -- the
                //          twenty someone pasted, or a zoomed-in window of a big file.
                //   many   drawn from the histogram built at load: one strip per bin, so a
                //          chromosome carrying two hundred thousand variants costs the same
                //          2048 bins as one carrying ten. Nothing iterates the variants.
                //
                // The threshold is a count, not a zoom level, because that is the thing that
                // actually decides whether individual marks are readable or a smear.
                // ---- PATENTS, IN A PASS OF THEIR OWN ---------------------------------
                //
                // NOT INSIDE THE VARIANT LOOP, which is where both of these used to live.
                // That loop runs under `if (vtotal)` and skips every chromosome carrying no
                // variants, and the strip sat in its DENSITY branch besides. So the button
                // read its twenty-one million hits, set patOn, reported the count -- and drew
                // nothing whatsoever until a VCF had been loaded, then lost the strip again
                // the moment the zoom went deep enough to draw individual marks. It looked
                // like a dead button because the only thing it changed was a number in the
                // status line.
                //
                // patAt(), which takes the clicks, never had that condition: it answers on
                // `patOn && patHist` alone. The strip was therefore clickable in a gutter
                // with nothing painted in it, which is the same disagreement seen from the
                // other side.
                //
                // Patents are a fact about the genome, not about the file someone happens to
                // have opened, so this pass is gated on patent state and nothing else.
                if (patOn && patHist) {
                    ctx.save();
                    for (let ci = 0; ci < drawn.length; ci++) {
                        const c = drawn[ci];
                        if (c.circular) continue;   // drawn on the ring, with the ring
                        const bx0 = g.X(barLeft(ci)), bx1 = g.X(barRight(ci));
                        if (bx1 < -30 || bx0 > ctx.canvas.width + 120) continue;
                        const bw = bx1 - bx0;

                        // The visible window of THIS chromosome, in bases -- the same
                        // derivation the variant pass uses, so the two line up.
                        const vA = -g.Ywc(0) * MB, vB = -g.Ywc(ctx.canvas.height) * MB;
                        const lo = Math.max(0, Math.min(c.length, Math.min(vA, vB)));
                        const hi = Math.min(c.length, Math.max(0, Math.max(vA, vB)));
                        if (hi <= lo) continue;

                        // The strip is binned on the variant histogram's geometry so the two
                        // gutters are read the same way, whether or not any variants exist.
                        const scale = HIST_BINS / c.length;
                        const b0 = Math.max(0, Math.floor(lo * scale));
                        const b1 = Math.min(HIST_BINS - 1, Math.ceil(hi * scale));
                        const maxW = Math.max(6, Math.min(26, bw * 0.55));

                        // THE NAMES, INSIDE THE BAR, once it is wide enough to hold them
                        // and the window is small enough to ask about.
                        //
                        // GUARDED, because this is a decoration and the frame it sits in
                        // is not. paint() builds the click targets -- the callout cards'
                        // rectangles are pushed near the END of it -- so anything that
                        // throws here takes the rest of the frame with it and leaves
                        // calloutHits empty while the previous frame's cards are still on
                        // screen: the cards look present and stop answering the mouse.
                        // The failure is reported once rather than silently swallowed.
                        try {
                        if (bw >= PAT_LABEL_MIN_W) {
                            const wlo = Math.max(1, Math.floor(lo));
                            const whi = Math.min(c.length, Math.ceil(hi));
                            // Rounded to a stable window so panning by a pixel does not
                            // ask the server a new question every frame.
                            const STEP = 250000;
                            const qlo = Math.max(1, Math.floor(wlo / STEP) * STEP);
                            const qhi = Math.min(c.length, Math.ceil(whi / STEP) * STEP);
                            // HOW MUCH OF A CHROMOSOME MAY BE ASKED ABOUT AT ONCE. This was
                            // 20 Mb, which is a quarter of chr17 and a twelfth of chr1 -- so
                            // zooming onto a chromosome to look at its patents, the obvious
                            // way to use this, asked for nothing and drew nothing, with the
                            // strip visible beside it the whole time. The cap is now the
                            // longest chromosome there is, so a whole one always qualifies.
                            //
                            // Measured before raising it: chr17 end to end is 3.6 s on the
                            // server, 14,739 transcripts and 416 patents, and the answer is
                            // cached per rounded window and asked for once. What bounds the
                            // number of these in flight is the bar width above -- a genome-
                            // wide view has bars far too narrow to hold a label, so nothing
                            // is asked at all until the view is down to a few chromosomes.
                            if (qhi > qlo && (qhi - qlo) <= 260000000) {
                                const kk = patLabelKey(ci, qlo, qhi);
                                const rec = patLabels.get(kk);
                                if (!rec) { patLabelsAsk(ci, qlo, qhi); }
                                else if (rec.state === 'done' && rec.list.length) {
                                    // LABELS THAT STAY ON THE CANVAS AND NEAR THEIR STRIP MARK.
                                    //
                                    // The top patents claim large, overlapping spans, so many
                                    // anchor at almost the same Y. Rather than stack them into a
                                    // column that runs off the bottom of the screen, anchors that
                                    // would overlap are MERGED into one summary -- "US1234 +5
                                    // more…" -- clickable to open the full list for that stretch.
                                    // Every label is then placed as close to its strip mark as it
                                    // can go without overlapping a neighbour, and clamped so none
                                    // leaves the canvas. A leader line ties each back to the
                                    // density strip (the sequence histogram) it refers to.
                                    const H = ctx.canvas.height;
                                    const cx = (bx0 + bx1) / 2;
                                    const stripX = bx0 - 3;         // right edge of the density strip
                                    const MAXW = Math.max(120, Math.min(320, bw - 10));
                                    const TOP_PAD = 6, BOT_PAD = 6, GAP = 2, CLUSTER_GAP = 14;
                                    const clampY = (v) => Math.max(TOP_PAD, Math.min(H - BOT_PAD, v));
                                    const anchored = [];
                                    for (const q2 of rec.list) {
                                        const s = +q2.start, e = +q2.end;
                                        const ay = g.Y(wy((s + e) / 2));
                                        if (ay < -30 || ay > H + 30) continue;   // far off-screen: skip; near-edge is clamped
                                        anchored.push({ q: q2, ay: clampY(ay), s: s, e: e });
                                    }
                                    if (anchored.length) {
                                        anchored.sort((a, b) => a.ay - b.ay);
                                        // MERGE overlapping anchors into clusters.
                                        const clusters = [];
                                        for (const a of anchored) {
                                            const last = clusters[clusters.length - 1];
                                            if (last && a.ay - last.lastAy <= CLUSTER_GAP) {
                                                last.members.push(a); last.lastAy = a.ay;
                                                last.loBp = Math.min(last.loBp, a.s); last.hiBp = Math.max(last.hiBp, a.e);
                                                last.hits += (+a.q.hits || 0);
                                            } else {
                                                clusters.push({ members: [a], lastAy: a.ay, loBp: a.s, hiBp: a.e, hits: (+a.q.hits || 0) });
                                            }
                                        }
                                        // Title + dates only for a lone patent, and only when the
                                        // bar is wide and there are few labels.
                                        const showExtra = (bw >= 240 && clusters.length <= 12);
                                        // THE GENES the patents sit in, drawn at their loci
                                        // ALWAYS (whenever the patent labels are drawn), not only
                                        // when the metadata text is showing. One window fetch,
                                        // throttled and cached, not one per patent.
                                        let glist = null;
                                        {
                                            const wg = winGenes.get(ci + ':' + qlo + ':' + qhi);
                                            if (!wg) winGenesAsk(ci, qlo, qhi);
                                            else if (wg.state === 'done') glist = wg.genes;
                                        }
                                        ctx.save();
                                        ctx.textBaseline = 'middle';
                                        ctx.textAlign = 'left';
                                        // Measure each label (single or summary) before placing.
                                        const recs = clusters.map((cl) => {
                                            const ay = cl.members.reduce((s, m) => s + m.ay, 0) / cl.members.length;
                                            const sBp = (cl.members.length === 1) ? cl.members[0].s : cl.loBp;
                                            const eBp = (cl.members.length === 1) ? cl.members[0].e : cl.hiBp;
                                            const lines = [];
                                            let txt, numOnly = '', isCluster = false;
                                            ctx.font = '600 10px ' + FONT;
                                            if (cl.members.length === 1) {
                                                const q2 = cl.members[0].q;
                                                txt = '' + (q2.label || q2.id || '');
                                                numOnly = txt.split(' ')[0];
                                                if (ctx.measureText(txt).width > MAXW) txt = numOnly;
                                                if (showExtra) {
                                                    const dates = [q2.filed ? ('filed ' + q2.filed) : '',
                                                                   q2.granted ? ('granted ' + q2.granted) : '']
                                                        .filter(Boolean).join('  ·  ');
                                                    let ttl = '' + (q2.title || '');
                                                    if (ttl) {
                                                        ctx.font = '500 9px ' + FONT;
                                                        while (ttl.length > 8 && ctx.measureText(ttl).width > MAXW) ttl = ttl.slice(0, -2);
                                                        if (ttl.length < ('' + q2.title).length) ttl += '…';
                                                        lines.push(ttl);
                                                    }
                                                    if (dates) lines.push(dates);
                                                    ctx.font = '600 10px ' + FONT;
                                                }
                                            } else {
                                                // A SHORT SUMMARY AND THEN "…": the top patent's
                                                // number and how many more share this stretch.
                                                isCluster = true;
                                                const top = cl.members[0].q;
                                                numOnly = ('' + (top.label || top.id || '')).split(' ')[0];
                                                txt = numOnly + '  +' + (cl.members.length - 1) + ' more…';
                                                if (ctx.measureText(txt).width > MAXW) txt = cl.members.length + ' patents…';
                                            }
                                            ctx.font = '600 10px ' + FONT;
                                            let boxW = ctx.measureText(txt).width;
                                            if (lines.length) {
                                                ctx.font = '500 9px ' + FONT;
                                                for (const ln of lines) boxW = Math.max(boxW, ctx.measureText(ln).width);
                                                ctx.font = '600 10px ' + FONT;
                                            }
                                            boxW += 10;
                                            const rowH = lines.length ? (16 + lines.length * 10) : 13;
                                            return { ay: ay, rowH: rowH, boxW: boxW, txt: txt, numOnly: numOnly, lines: lines, isCluster: isCluster, cl: cl, sBp: sBp, eBp: eBp };
                                        });
                                        // PLACE near each anchor, no overlaps, none off canvas: a
                                        // downward pass opens room below, an upward pass pulls the
                                        // tail back inside the bottom edge.
                                        recs.sort((a, b) => a.ay - b.ay);
                                        for (const rr of recs) rr.top = rr.ay - rr.rowH / 2;
                                        let cur = TOP_PAD;
                                        for (const rr of recs) { if (rr.top < cur) rr.top = cur; cur = rr.top + rr.rowH + GAP; }
                                        let limit = H - BOT_PAD;
                                        for (let i = recs.length - 1; i >= 0; i--) {
                                            const rr = recs[i];
                                            if (rr.top + rr.rowH > limit) rr.top = limit - rr.rowH;
                                            if (rr.top < TOP_PAD) rr.top = TOP_PAD;
                                            limit = rr.top - GAP;
                                        }
                                        // THE GENES AT THEIR OWN LOCI. The patent text is left as
                                        // it was; the genes the patents sit in are drawn where
                                        // they actually are -- the symbol on its locus and its
                                        // range banded in green -- whenever the patent labels are
                                        // drawn, whether or not the metadata text is showing.
                                        // Collected across the patent blocks, deduped, symbols
                                        // decluttered. NB: `g` is the graph here, so a gene is `gn`.
                                        if (glist) {
                                            const seen = new Set();
                                            const grecs = [];
                                            for (const rr of recs) {
                                                for (const gn of glist) {
                                                    if (+gn.end < rr.sBp) continue;
                                                    if (+gn.start > rr.eBp) break;
                                                    const sym = gn.gene;
                                                    if (!sym || seen.has(sym)) continue;
                                                    seen.add(sym);
                                                    grecs.push({ sym: sym, s: +gn.start, e: +gn.end, ay: clampY(g.Y(wy(((+gn.start) + (+gn.end)) / 2))) });
                                                }
                                            }
                                            grecs.sort((a, b) => a.ay - b.ay);
                                            // Range bands over each gene's extent.
                                            ctx.save();
                                            ctx.fillStyle = 'rgba(16,185,129,0.16)';
                                            ctx.strokeStyle = 'rgba(5,150,105,0.55)';
                                            ctx.lineWidth = 1;
                                            for (const gg of grecs) {
                                                let yA = g.Y(wy(gg.s)), yB = g.Y(wy(gg.e));
                                                if (yA > yB) { const t = yA; yA = yB; yB = t; }
                                                yA = Math.max(-2, yA); yB = Math.min(H + 2, yB);
                                                if (yB < 0 || yA > H) continue;
                                                const hgt = Math.max(2, yB - yA);
                                                ctx.fillRect(bx0, yA, Math.max(2, bx1 - bx0), hgt);
                                                ctx.strokeRect(bx0 + 0.5, yA + 0.5, Math.max(2, bx1 - bx0) - 1, hgt - 1);
                                            }
                                            ctx.restore();
                                            // Symbols on their loci, left edge of the bar, decluttered.
                                            ctx.save();
                                            ctx.font = '700 10px ' + FONT;
                                            ctx.textAlign = 'left';
                                            ctx.textBaseline = 'middle';
                                            let prevB = -1e9;
                                            for (const gg of grecs) {
                                                let sy = Math.max(prevB + 12, gg.ay);
                                                if (sy > H - 4) break;
                                                prevB = sy;
                                                const tw = ctx.measureText(gg.sym).width;
                                                const sx = bx0 + 4;
                                                // A tick back to the true locus when the symbol was
                                                // pushed off it by the declutter.
                                                if (Math.abs(sy - gg.ay) > 3) {
                                                    ctx.strokeStyle = 'rgba(5,150,105,0.6)';
                                                    ctx.lineWidth = 1;
                                                    ctx.beginPath();
                                                    ctx.moveTo(sx - 3, sy);
                                                    ctx.lineTo(bx0 + 1, gg.ay);
                                                    ctx.stroke();
                                                }
                                                ctx.fillStyle = '#ecfdf5';
                                                ctx.fillRect(sx - 2, sy - 6, tw + 4, 12);
                                                ctx.strokeStyle = 'rgba(5,150,105,0.45)';
                                                ctx.lineWidth = 1;
                                                ctx.strokeRect(sx - 2 + 0.5, sy - 6 + 0.5, tw + 4 - 1, 12 - 1);
                                                ctx.fillStyle = '#065f46';
                                                ctx.fillText(gg.sym, sx, sy);
                                            }
                                            ctx.restore();
                                            ctx.textAlign = 'center';
                                            ctx.textBaseline = 'top';
                                        }
                                        for (const rr of recs) {
                                            const top = rr.top;
                                            const lx0 = cx - rr.boxW / 2;
                                            const ap = clampY(rr.ay);
                                            // Leader line back to the strip mark.
                                            ctx.strokeStyle = 'rgba(180,83,9,0.55)';
                                            ctx.lineWidth = 1;
                                            ctx.beginPath();
                                            ctx.moveTo(lx0 - 2, top + rr.rowH / 2);
                                            ctx.lineTo(stripX, ap);
                                            ctx.stroke();
                                            ctx.fillStyle = 'rgba(180,83,9,0.95)';
                                            ctx.beginPath(); ctx.arc(stripX, ap, 2, 0, 2 * Math.PI); ctx.fill();
                                            // A SOLID BACKFILL so the patent text reads over the
                                            // green gene bands and the marks behind it -- fully
                                            // opaque, with a soft shadow and a thin border to lift
                                            // it off the noise. A summary gets a faint amber body.
                                            ctx.save();
                                            ctx.shadowColor = 'rgba(8,22,38,0.35)';
                                            ctx.shadowBlur = 4;
                                            ctx.shadowOffsetY = 1;
                                            ctx.fillStyle = rr.isCluster ? '#fff4e6' : '#ffffff';
                                            ctx.fillRect(lx0, top, rr.boxW, rr.rowH);
                                            ctx.restore();
                                            ctx.strokeStyle = 'rgba(124,45,18,0.35)';
                                            ctx.lineWidth = 1;
                                            ctx.strokeRect(lx0 + 0.5, top + 0.5, rr.boxW - 1, rr.rowH - 1);
                                            ctx.fillStyle = '#7c2d12';
                                            ctx.font = '600 10px ' + FONT;
                                            ctx.fillText(rr.txt, lx0 + 5, rr.lines.length ? (top + 8) : (top + rr.rowH / 2));
                                            if (rr.lines.length) {
                                                ctx.font = '500 9px ' + FONT;
                                                ctx.fillStyle = '#9a3412';
                                                let ey = top + 18;
                                                for (const ln of rr.lines) { ctx.fillText(ln, lx0 + 5, ey); ey += 10; }
                                                ctx.font = '600 10px ' + FONT;
                                                ctx.fillStyle = '#7c2d12';
                                            }
                                            if (!rr.isCluster) {
                                                const numW = ctx.measureText(rr.numOnly).width;
                                                ctx.fillRect(lx0 + 5, rr.lines.length ? (top + 13) : (top + rr.rowH / 2 + 6), numW, 0.8);
                                                const q2 = rr.cl.members[0].q;
                                                patLabelHits.push({
                                                    x: lx0, y: top, w: rr.boxW, h: rr.rowH,
                                                    id: '' + (q2.id || ''), label: '' + (q2.label || ''),
                                                    title: q2.title || '', filed: q2.filed || '', granted: q2.granted || '',
                                                    assignee: q2.assignee || '', hits: q2.hits, transcripts: q2.transcripts,
                                                    where: c.name + ':' + human(Math.max(1, Math.floor(+q2.start || 0)))
                                                        + '-' + human(Math.ceil(+q2.end || 0)),
                                                });
                                            } else {
                                                patLabelHits.push({
                                                    x: lx0, y: top, w: rr.boxW, h: rr.rowH, cluster: true, ci: ci,
                                                    lo: Math.max(1, Math.floor(rr.cl.loBp)), hi: Math.min(c.length, Math.ceil(rr.cl.hiBp)),
                                                    n: rr.cl.hits,
                                                });
                                            }
                                        }
                                        ctx.restore();
                                        ctx.textAlign = 'center';
                                        ctx.textBaseline = 'top';
                                    }
                                }
                            }
                        }

                        } catch (e) {
                            if (!patLabelFailed) {
                                patLabelFailed = true;
                                step('patent labels threw, drawing without them: '
                                    + (e && e.message ? e.message : e)
                                    + (e && e.stack ? ' | ' + e.stack.split('\n')[1] : ''));
                            }
                        }

                        // PATENTS, DOWN THE LEFT. Log-scaled on the same rule as the
                        // variant strip opposite -- the busiest bin in the genome is the
                        // full width -- so the two sides are read the same way. Its own
                        // color, because it is a different fact about the same place.
                        if (patHist[ci] && patMax > 0) {
                            const ph = patHist[ci];
                            const plp = Math.log(patMax + 1) || 1;
                            ctx.fillStyle = 'rgba(180,83,9,0.75)';
                            for (let b = b0; b <= b1; b++) {
                                const n2 = ph[b];
                                if (!n2) continue;
                                const yA3 = g.Y(wy(b / scale));
                                const yB3 = g.Y(wy((b + 1) / scale));
                                if (yB3 < -4 || yA3 > ctx.canvas.height + 4) continue;
                                const h4 = Math.max(1, yB3 - yA3);
                                const w4 = 2 + maxW * (Math.log(n2 + 1) / plp);
                                ctx.fillRect(bx0 - 2 - w4, yA3, w4, h4);
                            }
                        }
                    }
                    ctx.restore();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                }

                if (vtotal) {
                    ctx.save();
                    // WHAT IS ALREADY WRITTEN INSIDE A BAR this frame: the patent names, laid
                    // out by the pass above. Both want the middle of the same bar at the same
                    // zoom, and two labels in one place is worse than one label and a mark, so
                    // a variant's metadata declines the space rather than printing over them.
                    const metaClear = (x, y, w, h) => {
                        for (const l of patLabelHits) {
                            if (x < l.x + l.w && x + w > l.x && y < l.y + l.h && y + h > l.y) {
                                return false;
                            }
                        }
                        return true;
                    };
                    for (let ci = 0; ci < drawn.length; ci++) {
                        const d = vdata[ci];
                        if (!d.n) continue;
                        const c = drawn[ci];
                        if (c.circular) continue;   // drawn on the ring, with the ring
                        const bx0 = g.X(barLeft(ci)), bx1 = g.X(barRight(ci));
                        if (bx1 < -30 || bx0 > ctx.canvas.width + 120) continue;
                        const bw = bx1 - bx0;

                        // The visible window of THIS chromosome, in bases.
                        const vA = -g.Ywc(0) * MB, vB = -g.Ywc(ctx.canvas.height) * MB;
                        const lo = Math.max(0, Math.min(c.length, Math.min(vA, vB)));
                        const hi = Math.min(c.length, Math.max(0, Math.max(vA, vB)));
                        if (hi <= lo) continue;

                        // How many are in view, from the histogram -- 2048 additions at worst,
                        // whatever the file size.
                        const scale = HIST_BINS / c.length;
                        let b0 = Math.max(0, Math.floor(lo * scale));
                        let b1 = Math.min(HIST_BINS - 1, Math.ceil(hi * scale));
                        let inView = 0;
                        for (let b = b0; b <= b1; b++) inView += d.hist[b];
                        if (!inView) continue;

                        if (inView <= EXACT_MAX) {
                            // Binary search the sorted positions for the window, then draw
                            // only those.
                            let a = 0, z = d.n;
                            while (a < z) { const m = (a + z) >> 1; if (d.pos[m] < lo) a = m + 1; else z = m; }
                            const r = Math.max(3.4, Math.min(7, bw * 0.16));
                            // The last row of in-bar metadata, so the next one can refuse to
                            // overlap it. Per chromosome: they are laid out down a bar.
                            let lastMetaY = -1e9;
                            for (let k = a; k < d.n && d.pos[k] <= hi; k++) {
                                const my = g.Y(wy(d.pos[k]));
                                if (my < -10 || my > ctx.canvas.height + 10) continue;
                                const col = colorOf(d, k);
                                if (bw > 60) {
                                    ctx.strokeStyle = col;
                                    ctx.globalAlpha = 0.9;
                                    ctx.lineWidth = 1.5;
                                    ctx.beginPath();
                                    ctx.moveTo(bx0, my); ctx.lineTo(bx1, my);
                                    ctx.stroke();
                                    ctx.globalAlpha = 1;
                                }
                                ctx.shadowColor = col;
                                ctx.shadowBlur = 8;
                                ctx.fillStyle = col;
                                ctx.beginPath();
                                ctx.moveTo(bx1 + 1, my);
                                ctx.lineTo(bx1 + 1 + r * 1.6, my - r);
                                ctx.lineTo(bx1 + 1 + r * 1.6, my + r);
                                ctx.closePath();
                                ctx.fill();
                                ctx.fill();                     // twice: the glow compounds
                                ctx.shadowBlur = 0;
                                // A DARK EDGE, not a white one. Brighter is lighter, so the
                                // saturated fills lose contrast against the pale grounds these
                                // mostly sit on -- amber on nucleoplasm measures 1.67:1, which
                                // is not an edge. Dark defines the shape on anything pale; on a
                                // dark band the outline disappears and the fill and its glow
                                // carry it. Between them every ground is covered.
                                ctx.strokeStyle = 'rgba(15,23,42,0.8)';
                                ctx.lineWidth = 1.2;
                                ctx.stroke();
                                if (bw >= COORD_PER_CHROM * ctx.canvas.width) {
                                    const o = snpAt(ci, k);
                                    const nm = (o && o.name) || (d.names[k] || (c.name + ':' + d.pos[k]));
                                    ctx.font = '700 10.5px ' + FONT;
                                    ctx.textAlign = 'left';
                                    ctx.textBaseline = 'middle';
                                    const tw3 = ctx.measureText(nm).width;
                                    ctx.fillStyle = 'rgba(255,255,255,0.88)';
                                    ctx.fillRect(bx1 + r * 1.6 + 4, my - 7.5, tw3 + 6, 15);
                                    ctx.fillStyle = col;
                                    ctx.fillText(nm, bx1 + r * 1.6 + 7, my);
                                }
                                // THE METADATA, INSIDE THE CHROMOSOME.
                                //
                                // Zoomed in this far the bar is a wide empty ribbon with a
                                // hairline across it per variant, and everything that says what
                                // the variant IS lives outside it: a name to the right, and the
                                // rest only in the card a click away. The bar is the widest
                                // clear space on the screen and it is directly on the thing
                                // being described, so the change and how it was classified go
                                // in there -- the two facts that decide whether a mark is worth
                                // clicking at all.
                                //
                                // WHEN THE SPACE PERMITS, and measured rather than assumed: the
                                // text is fitted to the bar, dropping the classification before
                                // the alleles because A>T with no verdict still says something
                                // and a verdict with no change does not. Rows that would touch
                                // are skipped, and so is anything that would land on a patent
                                // name already written there.
                                if (bw >= VAR_META_MIN_W && (my - lastMetaY) >= VAR_META_PX) {
                                    const ab = allelesAt(ci, k);
                                    // An indel's alleles run to hundreds of bases; the head of
                                    // one says which way it goes, which is all that fits.
                                    const brief = (t2) => (t2.length > 6 ? t2.slice(0, 5) + '\u2026' : t2);
                                    const change = brief(ab[0]) + '>' + brief(ab[1]);
                                    const annot = ((d.hl && d.hl[k]) ? HL_NAME[d.hl[k]] : '')
                                        || modeAnnot(d, k) || CLS_SHORT[d.cls[k]];
                                    ctx.font = '600 9.5px ' + FONT;
                                    ctx.textAlign = 'left';
                                    ctx.textBaseline = 'middle';
                                    let txt = annot ? (change + ' \u00b7 ' + annot) : change;
                                    if (ctx.measureText(txt).width > bw - 10) txt = change;
                                    const tw4 = ctx.measureText(txt).width;
                                    if (tw4 <= bw - 10) {
                                        const mx = bx0 + 5;
                                        if (metaClear(mx - 2, my - 6.5, tw4 + 4, 13)) {
                                            lastMetaY = my;
                                            // A backing, because a bar is a stained band and
                                            // the stain is whatever the cytogenetics said.
                                            ctx.fillStyle = 'rgba(255,255,255,0.86)';
                                            ctx.fillRect(mx - 2, my - 6.5, tw4 + 4, 13);
                                            ctx.fillStyle = col;
                                            ctx.fillText(txt, mx, my);
                                        }
                                    }
                                }
                            }
                        } else {
                            // DENSITY. One strip per histogram bin that falls in view, its
                            // width scaled by count against the busiest bin on screen, so the
                            // picture reads as where the variants are rather than as a solid
                            // block. Log, because coverage across a genome spans orders of
                            // magnitude and a linear scale shows one peak and nothing else.
                            let peak = 1;
                            for (let b = b0; b <= b1; b++) if (d.hist[b] > peak) peak = d.hist[b];
                            const lp = Math.log(peak + 1);
                            const maxW = Math.max(6, Math.min(26, bw * 0.55));
                            ctx.globalAlpha = 1;

                            for (let b = b0; b <= b1; b++) {
                                const n = d.hist[b];
                                if (!n) continue;
                                const yA = g.Y(wy(b / scale));
                                const yB = g.Y(wy((b + 1) / scale));
                                const h2 = Math.max(1, yB - yA);
                                if (yB < -4 || yA > ctx.canvas.height + 4) continue;
                                const f = Math.log(n + 1) / lp;
                                // The strips are every variant, matched or not, so under a
                                // filter they become the background the matches sit on.
                                if (hlActive) {
                                    ctx.fillStyle = 'rgba(148,163,184,' + (0.30 + 0.35 * f).toFixed(3) + ')';
                                    ctx.fillRect(bx1 + 2, yA, 2 + maxW * f, h2);
                                } else {
                                    // Segments in proportion to the categories in the bin,
                                    // in category order so the colors stack the same way
                                    // down the whole chromosome.
                                    const hb = binsBy(d), pal = modePalette();
                                    const wAll = 2 + maxW * f, alpha = 0.45 + 0.55 * f;
                                    let x2 = bx1 + 2;
                                    for (let cat = 0; cat < NCAT; cat++) {
                                        const cnt = hb[b * NCAT + cat];
                                        if (!cnt) continue;
                                        const w2 = wAll * cnt / n;
                                        ctx.fillStyle = withAlpha(pal[cat] || CLS_COLOR[0], alpha);
                                        ctx.fillRect(x2, yA, w2, h2);
                                        x2 += w2;
                                    }
                                }
                            }
                            // THE MATCHES, on the same bins and the same scale, so the
                            // magenta reads as "this much of that density" rather than as
                            // a second unrelated chart. Always a subset, so never wider
                            // than the grey underneath it.
                            if (hlActive && d.hlHist) {
                                let hlInView = 0;
                                for (let b = b0; b <= b1; b++) hlInView += d.hlHist[b];
                                if (hlInView) {
                                    if (hlInView <= EXACT_MAX && d.hlIdx && d.hlIdx.length) {
                                        // Few enough to place exactly: a hairline strip is
                                        // not visible, and a handful of coding variants on
                                        // a busy chromosome is the case that matters most.
                                        const idx2 = d.hlIdx;
                                        let a4 = 0, z4 = idx2.length;
                                        while (a4 < z4) {
                                            const m4 = (a4 + z4) >> 1;
                                            if (d.pos[idx2[m4]] < lo) a4 = m4 + 1; else z4 = m4;
                                        }
                                        // Pulsing GLOW so a marked variant reads even zoomed right
                                        // out: a translucent halo behind a solid core, the halo
                                        // swelling and brightening with __hlPulse. NOT canvas
                                        // shadowBlur -- that re-blurs on every fill and, with
                                        // hundreds of dots repainted several times a second, was
                                        // the whole cost of the effect. Two plain fills per dot is
                                        // a fraction of that and looks the same.
                                        const rr2 = Math.max(2, Math.min(4.5, bw * 0.14));
                                        const puls = __hlPulse;
                                        const haloR = rr2 * (2.1 + 1.3 * puls);
                                        const haloA = 0.16 + 0.30 * puls;
                                        ctx.save();
                                        for (let j2 = a4; j2 < idx2.length; j2++) {
                                            const k2 = idx2[j2];
                                            if (d.pos[k2] > hi) break;
                                            const yh = g.Y(wy(d.pos[k2]));
                                            if (yh < -6 || yh > ctx.canvas.height + 6) continue;
                                            const col = HL_COLOR[d.hl[k2]] || HL_COLOR[1];
                                            ctx.fillStyle = col;
                                            ctx.globalAlpha = haloA;
                                            ctx.beginPath();
                                            ctx.arc(bx1 + 6, yh, haloR, 0, Math.PI * 2);
                                            ctx.fill();
                                            ctx.globalAlpha = 1;
                                            ctx.beginPath();
                                            ctx.arc(bx1 + 6, yh, rr2, 0, Math.PI * 2);
                                            ctx.fill();
                                        }
                                        ctx.restore();
                                    } else {
                                        // Density bars, glowing the cheap way too: a translucent
                                        // over-wide bar behind the solid one, no shadowBlur.
                                        const barCol = HL_COLOR[hlActive] || HL_COLOR[1];
                                        const glowA = 0.14 + 0.30 * __hlPulse;
                                        const grow = 1.25 + 0.35 * __hlPulse;
                                        ctx.save();
                                        ctx.fillStyle = barCol;
                                        for (let b = b0; b <= b1; b++) {
                                            const nh = d.hlHist[b];
                                            if (!nh) continue;
                                            const yA2 = g.Y(wy(b / scale));
                                            const yB2 = g.Y(wy((b + 1) / scale));
                                            if (yB2 < -4 || yA2 > ctx.canvas.height + 4) continue;
                                            const h3 = Math.max(1, yB2 - yA2);
                                            const f2 = Math.log(nh + 1) / lp;
                                            const w = 2 + maxW * f2;
                                            ctx.globalAlpha = glowA;
                                            ctx.fillRect(bx1 + 2, yA2 - 1, w * grow, h3 + 2);
                                            ctx.globalAlpha = 1;
                                            ctx.fillRect(bx1 + 2, yA2, w, h3);
                                        }
                                        ctx.restore();
                                    }
                                }
                            }
                        }
                    }
                    ctx.restore();
                }

                // THE SHARED AXIS. One scale for the whole karyotype, because there is one
                // scale: position 0 is the same line on every chromosome and a megabase is the
                // same distance on all of them. Pinned to the left edge of the canvas rather
                // than to the drawing, so it stays readable while the view is panned.
                if (drawn.length && (g.X(barRight(0)) - g.X(barLeft(0))) >= COORD_FRACTION * ctx.canvas.width) {
                    const vTop = -g.Ywc(0) * MB;
                    const vBot = -g.Ywc(ctx.canvas.height) * MB;
                    const lo = Math.max(0, Math.min(vTop, vBot));
                    const hi = Math.min(maxMb * MB, Math.max(vTop, vBot));
                    const stepBp = niceStep((hi - lo) / 9);
                    if (stepBp > 0 && hi > lo) {
                        ctx.save();
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.font = '10.5px ' + FONT;
                        ctx.strokeStyle = 'rgba(71,85,105,0.45)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(9, g.Y(wy(lo)));
                        ctx.lineTo(9, g.Y(wy(hi)));
                        ctx.stroke();
                        for (let bp = Math.ceil(lo / stepBp) * stepBp; bp <= hi + 1; bp += stepBp) {
                            const ty2 = g.Y(wy(bp));
                            ctx.beginPath();
                            ctx.moveTo(9, ty2);
                            ctx.lineTo(15, ty2);
                            ctx.stroke();
                            // A backdrop, because this sits over the nucleus and over whatever
                            // the first chromosome has at that height.
                            const label = fmtBp(bp, stepBp);
                            const tw2 = ctx.measureText(label).width;
                            ctx.fillStyle = 'rgba(255,255,255,0.72)';
                            ctx.fillRect(17, ty2 - 7, tw2 + 4, 14);
                            ctx.fillStyle = '#475569';
                            ctx.fillText(label, 19, ty2);
                        }
                        ctx.restore();
                    }
                }

                // ---- THE CALLOUTS ---------------------------------------------------
                //
                // One card per region too small to label in place, stacked down the right
                // margin at the height of its own band where there is room, and pushed down
                // where two would collide -- so the leaders stay short and never cross.
                // The card carries the region's number, its span, and the genes in it.
                if (callouts.length) {
                    ctx.save();
                    const CW = Math.min(232, Math.max(150, ctx.canvas.width * 0.22));
                    const cardX = ctx.canvas.width - CW - 12;
                    const line = 12.5;
                    // Tallest first would reorder them; they are laid out in the order they
                    // sit down the genome, which is the order the leaders will read in.
                    callouts.sort((a, b) => a.ay - b.ay);
                    // How tall each card is, so the stack can be resolved before anything
                    // is drawn: a card whose height is only known while drawing it cannot
                    // be moved out of the way of the one above.
                    for (const co of callouts) {
                        const gs = co.genes || [];
                        // Coding first for the card -- with room for a handful out of what
                        // may be two hundred, the protein-coding ones are the ones worth
                        // the space.
                        const pick = gs.slice().sort((a, b) => (b.coding ? 1 : 0) - (a.coding ? 1 : 0));
                        co.names = pick.slice(0, 6).map((x) => x.gene).filter(Boolean);
                        co.more = Math.max(0, gs.length - co.names.length);
                        co.wrapped = [];
                        if (co.names.length) {
                            ctx.font = '11px ' + FONT;
                            let ln = '';
                            for (const nm of co.names) {
                                const t2 = ln ? ln + ', ' + nm : nm;
                                if (ctx.measureText(t2).width > CW - 20 && ln) { co.wrapped.push(ln); ln = nm; }
                                else ln = t2;
                            }
                            if (ln) co.wrapped.push(ln);
                            if (co.more) co.wrapped.push('+' + co.more + ' more');
                        } else if (co.genes) {
                            co.wrapped = ['no genes annotated'];
                        } else {
                            co.wrapped = ['reading the genes…'];
                        }
                        // WHAT THE FILE SAID ABOUT IT. A region that came from a report
                        // carries the report's own words -- the change it named, or why
                        // it named the gene -- above the annotation's list, in its own ink.
                        co.labelLines = 0;
                        if (co.rg.label) {
                            ctx.font = '600 11px ' + FONT;
                            const lab = [];
                            let ln2 = '';
                            for (const w3 of ('' + co.rg.label).split(/\s+/)) {
                                const t3 = ln2 ? ln2 + ' ' + w3 : w3;
                                if (ctx.measureText(t3).width > CW - 20 && ln2) { lab.push(ln2); ln2 = w3; }
                                else ln2 = t3;
                            }
                            if (ln2) lab.push(ln2);
                            co.labelLines = Math.min(lab.length, 3);
                            co.wrapped = lab.slice(0, 3).concat(co.wrapped);
                        }
                        co.h = 9 + line + line + (co.wrapped.length * line) + 9;
                    }
                    // Resolve the stack downward, then lift it back into view if the last
                    // one has run off the bottom.
                    let cursor = 8;
                    for (const co of callouts) {
                        co.y = Math.max(cursor, co.ay - co.h / 2);
                        cursor = co.y + co.h + 8;
                    }
                    const overflow = cursor - 8 - ctx.canvas.height;
                    if (overflow > 0) {
                        const lift = Math.min(overflow, callouts[0].y - 8);
                        for (const co of callouts) co.y -= lift;
                    }
                    for (const co of callouts) {
                        const cy2 = co.y + co.h / 2;
                        // THE LEADER. Elbowed rather than straight: a diagonal across the
                        // chromosomes reads as a line drawn ON them, an elbow reads as a
                        // line drawn past them to the margin.
                        const midX = Math.min(cardX - 14, co.ax + 18);
                        const lead = activeRegion === geneKey(co.rg);
                        ctx.strokeStyle = lead ? 'rgba(29,78,216,0.95)' : 'rgba(37,99,235,0.55)';
                        ctx.lineWidth = lead ? 1.8 : 1;
                        ctx.beginPath();
                        ctx.moveTo(co.ax + 2, co.ay);
                        ctx.lineTo(midX, co.ay);
                        ctx.lineTo(midX, cy2);
                        ctx.lineTo(cardX - 2, cy2);
                        ctx.stroke();
                        // A dot on the band itself, so the leader has a source you can see
                        // even when the region is one pixel tall.
                        ctx.beginPath();
                        ctx.arc(co.ax + 2, co.ay, 2.4, 0, Math.PI * 2);
                        ctx.fillStyle = '#2563eb';
                        ctx.fill();

                        // THE CARD, raised off the drawing. A shadow and a light fill are
                        // what make it read as something in front of the karyotype rather
                        // than as more karyotype.
                        ctx.save();
                        ctx.shadowColor = 'rgba(15,23,42,0.28)';
                        ctx.shadowBlur = 9;
                        ctx.shadowOffsetY = 2;
                        ctx.fillStyle = 'rgba(255,255,255,0.97)';
                        roundRect(ctx, cardX, co.y, CW, co.h, 7);
                        ctx.fill();
                        ctx.restore();
                        const active = activeRegion === geneKey(co.rg);
                        ctx.strokeStyle = active ? '#1d4ed8' : 'rgba(37,99,235,0.45)';
                        ctx.lineWidth = active ? 2 : 1;
                        roundRect(ctx, cardX, co.y, CW, co.h, 7);
                        ctx.stroke();
                        calloutHits.push({ x: cardX, y: co.y, w: CW, h: co.h, rg: co.rg });
                        // A chevron, because a card that does something has to look
                        // different from a card that only says something -- and on a canvas
                        // there is no cursor change to give it away.
                        ctx.strokeStyle = 'rgba(37,99,235,0.75)';
                        ctx.lineWidth = 1.6;
                        ctx.beginPath();
                        ctx.moveTo(cardX + CW - 16, co.y + 10);
                        ctx.lineTo(cardX + CW - 11, co.y + 14.5);
                        ctx.lineTo(cardX + CW - 16, co.y + 19);
                        ctx.stroke();
                        // The number ties the card to the Regions menu, which counts them.
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'top';
                        ctx.fillStyle = '#1d4ed8';
                        ctx.font = '700 11.5px ' + FONT;
                        // The chromosome on the first line, the coordinates on the second.
                        // Both on one line ran under the chevron on a narrow card -- and a
                        // number that long is easier to read on its own anyway.
                        ctx.fillText(co.n + '. ' + co.chrom.name, cardX + 10, co.y + 9);
                        ctx.fillStyle = '#64748b';
                        ctx.font = '10.5px ' + FONT;
                        // Measured, not assumed: the card is a fifth of the canvas and on a
                        // narrow one the full coordinates do not fit. Rounded megabases say
                        // the same thing in half the room, and the exact numbers are one
                        // click away in the panel this card opens.
                        const spanTxt = fmtSpan(co.rg.hi - co.rg.lo);
                        let coordTxt = human(co.rg.lo) + '-' + human(co.rg.hi) + '  ·  ' + spanTxt;
                        if (ctx.measureText(coordTxt).width > CW - 20) {
                            coordTxt = (co.rg.lo / MB).toFixed(2) + '-' + (co.rg.hi / MB).toFixed(2)
                                + ' Mb  ·  ' + spanTxt;
                        }
                        if (ctx.measureText(coordTxt).width > CW - 20) coordTxt = spanTxt;
                        ctx.fillText(coordTxt, cardX + 10, co.y + 9 + line);
                        let ly = co.y + 9 + line + line;
                        for (let wi = 0; wi < co.wrapped.length; wi++) {
                            const isLabel = wi < (co.labelLines || 0);
                            ctx.fillStyle = isLabel ? '#9d174d' : (co.genes ? '#334155' : '#94a3b8');
                            ctx.font = (isLabel ? '600 ' : '') + '11px ' + FONT;
                            ctx.fillText(co.wrapped[wi], cardX + 10, ly);
                            ly += line;
                        }
                    }
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.restore();
                }

                // The drag, while it is happening.
                if (dragging && dragging.i >= 0 && dragging.i < drawn.length) {
                    const c = drawn[dragging.i];
                    const sx0 = g.X(barLeft(dragging.i)), sx1 = g.X(barRight(dragging.i));
                    const ya = g.Y(Math.max(dragging.y0, dragging.y1));
                    const yb = g.Y(Math.min(dragging.y0, dragging.y1));
                    if (Math.abs(yb - ya) > 1) {
                        ctx.save();
                        ctx.fillStyle = 'rgba(37,99,235,0.18)';
                        ctx.fillRect(sx0 - 3, ya, (sx1 - sx0) + 6, yb - ya);
                        ctx.strokeStyle = 'rgba(37,99,235,0.85)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(sx0 - 3, ya); ctx.lineTo(sx1 + 3, ya);
                        ctx.moveTo(sx0 - 3, yb); ctx.lineTo(sx1 + 3, yb);
                        ctx.stroke();
                        const lo = Math.max(0, Math.min(c.length, -Math.max(dragging.y0, dragging.y1) * MB));
                        const hi = Math.max(0, Math.min(c.length, -Math.min(dragging.y0, dragging.y1) * MB));
                        ctx.fillStyle = '#1e3a8a';
                        ctx.font = '600 11px ' + FONT;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';
                        ctx.fillText(c.name + ':' + Math.round(lo).toLocaleString()
                            + '-' + Math.round(hi).toLocaleString()
                            + '  (' + fmtSpan(hi - lo) + ')', (sx0 + sx1) / 2, ya - 4);
                        ctx.restore();
                    }
                }
                ctx.restore();
            }
        };

        // ---- SCREEN AND WORLD ----------------------------------------------------------
        //
        // THE LISTENERS ARE HANDED WORLD COORDINATES, NOT PIXELS. graph.js converts before
        // it dispatches --
        //     mouseMoveListener(this.grid.Xwc(scx), this.grid.Ywc(scy))
        // -- and gene.js passes that straight through to every registered listener. This
        // view was reading those two numbers as screen pixels and converting them AGAIN
        // with graph.Xwc/Ywc, which is a second screen-to-world pass over something that
        // was already world: the result is off by the whole transform, and grows with the
        // zoom. The drag rectangle was being drawn, at coordinates far outside the canvas.
        //
        // So: listeners take world, and anything that needs pixels converts here. A pixel
        // is 1/scale of a world unit, which is all the two questions below ever ask.
        const SX = (wx) => { try { return graph.graph.grid.X(wx); } catch (e) { return NaN; } };
        const SY = (wyv) => { try { return graph.graph.grid.Y(wyv); } catch (e) { return NaN; } };
        const worldPerPxX = () => {
            try { const q = graph.graph.grid.xscale; return q ? 1 / Math.abs(q) : 0; } catch (e) { return 0; }
        };
        const basesPerPx = () => {
            try { const q = graph.graph.grid.yscale; return q ? MB / Math.abs(q) : 0; } catch (e) { return 0; }
        };

        // ---- which chromosome and which base is under a point --------------------------------
        const at = (wx, wyWorld) => {
            const i = Math.floor(wx / SLOT);
            if (i < 0 || i >= drawn.length) return null;
            if (wx < barLeft(i) - 0.06 * SLOT || wx > barRight(i) + 0.06 * SLOT) return null;
            // The ring has no vertical axis to read a position off, so anywhere on its slot
            // means the whole of it -- which for 16.6 kb is the only useful answer anyway.
            if (drawn[i].circular) return { i: i, chrom: drawn[i], bp: 0, circular: true };
            const c = drawn[i];
            const bp = Math.round(Math.max(0, Math.min(c.length, -wyWorld * MB)));
            return { i: i, chrom: c, bp: bp };
        };
        const human = (n) => (+n).toLocaleString();

        // What the drag covers right now, so a selection is something you SEE while making it
        // rather than a rectangle you find out about afterwards. Read by paint().
        let dragging = null;   // { i, y0, y1 } in world y
        // Whether Select sequence is currently armed. Every canvas click ends in pan(),
        // which disarms -- but a toolbar button pressed instead of a drag would otherwise
        // leave the pan locked off with nothing on screen saying why, so the buttons that
        // take the user away from the canvas put it back first.
        let armed = false;
        // Pixels the pointer must travel before a press counts as a drag rather than a
        // click. pan() uses 3 for the same question; a selection asks for a little more so
        // a shaky press on a variant does not become a region.
        const DRAG_MIN_PX = 6;

        // ---- variants, from a pasted VCF -----------------------------------------------
        //
        // BUILT TO TAKE A WHOLE GENOME. A germline VCF is four to five million rows, and the
        // obvious shape -- an object per variant, drawn in a loop every frame -- is fine for
        // the twenty someone pastes by hand and unusable at that size. Three things keep it
        // flat instead:
        //
        //   positions live in typed arrays, one per chromosome, not in objects;
        //   every chromosome carries a fixed histogram, so a frame costs the same whether it
        //     is showing twenty variants or five million;
        //   SnpIndel objects are made for the ones that can actually be looked at, and made
        //     on demand for the rest.
        //
        // The SnpIndels are the real class the tracks use, so a variant here carries its
        // annotations, its clinical significance and its name -- but five million of them is
        // three gigabytes of object headers to draw a heat strip nobody can click.
        const HIST_BINS = 2048;      // per chromosome: chr1 is ~122 kb a bin
        const EXACT_MAX = 400;       // visible variants drawn one at a time; above this, density
        // A bar narrower than this cannot hold even the shortest change ("A>T" is 16 px of
        // text plus the 5 px of clear either side), so there is nothing to try. It is
        // deliberately the FLOOR and not a judgement about how wide a bar ought to be:
        // whether a particular string fits a particular bar is measured below, against that
        // bar. Set at 54 to begin with, which quietly refused the commonest view there is --
        // the whole genome across the screen puts a bar at about 34 px, so someone who
        // zoomed into position far enough to see individual variants, without also zooming
        // horizontally onto one chromosome, was told nothing at all.
        const VAR_META_MIN_W = 28;
        const VAR_META_PX = 13;      // two metadata rows closer than this would touch
        // The significance a variant is carrying, in the width a chromosome bar has.
        // CLS_SIG's own wording is what the editor needs and is far too long to put inside a
        // bar -- "Conflicting classifications of pathogenicity" is wider than chr1 at any
        // zoom that still shows a second chromosome.
        const CLS_SHORT = ['', 'pathogenic', 'benign', 'VUS', 'conflicting'];
        const OBJECT_CAP = 20000;    // SnpIndels built eagerly; beyond this, on demand

        let SnpIndel = null;
        // Per chromosome: sorted positions, a significance class per position, the histogram,
        // and the SnpIndels for as far as the cap reached.
        const vdata = drawn.map((c) => ({
            n: 0,
            pos: null,               // Float64Array, sorted
            cls: null,               // Uint8Array: 0 none 1 pathogenic 2 benign 3 uncertain 4 conflicting
            // ALLELES AS CODES, not as strings. A variant handed to the editor has to be a
            // real one -- A>G, not N>N -- and two Uint8Arrays cost 2 bytes a variant where
            // two string arrays cost a hundred. 0-3 are ACGT, 4 is N, 5 says "look in cplx",
            // which is where indels and multi-base alleles go. Those are the minority in every
            // VCF, so the rare case pays for itself and the common one is free.
            ref: null,               // Uint8Array
            alt: null,               // Uint8Array
            cplx: null,              // Map(index -> [refString, altString])
            hist: null,              // Uint32Array(HIST_BINS)
            snps: [],                // SnpIndel or null, parallel to pos while under the cap
            names: [],               // parallel; only kept while under the cap
            // GENOTYPES, one byte per sample per variant, in SAMPLES order (gtw wide). A
            // VCF with two samples is two people, or one person twice -- a tumour and its
            // germline -- and which of them carries a change is the first thing to see.
            gts: null,               // Uint8Array(n * gtw): GT_* codes
            gtw: 0,                  // samples known when this chromosome was last built
        }));
        const BCODE = { A: 0, C: 1, G: 2, T: 3, N: 4 };
        const BCHAR = ['A', 'C', 'G', 'T', 'N'];
        const codeOf = (b) => (b.length === 1 && BCODE[b] != null) ? BCODE[b] : 5;
        let vtotal = 0, vobjects = 0;

        const CLS_COLOR = ['#ff2d78', '#ff2020', '#12c95a', '#ffa400', '#94a3b8'];

        // ---- SAMPLES AND PHASE -----------------------------------------------------------
        //
        // The columns after FORMAT are the part of a VCF that says WHO has the variant, and
        // how: 0/1 in the tumour and 0/0 in the germline is a somatic change; 1|0 and 0|1
        // are the two haplotypes of one person, and which one a change sits on is what an
        // allele-selective design needs to know. None of it was read before. Sample names
        // are registered once, across every file loaded, up to GT_MAX of them.
        const GT_MAX = 8;
        const SAMPLES = [];                     // names, in slot order
        const sampleSlot = (name) => {
            const n = ('' + (name || '')).trim() || ('sample ' + (SAMPLES.length + 1));
            let i = SAMPLES.indexOf(n);
            if (i < 0) { if (SAMPLES.length >= GT_MAX) return -1; SAMPLES.push(n); i = SAMPLES.length - 1; }
            return i;
        };
        // One byte per genotype. Codes 2 and up carry the alternate allele.
        //   0 none   1 0/0   2 0/1 unphased   3 1/1   4 0|1 (alt on hap 2)   5 1|0 (alt on hap 1)
        //   6 1|1 phased   7 other (a different alt of a multi-allelic site, or a mix)
        const GT_TEXT = ['', '0/0', '0/1', '1/1', '0|1', '1|0', '1|1', 'other'];
        const GT_NONE = 0, GT_REF = 1, GT_HET = 2, GT_HOM = 3, GT_HAP2 = 4, GT_HAP1 = 5, GT_HOMP = 6, GT_OTHER = 7;
        // The code for a genotype string, RELATIVE TO ONE ALT: a multi-allelic row is split
        // into one record per alt, and 1/2 carries the first alt on one chromosome and the
        // second on the other, so each record reads its own allele index.
        const gtCode = (gt, altIdx) => {
            if (!gt || gt === '.' || gt === './.' || gt === '.|.') return GT_NONE;
            const phased = gt.indexOf('|') >= 0;
            const al = gt.split(/[|\/]/);
            let has = 0, known = 0;
            for (const a of al) { if (a === '.' || a === '') continue; known++; if (+a === altIdx) has++; }
            if (!known) return GT_NONE;
            if (!has) return GT_REF;
            if (has === known && known === al.length) return phased ? GT_HOMP : GT_HOM;
            if (has === 1 && al.length === 2) {
                if (!phased) return GT_HET;
                return (+al[0] === altIdx) ? GT_HAP1 : GT_HAP2;
            }
            return GT_OTHER;
        };
        const gtOf = (d, k, si) => (d.gts && si < d.gtw) ? d.gts[k * d.gtw + si] : GT_NONE;
        // Which samples carry this variant, as a bitmask over slots.
        const carriersOf = (d, k) => {
            let m = 0;
            for (let si = 0; si < d.gtw; si++) if (gtOf(d, k, si) >= GT_HET) m |= (1 << si);
            return m;
        };
        // 'hap1' | 'hap2' | 'hom' | 'het' | 'other' | 'mixed' | '' -- one word for the
        // phase of a variant, across the samples that carry it.
        const PHASE_OF_CODE = ['', '', 'het', 'hom', 'hap2', 'hap1', 'hom', 'other'];
        const phaseOf = (d, k) => {
            let ph = '';
            for (let si = 0; si < d.gtw; si++) {
                const w = PHASE_OF_CODE[gtOf(d, k, si)];
                if (!w) continue;
                if (!ph) ph = w; else if (ph !== w) return 'mixed';
            }
            return ph;
        };
        const PHASE_COLOR = { hap1: '#1d9bf0', hap2: '#ff2d78', hom: '#a855f7', het: '#ffa400', other: '#94a3b8', mixed: '#94a3b8' };
        const PHASE_NAME = { hap1: 'haplotype 1 (1|0)', hap2: 'haplotype 2 (0|1)', hom: 'homozygous', het: 'heterozygous, unphased', other: 'other allele', mixed: 'differs between samples' };
        const SAMPLE_COLOR = ['#1d9bf0', '#ff2d78', '#ffa400', '#12c95a', '#a855f7', '#f97316', '#14b8a6', '#e11d48'];
        const SHARED_COLOR = '#475569';         // carried by more than one sample
        const ABSENT_COLOR = '#cbd5e1';         // carried by none of them (0/0 everywhere)
        // HOW THE MARKS ARE COLOURED: by ClinVar class, by which sample carries the change,
        // or by which haplotype it is on. Picked for the file on load, and switchable.
        let colorMode = 'class';
        const colorOf = (d, k) => {
            if (d.hl && d.hl[k] && HL_COLOR[d.hl[k]]) return HL_COLOR[d.hl[k]];
            if (hlActive) return DIM_COLOR;
            if (colorMode === 'sample' && d.gtw) {
                const m = carriersOf(d, k);
                if (!m) return ABSENT_COLOR;
                if (m & (m - 1)) return SHARED_COLOR;
                return SAMPLE_COLOR[Math.log2(m) | 0] || SHARED_COLOR;
            }
            if (colorMode === 'phase' && d.gtw) {
                return PHASE_COLOR[phaseOf(d, k)] || ABSENT_COLOR;
            }
            return CLS_COLOR[d.cls[k]] || CLS_COLOR[0];
        };
        // The word that goes inside the bar beside the change, in the current mode.
        const modeAnnot = (d, k) => {
            if (colorMode === 'sample' && d.gtw) {
                const m = carriersOf(d, k);
                if (!m) return 'in no sample';
                const who = SAMPLES.filter((_, si) => m & (1 << si));
                return who.length === SAMPLES.length && who.length > 1 ? 'all samples' : who.join(' + ');
            }
            if (colorMode === 'phase' && d.gtw) return phaseOf(d, k);
            return '';
        };
        // The samples and their genotypes for one variant, as [name, code] pairs.
        const genotypesOf = (d, k) => SAMPLES.slice(0, d.gtw).map((nm, si) => [nm, gtOf(d, k, si)]);

        // THE KEY. A color is a claim, and a key is what makes it one that can be read: a
        // small card in the corner naming what each color means in the mode that is on.
        // Only shown when there is something to explain -- more than one sample, or a
        // mode other than the classes the in-bar text already spells out.
        let legendEl = null;
        // THE KEY IS ONLY THERE WHILE THE CANVAS IS. It is a fixed element on the page
        // body, so nothing removes it when the canvas goes -- the editor opened over this
        // view, a full-screen panel, a modal -- and it would sit over whatever came next.
        // A watcher checks the canvas it belongs to: attached, laid out, and the thing
        // actually under its own middle; when that stops being true the key comes down,
        // and when it is true again the key comes back, in the mode it was in.
        let lastCanvas = null, legendWanted = false, legendTimer = null;
        const canvasVisible = () => {
            const cv = lastCanvas;
            if (!cv || !document.body.contains(cv)) return false;
            let r = null;
            try { r = cv.getBoundingClientRect(); } catch (e) { return false; }
            if (!r || r.width < 2 || r.height < 2) return false;
            try {
                const cx = Math.max(0, Math.min(window.innerWidth - 1, r.left + r.width / 2));
                const cy = Math.max(0, Math.min(window.innerHeight - 1, r.top + r.height / 2));
                const top = document.elementFromPoint(cx, cy);
                if (!top) return false;
                if (top !== cv && !cv.contains(top) && !(legendEl && legendEl.contains(top))) return false;
            } catch (e) { }
            return true;
        };
        const legendDetach = () => { try { if (legendEl && legendEl.parentNode) legendEl.parentNode.removeChild(legendEl); } catch (e) { } legendEl = null; };
        const legendWatch = () => {
            if (legendTimer) return;
            legendTimer = setInterval(() => {
                if (!legendWanted) { clearInterval(legendTimer); legendTimer = null; return; }
                const vis = canvasVisible();
                if (!vis && legendEl) legendDetach();
                else if (vis && !legendEl) legendBuild();
            }, 400);
        };
        const legendHide = () => { legendWanted = false; legendDetach(); if (legendTimer) { clearInterval(legendTimer); legendTimer = null; } };
        const legendShow = () => {
            legendWanted = true;
            legendWatch();
            if (!canvasVisible()) { legendDetach(); return; }
            legendBuild();
        };
        const legendBuild = () => {
            legendDetach();
            const sw = (col, txt) => '<div style="display:flex;align-items:center;gap:8px;margin-top:5px;">'
                + '<span style="width:11px;height:11px;border-radius:50%;background:' + col + ';box-shadow:0 0 6px ' + col + ';flex:0 0 auto;"></span>'
                + '<span>' + esc(txt) + '</span></div>';
            let title = '', rows = '';
            if (colorMode === 'sample' && SAMPLES.length) {
                title = 'Color by sample';
                rows = SAMPLES.map((nm, si) => sw(SAMPLE_COLOR[si], nm + ' only')).join('');
                if (SAMPLES.length > 1) rows += sw(SHARED_COLOR, 'in more than one sample') + sw(ABSENT_COLOR, 'in none (0/0)');
            } else if (colorMode === 'phase' && SAMPLES.length) {
                title = 'Color by phase';
                rows = ['hap1', 'hap2', 'hom', 'het'].map((w) => sw(PHASE_COLOR[w], PHASE_NAME[w])).join('')
                    + (SAMPLES.length > 1 ? sw(PHASE_COLOR.mixed, PHASE_NAME.mixed) : '');
            } else if (SAMPLES.length > 1) {
                title = 'Color by ClinVar class';
                rows = sw(CLS_COLOR[0], 'unclassified') + sw(CLS_COLOR[1], 'pathogenic') + sw(CLS_COLOR[2], 'benign')
                    + sw(CLS_COLOR[3], 'uncertain') + sw(CLS_COLOR[4], 'conflicting');
            } else { legendWanted = false; return; }
            try {
                const el = document.createElement('div');
                el.id = 'baja-karyo-legend';
                el.style.cssText = 'position:fixed;left:18px;bottom:26px;z-index:2147481000;'
                    + 'background:rgba(11,37,69,0.94);color:#e8f0fb;font:12px Arial,Helvetica,sans-serif;'
                    + 'border-radius:10px;padding:10px 14px 11px;box-shadow:0 10px 30px rgba(0,0,0,0.35);'
                    + 'border:1px solid rgba(255,255,255,0.14);pointer-events:auto;cursor:pointer;max-width:260px;';
                el.title = 'Click to change how the variants are colored';
                el.innerHTML = '<div style="font:700 12.5px Arial;">' + esc(title) + '</div>' + rows
                    + (SAMPLES.length ? '<div style="margin-top:7px;color:#9fb3c8;font-size:11px;">'
                        + esc(SAMPLES.length + ' sample' + (SAMPLES.length === 1 ? '' : 's') + ': ' + SAMPLES.join(', ')) + '</div>' : '');
                el.onclick = () => { try { colorMenu(); } catch (e) { } };
                document.body.appendChild(el);
                legendEl = el;
            } catch (e) { legendEl = null; }
        };
        const setColorMode = (m) => {
            colorMode = m;
            legendShow();
            try { if (graph.wake) graph.wake(); } catch (e) { }
        };
        // THE DENSITY STRIPS CARRY THE COLOURS TOO. Zoomed out, a chromosome shows its
        // variants as one strip per bin, and a strip that is always magenta says nothing
        // about who carries what. So each bin is counted per color category of the mode
        // that is on, and the strip is drawn as segments in proportion -- a bin that is
        // two-thirds haplotype 1 is two-thirds blue. Built lazily per chromosome, once
        // per mode, from the same bytes the exact drawing reads.
        const NCAT = 10;
        const PH_ORDER = ['', 'hap1', 'hap2', 'hom', 'het', 'other', 'mixed'];
        const catOf = (d, k) => {
            if (colorMode === 'sample' && d.gtw) {
                const m = carriersOf(d, k);
                if (!m) return 0;
                if (m & (m - 1)) return 9;
                return 1 + (Math.log2(m) | 0);
            }
            if (colorMode === 'phase' && d.gtw) return Math.max(0, PH_ORDER.indexOf(phaseOf(d, k)));
            return d.cls[k] || 0;
        };
        const modePalette = () => {
            if (colorMode === 'sample') return [ABSENT_COLOR].concat(SAMPLE_COLOR, [SHARED_COLOR]);
            if (colorMode === 'phase') return [ABSENT_COLOR].concat(PH_ORDER.slice(1).map((w) => PHASE_COLOR[w]));
            return CLS_COLOR;
        };
        const binsBy = (d) => {
            const key = colorMode + ':' + d.gtw + ':' + d.n;
            if (d.histBy && d.histByKey === key) return d.histBy;
            const hb = new Uint32Array(HIST_BINS * NCAT);
            const scale = HIST_BINS / d.__len;
            for (let k = 0; k < d.n; k++) {
                let bin = (d.pos[k] * scale) | 0;
                if (bin >= HIST_BINS) bin = HIST_BINS - 1;
                hb[bin * NCAT + Math.min(NCAT - 1, catOf(d, k))]++;
            }
            d.histBy = hb; d.histByKey = key;
            return hb;
        };
        const withAlpha = (hex, a) => {
            const v = parseInt(('' + hex).slice(1), 16);
            return 'rgba(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + a.toFixed(3) + ')';
        };
        // WHAT THIS VARIANT'S CLINICAL SIGNIFICANCE IS, as a string the editor understands.
        //
        // Two sources, and both are needed. A VCF that carries CLNSIG says so itself, and
        // clsOf below has already read it. But a plain germline VCF carries no CLNSIG at
        // all, and for those the pathogenic filter is what found them -- by position,
        // against the same ClinVar the CLNSIG field quotes. That answer used to stop at the
        // karyotype: the variants were marked magenta here and arrived in the editor with
        // no significance and no red glow, which said the opposite of what had just been
        // established about them.
        //
        // SnpIndel.clinsigStyle tests /\bpathogenic\b/, so "Likely pathogenic" glows and
        // "Conflicting classifications of pathogenicity" does not -- the wording below is
        // chosen to land on the right side of that.
        const CLS_SIG = ['', 'Pathogenic', 'Benign', 'Uncertain significance',
            'Conflicting classifications of pathogenicity'];
        const sigOf = (d, k) => {
            const fromVcf = CLS_SIG[d.cls[k]] || '';
            if (fromVcf) return fromVcf;
            if (d.hl && d.hl[k] === HL_PATHOGENIC) return 'Pathogenic/Likely pathogenic';
            return '';
        };

        const clsOf = (info) => {
            const m = ('' + (info || '')).match(/(?:^|;)CLNSIG=([^;]*)/);
            if (!m) return 0;
            const t = m[1].toLowerCase();
            if (t.indexOf('conflict') >= 0) return 4;
            if (t.indexOf('pathogenic') >= 0) return 1;
            if (t.indexOf('benign') >= 0) return 2;
            if (t.indexOf('uncertain') >= 0 || t.indexOf('vus') >= 0) return 3;
            return 0;
        };

        // ---- BOOKMARKED VIEWS ---------------------------------------------------
        //
        // A view here is four numbers -- the grid's world rectangle -- and getting back to
        // one by hand means re-finding a band on a chromosome at a zoom that took several
        // gestures to reach. So the camera keeps them, and they travel in the saved file:
        // a karyotype someone opens tomorrow arrives with the places worth looking at
        // already marked, which is most of what makes it worth saving at all.
        // WHERE THE CALLOUT CARDS WERE DRAWN, in screen pixels, so a click can find them.
        // Rebuilt every frame by paint(): a card's position is a fact about the frame it
        // was drawn in, and a remembered rectangle from a previous zoom would take clicks
        // for a card that is no longer there.
        let calloutHits = [];           // [{ x, y, w, h, rg }]
        // WHERE EACH PATENT LABEL WAS DRAWN, in screen pixels. Rebuilt every frame for the
        // same reason the callout rectangles are: a label's position is a fact about the
        // frame it was drawn in, and one remembered from a previous zoom would take clicks
        // for a name that is no longer there.
        let patLabelHits = [];          // [{ x, y, w, h, id, label }]
        // THE REGION WHOSE CARD WAS OPENED. The transcript panel covers the whole screen,
        // so while it is up nothing of the karyotype shows -- the point of marking it is
        // what you see the moment the panel closes: which of several selections you were
        // just reading about, without having to match a number against a card again.
        // Cleared when the regions it refers to are.
        let activeRegion = null;        // the region key, or null
        let bookmarks = [];             // [{ name, x0, x1, y0, y1, at }]
        const BOOKMARK_CAP = 60;        // a list, not an archive; past this the menu is a wall

        // The grid's rectangle, or null while there is no grid yet. Both the saver and the
        // camera read the view from here so there is one answer to "where are we".
        const viewOf = () => {
            try {
                const gr = graph.graph && graph.graph.grid;
                if (!gr || !isFinite(gr.xmin)) return null;
                return { x0: gr.xmin, x1: gr.xmax, y0: gr.ymin, y1: gr.ymax };
            } catch (e) { return null; }
        };
        // WHY THIS DOES NOT SIMPLY CALL zoomRect.
        //
        // zoomRect -> animateTo does not fly to the rectangle it is handed; it reshapes it
        // first, and both of its rules destroy exactly the thing a bookmark is for -- the
        // depth, the z of the view:
        //
        //   if (Math.abs(ymax - ymin) < 1) { ymin = grid.ymin; ymax = grid.ymax; }
        //
        // y here is MEGABASES (wy = -bp/MB), so "less than 1" is "less than a megabase
        // tall" -- which is every view worth bookmarking. The requested y is thrown away
        // and the CURRENT y substituted, so the camera lands at the right chromosome at
        // whatever depth the grid happened to be left at. That is the whole of "the
        // bookmark loses its z when the grid is reset".
        //
        // The second rule clamps the aspect ratio into [10, 5000], widening x or
        // stretching y to get there, so even a view over a megabase tall comes back a
        // different shape than it went in.
        //
        // The bounds ARE the depth: x0..x1 and y0..y1 carry it exactly. So the view is set
        // on the grid directly -- one zoom() sets four bounds and rescales once -- and the
        // animation is used only for rectangles animateTo would have left alone.
        const ANIM_MIN_YW = 1;                        // animateTo's own threshold, in Mb
        const ANIM_AR_LO = 10, ANIM_AR_HI = 5000;     // and its aspect clamp
        const animWouldReshape = (v) => {
            const yw = Math.abs(v.y1 - v.y0);
            if (!(yw >= ANIM_MIN_YW)) return true;
            const ar = Math.abs(v.x1 - v.x0) / yw;
            return !(ar >= ANIM_AR_LO && ar <= ANIM_AR_HI);
        };
        // Four bounds onto the grid and one rescale. grid.zoom does exactly that; the
        // long-hand is there for a grid that predates it.
        const setViewExact = (v) => {
            try {
                const gr = graph.graph && graph.graph.grid;
                if (!gr) return false;
                if (gr.zoom) gr.zoom(v.x0, v.x1, v.y0, v.y1);
                else {
                    gr.setxmin(v.x0); gr.setxmax(v.x1);
                    gr.setymin(v.y0); gr.setymax(v.y1);
                    if (gr.rescale) gr.rescale();
                }
                if (graph.wake) graph.wake();
                return true;
            } catch (e) { step('setViewExact threw: ' + e); return false; }
        };
        // zoomRect takes (x0, x1, yTop, yBottom); y runs negative downward, so the TOP of
        // the view is the larger y.
        const goView = async (v) => {
            if (!v || !isFinite(v.x0) || !isFinite(v.y0)) return false;
            if (!animWouldReshape(v)) {
                try { await graph.zoomRect(v.x0, v.x1, v.y1, v.y0, 30); } catch (e) { }
            }
            // Set exactly whether or not it animated: the animation walks in a fixed
            // number of increments and stops near the target, not on it, and near is a
            // different number of bases at sequence zoom.
            setViewExact(v);
            // Then check it took. Something else clamping the grid would otherwise be
            // another silent loss of depth, and the point of this function is that there
            // are no more of those.
            try {
                const gr = graph.graph && graph.graph.grid;
                const want = Math.abs(v.y1 - v.y0), got = Math.abs(gr.ymax - gr.ymin);
                if (want > 0 && Math.abs(got - want) / want > 0.005) {
                    step('view depth did not take: asked ' + want.toExponential(3)
                        + ' Mb, grid holds ' + got.toExponential(3));
                }
            } catch (e) { }
            pan();
            return true;
        };
        // Enough of a description to recognise the place: which chromosomes the rectangle
        // covers and what stretch of them, in whichever unit the span is actually in.
        const bpText = (lo, hi) => {
            const span = Math.max(0, hi - lo);
            if (span >= 2e6) return (lo / 1e6).toFixed(1) + '–' + (hi / 1e6).toFixed(1) + ' Mb';
            if (span >= 2e3) return Math.round(lo / 1e3).toLocaleString() + '–'
                + Math.round(hi / 1e3).toLocaleString() + ' kb';
            return Math.round(lo).toLocaleString() + '–' + Math.round(hi).toLocaleString() + ' bp';
        };
        const describeView = (v) => {
            if (!v || !isFinite(v.x0)) return 'the whole genome';
            const i0 = Math.floor(Math.min(v.x0, v.x1) / SLOT);
            const i1 = Math.floor(Math.max(v.x0, v.x1) / SLOT);
            const a = Math.max(0, i0), b = Math.min(drawn.length - 1, i1);
            let where;
            if (!drawn.length || b < a) where = 'off the chromosomes';
            else if (a === 0 && b === drawn.length - 1) where = 'all chromosomes';
            else if (a === b) where = drawn[a].name;
            else where = drawn[a].name + '–' + drawn[b].name;
            const lo = Math.max(0, -Math.max(v.y0, v.y1) * MB);
            const hi = Math.max(lo, -Math.min(v.y0, v.y1) * MB);
            // A view taller than the longest chromosome in it is the whole of them; saying
            // "0.0–250.0 Mb" for that is a number where a word does.
            let longest = 0;
            for (let i = a; i <= b && i >= 0 && i < drawn.length; i++) {
                longest = Math.max(longest, drawn[i].length || 0);
            }
            if (longest && (hi - lo) >= longest * 0.98) return where + ', whole length';
            return where + ' ' + bpText(lo, hi);
        };

        // ---- PATENTED SEQUENCE DENSITY ------------------------------------------
        //
        // Where the patent hits fall, as a strip down the LEFT of every chromosome -- the
        // right is already the variant marks, the gene labels and the callout leaders.
        //
        // The hit file is keyed by transcript, twenty-one million rows of it, so the
        // carrying-back to genomic coordinates and the binning happen once on the server
        // (py/bio/patent-density.py) and are cached there. What arrives here is a few
        // thousand numbers.
        // TWO DATASETS, EACH DOING WHAT ONLY IT CAN.
        //
        // The strip is the 2020-2025 index: 21.4M hits, and 99.8% of them carry back to a
        // locus through this server's GENCODE, so the shape it draws is the real one. What
        // it cannot do is name anything -- its column 4 is a sequential record id.
        //
        // The names come from the ASO/siRNA set, whose column 4 IS a patent number with a
        // TSV behind it. That set cannot draw the strip: it was built against a transcript
        // set of 481,326 ids against this annotation's 254,070, so 62% of its hits have no
        // locus here and a density from it would be a picture of the overlap rather than of
        // the patents.
        //
        // So the height is measured by one and the list is named by the other, and the panel
        // says which is which rather than presenting them as one number.
        const PAT_KEY = 'patent';           // the strip
        const PAT_NAME_KEY = 'aso_sirna_gt'; // the list
        let patLabelFailed = false;     // so a broken label reports once, not once a frame
        let patHist = null;             // per chromosome: Float64Array(HIST_BINS), or null
        let patMax = 0;                 // the busiest bin anywhere, for the log scale
        let patOn = false;
        let patBusy = false;
        let patNote = '';
        const patLoad = async () => {
            if (patBusy) return;
            if (patHist) { patOn = !patOn; if (graph.wake) graph.wake(); return; }
            patBusy = true;
            graph.setMessage(' Reading the patented sequences… ');
            let rs = null;
            try {
                const em = new EngineMonitor((m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } });
                rs = await exec(server + '/py/bio/patent-density.py', em,
                    PAT_KEY, (r.species || 'human'), '100000');
            } catch (e) { rs = null; step('patent-density threw: ' + e); }
            patBusy = false;
            if (!rs || !rs.ok) {
                graph.setMessage(' The patented sequences could not be read'
                    + ((rs && rs.error) ? (': ' + rs.error) : '') + '. ');
                return;
            }
            let ch = {};
            try { ch = JSON.parse(rs.chroms || '{}'); } catch (e) { ch = {}; }
            const BINW = +rs.bin || 100000;
            // Onto this view's own bins, so the strip lines up with the variant histogram
            // beside it rather than carrying a second geometry.
            patHist = drawn.map(() => null);
            patMax = 0;
            for (let i = 0; i < drawn.length; i++) {
                const c = drawn[i];
                const rec = ch[c.name] || ch[c.name.replace(/^chr/, '')] || ch['chr' + c.name];
                if (!rec || !rec.i || !rec.n) continue;
                const arr = new Float64Array(HIST_BINS);
                const sc = HIST_BINS / c.length;
                for (let q = 0; q < rec.i.length; q++) {
                    // The bin's own midpoint, not its edge: a 100 kb bin placed by its start
                    // sits systematically early against a 122 kb one.
                    const posBp = (+rec.i[q]) * BINW + BINW / 2;
                    let b = (posBp * sc) | 0;
                    if (b < 0) b = 0;
                    if (b >= HIST_BINS) b = HIST_BINS - 1;
                    arr[b] += (+rec.n[q]) || 0;
                }
                for (let b = 0; b < HIST_BINS; b++) if (arr[b] > patMax) patMax = arr[b];
                patHist[i] = arr;
            }
            patOn = patMax > 0;
            patNote = (+rs.hits || 0).toLocaleString() + ' patent hits over '
                + (+rs.transcripts || 0).toLocaleString() + ' transcripts';
            graph.setMessage(' ' + patNote
                + (rs.built ? ' (indexed for the first time; instant from now on)' : '') + '. ');
            step('patent density: ' + patNote + ', max bin ' + patMax);
            if (graph.wake) graph.wake();
        };

        // ---- THE PATENTS, NAMED ON THE CHROMOSOME -------------------------------
        //
        // The strip says how much; once a chromosome is wide enough to hold the words, the
        // bar itself says WHICH. Written inside the bar because that is the only place on
        // this drawing with horizontal room -- both gutters are spoken for -- and because a
        // patent claiming sequence there is a fact about that stretch of chromosome.
        //
        // Only when the text FITS. A label clipped at the bar edge, or one drawn over its
        // neighbour, is worse than the strip alone: it looks like information and cannot be
        // read. Measured, never estimated.
        // THE FLOOR, not a judgement about how wide a bar ought to be. The shortest thing
        // a patent label ever shrinks to is its publication number alone -- "US12406749",
        // about 56 px at 10 px bold -- and the 8 px of clear either side makes 64. Whether a
        // PARTICULAR label fits a PARTICULAR bar is measured below, against that bar, and
        // the full "US12406749 President and Fellows of Harvard College" needs a far wider
        // one. Set at 90 to begin with, which refused bars that could have carried the
        // number perfectly well.
        const PAT_LABEL_MIN_W = 64;
        const PAT_LABEL_PX = 11;        // and rows closer than this collide
        const patLabels = new Map();    // 'ci:lo:hi' -> {state, list}
        const patLabelKey = (ci, lo, hi) => ci + ':' + lo + ':' + hi;
        // HOW MANY OF THESE MAY BE IN THE AIR AT ONCE.
        //
        // paint() asks per VISIBLE CHROMOSOME, so a view holding a dozen of them wide enough
        // to label asks a dozen questions in one frame, and each is a scan of every patent
        // hit over every transcript in the window -- 3.6 s and 14,739 transcripts for a whole
        // chr17. The server runs six python jobs at a time across the whole site, so twelve
        // of these take all six slots and queue the rest: the labels do not arrive, and
        // neither does anything else anyone is doing, because every other tool is behind them
        // in the same queue. Seen on production doing exactly that -- six active, twenty-three
        // queued, all of them this script.
        //
        // Two at a time, and a refusal is NOT recorded as pending, so the frame after asks
        // again and the rest arrive in their own time. Labels appearing chromosome by
        // chromosome over a few seconds is the correct behaviour for a question this
        // expensive; taking the server down to answer it faster is not.
        const PAT_ASK_MAX = 2;
        let patAsking = 0;
        const patLabelsAsk = async (ci, lo, hi) => {
            const k = patLabelKey(ci, lo, hi);
            if (patLabels.has(k)) return;
            if (patAsking >= PAT_ASK_MAX) return;   // deliberately not marked pending
            patAsking++;
            patLabels.set(k, { state: 'pending', list: [] });
            if (patLabels.size > 60) {
                for (const kk of Array.from(patLabels.keys()).slice(0, 30)) patLabels.delete(kk);
            }
            let list = [];
            try {
                const em = new EngineMonitor(() => { });
                const rs = await exec(server + '/py/bio/patents-at.py', em,
                    drawn[ci].name.replace(/^chr/, ''), String(lo), String(hi),
                    PAT_NAME_KEY, (r.species || 'human'), '200');
                if (rs && rs.ok) { try { list = JSON.parse(rs.patents || '[]'); } catch (e) { list = []; } }
            } catch (e) { list = []; }
            finally { patAsking = Math.max(0, patAsking - 1); }
            list = list.filter((q) => q && +q.start > 0 && +q.end >= +q.start);
            list.sort((a, b) => (+a.start) - (+b.start));
            patLabels.set(k, { state: 'done', list: list });
            if (graph.wake) graph.wake();
        };

        // THE GENES IN THE VISIBLE WINDOW, fetched ONCE per rounded window (not per patent)
        // so the patent labels can name which genes each one sits in without a server call
        // each. Same genes-in-range.py the Regions panel uses; same throttle as the patent
        // labels so a genome full of chromosomes cannot flood the six-slot python bridge.
        const winGenes = new Map();     // 'ci:qlo:qhi' -> { state, genes:[{gene,start,end}] }
        const winGenesAsk = async (ci, lo, hi) => {
            const key = ci + ':' + lo + ':' + hi;
            if (winGenes.has(key)) return;
            if (patAsking >= PAT_ASK_MAX) return;   // shares the patent budget; not marked pending
            patAsking++;
            winGenes.set(key, { state: 'pending', genes: [] });
            if (winGenes.size > 60) {
                for (const kk of Array.from(winGenes.keys()).slice(0, 30)) winGenes.delete(kk);
            }
            let gs = [];
            try {
                const em = new EngineMonitor(() => { });
                const res = await exec(server + '/py/bio/genes-in-range.py', em,
                    drawn[ci].name.replace(/^chr/, ''), String(lo), String(hi),
                    (r.species || 'human'), '400');
                try { gs = JSON.parse((res && res.genes) || '[]'); } catch (e) { gs = []; }
            } catch (e) { gs = []; }
            finally { patAsking = Math.max(0, patAsking - 1); }
            gs = gs.filter((g) => g && +g.start > 0).sort((a, b) => (+a.start) - (+b.start));
            winGenes.set(key, { state: 'done', genes: gs });
            if (graph.wake) graph.wake();
        };
        // The gene symbols overlapping [s,e], from a fetched window's gene list (ascending by
        // start). A few at most are wanted on a label, so it stops after `cap`.
        const genesOver = (genesList, s, e, cap) => {
            const out = [];
            for (const g of genesList) {
                if (+g.end < s) continue;
                if (+g.start > e) break;
                if (g.gene) { out.push(g.gene); if (out.length >= cap) break; }
            }
            return out;
        };

        // ---- THE GENES INSIDE A SELECTED REGION ---------------------------------
        //
        // A region is chosen to ask a question about somewhere, and the first thing anyone
        // wants to know about somewhere is what is in it. The names are already one server
        // call away -- the same genes-in-range.py the Regions panel opens with -- so once a
        // region is drawn large enough for a name to fit beside it, the names are fetched
        // and drawn, and the panel becomes a way to ACT on what you can already see rather
        // than the only way to find out.
        //
        // Fetched from paint(), on demand, exactly as the sequence chunks are: what has not
        // arrived is not drawn, so nothing shifts when it lands.
        const GENE_LABEL_PX = 11;    // a gene shorter than this on screen has no room for a name
        const GENE_ROW_PX = 12;      // and two names closer than this would sit on each other
        const GENE_MAX_LABELS = 40;  // past this it is a wall of text, not a label
        const GENE_ASK_PX = 24;      // a region smaller than this is not worth a server call
        const geneCache = new Map();                       // 'i:lo:hi' -> {state, genes}
        const geneKey = (rg) => rg.i + ':' + rg.lo + ':' + rg.hi;
        const geneAsk = async (rg) => {
            const k = geneKey(rg);
            if (geneCache.has(k)) return;
            geneCache.set(k, { state: 'pending', genes: [] });
            // Deterministic keys, so a region re-added later reuses what was read. The cap
            // is only so a long session cannot grow this without bound.
            if (geneCache.size > 200) {
                for (const kk of Array.from(geneCache.keys()).slice(0, 100)) geneCache.delete(kk);
            }
            let gs = [];
            try {
                const em = new EngineMonitor(() => { });
                const res = await exec(server + '/py/bio/genes-in-range.py', em,
                    drawn[rg.i].name.replace(/^chr/, ''), '' + rg.lo, '' + rg.hi,
                    (r.species || 'human'), '200');
                try { gs = JSON.parse((res && res.genes) || '[]'); } catch (e) { gs = []; }
            } catch (e) { gs = []; }
            // Sorted by position, not by the panel's coding-first order: these are drawn
            // down a chromosome, and the overlap test below only works in that order.
            gs.sort((a, b) => (+a.start || 0) - (+b.start || 0));
            geneCache.set(k, { state: gs.length ? 'done' : 'miss', genes: gs });
            if (graph.wake) graph.wake();
        };

        // ---- SELECTED REGIONS ---------------------------------------------------
        // A selection is a base range on one chromosome, and they accumulate: the
        // questions this view exists for -- drop these, keep only these, mark what is
        // coding inside them -- are asked of several places at once, not one.
        let regions = [];                                  // [{ i, lo, hi }]
        const HL_COLOR = ['', '#ee00ee', '#0ea5e9', '#7c3aed', '#0d9488', '#e11d48'];
        // While a filter is on, everything it did not match is drawn in this instead of
        // its own color: the point of asking "where is the protein coding" is to see
        // that against the rest, not to hunt colored dots in a field of colored dots.
        const DIM_COLOR = '#cbd5e1';
        let hlActive = 0;               // the filter currently applied, 0 for none
        const HL_NAME = ['', 'protein-coding', 'intronic', "3' UTR", "5' UTR",
            'pathogenic / likely pathogenic'];
        const HL_PATHOGENIC = 5;        // the filter code HL_NAME[5] names
        const inRegion = (ci, p) => {
            for (let q = 0; q < regions.length; q++) {
                const r = regions[q];
                if (r.i === ci && p >= r.lo && p <= r.hi) return true;
            }
            return false;
        };
        // Membership in a flat [start,end,start,end,...] interval list, by bisection:
        // a window holds a few thousand exons and the file holds millions of variants,
        // so the search has to be on the small side of that.
        const inFlat = (flat, p) => {
            let lo = 0, hi = (flat.length >> 1) - 1;
            while (lo <= hi) {
                const m = (lo + hi) >> 1, a = flat[m << 1], b = flat[(m << 1) + 1];
                if (p < a) hi = m - 1;
                else if (p > b) lo = m + 1;
                else return true;
            }
            return false;
        };
        const inSorted = (arr, p) => {
            let lo = 0, hi = arr.length - 1;
            while (lo <= hi) {
                const m = (lo + hi) >> 1;
                if (arr[m] < p) lo = m + 1; else if (arr[m] > p) hi = m - 1; else return true;
            }
            return false;
        };

        const chromIndex = {};
        drawn.forEach((c, i) => {
            chromIndex[c.name] = i;
            chromIndex[c.name.replace(/^chr/, '')] = i;
        });
        // YEAST IS NUMBERED IN ROMAN NUMERALS, and its files disagree about how to write
        // that: the karyotype says chrIV, Ensembl says IV, the 1011-genomes matrix says
        // chromosome4 and a spreadsheet says 4. They are one chromosome, so every spelling
        // indexes it -- but only in a genome that HAS a chrI, because in any other genome
        // chrX is a sex chromosome and not the number ten.
        const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI',
            'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
        const romanGenome = drawn.some((c) => /^chrI$/i.test(c.name));
        drawn.forEach((c, i) => {
            const bare = c.name.replace(/^chr/i, '');
            if (romanGenome) {
                const n = ROMAN.indexOf(bare.toUpperCase());
                if (n > 0) {
                    for (const k of [String(n), 'chr' + n, 'chromosome' + n, 'chrom' + n,
                        'chromosome' + ROMAN[n], bare.toUpperCase(), 'chr' + bare.toUpperCase()]) {
                        if (chromIndex[k] == null) chromIndex[k] = i;
                    }
                }
            }
            if (c.circular) {
                for (const k of ['M', 'MT', 'Mito', 'chrM', 'chrMT', 'chrMito', 'mito', 'chrmt']) {
                    if (chromIndex[k] == null) chromIndex[k] = i;
                }
            }
        });

        const looksLikeVcf = (t) => {
            if (/^\s*##fileformat=VCF/im.test(t)) return true;
            if (/^#CHROM\s+POS\s+ID\s+REF\s+ALT/im.test(t)) return true;
            // ONE ROW IS ENOUGH WHEN IT IS UNMISTAKABLY ONE. A pasted VCF usually arrives
            // without its header -- a line out of a caller's output, or the one row of
            // interest. Two rows of the five-column shape count; one row counts when it
            // carries QUAL and FILTER as well, which a BED line does not (and a BED line's
            // fourth column is a name, so it fails the reference test first regardless).
            let rows = 0;
            for (const line of ('' + t).split(/\r?\n/)) {
                const str = line.trim();
                if (!str || str.charAt(0) === '#') continue;
                const f = str.split(/\t|\s+/);
                if (!/^(chr|chromosome)?([0-9XYMT]{1,5}|[IVX]{1,5}|Mito)$/i.test(f[0] || '')) continue;
                if (!/^\d+$/.test(f[1] || '')) continue;
                if (!/^[ACGTNacgtn]+$/.test(f[3] || '')) continue;
                if (!f[4]) continue;
                if (f.length >= 6 && /^(\d+(\.\d+)?|\.)$/.test(f[5] || '')) return true;
                if (++rows >= 2) return true;
            }
            return false;
        };

        // The alleles at a stored index, back as strings.
        const allelesAt = (ci, k) => {
            const d = vdata[ci];
            if (d.cplx && d.cplx.has(k)) return d.cplx.get(k);
            return [BCHAR[d.ref[k]] || 'N', BCHAR[d.alt[k]] || 'N'];
        };

        // A variant's SnpIndel, built the moment something needs one.
        const snpAt = (ci, k) => {
            const d = vdata[ci];
            if (d.snps[k]) return d.snps[k];
            if (!SnpIndel) return null;
            const c = drawn[ci];
            const nm = d.names[k] || (c.name + ':' + d.pos[k]);
            try {
                const ab = allelesAt(ci, k);
                const ty = ab[1].length > ab[0].length ? 'ins' : (ab[0].length > ab[1].length ? 'del' : 'snp');
                const o = new SnpIndel(ty, d.pos[k], ab[0], ab[1], 0, 1, nm, null, null);
                o.name = nm;
                o.source = 'VCF';
                d.snps[k] = o;
                return o;
            } catch (e) { return null; }
        };

        // ---- parsing, shared by a paste and by a file --------------------------------
        //
        // Split apart because a pasted string and a two-gigabyte file want the same parser
        // and different feeding. The expensive half -- merge, sort, histogram -- runs ONCE at
        // the end either way: doing it per chunk would sort the same array a hundred times.
        const newBufs = () => drawn.map(() => ({
            pos: new Float64Array(1024), cls: new Uint8Array(1024),
            ref: new Uint8Array(1024), alt: new Uint8Array(1024),
            gts: new Uint8Array(1024 * GT_MAX),   // GT_MAX wide while reading; packed in finalise
            cplx: new Map(), n: 0,
        }));
        const pushInto = (bufs, ci, p2, cl, rs, as, gt) => {
            const b = bufs[ci];
            if (b.n === b.pos.length) {
                // Doubled rather than pushed: this is the whole reason a genome-sized file
                // stays inside the memory of the tab.
                const np = new Float64Array(b.n * 2); np.set(b.pos); b.pos = np;
                const nc = new Uint8Array(b.n * 2); nc.set(b.cls); b.cls = nc;
                const nr = new Uint8Array(b.n * 2); nr.set(b.ref); b.ref = nr;
                const na = new Uint8Array(b.n * 2); na.set(b.alt); b.alt = na;
                const ng = new Uint8Array(b.n * 2 * GT_MAX); ng.set(b.gts); b.gts = ng;
            }
            const rc = codeOf(rs), ac = codeOf(as);
            b.pos[b.n] = p2; b.cls[b.n] = cl; b.ref[b.n] = rc; b.alt[b.n] = ac;
            if (rc === 5 || ac === 5) b.cplx.set(b.n, [rs, as]);
            if (gt) b.gts.set(gt, b.n * GT_MAX);
            b.n++;
        };
        // The genotype bytes for one row, for one alt index: null when the row has no
        // sample columns. `count.cols` maps the row's sample columns to SAMPLES slots and
        // is set from the #CHROM line, or from the first row when a paste has no header.
        const gtRow = new Uint8Array(GT_MAX);
        const genotypesOfRow = (f, count, altIdx) => {
            if (f.length < 10) return null;
            if (!count.cols) {
                count.cols = [];
                for (let j = 9; j < f.length && j < 9 + GT_MAX; j++) count.cols.push(sampleSlot('sample ' + (j - 8)));
            }
            gtRow.fill(0);
            let any = false, carriers = 0, known = 0, phased = false;
            for (let j = 0; j < count.cols.length && 9 + j < f.length; j++) {
                const si = count.cols[j];
                if (si < 0) continue;
                const cell = f[9 + j];
                const colon = cell.indexOf(':');
                const code = gtCode(colon < 0 ? cell : cell.slice(0, colon), altIdx);
                gtRow[si] = code;
                if (code) { any = true; known++; }
                if (code >= GT_HET) carriers++;
                if (code === GT_HAP1 || code === GT_HAP2 || code === GT_HOMP) phased = true;
            }
            if (!any) return null;
            // What the file has to show: samples that differ, and phase. These decide the
            // color mode the load lands in. The carrier PATTERN is what matters: a file
            // in which every row is tumour-only differs on every row and still has one
            // pattern, and coloring it by sample paints everything one color.
            if (carriers && carriers < known) count.differ = (count.differ || 0) + 1;
            if (phased) count.phased = (count.phased || 0) + 1;
            let mask = 0;
            for (let si = 0; si < GT_MAX; si++) if (gtRow[si] >= GT_HET) mask |= (1 << si);
            if (!count.masks) count.masks = {};
            if (!count.masks[mask]) { count.masks[mask] = 1; count.maskKinds = (count.maskKinds || 0) + 1; }
            return gtRow;
        };
        const parseLines = (lines, bufs, namesOf, count) => {
            for (let li = 0; li < lines.length; li++) {
                const t = lines[li];
                if (!t) continue;
                if (t.charCodeAt(0) === 35 /* # */) {
                    // The header line names the samples; every column after FORMAT is one.
                    if (t.indexOf('#CHROM') === 0) {
                        const h = t.split('\t');
                        count.cols = [];
                        for (let j = 9; j < h.length; j++) count.cols.push(sampleSlot(h[j]));
                    }
                    continue;
                }
                let f = t.split('\t');
                if (f.length < 5) f = t.trim().split(/\s+/);
                if (f.length < 5) continue;
                const pos = +f[1];
                if (!(pos > 0)) continue;
                if (!/^[ACGTNacgtn]+$/.test(f[3])) { count.skipped++; continue; }
                let ci = chromIndex[f[0]];
                if (ci == null) ci = chromIndex['chr' + f[0]];
                if (ci == null) { count.offGenome++; continue; }
                if (pos > drawn[ci].length) { count.offGenome++; continue; }
                const cl = clsOf((f.length > 7 ? f[7] : '') || '');
                const nm = (f[2] && f[2] !== '.') ? f[2] : '';
                const alts = f[4];
                const refU = f[3].toUpperCase();
                if (alts.indexOf(',') < 0) {
                    if (!/^[ACGTNacgtn]+$/.test(alts)) { count.skipped++; continue; }
                    if (vtotal + count.added < OBJECT_CAP) namesOf[ci].push(nm);
                    pushInto(bufs, ci, pos, cl, refU, alts.toUpperCase(), genotypesOfRow(f, count, 1)); count.added++;
                } else {
                    const each = alts.split(',');
                    for (let ai = 0; ai < each.length; ai++) {
                        const a = each[ai];
                        if (!/^[ACGTNacgtn]+$/.test(a)) { count.skipped++; continue; }
                        if (vtotal + count.added < OBJECT_CAP) namesOf[ci].push(nm);
                        pushInto(bufs, ci, pos, cl, refU, a.toUpperCase(), genotypesOfRow(f, count, ai + 1)); count.added++;
                    }
                }
            }
        };
        const finalise = (bufs, namesOf, count, what) => {
            for (let ci = 0; ci < drawn.length; ci++) {
                const b = bufs[ci];
                if (!b.n) continue;
                const d = vdata[ci];
                const total = d.n + b.n;
                const pos = new Float64Array(total), cls = new Uint8Array(total);
                const rf = new Uint8Array(total), al = new Uint8Array(total);
                const cx = new Map();
                // Genotypes are re-packed at today's sample count: a second file can bring
                // new samples, and the rows already here simply have no call for those.
                const W = SAMPLES.length;
                const gts = W ? new Uint8Array(total * W) : null;
                if (d.n) {
                    pos.set(d.pos.subarray(0, d.n)); cls.set(d.cls.subarray(0, d.n));
                    rf.set(d.ref.subarray(0, d.n)); al.set(d.alt.subarray(0, d.n));
                    if (d.cplx) for (const [k, v] of d.cplx) cx.set(k, v);
                    if (gts && d.gts) for (let k = 0; k < d.n; k++) for (let si = 0; si < d.gtw && si < W; si++) gts[k * W + si] = d.gts[k * d.gtw + si];
                }
                pos.set(b.pos.subarray(0, b.n), d.n);
                cls.set(b.cls.subarray(0, b.n), d.n);
                rf.set(b.ref.subarray(0, b.n), d.n);
                al.set(b.alt.subarray(0, b.n), d.n);
                for (const [k, v] of b.cplx) cx.set(k + d.n, v);
                if (gts) for (let k = 0; k < b.n; k++) for (let si = 0; si < W; si++) gts[(d.n + k) * W + si] = b.gts[k * GT_MAX + si];
                // Sorted once, by ordering an index: every draw binary-searches this.
                const order = new Uint32Array(total);
                for (let k = 0; k < total; k++) order[k] = k;
                Array.prototype.sort.call(order, (x, y) => pos[x] - pos[y]);
                const sp = new Float64Array(total), sc = new Uint8Array(total);
                const sr = new Uint8Array(total), sa = new Uint8Array(total);
                const sg = gts ? new Uint8Array(total * W) : null;
                const scx = new Map();
                const sn = [];
                const oldNames = d.names, newNames = namesOf[ci];
                for (let k = 0; k < total; k++) {
                    const o = order[k];
                    sp[k] = pos[o]; sc[k] = cls[o]; sr[k] = rf[o]; sa[k] = al[o];
                    if (sg) for (let si = 0; si < W; si++) sg[k * W + si] = gts[o * W + si];
                    if (cx.has(o)) scx.set(k, cx.get(o));
                    if (total <= OBJECT_CAP) sn[k] = (o < d.n) ? (oldNames[o] || '') : (newNames[o - d.n] || '');
                }
                d.pos = sp; d.cls = sc; d.ref = sr; d.alt = sa; d.cplx = scx;
                d.gts = sg; d.gtw = sg ? W : 0;
                d.n = total; d.snps = []; d.names = sn;
                d.__len = drawn[ci].length; d.histBy = null; d.histByKey = '';
                // Highlights are derived, not loaded: a fresh set of zeros whenever the
                // variants change, rather than something to merge and keep in step.
                d.hl = new Uint8Array(total);
                d.hlIdx = [];
                const hist = new Uint32Array(HIST_BINS);
                const scale = HIST_BINS / drawn[ci].length;
                for (let k = 0; k < total; k++) {
                    let bin = (sp[k] * scale) | 0;
                    if (bin >= HIST_BINS) bin = HIST_BINS - 1;
                    hist[bin]++;
                }
                d.hist = hist;
            }
            vtotal += count.added;
            vobjects = Math.min(vtotal, OBJECT_CAP);
            // THE FILE DECIDES HOW IT IS FIRST SEEN. Samples that differ on some rows is
            // the tumour-and-germline shape, and which sample has the change is the
            // question; failing that, phased calls are shown by haplotype. A file with
            // neither keeps whatever mode is on.
            let modeNote = '';
            if (count.cols && count.cols.length) {
                if (SAMPLES.length > 1 && count.maskKinds > 1) { setColorMode('sample'); modeNote = ' Colored by sample.'; }
                else if (count.phased) { setColorMode('phase'); modeNote = ' Colored by haplotype.'; }
                else legendShow();
                if (SAMPLES.length > 1 && count.maskKinds === 1) {
                    const only = +Object.keys(count.masks)[0];
                    const who = SAMPLES.filter((_, si) => only & (1 << si));
                    modeNote = ' Every change is in ' + (who.length ? who.join(' + ') + ' only' : 'no sample') + '.' + modeNote;
                }
            }
            if (graph.wake) graph.wake();
            const onChroms = vdata.filter((d) => d.n).length;
            graph.setMessage(' ' + count.added.toLocaleString() + ' variant'
                + (count.added === 1 ? '' : 's') + (what ? ' from ' + what : '')
                + ' placed on ' + onChroms + ' chromosome' + (onChroms === 1 ? '' : 's')
                + (vtotal !== count.added ? ' (' + vtotal.toLocaleString() + ' in total)' : '')
                + (count.cols && count.cols.length ? ' · ' + count.cols.length + ' sample' + (count.cols.length === 1 ? '' : 's')
                    + (count.phased ? ', ' + count.phased.toLocaleString() + ' phased' : '') + modeNote : '')
                + (count.offGenome ? ' · ' + count.offGenome.toLocaleString() + ' on contigs this genome does not draw' : '')
                + (count.skipped ? ' · ' + count.skipped.toLocaleString() + ' symbolic or malformed' : '')
                + '. ');
            step('vcf: ' + count.added + ' placed, ' + count.offGenome + ' off-genome, '
                + count.skipped + ' skipped, ' + vtotal + ' total');
        };

        // A pasted string: sliced with a yield between, so a large paste shows progress
        // instead of a frozen canvas.
        const addVcf = async (text, what) => {
            if (!SnpIndel) { try { SnpIndel = await exec('flexigraph/snpindel.js'); } catch (e) { } }
            const lines = ('' + text).split(/\r?\n/);
            const bufs = newBufs(), namesOf = drawn.map(() => []);
            const count = { added: 0, offGenome: 0, skipped: 0 };
            const SLICE = 20000;
            for (let start = 0; start < lines.length; start += SLICE) {
                parseLines(lines.slice(start, start + SLICE), bufs, namesOf, count);
                if (start + SLICE < lines.length) {
                    graph.setMessage(' Reading ' + count.added.toLocaleString() + ' variants… ');
                    await new Promise((r) => setTimeout(r, 0));
                }
            }
            finalise(bufs, namesOf, count, what || '');
        };

        // A FILE, READ IN SLICES RATHER THAN SWALLOWED. A whole-genome VCF is gigabytes;
        // file.text() on one asks the browser for a single string that large and it either
        // fails or takes the tab down with it. This reads 8 MB at a time, keeps the partial
        // last line between slices, and never holds more than one slice plus the typed
        // arrays.
        //
        // A COMPRESSED VCF IS UNPACKED HERE, IN THE SAME SLICES. Nearly every VCF a caller
        // writes is bgzipped -- Mutect2, Clair3, bcftools all emit BGZF -- and the name does
        // not say so reliably: aso_candidates.vcf was one. Read as text it is gzip bytes, which
        // parse to nothing; sent to the server to be asked what it is, it is a 27 MB upload
        // that unpacks past what the classifier will hold. So the bytes are looked at, not the
        // name, and a gzip is inflated in the browser on the way to the parser.
        //
        // BGZF is a run of small gzip members, one per 64 KB block, and the browser's gzip
        // decoder stops at the end of the first member (Chrome throws on what follows it).
        // Each block carries its own compressed length in its header, so the file is walked
        // block by block and every block inflated as the complete gzip it is. A plain gzip
        // has one member and is streamed whole.
        const GZ_MAGIC = (b) => b.length > 1 && b[0] === 0x1f && b[1] === 0x8b;
        const isBgzf = (b) => GZ_MAGIC(b) && b.length >= 18 && (b[3] & 4) && b[12] === 66 /* B */ && b[13] === 67 /* C */;
        const inflateBlob = async (blob, format) => {
            const rs = blob.stream().pipeThrough(new DecompressionStream(format));
            return new Uint8Array(await new Response(rs).arrayBuffer());
        };
        // Hand every line of the file to onLines, in order, decoding whatever it is. onLines
        // may return false to stop early (the sniff wants only the head). Progress is by
        // bytes of the file consumed, compressed or not.
        const readLines = async (file, onLines, onProgress) => {
            let head = new Uint8Array(0);
            try { head = new Uint8Array(await file.slice(0, 18).arrayBuffer()); } catch (e) { }
            const dec = new TextDecoder('utf-8');
            let tail = '', stopped = false;
            const feed = (bytes, last) => {
                const lines = (tail + dec.decode(bytes, { stream: !last })).split(/\r?\n/);
                // The last line of a slice is almost never a whole line.
                tail = last ? '' : lines.pop();
                if (onLines(lines) === false) stopped = true;
            };
            if (GZ_MAGIC(head)) {
                if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot unpack a gzip; decompress the file first');
                if (isBgzf(head)) {
                    // Block header: 10 fixed bytes, XLEN, then the BC subfield whose BSIZE is
                    // the whole block's length minus one. Blocks never straddle a slice for
                    // long: a partial block at the end of a slice is carried into the next.
                    const CHUNK = 8 * 1024 * 1024;
                    let offset = 0, carry = new Uint8Array(0);
                    while (offset < file.size && !stopped) {
                        const got = new Uint8Array(await file.slice(offset, Math.min(file.size, offset + CHUNK)).arrayBuffer());
                        offset += CHUNK;
                        let buf = carry.length ? (() => { const m = new Uint8Array(carry.length + got.length); m.set(carry); m.set(got, carry.length); return m; })() : got;
                        let at = 0;
                        const blocks = [];
                        while (at + 18 <= buf.length) {
                            if (!GZ_MAGIC(buf.subarray(at))) throw new Error('not a BGZF block at byte ' + (offset - CHUNK + at));
                            const bsize = (buf[at + 16] | (buf[at + 17] << 8)) + 1;
                            if (at + bsize > buf.length) break;
                            blocks.push(buf.subarray(at, at + bsize));
                            at += bsize;
                        }
                        carry = buf.slice(at);
                        // Inflate a batch at a time so the decoders overlap, then feed in order.
                        for (let i = 0; i < blocks.length && !stopped; i += 32) {
                            const outs = await Promise.all(blocks.slice(i, i + 32).map((b) => inflateBlob(new Blob([b]), 'gzip')));
                            for (const o of outs) { if (o.length) feed(o, false); if (stopped) break; }
                        }
                        if (onProgress) onProgress(Math.min(offset, file.size));
                        await new Promise((r) => setTimeout(r, 0));
                    }
                    if (!stopped && carry.length > 28) {
                        // A last block cut short by the size check above, if any.
                        try { feed(await inflateBlob(new Blob([carry]), 'gzip'), false); } catch (e) { }
                    }
                } else {
                    const reader = file.stream().pipeThrough(new DecompressionStream('gzip')).getReader();
                    let seen = 0;
                    for (; !stopped;) {
                        let r = null;
                        // A single-member gzip ends cleanly; anything odd after the member
                        // is not a reason to lose what was already read.
                        try { r = await reader.read(); } catch (e) { break; }
                        if (r.done) break;
                        feed(r.value, false);
                        seen += r.value.length;
                        if (onProgress) onProgress(Math.min(file.size, Math.round(seen / 4)));
                    }
                    try { reader.cancel(); } catch (e) { }
                }
            } else {
                const CHUNK = 8 * 1024 * 1024;
                let offset = 0;
                while (offset < file.size && !stopped) {
                    const got = new Uint8Array(await file.slice(offset, Math.min(file.size, offset + CHUNK)).arrayBuffer());
                    offset += CHUNK;
                    feed(got, false);
                    if (onProgress) onProgress(Math.min(offset, file.size));
                    await new Promise((r) => setTimeout(r, 0));
                }
            }
            if (!stopped) feed(new Uint8Array(0), true);
        };
        // The first stretch of the file as text, unpacked if it is compressed: what the sniff
        // reads. A gzip's head is inflated no further than this needs.
        const headTextOf = async (file, want) => {
            let out = '';
            try {
                await readLines(file, (lines) => { out += lines.join('\n') + '\n'; return out.length < want; });
            } catch (e) { }
            return out.slice(0, want);
        };
        const addVcfFile = async (file) => {
            if (!SnpIndel) { try { SnpIndel = await exec('flexigraph/snpindel.js'); } catch (e) { } }
            const bufs = newBufs(), namesOf = drawn.map(() => []);
            const count = { added: 0, offGenome: 0, skipped: 0 };
            await readLines(file, (lines) => { parseLines(lines, bufs, namesOf, count); }, (done) => {
                graph.setMessage(' Reading ' + file.name + ' — '
                    + Math.min(100, Math.round(done * 100 / file.size)) + '%, '
                    + count.added.toLocaleString() + ' variants… ');
            });
            finalise(bufs, namesOf, count, file.name);
            return count;
        };

        // ---- keeping the file ----------------------------------------------------------
        // Straight into the signed-in user's own drive -- no path, which is the root of My
        // Files -- through the same chunked /upload endpoint
        // baja/manchester/menu/upload-data.js uses. Chunked because the whole point of this
        // is files too big to hand over in one request.
        const uploadToMyFiles = async (file, onPct) => {
            const host_ = window['env']['apiUrl'];
            const chunkSize = 5 * 1024 * 1024;
            const totalChunks = Math.max(1, Math.ceil(file.size / chunkSize));
            const uploadId = Date.now() + '-' + Math.random().toString(36).slice(2) + '-' + file.name;
            for (let ci = 0; ci < totalChunks; ci++) {
                const start = ci * chunkSize;
                const fd = new FormData();
                fd.append('user', getUser());
                fd.append('type', 'data');
                fd.append('file', file.slice(start, Math.min(start + chunkSize, file.size)), file.name);
                fd.append('uploadId', uploadId);
                fd.append('filename', file.name);
                fd.append('chunkIndex', String(ci));
                fd.append('totalChunks', String(totalChunks));
                fd.append('fileSize', String(file.size));
                let r = null;
                try {
                    const res = await fetch(host_ + '/upload', { method: 'POST', body: fd });
                    r = await res.json();
                    if (!res.ok || (r && r.failed)) return { error: 'upload failed at chunk ' + ci };
                } catch (e) { return { error: 'network error during upload' }; }
                if (onPct) onPct(((ci + 1) / totalChunks) * 100);
            }
            return { ok: true };
        };

        // ---- ANY FILE, NOT ONLY A VCF -----------------------------------------------
        //
        // The button used to take a VCF and nothing else, and a VCF is one of the shapes
        // genetic information arrives in. A clinical report is another; so is a lab PDF, a
        // 23andMe export, a gene panel, a paper, a photo of a result. So the picker takes
        // anything, and the first question is what it is.
        //
        // A VCF IS RECOGNISED HERE, BEFORE ANYTHING IS SENT. The head of the file is read
        // locally, and a VCF header -- or rows of the five-column shape -- goes straight to
        // the streaming reader above: a five-million-row file is the case that reader was
        // built for, and the case nothing should be handed to a model. Everything else goes
        // to py/bio/genetic-file.py, which asks Claude what the file is and, for a report,
        // reads out the genes and variants it names and resolves each one to a place on
        // this genome from the annotation on the server -- deterministically, so nothing is
        // drawn where a model guessed it goes. What comes back is in the two shapes this
        // view already draws: VCF rows, and gene symbols.
        const FILE_SCRIPT = server + '/py/bio/genetic-file.py';
        const FILE_MAX_SEND = 30 * 1024 * 1024;    // the Messages API reads PDFs to 32 MB
        const FILE_HEAD = 256 * 1024;              // what is sniffed locally
        const FILE_TEXT_HEAD = 1024 * 1024;        // the head of a large text file that is sent
        const FILE_TIMEOUT_MS = 6 * 60 * 1000;
        const FILE_MAX_REGIONS = 40;               // genes a report can select at once

        const readAsBase64 = (blob) => new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onload = () => { const str = '' + fr.result; res(str.slice(str.indexOf(',') + 1)); };
            fr.onerror = () => rej(fr.error || new Error('read failed'));
            fr.readAsDataURL(blob);
        });
        const looksLikeText = (t) => {
            // A NUL in the first kilobytes is a binary file; a heap of replacement
            // characters is one that was decoded as text and is not.
            const h = t.slice(0, 4096);
            if (h.indexOf('\u0000') >= 0) return false;
            let bad = 0;
            for (let i = 0; i < h.length; i++) if (h.charCodeAt(i) === 0xfffd) bad++;
            return bad < h.length / 50;
        };
        const parseJson = (t, d) => {
            if (t && typeof t === 'object') return t;
            try { const v = JSON.parse(t || ''); return v == null ? d : v; } catch (e) { return d; }
        };

        // A TABLE OF VARIANTS THAT IS NOT A VCF: a 23andMe export, an annotated TSV, a
        // BED-like list. The model has said which column is which; the rows are read here,
        // in slices like a VCF, and fed to the same parser as five-column lines.
        const addTableFile = async (file, table) => {
            if (!SnpIndel) { try { SnpIndel = await exec('flexigraph/snpindel.js'); } catch (e) { } }
            const bufs = newBufs(), namesOf = drawn.map(() => []);
            const count = { added: 0, offGenome: 0, skipped: 0 };
            const delim = table.delimiter === 'comma' ? ',' : table.delimiter === 'semicolon' ? ';'
                : table.delimiter === 'whitespace' ? null : '\t';
            const cp = table.comment_prefix || '#';
            let headerLeft = Math.max(0, +table.header_lines || 0);
            const unq = (x) => ('' + (x == null ? '' : x)).trim().replace(/^"(.*)"$/, '$1');
            const rows = (lines) => {
                const out = [];
                for (const line of lines) {
                    if (!line) continue;
                    // The header count includes comment lines -- a 23andMe export's two
                    // '#' lines ARE its header -- so it is spent first, or those lines
                    // would be skipped as comments and the first data rows as the header.
                    if (headerLeft > 0) { headerLeft--; continue; }
                    if (cp && line.indexOf(cp) === 0) continue;
                    const f = delim ? line.split(delim) : line.trim().split(/\s+/);
                    const chrom = unq(f[table.chrom_col]);
                    const pos = unq(f[table.pos_col]);
                    if (!chrom || !/^\d+$/.test(pos)) { count.skipped++; continue; }
                    let ref = table.ref_col >= 0 ? unq(f[table.ref_col]).toUpperCase() : '';
                    let alt = table.alt_col >= 0 ? unq(f[table.alt_col]).toUpperCase() : '';
                    const id = table.id_col >= 0 ? unq(f[table.id_col]) : '';
                    if (!alt && table.genotype_col >= 0) {
                        // A genotype export gives no reference allele: the call is drawn
                        // as the first base of the genotype, and a no-call ("--") is not
                        // a variant.
                        const gt = unq(f[table.genotype_col]).toUpperCase().replace(/[^ACGTDI]/g, '');
                        if (!gt) { count.skipped++; continue; }
                        alt = gt.charAt(0) === 'D' ? 'N' : gt.charAt(0) === 'I' ? 'NN' : gt.charAt(0);
                        ref = 'N';
                    }
                    if (!/^[ACGTN]+$/.test(ref)) ref = 'N';
                    if (!/^[ACGTN,]+$/.test(alt)) { count.skipped++; continue; }
                    out.push(chrom + '\t' + pos + '\t' + (id || '.') + '\t' + ref + '\t' + alt);
                }
                return out;
            };
            await readLines(file, (lines) => { parseLines(rows(lines), bufs, namesOf, count); }, (done) => {
                graph.setMessage(' Reading ' + file.name + ' — '
                    + Math.min(100, Math.round(done * 100 / file.size)) + '%, '
                    + count.added.toLocaleString() + ' variants… ');
            });
            finalise(bufs, namesOf, count, file.name);
            return count;
        };

        // Go to one place on one chromosome -- a variant a report named.
        const gotoPlace = async (chrom, pos) => {
            const c0 = '' + (chrom || '');
            let ci = chromIndex[c0];
            if (ci == null) ci = chromIndex['chr' + c0];
            if (ci == null) ci = chromIndex[c0.replace(/^chr/i, '')];
            if (ci == null || !(pos > 0)) return false;
            return goView({
                x0: barLeft(ci) - 0.5 * SLOT, x1: barRight(ci) + 0.5 * SLOT,
                y0: wy(pos + 3000), y1: wy(Math.max(0, pos - 3000))
            });
        };

        // A REPORT, READ. The variants arrive as VCF rows and go through addVcf like a
        // paste; the genes become selected regions, labelled with what the report said
        // about them; the view frames what was found; and a shelf lists everything --
        // including what could not be placed and WHY, because a change that is not drawn
        // has to be explained or its absence reads as the report never mentioning it.
        const applyReport = async (res, file) => {
            const genes = parseJson(res.genes, []), placed = parseJson(res.variants, []);
            const unresolved = parseJson(res.unresolved, []), warnings = parseJson(res.warnings, []);
            const conditions = parseJson(res.conditions, []);
            if (res.vcf) await addVcf(res.vcf, file.name);
            // The genes, as regions. Each is looked up the way the Search button looks a
            // gene up, so synonyms and old names resolve the same way. The label is what
            // the report said: the changes it carries, or the reason it was named.
            const byGene = {};
            for (const v of placed) if (v.gene) (byGene[v.gene] = byGene[v.gene] || []).push(v);
            for (const u of unresolved) if (u.gene) (byGene[u.gene] = byGene[u.gene] || []).push(u);
            const added = [], missing = [];
            for (const g of genes.slice(0, FILE_MAX_REGIONS)) {
                graph.setMessage(' Finding ' + g.symbol + '… ');
                let f = null;
                try { f = await findGene(g.symbol); } catch (e) { f = null; }
                if (!f) { missing.push(g.symbol); continue; }
                const carried = (byGene[g.symbol] || []).map((v) => v.label).filter(Boolean);
                const label = carried.length
                    ? carried.slice(0, 3).join('; ') + (carried.length > 3 ? ' +' + (carried.length - 3) : '')
                    : (g.symbol + (g.why ? ' — ' + g.why : ''));
                const dup = regions.find((rg) => rg.i === f.ci && rg.lo === f.lo && rg.hi === f.hi);
                if (dup) { dup.label = label; dup.gene = g.symbol; added.push(dup); continue; }
                const rg = { i: f.ci, lo: f.lo, hi: f.hi, label: label, gene: g.symbol };
                regions.push(rg);
                added.push(rg);
            }
            if (genes.length > FILE_MAX_REGIONS) {
                warnings.push('The report names ' + genes.length + ' genes; the first '
                    + FILE_MAX_REGIONS + ' were selected.');
            }
            if (missing.length) {
                warnings.push('Not in the ' + (r.species || 'human') + ' annotation: ' + missing.join(', ') + '.');
            }
            // Frame it: one gene up close, several genes as the whole genome with their
            // cards, which is where the eye goes next anyway.
            if (added.length === 1) {
                const rg = added[0];
                const pad = Math.max((rg.hi - rg.lo) * 0.25, 2000) / MB;
                await goView({
                    x0: barLeft(rg.i) - 0.5 * SLOT, x1: barRight(rg.i) + 0.5 * SLOT,
                    y0: wy(rg.hi) - pad, y1: wy(rg.lo) + pad
                });
            } else if (added.length > 1) {
                await fit();
            }
            if (graph.wake) graph.wake();

            const sigName = (k) => ({
                pathogenic: 'pathogenic', likely_pathogenic: 'likely pathogenic', uncertain: 'uncertain',
                likely_benign: 'likely benign', benign: 'benign', conflicting: 'conflicting',
                risk_factor: 'risk factor', drug_response: 'drug response', other: 'other', not_stated: ''
            }[k] || '');
            const books = [];
            books.push({ section: 'What the file is', note: true, title: 'summary',
                blurb: (res.description ? res.description + ' ' : '') + (res.summary || '')
                    + (res.subject ? ' (' + res.subject + ')' : '') });
            if (conditions.length) {
                books.push({ section: 'What the file is', note: true, title: 'conditions',
                    blurb: 'Conditions: ' + conditions.join(', ') });
            }
            for (const w of warnings) books.push({ section: 'What the file is', note: true, title: 'note', blurb: w });
            if (res.notes) books.push({ section: 'What the file is', note: true, title: 'model notes', blurb: res.notes });
            if (placed.length) {
                for (const v of placed) {
                    books.push({
                        section: 'Variants placed (' + placed.length + ')',
                        title: v.label || (v.gene + ' ' + v.chrom + ':' + v.pos),
                        badge: sigName(v.classification) || 'variant',
                        blurb: v.chrom + ':' + human(v.pos) + ' ' + v.ref + '>' + v.alt
                            + (v.zygosity ? ' · ' + v.zygosity : '')
                            + (v.condition ? ' · ' + v.condition : '')
                            + ' · placed by ' + (v.how || '?')
                            + (v.note ? ' · ' + v.note : '') + '. Open to go there.',
                        open: async () => { try { hideAllModal(); } catch (e) { } await gotoPlace(v.chrom, v.pos); }
                    });
                }
            } else {
                books.push({ section: 'Variants placed (0)', note: true, title: 'none',
                    blurb: 'The file names no specific change that could be placed.' });
            }
            for (const u of unresolved) {
                books.push({ section: 'Not placed (' + unresolved.length + ')', note: true, title: u.label,
                    blurb: (u.label || '?') + ' — ' + (u.reason || 'no reason given') });
            }
            if (genes.length) {
                for (const g of genes) {
                    const lost = missing.indexOf(g.symbol) >= 0;
                    books.push({
                        section: 'Genes (' + genes.length + ')',
                        title: g.symbol, badge: lost ? 'not found' : 'gene',
                        blurb: (g.why || '') + (g.quoted === false ? ' (inferred, not named in the text)' : '')
                            + (lost ? '' : ' Open to go there.'),
                        // The region this report already selected, rather than a second
                        // copy of it from gotoGene.
                        open: lost ? undefined
                            : async () => {
                                try { hideAllModal(); } catch (e) { }
                                const rg = added.find((q) => q.gene === g.symbol);
                                if (!rg) { await gotoGene(g.symbol); return; }
                                const pad = Math.max((rg.hi - rg.lo) * 0.25, 2000) / MB;
                                await goView({
                                    x0: barLeft(rg.i) - 0.5 * SLOT, x1: barRight(rg.i) + 0.5 * SLOT,
                                    y0: wy(rg.hi) - pad, y1: wy(rg.lo) + pad
                                });
                            }
                    });
                }
            }
            try {
                await exec('baja/lib/shelf.js', {
                    id: 'baja-genetic-file',
                    title: file.name,
                    subtitle: placed.length + ' variant' + (placed.length === 1 ? '' : 's') + ' placed'
                        + (unresolved.length ? ', ' + unresolved.length + ' not placed' : '')
                        + ' · ' + added.length + ' gene' + (added.length === 1 ? '' : 's') + ' selected'
                        + (res.models ? ' · read by ' + res.models : ''),
                    books: books
                });
            } catch (e) { step('shelf failed: ' + e); }
            step('report: ' + placed.length + ' placed, ' + unresolved.length + ' unresolved, '
                + added.length + ' regions, ' + missing.length + ' genes missing');
            return placed.length + ' variant' + (placed.length === 1 ? '' : 's') + ' placed, '
                + added.length + ' gene' + (added.length === 1 ? '' : 's') + ' selected'
                + (unresolved.length ? ', ' + unresolved.length + ' not placed' : '');
        };

        // What to do with a file, by what it turns out to be. Returns one line for the
        // outcome message, or '' when it has already said what went wrong.
        // What went wrong, kept: the save that follows a failed read would otherwise put
        // "saved to My Files" over the reason, and the reader is left with a success line
        // for a file that drew nothing.
        let readFailure = '';
        const fail = (m) => { readFailure = m; graph.setMessage(' ' + m + ' '); return ''; };
        const readAnyFile = async (file) => {
            readFailure = '';
            let head = '', gz = false;
            // The magic is read from the BYTES. Decoded as text, 0x8b is not valid UTF-8 on
            // its own and comes out as U+FFFD, so a check on the string never matched.
            try { gz = GZ_MAGIC(new Uint8Array(await file.slice(0, 2).arrayBuffer())); } catch (e) { gz = false; }
            try { if (!gz) head = await file.slice(0, Math.min(file.size, FILE_HEAD)).text(); } catch (e) { head = ''; }
            // A gzip is sniffed on what is INSIDE it. Most VCFs arrive bgzipped, and a
            // name is no guide to whether one is: ".vcf" files that are gzip bytes are common.
            if (gz) {
                try { head = await headTextOf(file, FILE_HEAD); } catch (e) { head = ''; }
            }
            const isText = looksLikeText(head);
            if (isText && looksLikeVcf(head)) {
                const count = await addVcfFile(file);
                return count.added.toLocaleString() + ' variants drawn';
            }
            if (gz && file.size > FILE_MAX_SEND) {
                return fail(file.name + ' is compressed and large. Decompress it first.');
            }
            let blob = file, partial = false;
            if (file.size > FILE_MAX_SEND) {
                if (!isText) {
                    return fail(file.name + ' is ' + Math.round(file.size / 1048576)
                        + ' MB, which is more than can be read at once.');
                }
                blob = file.slice(0, FILE_TEXT_HEAD);
                partial = true;
            }
            graph.setMessage(' Asking what ' + file.name + ' is… ');
            const b64 = await readAsBase64(blob);
            const em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
            let timer = null, timedOut = false;
            const timeout = new Promise((r2) => { timer = setTimeout(() => { timedOut = true; r2(null); }, FILE_TIMEOUT_MS); });
            let res = null;
            try {
                res = await Promise.race([
                    exec(FILE_SCRIPT, em, b64, file.type || '', file.name, r.species || 'human',
                        String(file.size), partial ? '1' : '0'),
                    timeout
                ]);
            } finally { clearTimeout(timer); }
            if (timedOut) return fail('Reading ' + file.name + ' took too long.');
            if (!res || res.error) {
                return fail(file.name + ' could not be read' + (res && res.error ? ': ' + res.error : '.'));
            }
            step('genetic-file: ' + res.kind + ' — ' + res.description);
            const warnings = parseJson(res.warnings, []);
            const tail = warnings.length ? ' — ' + warnings.join(' ') : '';
            if (res.kind === 'vcf') {
                const count = await addVcfFile(file);
                return count.added.toLocaleString() + ' variants drawn' + tail;
            }
            if (res.kind === 'variant_table') {
                const table = parseJson(res.table, null);
                if (!table || table.chrom_col < 0 || table.pos_col < 0) {
                    return fail((res.description || file.name)
                        + ' — but its chromosome and position columns could not be identified.');
                }
                const count = await addTableFile(file, table);
                return count.added.toLocaleString() + ' variants drawn from the table' + tail;
            }
            if (res.kind === 'sequence' || (res.kind === 'other' && !res.genetic_content)) {
                return (res.description || 'nothing genetic was found in ' + file.name) + tail;
            }
            return await applyReport(res, file);
        };

        // The picker. Reading and uploading are separate jobs on the same file and both are
        // worth doing: whatever the file is, it is kept in My Files whether or not the
        // drawing found anything in it.
        const pickFile = (accept) => {
            try {
                const input = document.createElement('input');
                input.type = 'file';
                // The card that opened this says what kind of file it is for; the picker
                // filters to that, and the reader still checks the bytes, not the name.
                if (accept) { try { input.accept = accept; } catch (e) { } }
                input.style.cssText = 'position:fixed;left:-9999px;';
                document.body.appendChild(input);
                input.onchange = async () => {
                    const file = input.files && input.files[0];
                    try { document.body.removeChild(input); } catch (e) { }
                    if (!file) return;
                    step('file: ' + file.name + ' ' + file.size + ' bytes ' + (file.type || ''));
                    let outcome = '';
                    try { outcome = await readAnyFile(file); }
                    catch (e) {
                        graph.setMessage(' ' + file.name + ' could not be read: ' + (e && e.message ? e.message : e) + ' ');
                        step('read failed: ' + e);
                    }
                    // A VCF SAVES WITHOUT SAYING SO. It was opened to be drawn, and keeping
                    // a copy is a side effect of that; announcing the copy over the variant
                    // count reports the less interesting half. The outcome line below still
                    // says whether the copy was kept.
                    const quietSave = /\.vcf(\.b?gz)?$/i.test(file.name);
                    if (!quietSave) graph.setMessage(' Saving ' + file.name + ' to My Files… ');
                    const up = await uploadToMyFiles(file, (pct) => {
                        if (quietSave) return;
                        graph.setMessage(' Saving ' + file.name + ' to My Files — ' + Math.round(pct) + '%… ');
                    });
                    if (up && up.error) {
                        graph.setMessage(' ' + (outcome ? outcome + ', but ' : '')
                            + file.name + ' was not saved: ' + up.error + '. ');
                        step('upload failed: ' + up.error);
                    } else {
                        graph.setMessage(' ' + (outcome ? outcome + '. ' : (readFailure ? readFailure + ' ' : ''))
                            + file.name + (readFailure ? ' was still saved to My Files. ' : ' saved to My Files. '));
                        step('upload ok: ' + file.name + (readFailure ? ' (read failed: ' + readFailure + ')' : ''));
                    }
                };
                input.click();
            } catch (e) { graph.setMessage(' The file picker could not be opened: ' + e + ' '); }
        };

        // The canvas has no text field of its own, so a paste is for the view. Anything that
        // is not a VCF is left to whatever else is listening -- but it says so, because a
        // paste meant as variants that produces neither variants nor a reason is the worst
        // way for this to fail.
        // ONE listener per session, not one per open. This is registered on the WINDOW, so
        // it outlives the view: every re-entry -- the Species button reopens this module --
        // used to add another, and a paste then loaded the same VCF once per open. The
        // previous handler is kept on window so it can be found and removed, both here and
        // by the close button below.
        try {
            try {
                if (window.__karyotypePaste) {
                    window.removeEventListener('paste', window.__karyotypePaste, true);
                }
            } catch (e2) { }
            window.__karyotypePaste = (e) => {
                try {
                    if (e.target && ('' + e.target.localName).indexOf('text') >= 0) return;
                    const t = (e.clipboardData || window.clipboardData).getData('text');
                    if (!t) return;
                    if (!looksLikeVcf(t)) {
                        step('paste ignored: not read as VCF (' + t.trim().split(/\r?\n/).length + ' line(s))');
                        return;
                    }
                    e.preventDefault();
                    e.stopPropagation();
                    addVcf(t);
                } catch (e2) { }
            };
            window.addEventListener('paste', window.__karyotypePaste, true);
        } catch (e) { }

        // ---- THE 1011 YEAST GENOMES ----------------------------------------------------------
        //
        // Peter et al. 2018 (Nature 556:339) sequenced 1,011 S. cerevisiae isolates and
        // published every variant they called as one population VCF: 1.7 million sites by
        // 1,011 strains, 5.4 GB. It is the wrong shape for a browser in every way, so it is
        // not fetched here. py/bio/build-yeast-1011.py pulls it onto the server once and
        // repacks it by strain, and py/bio/yeast-1011.py answers from that in VCF text --
        // which is the one shape this view already draws, through the same addVcf a paste
        // goes through. Nothing below knows anything about the matrix's own layout.
        //
        // The dataset may not be on the server yet. The panel says so, offers to fetch it,
        // and follows the build's own progress file until it is; the panel can be closed
        // while that runs and opened again later.
        const Y1011_URL = server + '/py/bio/yeast-1011.py';
        const Y1011_CAP = 400000;
        const y1011Call = async (...args) => {
            const em = new EngineMonitor(() => { });
            return await exec(Y1011_URL, em, ...args);
        };
        let y1011Strains = null;            // every strain name, once asked for
        const yeast1011Menu = () => {
            if (document.getElementById('baja-ky-1011')) return;
            const F = 'width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;'
                + 'border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:8px 10px;font:13px Arial;';
            const L = 'display:block;font:600 12px Arial;color:#9fb3c8;margin:12px 0 5px;';
            const BTN = 'cursor:pointer;border-radius:8px;padding:8px 14px;font:700 12.5px Arial;'
                + 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;';
            const GO = 'cursor:pointer;border-radius:8px;padding:8px 16px;font:700 12.5px Arial;'
                + 'border:1px solid #22c55e;background:#22c55e;color:#04210f;';
            const CHIP = 'display:inline-block;cursor:pointer;margin:3px 4px 0 0;padding:2px 8px;'
                + 'border-radius:10px;background:#123a6b;color:#dbe9fb;font:12px Arial;';
            const nReg = regions.length;
            const chromOpts = drawn.slice().reverse()
                .map((c) => '<option value="' + esc(c.name) + '">' + esc(c.name) + ' only</option>').join('');
            const baseHint = 'Comma-separated isolate codes from the paper (AAA, AAB, … SACE_YDO); type a few letters '
                + 'to see matches. A site is drawn '
                + 'when any named strain carries a non-reference allele there; leave it empty for every '
                + 'polymorphic site in the population.';

            const panel = document.createElement('div');
            panel.id = 'baja-ky-1011';
            panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(7,26,48,0.72);'
                + 'display:flex;align-items:center;justify-content:center;font-family:Arial,Helvetica,sans-serif;';
            panel.innerHTML = ''
                + '<div style="width:min(720px,94vw);max-height:92vh;overflow:auto;background:#071a30;color:#fff;'
                + 'border-radius:12px;border:1px solid rgba(255,255,255,0.14);box-shadow:0 20px 60px rgba(0,0,0,0.5);">'
                + '<div style="display:flex;align-items:center;gap:16px;padding:16px 22px 14px;background:#0b2545;'
                + 'border-bottom:1px solid rgba(255,255,255,0.12);border-radius:12px 12px 0 0;">'
                + '<div style="min-width:0;"><div style="font:700 18px Arial;">1011 yeast genomes</div>'
                + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">Every SNP and indel called across '
                + '1,011 <i>S. cerevisiae</i> isolates (Peter et al. 2018), on the sacCer3 / R64 reference this '
                + 'karyotype is drawn to.</div></div>'
                + '<button id="y1011-x" title="Close" style="margin-left:auto;' + BTN + 'padding:6px 11px;">&#10005;</button>'
                + '</div>'
                + '<div style="padding:16px 22px 22px;">'
                + '<div id="y1011-status" style="font:13px Arial;color:#cfe0f5;padding:10px 12px;border-radius:8px;'
                + 'background:#0b2545;">Asking the server…</div>'
                + '<div id="y1011-fetchrow" style="display:none;margin-top:10px;">'
                + '<button id="y1011-fetch" style="' + GO + '">Fetch the dataset onto the server</button>'
                + '<div style="font:12px Arial;color:#9fb3c8;margin-top:6px;">Downloads the 5.4 GB matrix from '
                + '1002genomes.u-strasbg.fr once and repacks it by strain -- roughly a quarter of an hour on a fast '
                + 'line. This panel can be closed while it runs.</div></div>'
                + '<div id="y1011-form" style="display:none;">'
                + '<label style="' + L + '">Strains</label>'
                + '<input id="y1011-strains" placeholder="e.g. AAA, BAK — or empty for every polymorphic site" style="' + F + '"/>'
                + '<div id="y1011-strainhint" style="font:12px Arial;color:#9fb3c8;margin-top:5px;line-height:1.5;">' + baseHint + '</div>'
                + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0 14px;">'
                + '<div><label style="' + L + '">Where</label><select id="y1011-where" style="' + F + '">'
                + '<option value="genome">Whole genome</option>'
                + (nReg ? '<option value="regions">The ' + nReg + ' selected region' + (nReg === 1 ? '' : 's') + '</option>' : '')
                + chromOpts + '</select></div>'
                + '<div><label style="' + L + '">Variants</label><select id="y1011-kind" style="' + F + '">'
                + '<option value="all">SNPs and indels</option><option value="snp">SNPs only</option>'
                + '<option value="indel">Indels only</option></select></div>'
                + '<div><label style="' + L + '">Allele frequency, at least</label>'
                + '<input id="y1011-minaf" type="number" min="0" max="1" step="0.01" value="0" style="' + F + '"/></div>'
                + '<div><label style="' + L + '">Allele frequency, at most</label>'
                + '<input id="y1011-maxaf" type="number" min="0" max="1" step="0.01" value="1" style="' + F + '"/></div>'
                + '</div>'
                + '<div style="font:12px Arial;color:#9fb3c8;margin-top:10px;line-height:1.5;">Frequencies are across '
                + 'all 1,011 isolates. At most ' + Y1011_CAP.toLocaleString() + ' lines come back per request and the '
                + 'whole matrix holds 1.7 million sites, so a whole-genome request without a strain or a frequency '
                + 'band is cut short; one chromosome at a time is not.</div>'
                + '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">'
                + '<button id="y1011-cancel" style="' + BTN + '">Close</button>'
                + '<button id="y1011-go" style="' + GO + '">Add variants</button></div>'
                + '</div></div></div>';
            document.body.appendChild(panel);
            for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
                panel.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
            }
            const q = (sel) => panel.querySelector(sel);
            let closed = false, timer = null;
            const close = () => {
                closed = true;
                if (timer) { clearTimeout(timer); timer = null; }
                try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
            };
            panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
            q('#y1011-x').onclick = close;
            q('#y1011-cancel').onclick = close;

            // ---- what the server has ----
            const show = (st) => {
                const state = (st && st.state) || 'error';
                const msg = (st && (st.message || st.error)) || 'The server did not say.';
                q('#y1011-status').textContent = msg;
                q('#y1011-status').style.color = state === 'error' ? '#fca5a5' : '#cfe0f5';
                q('#y1011-fetchrow').style.display = (state === 'absent' || state === 'error') ? '' : 'none';
                q('#y1011-form').style.display = state === 'ready' ? '' : 'none';
                if (state === 'ready') ensureStrains();
            };
            const poll = async (action) => {
                let st = null;
                try { st = await y1011Call(action || 'status'); }
                catch (e) { st = { state: 'error', message: 'The server did not answer: ' + (e && e.message ? e.message : e) }; }
                if (closed) return;
                show(st);
                step('1011 genomes ' + (action || 'status') + ': ' + ((st && st.state) || '?') + ' ' + ((st && st.message) || ''));
                if (st && st.state === 'building') timer = setTimeout(() => poll(), 4000);
            };
            q('#y1011-fetch').onclick = () => {
                q('#y1011-fetchrow').style.display = 'none';
                q('#y1011-status').textContent = 'Starting the download…';
                poll('fetch');
            };

            // ---- strain names, offered as the user types ----
            const sIn = q('#y1011-strains'), sHint = q('#y1011-strainhint');
            const ensureStrains = async () => {
                if (y1011Strains) return;
                try {
                    const rs = await y1011Call('strains');
                    y1011Strains = JSON.parse((rs && rs.strains) || '[]');
                } catch (e) { y1011Strains = []; }
            };
            sIn.addEventListener('input', () => {
                const parts = sIn.value.split(',');
                const cur = parts[parts.length - 1].trim().toLowerCase();
                if (!cur || !y1011Strains || !y1011Strains.length) { sHint.innerHTML = baseHint; return; }
                const m = y1011Strains.filter((n) => n.toLowerCase().indexOf(cur) >= 0).slice(0, 16);
                sHint.innerHTML = m.length
                    ? m.map((n) => '<span data-n="' + esc(n) + '" style="' + CHIP + '">' + esc(n) + '</span>').join('')
                    : 'No strain in the set matches "' + esc(cur) + '".';
            });
            sHint.addEventListener('click', (e) => {
                const n = e.target && e.target.getAttribute && e.target.getAttribute('data-n');
                if (!n) return;
                const parts = sIn.value.split(',');
                parts[parts.length - 1] = ' ' + n;
                sIn.value = parts.join(',').replace(/^\s+/, '') + ', ';
                sHint.innerHTML = baseHint;
                try { sIn.focus(); } catch (e2) { }
            });

            // ---- the request ----
            q('#y1011-go').onclick = async () => {
                const strains = sIn.value.split(',').map((t) => t.trim()).filter(Boolean).join(',');
                const where = q('#y1011-where').value, kind = q('#y1011-kind').value;
                const minAf = Math.max(0, Math.min(1, +q('#y1011-minaf').value || 0));
                const maxAf = Math.max(0, Math.min(1, isNaN(+q('#y1011-maxaf').value) ? 1 : +q('#y1011-maxaf').value));
                const calls = [];                            // [chrom, lo, hi, said]
                if (where === 'genome') calls.push(['', '', '', 'the whole genome']);
                else if (where === 'regions') {
                    for (const rg of regions) {
                        const c = drawn[rg.i];
                        if (!c) continue;
                        calls.push([c.name, '' + Math.max(1, Math.floor(rg.lo)), '' + Math.ceil(rg.hi),
                            c.name + ':' + human(Math.floor(rg.lo)) + '-' + human(Math.ceil(rg.hi))]);
                    }
                } else calls.push([where, '', '', where]);
                if (!calls.length) { graph.setMessage(' Nothing is selected to ask about. '); return; }
                close();
                let text = '', count = 0, truncated = false, note = '';
                const what = '1011 genomes' + (strains ? ' (' + strains + ')' : '');
                for (const [c, lo, hi, said] of calls) {
                    graph.setMessage(' Asking the 1011 genomes for ' + said + (strains ? ' in ' + strains : '') + '… ');
                    let rs = null;
                    try {
                        // '-' for a blank: the argument list travels positionally and an
                        // empty value is the one thing worth not trusting to survive it.
                        rs = await y1011Call('variants', strains || '-', c || '-', lo || '-', hi || '-',
                            '' + minAf, '' + maxAf, kind, '' + Y1011_CAP);
                    } catch (e) { rs = { error: (e && e.message ? e.message : '' + e) }; }
                    if (!rs || rs.error) {
                        graph.setMessage(' The 1011 genomes did not answer: ' + ((rs && rs.error) || 'no result') + ' ');
                        step('1011 variants failed: ' + ((rs && rs.error) || 'no result'));
                        return;
                    }
                    if (rs.vcf) { text += (text ? '\n' : '') + rs.vcf; count += (+rs.count || 0); }
                    if (rs.truncated) truncated = true;
                    if (rs.note) note = '' + rs.note;
                }
                if (!count) {
                    graph.setMessage(' No 1011-genomes variants matched' + (strains ? ' for ' + strains : '')
                        + (note ? ' — ' + note : '') + '. ');
                    return;
                }
                await addVcf(text, what);
                if (truncated || note) {
                    graph.setMessage(' ' + count.toLocaleString() + ' variants from the ' + what
                        + (truncated ? ' — cut short at ' + Y1011_CAP.toLocaleString() + ' lines.' : '.')
                        + (note ? ' ' + note : '') + ' ');
                }
            };
            poll();
        };

        // ---- drag a region off a chromosome --------------------------------------------------
        // The selection is in WORLD coordinates, so the same drag means the same thing at
        // every zoom level, and the rectangle handed to zoomRect is the rectangle drawn.
        // PANNING IS THE DEFAULT STATE. A karyotype is a thing to move around and look at
        // before it is a thing to select from, and a canvas that only drags out regions makes
        // the ordinary gesture -- push the picture sideways -- do something else.
        //
        // With no listeners installed the graph pans and zooms on its own. The one thing to
        // stop is its habit of filling that vacuum: a click on a bare canvas re-arms
        // mouse-over-highlight, which is the hover tool for TRACKS and has nothing to hover
        // here. __hoverRearm is the graph's own override for exactly that.
        //
        // It is pointed BACK AT pan, not at a function that does nothing. The graph clears
        // the listeners whenever it returns to navigate -- which box zoom does the moment it
        // finishes, being one-shot -- and a no-op re-arm left this view with no listeners at
        // all: the zoom landed and then nothing on the canvas was clickable until something
        // else happened to reinstall them. pan() IS this view's default interaction, so it
        // is the right answer to "put the canvas back the way it was". No loop: the graph
        // only re-arms when no listeners are installed, and pan installs them.
        const pan = () => {
            graph.clearMouseListeners();
            try { graph.__hoverRearm = () => { pan(); }; } catch (e) { }
            try { graph.graph.mode = 'navigate'; } catch (e) { }
            // Released here and only here: arm() takes it, and every path out of arm()
            // ends in pan(), so navigating can never be left switched off.
            try { graph.graph.__suppressPan = false; } catch (e) { }
            armed = false;
            dragging = null;
            // A CLICK, NOT A DRAG. Navigating is the same gesture until the pointer
            // moves, so a press that goes nowhere is the one that opens a variant.
            let downAt = null;
            // World in, pixels kept alongside: "did the pointer move" is a question about
            // the screen, and three world units is three megabases at one zoom and three
            // bases at another.
            graph.addMouseDownListener((x, y) => { downAt = { x: x, y: y, px: SX(x), py: SY(y) }; });
            graph.addMouseUpListener(async (x, y) => {
                const d0 = downAt; downAt = null;
                if (!d0) return;
                if (Math.abs(SX(x) - d0.px) > 3 || Math.abs(SY(y) - d0.py) > 3) return;
                // A CALLOUT CARD FIRST OF ALL. It is drawn over the karyotype, so a click
                // that lands on one was aimed at it and not at the chromosome behind it.
                const card = calloutAt(SX(x), SY(y));
                if (card) {
                    activeRegion = geneKey(card.rg);
                    if (graph.wake) graph.wake();
                    calloutMenu(card.rg);
                    return;
                }
                // A PATENT NAME ON THE BAR. Tested before the variants underneath it: it is
                // drawn over them on its own backing, so a click that lands on the words was
                // aimed at the words.
                const pl = patLabelAt(SX(x), SY(y));
                if (pl) {
                    // Clicking the metadata opens a LIBRARY: a summary label lists every patent
                    // over that stretch, each drilling into its record; a single label opens
                    // that patent's record directly. The record's leaf opens the publication.
                    if (pl.cluster) { await patentInfoCluster({ ci: pl.ci, lo: pl.lo, hi: pl.hi, n: pl.n }); }
                    else { patentInfoOne(pl, pl.where); }
                    return;
                }
                // THE PATENT STRIP, on the other side of the bar from everything else.
                const ph = patAt(x, y);
                if (ph) { await patOpen(ph); return; }
                // A MARK NEXT. It lives in the gutter beside the bar, where nothing else
                // is clickable, so it can never take a click meant for a variant on the
                // bar -- and it works at zooms where variantAt correctly refuses.
                const mk = markAt(x, y);
                if (mk) {
                    const c2 = drawn[mk.ci];
                    graph.setMessage(' ' + c2.name + ':' + human(mk.bp)
                        + ' — reading the transcripts there… ');
                    try {
                        // Two bases wide: the question is which transcripts CONTAIN this
                        // position, and the position is the answer's whole subject.
                        await openRange(mk.ci, Math.max(0, mk.bp - 1),
                            Math.min(c2.length, mk.bp + 1), mk.bp);
                    } catch (e) {
                        step('transcripts at a mark threw: ' + e);
                        graph.setMessage(' Could not read the transcripts there: '
                            + (e && e.message ? e.message : e) + ' ');
                    }
                    return;
                }
                const hit = variantAt(x, y);
                if (!hit) {
                    // Nothing specific under the pointer: if it is inside a selected region,
                    // that is what was clicked.
                    const rg = regionAt(x, y);
                    if (rg) {
                        activeRegion = geneKey(rg);
                        if (graph.wake) graph.wake();
                        calloutMenu(rg);
                    }
                    return;
                }
                try { await showVariant(hit.ci, hit.k); } catch (e) {
                    step('variant panel threw: ' + e);
                }
            });
        };

        const arm = () => {
            graph.clearMouseListeners();
            // MOUSE-OVER HIGHLIGHT OFF. clearMouseListeners nulls highlightmethod, and
            // __hoverRearm is the graph's own override for the re-arm that would otherwise
            // exec the hover tool back over this view a tick later.
            try { graph.__hoverRearm = () => { }; } catch (e) { }
            try { graph.highlightmethod = null; } catch (e) { }
            // NOT setMouseMode. It calls
            //     clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js')
            // which nulls highlightmethod AND execs the hover tool over this view -- so the
            // karyotype drew once, and vanished the moment arm() ran a second later. The mode
            // string is the only part of setMouseMode this view wants, and it is one
            // assignment.
            //
            // AND THE PAN HAS TO STOP. graph.js pans on
            //     this.mode == 'navigate' && mouse_down && !this.__touchActive && !this.__suppressPan
            // so the mode token alone is one lock out of two, and the wrong one to rely on:
            // it is a shared string that any canvas button can put back to 'navigate' --
            // several of them do, on a timer -- and the moment one does, the drag that was
            // choosing a range starts dragging the whole view instead, under a pointer that
            // is still measuring against a chromosome now sliding beneath it.
            //
            // __suppressPan is the lock graph.js documents for precisely this ("Without it
            // the canvas pans under the drag"), and nothing else touches it. Both are taken
            // here and both are released in pan().
            try { graph.graph.mode = 'karyoselect'; } catch (e) { }
            try { graph.graph.__suppressPan = true; } catch (e) { }
            armed = true;
            // The press that hit the button is still in flight. bclick is how every canvas
            // tool in gene.js keeps that press from being read as the first gesture of the
            // tool it just started; the lasso holds it for the same 100 ms.
            // Only when nothing holds it: arriving from the canvas button, gene.js has
            // already set bclick to 'select_seq', and that value is what suppresses the
            // button's own press feedback for the same 100 ms. Overwriting it would take
            // the press animation off the button that was just pressed.
            try {
                if (!graph.bclick) {
                    graph.bclick = 'karyoselect';
                    setTimeout(() => {
                        try { if (graph.bclick === 'karyoselect') graph.bclick = ''; } catch (e) { }
                    }, 100);
                }
            } catch (e) { }
            graph.setMessage(' Select sequence — drag down a chromosome to choose a range. ');
            let from = null;
            graph.addMouseDownListener((x, y) => {
                // x and y are already WORLD. The pixel is taken here and kept alongside:
                // whether a gesture was a click or a drag is a question about the hand,
                // not about the genome, and the answer has to be the same at every zoom.
                from = { x: x, y: y, px: SX(x), py: SY(y) };
                dragging = null;
            });
            graph.addMouseMoveListener((x, y) => {
                if (!from) return;
                const h = at(from.x, from.y) || at(x, y);
                if (!h) return;
                // This is what draws the box: paint() reads `dragging` every frame, and
                // wake() asks for that frame now rather than at the next idle repaint.
                dragging = { i: h.i, y0: from.y, y1: y };
                if (graph.wake) graph.wake();
            });
            graph.addMouseUpListener(async (x, y) => {
                const to = { x: x, y: y };
                const f = from; from = null;
                dragging = null;
                if (!f) return;
                const a = at(f.x, f.y), b = at(to.x, to.y);
                const hit = a || b;
                if (!hit) { graph.setMessage(' Nothing there — drag on a chromosome. '); pan(); return; }
                // World y runs negative down the chromosome, so the HIGHER world y is the
                // LOWER base. Clamped to the chromosome: a drag that runs off the end means
                // "to the end", not a coordinate past it.
                if (hit.circular) {
                    graph.setMessage(' ' + hit.chrom.name + ' — the mitochondrial genome, '
                        + human(hit.chrom.length) + ' bp, circular. Drawn as a ring and not to '
                        + 'the scale of the others. ');
                    pan();
                    return;
                }
                const clamp = (bp) => Math.max(0, Math.min(hit.chrom.length, Math.round(bp)));
                const lo = clamp(-Math.max(f.y, to.y) * MB);
                const hi = clamp(-Math.min(f.y, to.y) * MB);
                // A CLICK IS NOT A REGION -- but that is a question about the POINTER, and
                // it used to be asked in bases: under 250 kb of span, read it as a click.
                // A drag is only 250 kb wide while the whole genome is on screen. Zoomed in
                // to a gene, every deliberate drag is smaller than that, and at sequence
                // zoom the entire canvas is under a hundred bases tall -- so every attempt
                // to select was answered by zooming out to the whole chromosome, which is
                // what "selecting a region does not work" was. Pixels travelled is the same
                // test at every zoom, and it is the one the hand is actually making.
                if (Math.hypot(SX(x) - f.px, SY(y) - f.py) < DRAG_MIN_PX) {
                    await goView({
                        x0: barLeft(hit.i) - 0.35 * SLOT, x1: barRight(hit.i) + 0.35 * SLOT,
                        y0: wy(hit.chrom.length) - 2, y1: 2
                    });
                    graph.setMessage(' ' + hit.chrom.name + ' — ' + human(hit.chrom.length) + ' bp. '
                        + 'Drag to move; Select sequence to choose a range. ');
                    pan();
                    return;
                }
                // Padding is a share of the region, with a floor of twenty bases rather
                // than of half a megabase: an absolute floor re-frames a 100-base selection
                // as a 1 Mb view, which is the same lost depth arriving by another road.
                const padMb = Math.max((hi - lo) / MB * 0.08, 20 / MB);
                await goView({
                    x0: barLeft(hit.i) - 0.5 * SLOT, x1: barRight(hit.i) + 0.5 * SLOT,
                    y0: wy(hi) - padMb, y1: wy(lo) + padMb
                });
                // The lasso IS the region picker. A dragged range is remembered as well as
                // opened, so Regions has something to work on without a second button
                // that does almost the same thing.
                regions.push({ i: hit.i, lo: lo, hi: hi });
                try { await openRange(hit.i, lo, hi); } catch (e) { step('range failed: ' + e); }
                // The span in whatever unit it is actually in. Rounded to Mb, every
                // selection made at gene zoom or closer reported itself as "0 Mb".
                const spanBp = hi - lo;
                const spanTxt = spanBp >= 1e6 ? (Math.round(spanBp / 1e4) / 100) + ' Mb'
                    : spanBp >= 1e3 ? (Math.round(spanBp / 10) / 100) + ' kb'
                        : spanBp.toLocaleString() + ' bp';
                graph.setMessage(' ' + hit.chrom.name + ':' + human(lo) + '-' + human(hi)
                    + '  (' + spanTxt + ') — region '
                    + regions.length + '. Drag again to add another, then Regions. ');
                step('region added ' + hit.chrom.name + ':' + lo + '-' + hi
                    + ' (' + regions.length + ' selected)');
                try {
                    graph.__karyotypeRegion = { chr: hit.chrom.name.replace(/^chr/, ''), start: lo, end: hi };
                } catch (e) { }
                // One region per arming: the next drag is a pan again, which is the gesture
                // someone reaches for straight after choosing a place to look at.
                pan();
            });
        };

        // ---- save and open, as JSON ------------------------------------------------------
        //
        // The same shape the editor uses -- a JSON document in the user's own drive, written
        // through /save-user-data and read back through /load-file -- so a karyotype sits
        // beside the .baja screens in the same file browser rather than in a store of its own.
        //
        // WHAT IS WORTH SAVING is the variants and where you were looking, not the
        // chromosomes: those come from the karyotype table on the server and are the same for
        // everyone. A file that carried its own copy of hg38's bands would be forty times
        // larger and would go stale the day the table is rebuilt.
        // VARIANTS WRITTEN TO A FILE. Raised from 250,000 so a whole VCF is saved
        // rather than its first quarter-million.
        //
        // The ceiling is still a ceiling, not decoration. A version 2 variant costs
        // about 18 bytes of JSON -- measured, not guessed: re-encoding a real
        // 250,000-variant file took it from 10,083,143 to 4,583,143 bytes, 40.3 to
        // 18.3 bytes each -- so ten million is roughly a 180 MB document. The browser
        // still holds the variant array AND the stringified copy at once while it
        // saves. Above this a tab is likelier to run out of memory than to finish,
        // and a save that hangs is worse than one that says it truncated.
        //
        // The chain below is known to take it: express accepts an 8gb body, nginx
        // client_max_body_size is 512m, and /save-user-data writes straight to disk.
        const SAVE_CAP = 10000000;    // variants written to a file
        // JSON inside, but the extension names what the file IS, not how it is
        // encoded -- the same reason a .baja file does not announce itself as .json.
        // Nothing filters My Files by extension, so the browser lists and opens it
        // exactly as before.
        const SAVE_EXT = '.karyotype';

        const stateDoc = () => {
            const out = {
                type: 'baja-karyotype', version: 3,
                species: r.species || wanted, assembly: r.assembly || '',
                saved: new Date().toISOString(),
                view: null, bookmarks: [], variants: [], truncated: false, total: vtotal,
            };
            out.view = viewOf();
            // The rest of the live state, so a reload is exactly what was saved: the sample
            // columns and per-variant genotypes (what "color by sample / phase" needs), the
            // selected regions, the color scheme, and the active highlight.
            const __hasGt = SAMPLES.length > 0;
            out.samples = SAMPLES.slice();
            out.hasGt = __hasGt;
            out.colorMode = colorMode;
            // The per-sample colours the user chose, so the by-sample view reopens in the
            // same colours. One hex per sample column, in sample order.
            out.sampleColors = SAMPLES.map((nm, si) => SAMPLE_COLOR[si] || '');
            out.highlight = hlActive || 0;
            out.regions = (regions || []).map((rg) => ({ i: rg.i, lo: rg.lo, hi: rg.hi, label: rg.label || '', gene: rg.gene || '' }));
            // The bookmarks go with the file. They are four numbers and a name each, so
            // they cost nothing next to the variants and are the part a reader opening
            // this tomorrow cannot reconstruct.
            out.bookmarks = bookmarks.map((b) => ({
                name: b.name || '', x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, at: b.at || ''
            }));
            // VERSION 2: one string per variant, "chrom:pos:ref:alt[:class[:name]]".
            //
            // Version 1 wrote {"c":"21","p":12345,"r":"A","a":"G"} -- the four key names
            // repeated once per variant, which at five and a half million of them is most
            // of the file. The string form is about a third of the size, and it costs one
            // string rather than one object per variant while the document is being built,
            // which is what decides whether a whole VCF can be saved at all.
            //
            // Name goes LAST and may itself contain ':' -- the reader takes the first four
            // fields by position and rejoins the remainder, so a VCF ID with a colon in it
            // survives the round trip.
            // VERSION 3 fields: chrom:pos:ref:alt:class[:gt][:name].
            //   class  always present (0 for none), so gt has a fixed position after it.
            //   gt     only when the file has samples (out.hasGt) -- one digit per sample
            //          slot (GT_* codes are 0..7), in SAMPLES order. Empty for a row with no
            //          genotype. Omitted entirely for a file with no sample columns, so a
            //          sample-less VCF is no larger than before.
            //   name   last, rejoined so a ':' inside a VCF id survives.
            let n = 0;
            for (let ci = 0; ci < drawn.length && n < SAVE_CAP; ci++) {
                const d = vdata[ci];
                if (!d.n) continue;
                const bare = drawn[ci].name.replace(/^chr/, '');
                const gw = d.gtw || 0;
                for (let k = 0; k < d.n && n < SAVE_CAP; k++) {
                    const ab = allelesAt(ci, k);
                    const cls = d.cls[k] || 0;
                    const nm = d.names[k] || '';
                    let e = bare + ':' + d.pos[k] + ':' + ab[0] + ':' + ab[1] + ':' + cls;
                    if (__hasGt) {
                        let gt = '';
                        if (gw) { for (let si = 0; si < gw && si < GT_MAX; si++) gt += (d.gts[k * gw + si] || 0); }
                        e += ':' + gt;
                    }
                    if (nm) e += ':' + nm;
                    out.variants.push(e);
                    n++;
                }
            }
            out.truncated = vtotal > n;
            return out;
        };

        const applyDoc = async (doc, onProgress) => {
            if (!doc || doc.type !== 'baja-karyotype') {
                graph.setMessage(' That file is not a saved karyotype. ');
                return false;
            }
            if (doc.species && r.species && ('' + doc.species).toLowerCase() !== ('' + r.species).toLowerCase()) {
                // Not refused -- positions are positions -- but said, because a mouse file on
                // a human karyotype puts variants at coordinates that mean nothing.
                graph.setMessage(' That file was saved for ' + doc.species + ' and this is '
                    + r.species + '. Positions may not mean what they did. ');
            }
            if (!SnpIndel) { try { SnpIndel = await exec('flexigraph/snpindel.js'); } catch (e) { } }
            // Version 1 wrote an object per variant, version 2 a string. Both are read:
            // the v1 files are still in people's folders and are the same data.
            const __V = +(doc.version || 1);
            const __HASGT = !!doc.hasGt;
            const asVariant = (raw) => {
                if (raw && typeof raw === 'object') return raw;      // version 1
                if (typeof raw !== 'string') return null;
                const f = raw.split(':');
                if (f.length < 4) return null;
                const o = { c: f[0], p: +f[1], r: f[2], a: f[3] };
                if (f.length > 4 && f[4] !== '') o.s = +f[4] || 0;
                if (__V >= 3 && __HASGT) {
                    // v3 with samples: field 5 is the genotype digits, name is the rest.
                    if (f.length > 5 && f[5]) o.g = f[5];
                    if (f.length > 6) { const nm = f.slice(6).join(':'); if (nm) o.n = nm; }
                } else {
                    // v1/v2 or v3 without samples: name follows the class.
                    if (f.length > 5) { const nm = f.slice(5).join(':'); if (nm) o.n = nm; }
                }
                return o;
            };
            // Restore the sample columns BEFORE placing variants, so finalise packs the
            // genotype lane to the right width (SAMPLES.length).
            if (Array.isArray(doc.samples) && doc.samples.length) {
                try { SAMPLES.length = 0; for (const nm of doc.samples.slice(0, GT_MAX)) SAMPLES.push('' + nm); } catch (e) { }
            }
            const __gtScratch = new Uint8Array(GT_MAX);
            const bufs = newBufs(), namesOf = drawn.map(() => []);
            const count = { added: 0, offGenome: 0, skipped: 0 };
            const list = doc.variants || [];
            const total = list.length;
            let seen = 0;
            // Driven from HERE rather than from the two call sites, so opening by deep
            // link and opening from the file browser report the same way. Below the
            // threshold the whole thing is over before a bar could be read.
            const BAR_MIN = 20000;
            const showBar = total >= BAR_MIN;
            if (showBar) {
                placeShow('Opening ' + (doc.name || 'the karyotype'),
                    'Placing 0 of ' + total.toLocaleString() + ' variants…');
                await paintTick();
            }
            try {
                for (const raw of list) {
                    // Yield every so often. This loop is what blocks the browser on a big
                    // file, and a progress report that cannot repaint during it is a
                    // picture of a progress report. ++seen before the continues below, so
                    // a skipped variant still counts as one gone past.
                    if ((++seen % 50000) === 0) {
                        if (onProgress) onProgress(seen, total);
                        if (showBar) {
                            placeSay(null, 'Placing ' + seen.toLocaleString() + ' of '
                                + total.toLocaleString() + ' variants…', seen * 100 / total);
                        }
                        await new Promise((res) => setTimeout(res, 0));
                    }
                    const v = asVariant(raw);
                    if (!v) { count.skipped++; continue; }
                    let ci = chromIndex[v.c];
                    if (ci == null) ci = chromIndex['chr' + v.c];
                    if (ci == null) { count.offGenome++; continue; }
                    if (!(v.p > 0) || v.p > drawn[ci].length) { count.offGenome++; continue; }
                    if (vtotal + count.added < OBJECT_CAP) namesOf[ci].push(v.n || '');
                    let __gt = null;
                    if (v.g) { __gtScratch.fill(0); for (let si = 0; si < v.g.length && si < GT_MAX; si++) { const c = v.g.charCodeAt(si) - 48; __gtScratch[si] = (c >= 0 && c <= 9) ? c : 0; } __gt = __gtScratch; }
                    pushInto(bufs, ci, +v.p, +(v.s || 0), ('' + (v.r || 'N')).toUpperCase(),
                        ('' + (v.a || 'N')).toUpperCase(), __gt);
                    count.added++;
                }
                if (onProgress) onProgress(total, total);
                // THE PHASE THAT USED TO REPORT NOTHING. finalise sorts every chromosome's
                // positions, which on a whole-genome file is the longest single freeze in the
                // open -- and it is synchronous, so the only honest thing is to say what is
                // happening and let the browser paint it before starting.
                if (showBar) {
                    placeSay(null, 'Sorting and indexing ' + count.added.toLocaleString()
                        + ' variants…', null);
                    await paintTick();
                }
                finalise(bufs, namesOf, count, doc.name || 'the saved file');
            } finally { placeHide(); }
            // Bookmarks come back before the view does, so the camera list is already
            // right at the moment the file finishes opening. Files saved before bookmarks
            // existed simply have none, which is the correct reading of a missing field.
            if (Array.isArray(doc.bookmarks)) {
                bookmarks = doc.bookmarks
                    .filter((b) => b && isFinite(b.x0) && isFinite(b.x1)
                        && isFinite(b.y0) && isFinite(b.y1))
                    .slice(0, BOOKMARK_CAP)
                    .map((b) => ({
                        name: ('' + (b.name || '')).slice(0, 80),
                        x0: +b.x0, x1: +b.x1, y0: +b.y0, y1: +b.y1, at: b.at || ''
                    }));
            }
            // Selected regions, color scheme and the active highlight, so the reload is
            // exactly what was saved.
            if (Array.isArray(doc.regions)) {
                try {
                    regions = doc.regions.filter((rg) => rg && rg.i != null && isFinite(+rg.lo) && isFinite(+rg.hi))
                        .map((rg) => ({ i: +rg.i, lo: +rg.lo, hi: +rg.hi, label: rg.label || '', gene: rg.gene || '' }));
                } catch (e) { }
            }
            if (Array.isArray(doc.sampleColors)) {
                try {
                    doc.sampleColors.forEach((c, si) => {
                        if (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)) SAMPLE_COLOR[si] = c;
                    });
                } catch (e) { }
            }
            if (doc.colorMode && ['class', 'sample', 'phase'].indexOf(doc.colorMode) >= 0) {
                try { setColorMode(doc.colorMode); } catch (e) { }
            }
            if (doc.highlight) {
                const __kmap = { 1: 'coding', 2: 'intronic', 3: 'three_utr', 4: 'five_utr', 5: 'pathogenic' };
                const __kind = __kmap[doc.highlight];
                // Best-effort and un-awaited: it re-fetches annotation to re-derive the marks,
                // which can be slow, and the karyotype is already interactive by now.
                if (__kind) { try { Promise.resolve(applyFilter(__kind, doc.highlight)).catch(() => { }); } catch (e) { } }
            }
            // Through goView, not zoomRect: a file saved at sequence zoom reopened at
            // genome zoom was the same lost depth, one level up.
            if (doc.view && isFinite(doc.view.x0)) await goView(doc.view);
            pan();
            return true;
        };

        // ---- WHAT THE REGIONS ARE FOR ------------------------------------------
        //
        // Two kinds of operation. One edits the variant set -- drop these, keep only
        // these -- and rebuilds the arrays; the other only marks, writing a code into
        // the highlight channel so paint() colors those variants without changing
        // what they are.

        // Rebuild every chromosome's arrays keeping the variants keep() accepts. The
        // histogram is rebuilt with them: it drives the density view, and leaving it
        // stale would draw a file that no longer exists.
        const rebuildKeeping = (keep, label) => {
            let kept = 0, removed = 0;
            for (let ci = 0; ci < drawn.length; ci++) {
                const d = vdata[ci];
                if (!d.n) continue;
                const idx = [];
                for (let k = 0; k < d.n; k++) if (keep(ci, d.pos[k])) idx.push(k);
                removed += d.n - idx.length;
                const total = idx.length;
                const sp = new Float64Array(total), sc = new Uint8Array(total);
                const sr = new Uint8Array(total), sa = new Uint8Array(total);
                const sh = new Uint8Array(total), scx = new Map(), sn = [];
                const hadNames = d.names && d.names.length;
                for (let j = 0; j < total; j++) {
                    const k = idx[j];
                    sp[j] = d.pos[k]; sc[j] = d.cls[k]; sr[j] = d.ref[k]; sa[j] = d.alt[k];
                    if (d.hl) sh[j] = d.hl[k];
                    if (d.cplx && d.cplx.has(k)) scx.set(j, d.cplx.get(k));
                    if (hadNames) sn[j] = d.names[k] || '';
                }
                d.pos = sp; d.cls = sc; d.ref = sr; d.alt = sa; d.hl = sh;
                d.cplx = scx; d.names = sn; d.snps = []; d.n = total;
                const hist = new Uint32Array(HIST_BINS);
                const scale = HIST_BINS / drawn[ci].length;
                for (let k = 0; k < total; k++) {
                    let bin = (sp[k] * scale) | 0;
                    if (bin >= HIST_BINS) bin = HIST_BINS - 1;
                    hist[bin]++;
                }
                d.hist = hist;
                kept += total;
            }
            reindexHighlights();
            vtotal = kept;
            vobjects = Math.min(vtotal, OBJECT_CAP);
            if (graph.wake) graph.wake();
            graph.setMessage(' ' + label + ' — ' + removed.toLocaleString() + ' removed, '
                + kept.toLocaleString() + ' left. ');
            step(label + ': removed ' + removed + ', kept ' + kept);
        };

        // Marked variants get their OWN index. The density mode draws histogram bins
        // and never iterates the variants -- that is what keeps a genome-sized file
        // cheap -- so a marked variant would never be drawn at the zoom people
        // actually mark at. Drawing from this index costs the number of highlights in
        // view rather than the number of variants.
        const reindexHighlights = () => {
            for (let ci = 0; ci < drawn.length; ci++) {
                const d = vdata[ci];
                if (!d) continue;
                const idx = [];
                if (d.hl && d.n) {
                    for (let k = 0; k < d.n; k++) if (d.hl[k]) idx.push(k);
                }
                d.hlIdx = idx;              // ascending k, so ascending position
                // AND a histogram, on the same bins as d.hist. The marks have to survive
                // the density mode, where nothing iterates the variants -- and a global
                // cap on how many dots to draw per frame is not the answer: with the
                // chromosomes drawn smallest first, a cap simply stops part-way through
                // whichever chromosome the budget runs out on.
                const hh = new Uint32Array(HIST_BINS);
                if (idx.length && d.n) {
                    const sc2 = HIST_BINS / drawn[ci].length;
                    for (let q = 0; q < idx.length; q++) {
                        let b = (d.pos[idx[q]] * sc2) | 0;
                        if (b >= HIST_BINS) b = HIST_BINS - 1;
                        hh[b]++;
                    }
                }
                d.hlHist = hh;
            }
        };

        const markWhere = (pred, code) => {
            let n = 0;
            for (let ci = 0; ci < drawn.length; ci++) {
                const d = vdata[ci];
                if (!d.n) continue;
                if (!d.hl || d.hl.length !== d.n) d.hl = new Uint8Array(d.n);
                for (let k = 0; k < d.n; k++) if (pred(ci, d.pos[k], k, d)) { d.hl[k] = code; n++; }
            }
            reindexHighlights();
            if (graph.wake) graph.wake();
            return n;
        };

        const clearHighlights = () => {
            for (const d of vdata) if (d.hl) d.hl = new Uint8Array(d.n);
            hlActive = 0;
            try { hlSamples.clear(); } catch (e) { }
            reindexHighlights();
            if (graph.wake) graph.wake();
            graph.setMessage(' Highlights cleared. ');
        };

        // A GLOW that PULSES while a highlight is on, so the marked variants read across the
        // whole genome even zoomed right out. __hlPulse (0..1) drives the glow in paint(); the
        // timer repaints a few times a second and stops itself the moment nothing is highlighted.
        let __hlPulse = 0, __hlPulseTimer = 0;
        const startHlPulse = () => {
            if (__hlPulseTimer) return;
            __hlPulseTimer = setInterval(() => {
                if (!hlActive) { clearInterval(__hlPulseTimer); __hlPulseTimer = 0; __hlPulse = 0; try { if (graph.wake) graph.wake(); } catch (e) { } return; }
                __hlPulse = 0.5 + 0.5 * Math.sin(Date.now() / 400);
                try { if (graph.wake) graph.wake(); } catch (e) { }
            }, 120);
        };

        // Highlight the variants SAMPLES carry, genome-wide, each in its own colour and glowing.
        // In-memory (no server call): a variant is a sample's if that sample carries a
        // non-reference call. Sample highlight codes sit above the annotation-filter codes,
        // one per sample slot. SEVERAL samples can glow at once -- each is toggled on and off
        // independently -- so hlSamples holds the set that is on and the draw reads each
        // variant's own code. SAMPLE_HL_MULTI is the density-bar colour when more than one is on
        // (the exact dots stay per-sample; only the zoomed-out bars need one colour per bin).
        const SAMPLE_HL_BASE = 6;
        const SAMPLE_HL_MULTI = 63;
        const hlSamples = new Set();
        // Rebuild the highlight channel from the set of active samples in ONE pass over each
        // chromosome: carriersOf once per variant, masked against the active samples, and the
        // lowest active carrier wins the colour. This is the whole per-toggle cost; the pulse
        // that follows only repaints.
        const rebuildSampleHighlights = () => {
            HL_COLOR[SAMPLE_HL_MULTI] = '#f59e0b';
            HL_NAME[SAMPLE_HL_MULTI] = 'multiple samples';
            let activeMask = 0;
            for (const si of hlSamples) {
                activeMask |= (1 << si);
                HL_COLOR[SAMPLE_HL_BASE + si] = SAMPLE_COLOR[si] || '#ee00ee';
                HL_NAME[SAMPLE_HL_BASE + si] = SAMPLES[si] || ('sample ' + (si + 1));
            }
            let marked = 0;
            for (let ci = 0; ci < drawn.length; ci++) {
                const d = vdata[ci];
                if (!d || !d.n) continue;
                if (!d.hl || d.hl.length !== d.n) d.hl = new Uint8Array(d.n); else d.hl.fill(0);
                if (!activeMask || !d.gtw) continue;
                for (let k = 0; k < d.n; k++) {
                    const m = carriersOf(d, k) & activeMask;
                    if (!m) continue;
                    const si = 31 - Math.clz32(m & -m);   // lowest set bit -> sample slot
                    d.hl[k] = SAMPLE_HL_BASE + si;
                    marked++;
                }
            }
            hlActive = hlSamples.size ? (hlSamples.size === 1
                ? (SAMPLE_HL_BASE + hlSamples.values().next().value)
                : SAMPLE_HL_MULTI) : 0;
            reindexHighlights();
            if (hlActive) startHlPulse();
            if (graph.wake) graph.wake();
            return marked;
        };
        // Toggle one sample's glow on or off, leaving the others as they are.
        const toggleSampleHighlight = (si) => {
            if (si < 0 || si >= SAMPLES.length) { graph.setMessage(' No such sample. '); return; }
            const nm = SAMPLES[si] || ('sample ' + (si + 1));
            const wasOn = hlSamples.has(si);
            if (wasOn) hlSamples.delete(si); else hlSamples.add(si);
            const marked = rebuildSampleHighlights();
            if (wasOn) {
                graph.setMessage(' ' + nm + ' glow off.' + (hlSamples.size ? ' ' + hlSamples.size + ' still on. ' : ' '));
            } else {
                graph.setMessage(' ' + nm + ' — glowing' + (hlSamples.size > 1 ? ' with ' + (hlSamples.size - 1) + ' other' + (hlSamples.size - 1 === 1 ? '' : 's') : ' across the genome') + '. ');
            }
        };
        // Kept for callers that expect the single-sample entry point.
        const highlightSample = (si) => toggleSampleHighlight(si);

        // Ask the server what a window is made of, then classify this view's own
        // variants against the answer. The intervals travel and the variants stay put.
        // Cached per chromosome and feature set, so asking a second question about the
        // same genome does not re-read the annotation.
        const featCache = new Map();
        const fetchFeatures = async (ci, need, lo, hi) => {
            const key = drawn[ci].name + '|' + need + '|' + lo + '|' + hi;
            if (featCache.has(key)) return featCache.get(key);
            const bare = drawn[ci].name.replace(/^chr/, '');
            let rs = null;
            try {
                const em3 = new EngineMonitor(() => { });
                rs = await exec(server + '/py/bio/region-features.py', em3,
                    bare, String(lo), String(hi), need, (r.species || 'human'));
            } catch (e) { step('region-features threw: ' + e); }
            if (!rs || !rs.ok) { step('features ' + drawn[ci].name + ': ' + (rs && rs.error)); return null; }
            const F = {};
            for (const k of ['cds', 'five_utr', 'three_utr', 'exon', 'gene', 'pathogenic']) {
                try { F[k] = JSON.parse(rs[k] || '[]'); } catch (e) { F[k] = []; }
            }
            featCache.set(key, F);
            return F;
        };

        // Mark one chromosome, without touching the index -- the caller reindexes once
        // at the end rather than after every chromosome.
        const markOn = (ci, pred, code) => {
            const d = vdata[ci];
            if (!d || !d.n) return 0;
            if (!d.hl || d.hl.length !== d.n) d.hl = new Uint8Array(d.n);
            let n = 0;
            for (let k = 0; k < d.n; k++) if (pred(d.pos[k], k, d)) { d.hl[k] = code; n++; }
            return n;
        };

        // THE WHOLE GENOME, ALWAYS. "Where is the pathogenic" is a question about every
        // chromosome, and it does not stop being one because a region happens to be
        // selected for something else.
        //
        // This used to narrow to the selected regions when there were any, and that made
        // the filters look broken: with a region picked out for a different purpose, the
        // marks were confined to a band a couple of pixels tall while everything else on
        // the karyotype greyed out -- so the visible result of asking for the pathogenic
        // SNPs was a dimmed genome with nothing lit on it. Selecting a region is not a
        // statement about what you want colored.
        //
        // A whole chromosome is one query -- chr1 merges to about 21,700 coding intervals
        // -- and the answers are cached, so asking for all of them costs the same the
        // second time.
        const applyFilter = async (kind, code) => {
            const need = (kind === 'intronic') ? 'gene,exon'
                : (kind === 'pathogenic') ? 'pathogenic'
                    : (kind === 'coding') ? 'cds'
                        : (kind === 'three_utr') ? 'three_utr' : 'five_utr';
            const targets = drawn.map((c, i) => ({ i: i, lo: 1, hi: c.length }));
            const live = targets.filter((t) => vdata[t.i] && vdata[t.i].n);
            if (!live.length) { graph.setMessage(' There are no variants to mark. '); return; }

            // A filter replaces the last one rather than adding to it: two colors at
            // once would be a different feature, and a stale mark would be a lie.
            for (const d of vdata) if (d.hl) d.hl = new Uint8Array(d.n);

            let marked = 0, failed = 0;
            for (let q = 0; q < live.length; q++) {
                const t = live[q];
                graph.setMessage(' Reading ' + drawn[t.i].name + ' annotation — '
                    + (q + 1) + ' of ' + live.length + '… ');
                const F = await fetchFeatures(t.i, need, t.lo, t.hi);
                if (!F) { failed++; continue; }
                const within = (p) => p >= t.lo && p <= t.hi;
                if (kind === 'pathogenic') {
                    const hits = F.pathogenic || [];
                    marked += markOn(t.i, (p, k, d) => within(p)
                        && (d.cls[k] === 1 || inSorted(hits, p)), code);
                } else if (kind === 'intronic') {
                    const gene = F.gene || [], exon = F.exon || [];
                    marked += markOn(t.i, (p) => within(p)
                        && inFlat(gene, p) && !inFlat(exon, p), code);
                } else {
                    const iv = F[(kind === 'coding') ? 'cds'
                        : (kind === 'three_utr') ? 'three_utr' : 'five_utr'] || [];
                    marked += markOn(t.i, (p) => within(p) && inFlat(iv, p), code);
                }
                // Let the canvas repaint between chromosomes so the marks appear as they
                // are found rather than all at once at the end.
                reindexHighlights();
                hlActive = code;
                if (graph.wake) graph.wake();
                await new Promise((res) => setTimeout(res, 0));
            }
            hlActive = marked ? code : 0;
            reindexHighlights();
            if (graph.wake) graph.wake();
            graph.setMessage(' ' + marked.toLocaleString() + ' ' + HL_NAME[code]
                + ' variant' + (marked === 1 ? '' : 's') + ' across the whole genome'
                + '; the rest are greyed out.'
                + (failed ? ' ' + failed + ' chromosome(s) could not be read.' : '') + ' ');
            step('filter ' + kind + ': marked ' + marked + ', failed ' + failed);
        };

        // ---- CLICKING ONE VARIANT ------------------------------------------------
        //
        // Only when the view can actually separate them. Zoomed out, a pixel column is
        // tens of thousands of bases and a click would be a guess dressed up as an
        // answer; so a variant is clickable when it sits within CLICK_PX of the
        // pointer AND its nearest neighbour is at least SEPARATE_PX away, which is the
        // same thing as saying the marks are far enough apart to be aimed at.
        const CLICK_PX = 6;
        const SEPARATE_PX = 5;
        // A SELECTED REGION, IF THE POINTER IS ON ITS BAND.
        //
        // The callout card is only drawn when a region is too small to label where it is --
        // which is to say when the view is zoomed OUT. Zoomed in there is no card, and the
        // region itself was not clickable, so the menu could only be reached by framing the
        // whole genome first. The band is the region; clicking it should open what the card
        // opens.
        //
        // Tested LAST, after the variants and marks that sit on the same bar: a click on a
        // variant is a click on that variant, not on the region it happens to lie in.
        // A CLICK TARGET NO SMALLER THAN WHAT IS DRAWN.
        //
        // The band is drawn at `Math.max(1.5, ...)` px tall plus a stroke either side, so a
        // gene always LOOKS clickable. This test had no such floor: it compared base pairs,
        // and at the framing this view opens in -- the whole genome, ~509,000 bases to the
        // pixel -- a highlighted BRCA1 is a band 0.25 px tall and TP53 is 0.05 px. Clicking
        // the thing you can plainly see missed it essentially every time, and since a region
        // is the last thing the click dispatch tries, the press did nothing at all: no menu,
        // no editor, no message saying why.
        //
        // So the test is padded by the same pixels the drawing rounds up to, converted to
        // bases through the grid's own scale. Zoomed in, where a region is already hundreds
        // of pixels tall, the padding is a few hundred bases and changes nothing.
        const REGION_GRAB_PX = 3;
        const regionAt = (wx, wyy) => {
            const bp = -wyy * MB;
            const pad = Math.max(0, (basesPerPx() || 0) * REGION_GRAB_PX);
            for (let q = regions.length - 1; q >= 0; q--) {
                const rg = regions[q];
                const c = drawn[rg.i];
                if (!c || c.circular) continue;
                if (wx < barLeft(rg.i) || wx > barRight(rg.i)) continue;
                if (bp < rg.lo - pad || bp > rg.hi + pad) continue;
                return rg;
            }
            return null;
        };

        // A PATENT LABEL, IF THE POINTER IS ON ONE. Screen pixels: the labels are laid out
        // against the bar's width on screen, not against the genome.
        const patLabelAt = (px, py) => {
            for (const l of patLabelHits) {
                if (px >= l.x && px <= l.x + l.w && py >= l.y && py <= l.y + l.h) return l;
            }
            return null;
        };
        // The publication itself. Google Patents rather than a panel of our own: the thing
        // a reader wants from a patent number is the patent, and we hold nothing about it
        // that its own record does not say better.
        const patOpenPublication = (l) => {
            const id = ('' + ((l && l.id) || '')).replace(/[^0-9A-Za-z]/g, '');
            if (!id) { graph.setMessage(' That label carries no publication number. '); return; }
            const url = 'https://patents.google.com/patent/US' + id;
            graph.setMessage(' Opening US' + id + '… ');
            try { window.open(url, '_blank', 'noopener'); }
            catch (e) {
                graph.setMessage(' Could not open ' + url + ' — the browser blocked it. ');
            }
        };

        // ONE PATENT AS A LIBRARY. Clicking a patent label opens this shelf: the record
        // (number, assignee, title, filing/grant dates, how much sequence it claims and
        // where) as prose, then a leaf that opens the publication itself. Built as `books`
        // so it can be shown on its own OR drilled into from the cluster shelf below, with a
        // Back either way.
        const patentDetailBooks = (p, where) => {
            const num = ('' + (p.label || ('US' + (p.id || '')))).split(' ')[0];
            const assignee = p.assignee
                || ('' + (p.label || '')).split(' ').slice(1).join(' ');
            const books = [];
            if (p.title) books.push({ section: 'Patent', note: true, blurb: p.title });
            books.push({ section: 'Patent', note: true, blurb: 'Publication  ·  ' + num });
            if (assignee) books.push({ note: true, blurb: 'Assignee  ·  ' + assignee });
            if (p.filed) books.push({ note: true, blurb: 'Filed  ·  ' + p.filed });
            if (p.granted) books.push({ note: true, blurb: 'Granted  ·  ' + p.granted });
            if (p.hits != null && p.hits !== '') {
                books.push({
                    note: true, blurb: (+p.hits).toLocaleString() + ' sequence hit' + ((+p.hits) === 1 ? '' : 's')
                        + (p.transcripts ? ' over ' + p.transcripts + ' transcript' + ((+p.transcripts) === 1 ? '' : 's') : '')
                });
            }
            if (where) books.push({ note: true, blurb: 'Location  ·  ' + where });
            books.push({
                section: 'Open', title: 'Open on Google Patents', icon: '↗',
                blurb: 'The full publication — claims, description, and patent family — on patents.google.com.',
                open: () => patOpenPublication({ id: p.id }),
            });
            return books;
        };
        const patentInfoOne = (p, where) => {
            const num = ('' + (p.label || ('US' + (p.id || '')))).split(' ')[0];
            const assignee = p.assignee || ('' + (p.label || '')).split(' ').slice(1).join(' ');
            try {
                exec('baja/lib/shelf.js', {
                    id: 'baja-patent-info',
                    title: num + (assignee ? '  —  ' + assignee : ''),
                    subtitle: p.title || 'Patent record',
                    books: patentDetailBooks(p, where),
                    graph: graph,
                });
            } catch (e) { graph.setMessage(' The patent library could not open: ' + (e && e.message ? e.message : e) + ' '); }
        };
        // SEVERAL PATENTS (a summary label) AS A LIBRARY. Fetches the list for the stretch
        // and shows one card per patent; each drills into its own record shelf above.
        const patentInfoCluster = async (h) => {
            const c = drawn[h.ci];
            const where = c.name + ':' + human(h.lo) + '-' + human(h.hi);
            graph.setMessage(' Reading the patents over ' + where + '… ');
            let rs = null;
            try {
                const em = new EngineMonitor((m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } });
                rs = await exec(server + '/py/bio/patents-at.py', em,
                    c.name.replace(/^chr/, ''), String(h.lo), String(h.hi),
                    PAT_NAME_KEY, (r.species || 'human'), '200');
            } catch (e) { rs = null; step('patents-at (cluster) threw: ' + e); }
            if (!rs || !rs.ok) { graph.setMessage(' The patents there could not be read. '); return; }
            let list = [];
            try { list = JSON.parse(rs.patents || '[]'); } catch (e) { list = []; }
            const heading = (rs.count || list.length) + ' patent' + ((rs.count || list.length) === 1 ? '' : 's') + ' over ' + where;
            const books = list.map((p) => {
                const num = ('' + (p.label || ('US' + (p.id || '')))).split(' ')[0];
                const assignee = p.assignee || ('' + (p.label || '')).split(' ').slice(1).join(' ');
                return {
                    section: heading,
                    title: num + (assignee ? '  —  ' + assignee : ''),
                    blurb: p.title || '',
                    badge: (p.hits != null && p.hits !== '') ? ((+p.hits) + ' hit' + ((+p.hits) === 1 ? '' : 's')) : '',
                    books: () => patentDetailBooks(p, where),
                };
            });
            if (!books.length) books.push({ note: true, blurb: 'No named patent claims sequence here.' });
            if ((rs.count || 0) > list.length) {
                books.push({ note: true, blurb: (rs.count - list.length) + ' further patents claim sequence here; the busiest ' + list.length + ' are listed.' });
            }
            try {
                exec('baja/lib/shelf.js', {
                    id: 'baja-patent-info',
                    title: 'Patents over ' + where,
                    subtitle: (rs.hits || 0).toLocaleString() + ' sequence hits in this window',
                    books: books,
                    graph: graph,
                });
            } catch (e) { graph.setMessage(' The patent library could not open: ' + (e && e.message ? e.message : e) + ' '); }
        };

        // THE PATENT STRIP, IF THE POINTER IS ON IT. It is drawn in the gutter to the LEFT
        // of a bar, where nothing else is, so this can never take a click meant for a
        // variant mark or a gene label -- those are all on the right.
        const PAT_GUTTER_PX = 30;       // 2 + maxW, and maxW tops out at 26
        const patAt = (wx, wyy) => {
            if (!patOn || !patHist) return null;
            const wppX = worldPerPxX();
            if (!(wppX > 0)) return null;
            const gut = PAT_GUTTER_PX * wppX;
            const slot = Math.floor(wx / SLOT);
            for (const i of [slot, slot + 1]) {
                if (i < 0 || i >= drawn.length) continue;
                const c = drawn[i];
                if (c.circular || !patHist[i]) continue;
                if (wx > barLeft(i) + 2 * wppX || wx < barLeft(i) - gut) continue;
                const bp = -wyy * MB;
                if (bp < 0 || bp > c.length) continue;
                const scale = HIST_BINS / c.length;
                let b = (bp * scale) | 0;
                if (b < 0) b = 0;
                if (b >= HIST_BINS) b = HIST_BINS - 1;
                if (!patHist[i][b]) continue;      // an empty bin has nothing to open
                return {
                    ci: i, bin: b, n: patHist[i][b],
                    lo: Math.max(1, Math.floor(b / scale)),
                    hi: Math.min(c.length, Math.ceil((b + 1) / scale)),
                };
            }
            return null;
        };

        // What claims sequence in that bin, as a panel.
        const patOpen = async (h) => {
            const c = drawn[h.ci];
            const where = c.name + ':' + human(h.lo) + '-' + human(h.hi);
            graph.setMessage(' Reading the patents over ' + where + '… ');
            let rs = null;
            try {
                const em = new EngineMonitor((m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } });
                rs = await exec(server + '/py/bio/patents-at.py', em,
                    c.name.replace(/^chr/, ''), String(h.lo), String(h.hi),
                    PAT_NAME_KEY, (r.species || 'human'), '60');
            } catch (e) { rs = null; step('patents-at threw: ' + e); }
            if (!rs || !rs.ok) {
                graph.setMessage(' The patents there could not be read'
                    + ((rs && rs.error) ? (': ' + rs.error) : '') + '. ');
                return;
            }
            let list = [];
            try { list = JSON.parse(rs.patents || '[]'); } catch (e) { list = []; }
            const sections = [];
            if (!list.length) {
                sections.push({
                    heading: 'Nothing claimed here',
                    text: 'No patent in this set claims sequence over the transcripts in this '
                        + 'window. The strip is drawn from transcript midpoints, so a bin can '
                        + 'be tall because of a gene whose body starts outside the window.',
                });
            } else {
                sections.push({
                    heading: (rs.count || list.length) + ' patent'
                        + ((rs.count || list.length) === 1 ? '' : 's'),
                    text: list.map((pp) => pp.label + '  —  ' + pp.hits + ' hit'
                        + (pp.hits === 1 ? '' : 's') + ' over ' + pp.transcripts + ' transcript'
                        + (pp.transcripts === 1 ? '' : 's')).join('\n'),
                });
                if ((rs.count || 0) > list.length) {
                    sections.push({
                        heading: 'Not listed',
                        text: ((rs.count - list.length) + ' further patents claim sequence here; '
                            + 'the busiest ' + list.length + ' are shown.'),
                    });
                }
            }
            sections.push({
                heading: 'What was searched',
                text: 'The named patents come from the ASO/siRNA set, matched through the '
                    + (rs.transcripts || 0) + ' transcript'
                    + ((rs.transcripts || 0) === 1 ? '' : 's') + ' overlapping this window. '
                    + 'The strip itself is drawn from the larger 2020-2025 index, which '
                    + 'carries no patent numbers — so the bar height and this list are '
                    + 'measuring different collections and will not add up.\n\n'
                    + 'A hit is claimed SEQUENCE, not a claim over the gene.',
            });
            try {
                await exec('baja/lib/model-panel.js', {
                    id: 'baja-patents-at',
                    title: 'Patents over ' + where,
                    subtitle: (rs.hits || 0).toLocaleString() + ' sequence hits in this window',
                    cards: [{ title: where, meta: c.name + '  ·  ' + fmtSpan(h.hi - h.lo + 1)
                        + '  ·  ' + Math.round(h.n).toLocaleString() + ' hits in this bin',
                        sections: sections }],
                });
            } catch (e) {
                graph.setMessage(' The patent panel could not open: '
                    + (e && e.message ? e.message : e) + ' ');
            }
        };

        // A CARD, IF THE POINTER IS ON ONE. Screen pixels, because that is the space the
        // cards are laid out in -- they are pinned to the margin, not to the genome.
        const calloutAt = (px, py) => {
            for (const c of calloutHits) {
                if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) return c;
            }
            return null;
        };

        // ---- CLICKING A MARK --------------------------------------------------------
        //
        // While a filter is on, every matching variant carries a mark in the gutter just
        // right of its chromosome: a magenta triangle each while few enough are in view, a
        // magenta spike per histogram bin when there are too many to place. Both say the
        // same thing -- something you asked for is HERE -- and the next question is always
        // the same one: what is it in? So the marks are the way in to the transcripts.
        //
        // This is deliberately NOT variantAt. That one refuses unless the view can tell two
        // variants apart, which is right for "show me this SNP" and wrong here: the marks
        // are legible across the whole genome, and a click on one at genome zoom means the
        // place, not a particular base.
        const MARK_GUTTER_PX = 16;   // triangles reach ~12 px past the bar; spikes a little more
        const MARK_TOL_PX = 7;       // how near the pointer must be, down the chromosome
        const markAt = (wx, wyy) => {
            if (!hlActive) return null;                    // no marks drawn, nothing to hit
            const wppX = worldPerPxX(), bpp = basesPerPx();
            if (!(wppX > 0) || !(bpp > 0)) return null;
            const gut = MARK_GUTTER_PX * wppX;
            // The gutter sits right of barRight, which at a wide enough zoom crosses into
            // the next slot -- so the slot the pointer is in and the one before it are both
            // candidates, and the bar edge decides.
            const slot = Math.floor(wx / SLOT);
            for (const i of [slot, slot - 1]) {
                if (i < 0 || i >= drawn.length) continue;
                const c = drawn[i];
                if (c.circular) continue;
                const d = vdata[i];
                if (!d || !d.n || !d.hlIdx || !d.hlIdx.length) continue;
                if (wx < barRight(i) - 2 * wppX || wx > barRight(i) + gut) continue;
                const pbp = -wyy * MB;
                // hlIdx is ascending in k and therefore in position, so the same bisection
                // the drawing uses finds the mark nearest the pointer.
                const idx = d.hlIdx;
                let a = 0, z = idx.length;
                while (a < z) { const m = (a + z) >> 1; if (d.pos[idx[m]] < pbp) a = m + 1; else z = m; }
                let best = -1, bestD = Infinity;
                for (const q of [a - 1, a]) {
                    if (q < 0 || q >= idx.length) continue;
                    const dist = Math.abs(d.pos[idx[q]] - pbp);
                    if (dist < bestD) { bestD = dist; best = idx[q]; }
                }
                if (best < 0) continue;
                // Tolerance in PIXELS, so it is the same aim at every zoom: 7 px is 7 px
                // whether that is two megabases or two bases.
                if (bestD / bpp > MARK_TOL_PX) continue;
                return { ci: i, k: best, bp: d.pos[best] };
            }
            return null;
        };

        const variantAt = (wx, wyy) => {
            const h = at(wx, wyy);
            if (!h || h.circular) return null;
            const d = vdata[h.i];
            if (!d || !d.n) return null;
            // Bases per pixel, read off the grid's own scale rather than assumed from a
            // zoom level.
            const bpp = basesPerPx();
            if (!(bpp > 0)) return null;
            const p = -wyy * MB;
            // Nearest position, by bisection, then the better of the two neighbours.
            let a = 0, z = d.n;
            while (a < z) { const m = (a + z) >> 1; if (d.pos[m] < p) a = m + 1; else z = m; }
            let best = -1, bestD = Infinity, second = Infinity;
            for (const k of [a - 1, a, a + 1]) {
                if (k < 0 || k >= d.n) continue;
                const dist = Math.abs(d.pos[k] - p);
                if (dist < bestD) { second = bestD; bestD = dist; best = k; }
                else if (dist < second) { second = dist; }
            }
            if (best < 0) return null;
            if (bestD / bpp > CLICK_PX) return null;
            // Too crowded to aim at: say nothing rather than open the wrong one.
            if (isFinite(second) && (second - bestD) / bpp < SEPARATE_PX) return null;
            return { ci: h.i, k: best };
        };

        const SIG_NAME = ['', 'Pathogenic / likely pathogenic', 'Benign',
            'Uncertain significance', 'Conflicting classifications'];

        // ---- ONE VARIANT, AS A LIBRARY -----------------------------------------
        //
        // A click on a mark used to raise a small read-only card: change, name, ClinVar,
        // gene. Everything it said was worth saying and none of it could be ACTED on, so the
        // one thing a person wants after reading "BRCA1, pathogenic" -- to open it and work
        // on it -- meant closing the card, finding the gene again, dragging a region round
        // it and going through the transcript panel.
        //
        // So it is a shelf, in the idiom the rest of this view now uses: what is known about
        // the variant as notes, and underneath them the things that can be done with it. The
        // gene is looked up BEFORE the shelf opens rather than filled in after, because it is
        // a one-base query answering in a fifth of a second and it is what the buttons under
        // it have to name.
        const showVariant = async (ci, k) => {
            const c = drawn[ci], d = vdata[ci];
            const ab = allelesAt(ci, k);
            const pos = d.pos[k];
            const bare = c.name.replace(/^chr/, '');
            const nm = (d.names && d.names[k]) || '';
            const sig = SIG_NAME[d.cls[k]] || '';
            const mark = (d.hl && d.hl[k]) ? HL_NAME[d.hl[k]] : '';
            const where = c.name + ':' + human(pos);
            const change = ab[0] + ' \u2192 ' + ab[1];
            step('variant clicked ' + where);
            graph.setMessage(' ' + where + ' — reading the gene there… ');

            let gs = [];
            try {
                const em4 = new EngineMonitor(() => { });
                const rs = await exec(server + '/py/bio/genes-in-range.py', em4,
                    bare, '' + pos, '' + pos, (r.species || 'human'), '8');
                try { gs = JSON.parse((rs && rs.genes) || '[]'); } catch (e) { gs = []; }
            } catch (e) { step('gene lookup threw: ' + e); }
            const withTx = gs.filter((gn) => gn.transcript);
            const coding = withTx.filter((gn) => gn.coding);
            const lead = coding[0] || withTx[0] || gs[0] || null;
            const geneWord = lead ? (lead.gene || '') : '';

            const books = [];
            const note = (title, blurb) => { if (blurb) books.push({ section: 'This variant', note: true, title: title, blurb: blurb }); };
            note('change', 'Change: ' + change + (nm ? '   ·   ' + nm : ''));
            if (sig) note('significance', 'ClinVar: ' + sig);
            if (mark) note('marked', 'Marked by the current filter as ' + mark + '.');
            const gl = genotypesOf(d, k).filter((g) => g[1]);
            if (gl.length) {
                note('samples', 'Samples: ' + gl.map((g) => g[0] + ' ' + (GT_TEXT[g[1]] || './.')
                    + (g[1] >= GT_HET && PHASE_NAME[PHASE_OF_CODE[g[1]]]
                        ? ' (' + PHASE_NAME[PHASE_OF_CODE[g[1]]] + ')' : '')).join(',   '));
            }
            note('gene', gs.length
                ? ('Gene: ' + gs.slice(0, 4).map((gg) => (gg.gene || '?')
                    + (gg.biotype ? ' (' + gg.biotype + ')' : '')
                    + (gg.transcript ? ' ' + gg.transcript : '')).join(',   '))
                : 'No gene is annotated at this position.');
            note('place', where + '   ·   ' + c.name + ' is ' + human(c.length) + ' bp');

            // THE THING TO DO WITH IT. Straight through: the transcripts that contain this
            // base are the answer to "which transcript", so it does not ask. The variants
            // that come across are the ones inside those genes, not just this one, because a
            // change is read against its neighbours -- and then the view goes to THIS one.
            books.push({
                section: 'Open it',
                title: 'Open in oligo editor' + (geneWord ? ' — ' + geneWord : ''),
                badge: coding.length ? 'coding' : (withTx.length ? 'transcript' : 'nothing here'),
                ready: withTx.length > 0,
                readyNote: 'Nothing at this position has a transcript in the ' + (r.species || 'human')
                    + ' annotation, so there is nothing to load.',
                blurb: withTx.length
                    ? ('Load ' + (coding.length ? coding.slice(0, 6).map((g) => g.transcript).join(', ')
                        : withTx.slice(0, 6).map((g) => g.transcript).join(', '))
                        + ' into the editor with the variants that fall inside '
                        + (geneWord || 'it') + ', then go straight to this change.')
                    : '',
                open: async () => {
                    await openRange(ci, Math.max(0, pos - 1), Math.min(c.length, pos + 1), pos,
                        { focus: { chr: bare, pos: pos } });
                },
            });
            books.push({
                section: 'Open it',
                title: 'Select this region',
                badge: 'region',
                blurb: 'Add the gene around this variant to the selection, so it can be acted '
                    + 'on with the others rather than on its own.',
                open: async () => {
                    const lo2 = lead ? Math.max(0, +lead.start) : Math.max(0, pos - 1000);
                    const hi2 = lead ? Math.min(c.length, +lead.end) : Math.min(c.length, pos + 1000);
                    regions.push({ i: ci, lo: lo2, hi: hi2, label: (geneWord || where) + '  ' + change, gene: geneWord });
                    if (graph.wake) graph.wake();
                    graph.setMessage(' ' + (geneWord || where) + ' selected — region ' + regions.length + '. ');
                },
            });
            // WHAT IS KNOWN ABOUT IT, asked for only when asked for: it is a model call and
            // most clicks on a mark are not a request for a dossier.
            books.push({
                section: 'Read about it',
                title: 'What is known about this variant',
                badge: 'dossier',
                blurb: 'Ask for a written summary under fixed headings: what the change is, how '
                    + 'it was classified, the conditions it is seen in, and what is not established.',
                books: async () => {
                    graph.setMessage(' Reading up on ' + (nm || where) + '… ');
                    let out = [];
                    try {
                        const em5 = new EngineMonitor((m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } });
                        const rs = await exec(server + '/py/bio/variant-dossier.py', em5, JSON.stringify([{
                            key: where, name: nm || where, gene: geneWord, chr: bare, pos: pos,
                            ref: ab[0], alt: ab[1],
                            type: (ab[1].length > ab[0].length ? 'ins' : (ab[0].length > ab[1].length ? 'del' : 'snp')),
                            rsid: /^rs\d+$/i.test(nm) ? nm : '', clinsig: sig, clindn: '',
                            consequence: mark || '', transcript: lead ? (lead.transcript || '') : '',
                            annotations: [],
                        }]));
                        let vs = [];
                        try { vs = JSON.parse((rs && rs.variants) || '[]'); } catch (e) { vs = []; }
                        const one = vs[0];
                        if (rs && rs.error) {
                            out = [{ note: true, title: 'error', blurb: '' + rs.error }];
                        } else if (one && one.sections && one.sections.length) {
                            out = one.sections.map((sc) => ({
                                note: true, title: sc.heading || '',
                                blurb: (sc.heading ? sc.heading + ': ' : '') + (sc.text || ''),
                            }));
                        }
                    } catch (e) {
                        out = [{ note: true, title: 'error', blurb: 'That could not be read: ' + (e && e.message ? e.message : e) }];
                    }
                    if (!out.length) out = [{ note: true, title: 'nothing', blurb: 'Nothing came back for this variant.' }];
                    return out;
                },
            });

            try {
                await exec('baja/lib/shelf.js', {
                    id: 'baja-variant-actions',
                    title: (nm ? nm + '  ·  ' : '') + where,
                    subtitle: change + (sig ? '   ·   ' + sig : '')
                        + (geneWord ? '   ·   ' + geneWord : ''),
                    graph: graph,
                    books: books,
                });
            } catch (e) { step('variant shelf failed: ' + e); }
        };

        // ---- the library of things to do with them ------------------------------
        // ---- FIND A GENE BY NAME ------------------------------------------------
        //
        // Everything else here starts from a place on the screen: drag a range, click a
        // mark. But nobody thinks in coordinates -- they think "where is SOD1" -- and
        // without this the only way to reach a gene is to know its megabase and drag to it.
        //
        // TWO LOOKUPS, because neither alone answers it. gene-locus.py reads the same
        // GENCODE annotation the rest of this view reads, so the span it returns is the
        // one the region will be drawn from -- but GENCODE gene rows carry no synonyms, so
        // it cannot resolve an old name. /gene-lookup can: it is the symbol table the
        // paste-gene-symbols tool uses, and it knows ALS1 is SOD1. So the symbol is tried
        // against the annotation first, and only what fails there is sent to /gene-lookup
        // to be translated into a stable id and asked again.
        const findGene = async (raw) => {
            const txt = ('' + (raw || '')).trim();
            // A TYPEAHEAD PICK IS A WHOLE ROW, not a word. The suggestion list joins the
            // fields it was given with commas -- "SOD1, ALS1, superoxide dismutase 1 […],
            // ENSG00000142168" -- and that string is what lands in the box. The stable id
            // in it is the unambiguous part, so it is preferred when present; otherwise the
            // first field, which is the symbol, is what was typed or picked.
            const ens = txt.match(/ENSG\d+/i);
            const sym = ens ? ens[0]
                : txt.replace(/[\r\n,;]+/g, ' ').split(' ').filter(Boolean)[0] || '';
            if (!sym) { graph.setMessage(' Type a gene symbol. '); return null; }
            const em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
            // WHICH GENOME WAS ACTUALLY SEARCHED. gene-locus.py echoes the species it
            // resolved the name to, and that is checked rather than assumed: it used to fall
            // back to the human annotation for any name it did not recognise, so a mouse
            // karyotype asking for Sod1 was answered with the human locus and no error --
            // an answer that looks like an answer and is about the wrong animal. It refuses
            // now, but a stale server would not, so the caller verifies.
            let searched = '';
            let lastError = '';
            const ask = async (key) => {
                let res = null;
                try {
                    res = await exec(server + '/py/bio/gene-locus.py', em, key,
                        (r.species || 'human'), '12');
                } catch (e) { return []; }
                if (!res || res.error) {
                    if (res && res.error) step('gene-locus: ' + res.error);
                    if (res && res.error) lastError = '' + res.error;
                    return [];
                }
                searched = '' + (res.species || '');
                const want = ('' + (r.species || 'human')).toLowerCase();
                if (searched && want.indexOf(searched.toLowerCase()) < 0
                    && searched.toLowerCase().indexOf(want) < 0) {
                    step('gene-locus searched ' + searched + ' but this karyotype is ' + want);
                    graph.setMessage(' That lookup searched the ' + searched + ' genome, not '
                        + want + '. Ignoring the result. ');
                    return [];
                }
                try { return JSON.parse(res.genes || '[]'); } catch (e) { return []; }
            };
            graph.setMessage(' Looking for ' + sym + '… ');
            let hits = await ask(sym);
            // THE SYNONYM TABLE IS HUMAN ONLY, so it is only consulted for a human
            // karyotype. /gene-lookup is an Ensembl symbol export whose every row carries an
            // ENSG id -- human. Asking it to translate a symbol for a mouse or yeast
            // karyotype returns a HUMAN gene id, which is then looked up in the mouse or
            // yeast annotation and of course found nowhere; the step could only ever waste a
            // round trip and, if an ENSG id ever did collide, point the picture at the wrong
            // chromosome. For those species the annotation's own symbols are all there is.
            const humanKaryotype = /^(human|homo)/i.test('' + (r.species || 'human'));
            if (!hits.length && !humanKaryotype) {
                step('no synonym table for ' + (r.species || '?') + '; the annotation symbols are all there is');
            }
            if (!hits.length && humanKaryotype) {
                // Not a symbol in this annotation. It may still be a synonym, which the
                // symbol table knows and the annotation does not.
                try {
                    const alt = await GETJSON(window['env']['apiUrl'] + '/gene-lookup?key='
                        + encodeURIComponent(sym));
                    // /gene-lookup is a SUBSTRING search -- 'ALS1' returns a hundred rows,
                    // and so would half a symbol someone stopped typing. So the row is
                    // chosen rather than taken: the gene whose SYMBOL is what was typed
                    // first, then the gene carrying it as a synonym, and only then the
                    // first row. Without that, a partial symbol silently selects whichever
                    // gene happened to sort first, and points the karyotype at the wrong
                    // chromosome with no sign that it did.
                    const up = sym.toUpperCase();
                    const rows = Array.isArray(alt) ? alt : [];
                    const eq = (v) => ('' + (v == null ? '' : v)).trim().toUpperCase() === up;
                    const pick = rows.find((q) => eq(q['Gene name']))
                        || rows.find((q) => eq(q['Gene Synonym']))
                        || rows[0];
                    const id = pick && (pick['Gene stable ID'] || '');
                    const nm = pick && (pick['Gene name'] || '');
                    if (id) {
                        const how = (pick && eq(pick['Gene name'])) ? 'symbol'
                            : (pick && eq(pick['Gene Synonym'])) ? 'synonym for ' + (nm || id)
                                : 'closest match ' + (nm || id);
                        step('resolved ' + sym + ' -> ' + (nm || id) + ' (' + how + ')');
                        hits = await ask(id);
                        // Say so when the answer is not the thing that was typed.
                        if (hits.length && how !== 'symbol') {
                            hits[0].matched = how;
                        }
                    }
                } catch (e) { step('gene-lookup failed: ' + e); }
            }
            if (!hits.length) {
                // Name the genome that was searched, and say when the search could not run at
                // all -- "no gene called X" and "this server holds no annotation for that
                // species" are different answers and were both delivered as the first one.
                graph.setMessage(lastError
                    ? (' ' + lastError + ' ')
                    : (' No gene called ' + sym + ' in the ' + (r.species || 'human')
                        + ' annotation. '
                        + (humanKaryotype ? '' : 'Only the symbols in that annotation can be searched for '
                            + (r.species || 'this species') + ' — synonyms and old names are human only. ')));
                return null;
            }
            // The chromosome has to be one this karyotype is drawing -- a gene on a patch
            // contig is a real answer to the lookup and not a place on this picture.
            for (const g of hits) {
                let ci = chromIndex[('' + g.chr).replace(/^chr/, '')];
                if (ci == null) ci = chromIndex['' + g.chr];
                if (ci == null) continue;
                return { ci: ci, gene: g, lo: Math.max(0, +g.start), hi: Math.min(drawn[ci].length, +g.end) };
            }
            graph.setMessage(' ' + sym + ' is on ' + hits[0].chr
                + ', which this karyotype does not draw. ');
            return null;
        };

        // Find it, select it, and go there. The region is what the rest of this view
        // already understands, so a gene found by name is the same thing as a gene
        // dragged out by hand from the moment it is found.
        const gotoGene = async (raw) => {
            const f = await findGene(raw);
            if (!f) return false;
            const c = drawn[f.ci];
            regions.push({ i: f.ci, lo: f.lo, hi: f.hi });
            // A little room either side: a gene framed exactly to its own ends gives no
            // sense of where it sits.
            const pad = Math.max((f.hi - f.lo) * 0.25, 2000) / MB;
            await goView({
                x0: barLeft(f.ci) - 0.5 * SLOT, x1: barRight(f.ci) + 0.5 * SLOT,
                y0: wy(f.hi) - pad, y1: wy(f.lo) + pad
            });
            graph.setMessage(' ' + f.gene.gene + ' — ' + c.name + ':' + human(f.lo) + '-'
                + human(f.hi) + '  (' + fmtSpan(f.hi - f.lo) + ', ' + f.gene.biotype + ')'
                + (f.gene.matched === 'symbol' ? '' : ' — matched by ' + f.gene.matched)
                + ' — region ' + regions.length + '. ');
            step('gene ' + f.gene.gene + ' -> ' + c.name + ':' + f.lo + '-' + f.hi);
            return true;
        };

        // FIND A GENE IS A LIBRARY OF EVERY GENE, filled as you type. The shelf's own
        // search box asks /gene-lookup -- the same endpoint the New-track form's typeahead
        // uses -- and each hit is a card: symbol, id, description. One row per synonym
        // comes back, so hits are folded by stable id, and a pick goes by that id, which
        // findGene prefers over a name. The old modal stays below as geneMenuModal in
        // case a caller wants the typeahead form.
        const geneMenu = () => {
            const host_ = window['env']['apiUrl'];
            const hint = { note: true, title: 'Start typing a gene symbol or an old name — SOD1, TARDBP, C9orf72, ALS1 — and pick the gene from the cards.', blurb: '' };
            const search = async (text) => {
                const res = await fetch(host_ + '/gene-lookup?key=' + encodeURIComponent(text));
                if (!res.ok) throw new Error('HTTP ' + res.status);
                let rows = await res.json();
                if (!Array.isArray(rows)) rows = [];
                const seen = new Map();
                for (const r0 of rows) {
                    const id = '' + (r0['Gene stable ID'] || '');
                    const sym = '' + (r0['Gene name'] || '');
                    if (!id && !sym) continue;
                    const key = id || sym;
                    if (!seen.has(key)) seen.set(key, { id: id, sym: sym, desc: ('' + (r0['Gene description'] || '')).replace(/\s*\[Source:[^\]]*\]\s*$/, ''), syn: [], canonical: r0['Ensembl Canonical'] === '1' });
                    const s2 = '' + (r0['Gene Synonym'] || '');
                    if (s2 && seen.get(key).syn.indexOf(s2) < 0 && s2 !== sym) seen.get(key).syn.push(s2);
                }
                const hits = Array.from(seen.values());
                if (!hits.length) return [{ note: true, title: 'No gene matches "' + text + '".', blurb: '' }];
                return hits.slice(0, 60).map((h) => ({
                    title: h.sym || h.id,
                    badge: h.id || 'gene',
                    blurb: (h.desc || 'no description') + (h.syn.length ? '  ·  also ' + h.syn.slice(0, 4).join(', ') : ''),
                    open: () => gotoGene(h.id || h.sym),
                })).concat(hits.length > 60 ? [{ note: true, title: hits.length + ' genes match; the first 60 are shown. Type more to narrow it.', blurb: '' }] : []);
            };
            try {
                exec('baja/lib/shelf.js', {
                    id: 'baja-karyo-gene',
                    title: 'Find a gene',
                    subtitle: 'The gene is framed on its chromosome and added to the selected regions, so Selected regions can then open its transcripts.',
                    searchPlaceholder: 'Gene symbol, name or description…',
                    books: [hint],
                    search: search,
                    graph: graph,
                });
            } catch (e) {
                step('gene shelf threw: ' + e);
                graph.setMessage(' Find a gene could not be opened: ' + (e && e.message ? e.message : e) + ' ');
            }
        };
        const geneMenuModal = () => {
            // THE SAME TYPEAHEAD THE NEW-TRACK FORM USES. input-textfield with a
            // typeahead_url queries /gene-lookup on every keystroke and offers the rows it
            // returns, joined from the fields named here -- so a half-typed symbol, an old
            // name or a description all reach the gene, and the exact spelling is picked
            // from a list rather than remembered. 'Gene name' comes first because the
            // joined string is what lands in the box, and its first field is what a
            // symbol-only search will read back out of it; 'Gene stable ID' comes last so a
            // pick always carries an unambiguous id for findGene to prefer.
            let geneBox = null;
            const readBox = () => {
                try {
                    if (geneBox && geneBox.getWidgetValue) return geneBox.getWidgetValue();
                    if (geneBox && geneBox.value != null) return geneBox.value;
                } catch (e) { }
                return '';
            };
            showModal({
                wid: 'card',
                data: {
                    // card_padding insets the whole panel from the modal edge; padding is
                    // per cell, so the header, the field and the button are spaced down the
                    // dialog. Both, because one alone gives either text against the edge or
                    // rows with no rhythm. The blocks inside no longer pad themselves
                    // horizontally -- two paddings on one edge makes one gutter wider than
                    // the other.
                    card_padding: '20px 22px',
                    padding: '7px 0',
                    height: '400px',
                    cards: [[
                        {
                            'title': ' ', 'width': '100%',
                            'component': {
                                wid: 'html',
                                data: '<div style="padding:2px 0 10px;font:14px Arial;">'
                                    + '<b>Find a gene</b><div style="color:#5b6b7a;font:12.5px Arial;'
                                    + 'margin-top:5px;line-height:1.45;">Start typing a symbol — '
                                    + 'SOD1, TARDBP, C9orf72 — and pick it from the list. The gene '
                                    + 'is framed on its chromosome and added to the selected '
                                    + 'regions, so Regions can then open its transcripts.</div></div>'
                            }
                        },
                        {
                            'title': 'Human Gene Symbol',
                            'width': '100%',
                            'component': {
                                wid: 'input-textfield',
                                data: {
                                    'show-button': false,
                                    'title': 'Human gene symbol (e.g. SOD1, TARDBP, C9orf72)',
                                    'text': '',
                                    'typeahead_url': window['env']['apiUrl'] + '/gene-lookup',
                                    // No 'Gene Synonym' here. The endpoint carries one row
                                    // per synonym, so including it made SOD1 three visibly
                                    // different lines that all mean the same gene -- and
                                    // being different, no dedupe could collapse them.
                                    // Searching BY a synonym still works: /gene-lookup
                                    // matches the whole row, not only the fields shown.
                                    'typeahead_fields': ['Gene name', 'Gene description',
                                        'Gene stable ID'],
                                    'ionHookFunction': createIonFunction((b) => { geneBox = b; }),
                                    // Picking from the list fills the box; the button is
                                    // still the thing that acts, so a mis-click costs
                                    // nothing and does not silently add a region.
                                    'optionSelected': createIonFunction((value) => {
                                        try {
                                            const v = ('' + value).split(',')[0].trim();
                                            if (v) graph.setMessage(' ' + v + ' — press Find to select it. ');
                                        } catch (e) { }
                                    })
                                }
                            }
                        },
                        {
                            'title': ' ', 'width': '100%',
                            'component': {
                                wid: 'mt-button',
                                data: {
                                    buttons: [{
                                        label: 'Find and select',
                                        ionFunction: createIonFunction(async () => {
                                            const v = readBox();
                                            if (!('' + (v || '')).trim()) {
                                                graph.setMessage(' Type a gene symbol. ');
                                                return;
                                            }
                                            try { hideAllModal(); } catch (e) { }
                                            await gotoGene(v);
                                        })
                                    }]
                                }
                            }
                        },
                    ]]
                }
            });
        };

        // ---- WHAT YOU CAN DO WITH A SELECTED REGION -----------------------------
        //
        // A callout card used to go straight to the transcript panel, which is one of the
        // things you might want and not always the one -- and once a card is clickable at
        // all, "what else" is the obvious next question. So it opens the library instead,
        // in the same idiom the selection library uses, and the transcript panel becomes
        // one leaf of it.
        const bpCovered = (flat, lo, hi) => {
            // Merged, sorted, non-overlapping pairs from region-features.py, so a clipped
            // sum is the covered length -- no interval arithmetic beyond the clip.
            let n = 0;
            for (let q = 0; q + 1 < flat.length; q += 2) {
                const a = Math.max(lo, +flat[q]), b = Math.min(hi, +flat[q + 1]);
                if (b >= a) n += (b - a + 1);
            }
            return n;
        };
        const pct = (n, d) => (d > 0 ? (n * 100 / d).toFixed(1) + '%' : '—');

        // The statistics, as a shelf of their own. Built when it is opened rather than up
        // front: it is two server calls, and most clicks on a card are not asking for it.
        const regionStatsBooks = async (rg) => {
            const c = drawn[rg.i];
            const lo = rg.lo, hi = rg.hi, span = Math.max(1, hi - lo + 1);
            graph.setMessage(' Reading ' + c.name + ':' + human(lo) + '-' + human(hi) + '… ');

            let gc = geneCache.get(geneKey(rg));
            if (!gc || gc.state === 'pending') { await geneAsk(rg); gc = geneCache.get(geneKey(rg)); }
            const genes = (gc && gc.genes) || [];
            const coding = genes.filter((g2) => g2.coding).length;

            const F = await fetchFeatures(rg.i, 'cds,five_utr,three_utr,exon,gene', lo, hi);
            const books = [];

            // The variants this view is holding here, which the annotation knows nothing
            // about -- they are the reason the region was selected in the first place.
            const d = vdata[rg.i];
            let vN = 0, vPath = 0;
            if (d && d.n) {
                let a2 = 0, z2 = d.n;
                while (a2 < z2) { const m2 = (a2 + z2) >> 1; if (d.pos[m2] < lo) a2 = m2 + 1; else z2 = m2; }
                for (let k = a2; k < d.n && d.pos[k] <= hi; k++) {
                    vN++;
                    if (d.cls[k] === 1 || (d.hl && d.hl[k] === HL_PATHOGENIC)) vPath++;
                }
            }

            books.push({ section: 'Region', note: true, title: 'span',
                blurb: c.name + ':' + human(lo) + '-' + human(hi) + '  ·  ' + fmtSpan(span)
                    + '  ·  ' + genes.length + ' gene' + (genes.length === 1 ? '' : 's')
                    + ' (' + coding + ' protein-coding)'
                    + '  ·  ' + vN.toLocaleString() + ' variant' + (vN === 1 ? '' : 's')
                    + (vPath ? ', ' + vPath.toLocaleString() + ' pathogenic' : '') });

            if (!F) {
                books.push({ section: 'Genomic structure', note: true, title: 'unavailable',
                    blurb: 'The annotation for this region could not be read.' });
            } else {
                const gene = bpCovered(F.gene || [], lo, hi);
                const exon = bpCovered(F.exon || [], lo, hi);
                const cds = bpCovered(F.cds || [], lo, hi);
                const u5 = bpCovered(F.five_utr || [], lo, hi);
                const u3 = bpCovered(F.three_utr || [], lo, hi);
                // Intronic is gene minus exon and intergenic is the rest, because that is
                // what those words mean -- neither is a feature the file carries.
                const intron = Math.max(0, gene - exon);
                const inter = Math.max(0, span - gene);
                const row = (label, n) => ({ section: 'Genomic structure', note: true,
                    title: label, blurb: label + ': ' + n.toLocaleString() + ' bp  ('
                        + pct(n, span) + ' of the region)' });
                books.push(row('Genic', gene));
                books.push(row('Exonic', exon));
                books.push(row('Coding (CDS)', cds));
                books.push(row("5' UTR", u5));
                books.push(row("3' UTR", u3));
                books.push(row('Intronic', intron));
                books.push(row('Intergenic', inter));
            }

            if (!genes.length) {
                books.push({ section: 'Genes', note: true, title: 'none',
                    blurb: 'No genes are annotated in this region.' });
            } else {
                for (const g2 of genes) {
                    books.push({
                        section: 'Genes',
                        title: g2.gene + (g2.strand === '-' ? '  \u25c2' : '  \u25b8'),
                        badge: g2.coding ? 'coding' : (g2.biotype || ''),
                        blurb: (g2.transcript || 'no transcript in the annotation')
                            + '  ·  ' + human(g2.start) + '-' + human(g2.end)
                            + '  ·  ' + fmtSpan(Math.max(1, g2.end - g2.start + 1)),
                    });
                }
            }
            return books;
        };

        const calloutMenu = (rg) => {
            const c = drawn[rg.i];
            const where = c.name + ':' + human(rg.lo) + '-' + human(rg.hi);
            const n = regions.indexOf(rg);
            try {
                exec('baja/lib/shelf.js', {
                    id: 'baja-region-actions',
                    title: where,
                    subtitle: fmtSpan(Math.max(1, rg.hi - rg.lo + 1))
                        + (n >= 0 ? '  ·  region ' + (n + 1) + ' of ' + regions.length : ''),
                    books: [
                        {
                            title: 'Open in oligo editor',
                            badge: 'transcripts',
                            blurb: 'List the transcripts here, tick the ones you want, and load '
                                + 'them into the editor with the variants that fall inside them.',
                            open: () => openRegions([rg]),
                        },
                        {
                            title: 'Sequence statistics',
                            badge: 'annotation',
                            blurb: 'What is in this region: its genes, and how much of it is '
                                + 'coding, UTR, intronic and intergenic.',
                            books: () => regionStatsBooks(rg),
                        },
                        {
                            title: 'Deselect',
                            badge: 'region',
                            blurb: 'Drop this region from the selection. The variants in it are '
                                + 'left exactly as they are.',
                            open: () => {
                                const at = regions.indexOf(rg);
                                if (at >= 0) regions.splice(at, 1);
                                if (activeRegion === geneKey(rg)) activeRegion = null;
                                if (graph.wake) graph.wake();
                                graph.setMessage(' ' + where + ' deselected — '
                                    + regions.length + ' region'
                                    + (regions.length === 1 ? '' : 's') + ' left. ');
                            },
                        },
                    ],
                    graph: graph,
                });
            } catch (e) {
                step('region menu threw: ' + e);
                graph.setMessage(' That region menu could not be opened: '
                    + (e && e.message ? e.message : e) + ' ');
            }
        };

        // The camera. One button opens this; everything about bookmarks happens in it.
        // `deleting` swaps what a click on a bookmark does -- go there, or drop it --
        // rather than putting a second control beside every row, which for sixty rows is
        // a hundred and twenty things to read instead of sixty.
        // BOOKMARKS ARE A LIBRARY OF VIEWS. The same shelf as the rest of the toolbar:
        // one card to keep the view showing now, then a card per view kept, and Remove
        // as a sub-library so taking one away is a choice made among the same cards.
        // The name of a new bookmark is typed in the shelf's own box: the box is wired
        // as a search, so what is typed does not filter the cards away -- it relabels
        // the keep card, which saves under that name. Untyped, the view names itself.
        // ---- DOWNLOAD LIBRARY --------------------------------------------------------------
        // The same idiom as the editor's Download (baja/lib/shelf.js): whole genome -> a
        // chromosome -> the selected regions, each ending in a format. Variants are the payload;
        // BED/JSON/CSV are built here, XLSX/PDF by /export-table. Huge variant sets are capped so
        // a browser is never asked to build millions of rows.
        const DL_ROW_CAP = 200000;       // in-browser BED/JSON/CSV
        const DL_SERVER_CAP = 50000;     // XLSX/PDF via /export-table
        const dlHost = window['env']['apiUrl'];
        const dlSafe = (x) => ('' + (x == null ? '' : x)).replace(/[^A-Za-z0-9_\- .]+/g, '_').replace(/\s+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'karyotype';
        const dlMsg = (m) => { try { if (graph && graph.setMessage) graph.setMessage(' ' + m + ' '); } catch (e) { } };
        const dlErr = (m) => { try { if (graph && graph.setError) graph.setError(m, 8); else dlMsg(m); } catch (e) { } };
        const dlSaveText = (text, filename, mime) => {
            try {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8;' }));
                a.download = filename; a.style.display = 'none';
                document.body.appendChild(a); a.click();
                setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(a.href); } catch (e) { } }, 500);
            } catch (e) { dlErr('Could not start the download: ' + e); }
        };
        const dlSaveB64 = (b64, filename, mime) => {
            try {
                const bin = atob(b64); const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }));
                a.download = filename; a.style.display = 'none';
                document.body.appendChild(a); a.click();
                setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(a.href); } catch (e) { } }, 500);
            } catch (e) { dlErr('Could not save the file: ' + e); }
        };
        const dlCell = (v) => { let x = (v == null) ? '' : ('' + v); if (/[",\n\r]/.test(x)) x = '"' + x.replace(/"/g, '""') + '"'; return x; };
        const dlColumns = (rows) => { const seen = []; for (const r of rows) for (const k in r) if (seen.indexOf(k) < 0) seen.push(k); return seen; };
        const dlToCSV = (rows) => { const c = dlColumns(rows); return c.map(dlCell).join(',') + '\n' + rows.map((r) => c.map((k) => dlCell(r[k])).join(',')).join('\n'); };
        const dlToBED = (rows) => rows.filter((b) => b && b.chrom && b.start !== '' && b.end !== '')
            .map((b) => [b.chrom, b.start, b.end, ('' + (b.name == null || b.name === '' ? '.' : b.name)).replace(/\s+/g, '_'), '.', '.'].join('\t')).join('\n') + '\n';

        const dlVariantRow = (ci, k) => {
            const d = vdata[ci]; const ab = allelesAt(ci, k);
            return { chrom: drawn[ci].name, pos: d.pos[k], ref: ab[0], alt: ab[1],
                significance: (function () { try { return sigOf(d, k) || ''; } catch (e) { return CLS_SIG[d.cls[k]] || ''; } })(),
                name: (d.names && d.names[k]) || '' };
        };
        const dlVariantBed = (ci, k) => {
            const d = vdata[ci];
            return { chrom: drawn[ci].name, start: Math.max(0, (d.pos[k] | 0) - 1), end: (d.pos[k] | 0),
                name: (d.names && d.names[k]) || (drawn[ci].name + ':' + d.pos[k]) };
        };
        // Collect up to `cap` variant indices for a set of chromosomes, optionally clipped to
        // regions. Returns { pairs:[[ci,k]...], total, truncated }.
        const dlCollect = (chromList, regionList, cap) => {
            const pairs = []; let total = 0, truncated = false;
            const inReg = (ci, pos) => { if (!regionList) return true; for (const r of regionList) { if (r.i === ci && pos >= r.lo && pos <= r.hi) return true; } return false; };
            for (const ci of chromList) {
                const d = vdata[ci]; if (!d || !d.n || !d.pos) continue;
                for (let k = 0; k < d.n; k++) {
                    if (regionList && !inReg(ci, d.pos[k])) continue;
                    total++;
                    if (pairs.length < cap) pairs.push([ci, k]); else truncated = true;
                }
            }
            return { pairs: pairs, total: total, truncated: truncated };
        };
        const dlCountVariants = (chromList, regionList) => {
            let total = 0;
            const inReg = (ci, pos) => { if (!regionList) return true; for (const r of regionList) { if (r.i === ci && pos >= r.lo && pos <= r.hi) return true; } return false; };
            for (const ci of chromList) { const d = vdata[ci]; if (!d || !d.n || !d.pos) continue; if (!regionList) { total += d.n; continue; } for (let k = 0; k < d.n; k++) if (inReg(ci, d.pos[k])) total++; }
            return total;
        };
        const dlAllChroms = () => drawn.map((c, i) => i);
        const dlSpecies = () => { try { return (r && r.species) || wanted || 'genome'; } catch (e) { return 'genome'; } };
        const dlAssembly = () => { try { return ('' + ((r && r.assembly) || '')); } catch (e) { return ''; } };

        const dlRunFormat = async (scope, fmt) => {
            try {
                const cap = (fmt === 'xlsx' || fmt === 'pdf') ? DL_SERVER_CAP : DL_ROW_CAP;
                const col = dlCollect(scope.chroms, scope.regions || null, cap);
                if (!col.pairs.length) { dlMsg('Nothing to download in that selection.'); return; }
                if (col.truncated) dlMsg('Large set — downloading the first ' + cap.toLocaleString() + ' of ' + col.total.toLocaleString() + ' variants.');
                if (fmt === 'json') { dlSaveText(JSON.stringify(col.pairs.map((p) => dlVariantRow(p[0], p[1])), null, 2), scope.base + '.json', 'application/json'); return; }
                if (fmt === 'csv') { dlSaveText(dlToCSV(col.pairs.map((p) => dlVariantRow(p[0], p[1]))), scope.base + '.csv', 'text/csv'); return; }
                if (fmt === 'bed') { dlSaveText(dlToBED(col.pairs.map((p) => dlVariantBed(p[0], p[1]))), scope.base + '.bed', 'text/plain'); return; }
                if (fmt === 'xlsx' || fmt === 'pdf') {
                    dlMsg('Building the ' + fmt.toUpperCase() + '…');
                    const rows = col.pairs.map((p) => dlVariantRow(p[0], p[1]));
                    const r = await POSTJSON({ format: fmt, filename: scope.base, title: scope.title, sheets: [{ name: 'Variants', rows: rows }] }, dlHost + '/export-table');
                    const body = (r && r.error && typeof r.error === 'object') ? r.error : r;
                    if (body && body.b64) { dlSaveB64(body.b64, body.filename || (scope.base + '.' + fmt), body.mime); dlMsg((body.filename || scope.base) + ' downloaded.'); }
                    else { dlErr('Could not build the ' + fmt.toUpperCase() + ': ' + ((body && (body.error || body.message)) || 'server error')); }
                }
            } catch (e) { dlErr('Download failed: ' + e); }
        };
        const dlFormatBooks = (scope) => {
            const n = dlCountVariants(scope.chroms, scope.regions || null);
            const heavy = n > DL_SERVER_CAP;
            const books = [
                { title: 'BED', badge: '.bed', leaf: true, ready: true, blurb: 'Genomic positions, tab-separated.', open: () => dlRunFormat(scope, 'bed') },
                { title: 'JSON', badge: '.json', leaf: true, ready: true, blurb: 'The variant records.', open: () => dlRunFormat(scope, 'json') },
                { title: 'CSV', badge: '.csv', leaf: true, ready: true, blurb: 'One row per variant.', open: () => dlRunFormat(scope, 'csv') },
                { title: 'Excel (XLSX)', badge: '.xlsx', leaf: true, ready: !heavy, readyNote: 'Too many variants for a spreadsheet — narrow to a chromosome or region.', blurb: 'A spreadsheet of the variants.', open: () => dlRunFormat(scope, 'xlsx') },
                { title: 'PDF', badge: '.pdf', leaf: true, ready: !heavy, readyNote: 'Too many variants for a PDF — narrow to a chromosome or region.', blurb: 'A printable listing.', open: () => dlRunFormat(scope, 'pdf') }
            ];
            return books;
        };
        const downloadMenu = () => {
            try { if (typeof hideAllModal === 'function') hideAllModal(); } catch (e) { }
            const base = dlSafe(dlSpecies() + (dlAssembly() ? ('_' + dlAssembly()) : ''));
            const genomeScope = { chroms: dlAllChroms(), base: base + '_variants', title: dlSpecies() + ' — all variants' };
            const books = [];
            const totalN = vtotal || dlCountVariants(dlAllChroms(), null);
            books.push({ section: 'Download genome', note: true, title: 'Every variant on the karyotype (' + (totalN ? totalN.toLocaleString() : '0') + ') — pick a format:' });
            dlFormatBooks(genomeScope).forEach((b) => books.push(Object.assign({}, b, { section: 'Download genome' })));
            if (Array.isArray(regions) && regions.length) {
                const rScope = { chroms: Array.from(new Set(regions.map((r) => r.i))), regions: regions.slice(), base: base + '_regions', title: dlSpecies() + ' — selected regions' };
                books.push({ section: 'Selected regions', note: true, title: 'The variants inside the ' + regions.length + ' selected region' + (regions.length === 1 ? '' : 's') + ':' });
                dlFormatBooks(rScope).forEach((b) => books.push(Object.assign({}, b, { section: 'Selected regions' })));
            }
            const withV = drawn.map((c, i) => i).filter((i) => vdata[i] && vdata[i].n);
            if (withV.length) {
                books.push({ section: 'By chromosome', note: true, title: 'Download one chromosome:' });
                withV.forEach((i) => books.push({
                    section: 'By chromosome', title: drawn[i].name, badge: (vdata[i].n.toLocaleString()), ready: true,
                    blurb: vdata[i].n.toLocaleString() + ' variant' + (vdata[i].n === 1 ? '' : 's'),
                    books: () => dlFormatBooks({ chroms: [i], base: base + '_' + dlSafe(drawn[i].name), title: dlSpecies() + ' — ' + drawn[i].name })
                }));
            }
            exec('baja/lib/shelf.js', {
                id: 'baja-karyo-download',
                title: 'Download',
                subtitle: 'Download the karyotype variants — whole genome, a chromosome, or the selected regions',
                graph: graph,
                books: books
            });
        };

        // ---- SHARE -------------------------------------------------------------------------
        // Mirrors the editor's Share: a public view-only link (anyone, no login, opened by the
        // exempt manchester/viewer.js) and a per-person share (an email invite; opened in this
        // viewer after sign-in). Both carry a stateDoc() snapshot, so the shared karyotype has
        // its variants, view and bookmarks.
        const shareBaseName = () => {
            let fn = '';
            try { const st = window.history.state; fn = (st && st.karyotype) ? ('' + st.karyotype).split('/').pop().replace(/\.karyotype(\.json)?$/i, '') : ''; } catch (e) { }
            return dlSafe(fn || (dlSpecies() + (dlAssembly() ? ('_' + dlAssembly()) : '')) || 'karyotype');
        };
        const shareEsc = (v) => ('' + (v == null ? '' : v)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const shareKaryoPublic = async () => {
            const host_ = window['env']['apiUrl']; const user = ('' + (getUser() || '')).trim();
            if (!user) { dlErr('Sign in to share.'); return; }
            dlMsg('Creating a public view-only link…');
            try {
                const value = JSON.stringify(stateDoc());
                const name = shareBaseName() + '.karyotype';
                const saveRs = await POSTJSON({ name: name, key: 'user', user: user, spath: 'public', value: value }, host_ + '/save-user-data');
                try { await POSTJSON({ name: '.share', key: 'user', user: user, spath: 'public', value: 'public\n/public' }, host_ + '/save-user-data'); } catch (e) { }
                const sharedPath = (saveRs && saveRs.path) ? saveRs.path : ('/' + user + '/public/' + name);
                let link = window.location.origin + '/app/manchester/viewer?path=' + encodeURIComponent(sharedPath);
                try { const al = await POSTJSON({ path: sharedPath }, host_ + '/share-alias'); if (al && al.code) link = window.location.origin + '/s/' + al.code; } catch (e) { }
                try { if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(link); } catch (e) { }
                showModal({ wid: 'html', data: '<div style="padding:18px 20px;font-family:system-ui,-apple-system,Arial;max-width:520px;">'
                    + '<div style="font-size:15px;font-weight:700;margin-bottom:8px;">Public link created</div>'
                    + '<div style="font-size:12px;color:#475569;margin-bottom:10px;">Copied to your clipboard. Anyone with this link can view this karyotype — no login required.</div>'
                    + '<div style="font-size:12px;word-break:break-all;background:#f1f5f9;border:1px solid #e2e8f0;border-radius:6px;padding:8px 10px;"><a href="' + shareEsc(link) + '" target="_blank" style="color:#1d4ed8;">' + shareEsc(link) + '</a></div></div>' }, 560, 220);
                dlMsg('Public link copied to clipboard.');
            } catch (e) { dlErr('Could not create the link: ' + e); }
        };
        const shareKaryoWithPerson = () => {
            const host_ = window['env']['apiUrl']; const user = ('' + (getUser() || '')).trim();
            if (!user) { dlErr('Sign in to share.'); return; }
            const designName = shareBaseName() + '.karyotype';
            const body = (r) => (r && r.error && typeof r.error === 'object') ? r.error : r;
            try { const old = document.getElementById('baja-karyo-share-dialog'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
            const backdrop = document.createElement('div');
            backdrop.style.cssText = 'position:fixed;inset:0;z-index:2147482999;background:rgba(0,0,0,0.35);';
            const panel = document.createElement('div');
            panel.id = 'baja-karyo-share-dialog';
            panel.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:2147483000;width:min(560px,94vw);max-height:calc(100vh - 90px);overflow:auto;background:#0b2545;color:#fff;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.14);font-family:Arial,Helvetica,sans-serif;padding:18px;';
            const fc = 'width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:10px;font:13px Arial;';
            panel.innerHTML = ''
                + '<button id="ks-x" title="Close" aria-label="Close" style="position:absolute;top:8px;right:10px;cursor:pointer;border:none;background:transparent;color:#9fb3c8;font:700 18px Arial;line-height:1;padding:4px 8px;">✕</button>'
                + '<div style="font:700 16px Arial;margin-bottom:4px;padding-right:24px;">Share this karyotype with a person</div>'
                + '<div style="font:13px Arial;color:#9fb3c8;margin-bottom:12px;">They get a short link that opens this karyotype once they sign in. No account yet? The link takes them through the free sign-in first.</div>'
                + '<label style="font:12px Arial;color:#9fb3c8;">Email address (one or more, comma-separated)</label>'
                + '<input id="ks-to" type="text" autocomplete="off" placeholder="name@example.org" style="' + fc + 'margin:4px 0 10px;">'
                + '<label style="font:12px Arial;color:#9fb3c8;">Message (optional)</label>'
                + '<textarea id="ks-msg" rows="2" placeholder="A note to go with the karyotype" style="' + fc + 'margin:4px 0 10px;resize:vertical;"></textarea>'
                + '<div id="ks-status" style="font:12px Arial;color:#9fb3c8;min-height:16px;margin-bottom:6px;"></div>'
                + '<div id="ks-results"></div>'
                + '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:10px;">'
                + '<button id="ks-close" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 13px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Close</button>'
                + '<button id="ks-send" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 13px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">Share</button></div>';
            document.body.appendChild(backdrop); document.body.appendChild(panel);
            const $ = (id) => panel.querySelector('#' + id);
            let onKey;
            const close = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } try { if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop); } catch (e) { } try { if (onKey) document.removeEventListener('keydown', onKey, true); } catch (e) { } };
            $('ks-close').onclick = close; $('ks-x').onclick = close; backdrop.onclick = close;
            onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
            document.addEventListener('keydown', onKey, true);
            $('ks-send').onclick = async () => {
                const raw = ('' + ($('ks-to').value || '')).split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
                const addrs = Array.from(new Set(raw));
                const bad = addrs.filter((a) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a));
                if (!addrs.length) { $('ks-status').textContent = 'Enter at least one email address.'; return; }
                if (bad.length) { $('ks-status').textContent = 'Not an email address: ' + bad.join(', '); return; }
                const message = ('' + ($('ks-msg').value || '')).trim();
                const btn = $('ks-send'); btn.disabled = true; btn.textContent = 'Sharing…';
                let value = '';
                try { value = JSON.stringify(stateDoc()); } catch (e) { $('ks-status').textContent = 'Could not serialize: ' + e; btn.disabled = false; btn.textContent = 'Share'; return; }
                $('ks-status').textContent = 'Saving a copy for ' + (addrs.length === 1 ? addrs[0] : addrs.length + ' people') + '…';
                let firstLink = '';
                for (const to of addrs) {
                    const r = body(await POSTJSON({ user: user, to: to, name: designName, value: value, message: message }, host_ + '/share-with'));
                    if (r && r.url) {
                        if (!firstLink) firstLink = r.url;
                        const mail = r.mailed ? ('<span style="color:#86efac;">Emailed to ' + shareEsc(to) + '.</span>') : ('<span style="color:#fcd34d;">Email not sent' + (r.mailError ? ' (' + shareEsc(r.mailError) + ')' : '') + ' — copy the link and send it.</span>');
                        $('ks-results').insertAdjacentHTML('beforeend', '<div style="background:#0a1e3a;border:1px solid rgba(255,255,255,0.12);border-radius:8px;padding:8px 10px;margin:6px 0;font:12px Arial;"><b>' + shareEsc(to) + '</b><div style="word-break:break-all;margin-top:4px;"><a href="' + shareEsc(r.url) + '" target="_blank" style="color:#4fd0e6;">' + shareEsc(r.url) + '</a></div><div style="margin-top:4px;">' + mail + '</div></div>');
                    } else {
                        $('ks-results').insertAdjacentHTML('beforeend', '<div style="font:12px Arial;color:#fca5a5;margin:6px 0;">' + shareEsc(to) + ': ' + shareEsc((r && (r.error || r.message)) || 'sharing failed') + '</div>');
                    }
                }
                if (firstLink && addrs.length === 1) { try { await navigator.clipboard.writeText(firstLink); } catch (e) { } }
                $('ks-status').textContent = firstLink ? ('Shared.' + (addrs.length === 1 ? ' Link on your clipboard.' : '')) : 'Nothing was shared.';
                $('ks-to').value = ''; btn.disabled = false; btn.textContent = 'Share';
            };
            try { $('ks-to').focus(); } catch (e) { }
        };
        const shareMenu = () => {
            try { if (typeof hideAllModal === 'function') hideAllModal(); } catch (e) { }
            const user = ('' + (getUser() || '')).trim();
            if (!user) { dlErr('Sign in to share a karyotype.'); return; }
            exec('baja/lib/shelf.js', {
                id: 'baja-karyo-share',
                title: 'Share',
                subtitle: 'Share this karyotype with named people, or as a public view-only link',
                graph: graph,
                books: [
                    { title: 'Share with people', badge: 'By email', ready: true, leaf: true, blurb: 'Name one or more email addresses; each gets a private link that opens this karyotype once they sign in — free if they have no account.', open: () => { try { shareKaryoWithPerson(); } catch (e) { dlErr('Could not open sharing: ' + e); } } },
                    { title: 'Public view-only link', badge: 'Anyone', ready: true, blurb: 'A link anyone can open, no login, read-only.', books: () => [
                        { note: true, title: 'A public link needs no login: anyone who has it can VIEW this karyotype, including the variants on it. Do not create a public link for identifiable or sensitive genetic data.' },
                        { title: 'Create the public link', badge: 'Confirm', ready: true, leaf: true, blurb: 'Publish this karyotype as a read-only public link and copy it to your clipboard.', open: () => { shareKaryoPublic(); } }
                    ] }
                ]
            });
        };

        // A lower-left bookmark navigator, the karyotype's version of the editor's
        // bookmark-nav: it lists the saved views and flies to one on click (goView), with a
        // green Download button at the bottom. Toggles: a second call takes it down. Auto-opens
        // for a shared karyotype that carries bookmarks.
        const bookmarkNav = () => {
            const id = 'baja-karyo-booknav';
            try { const ex = document.getElementById(id); if (ex && ex.parentNode) { ex.parentNode.removeChild(ex); return; } } catch (e) { }
            const esc = (x) => ('' + (x == null ? '' : x)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const panel = document.createElement('div');
            panel.id = id;
            panel.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:2147482000;width:230px;max-height:52vh;display:flex;flex-direction:column;background:#0b2545;color:#e8f0fb;border:1px solid rgba(255,255,255,0.16);border-radius:12px;box-shadow:0 10px 34px rgba(0,0,0,0.45);font-family:Arial,Helvetica,sans-serif;overflow:hidden;';
            const header = document.createElement('div');
            header.style.cssText = 'flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:10px 12px;background:#0a1e3a;border-bottom:1px solid rgba(255,255,255,0.12);';
            header.innerHTML = '<span style="font-size:16px;line-height:1;">📷</span><span style="font:700 13px Arial;flex:1;">Bookmarks</span><button id="kn-min" title="Collapse" style="cursor:pointer;border:none;background:transparent;color:#9fb3c8;font:700 15px Arial;line-height:1;padding:2px 6px;">–</button><button id="kn-x" title="Hide" style="cursor:pointer;border:none;background:transparent;color:#9fb3c8;font:700 14px Arial;line-height:1;padding:2px 6px;">✕</button>';
            const list = document.createElement('div');
            list.style.cssText = 'flex:1 1 auto;overflow:auto;padding:8px;display:flex;flex-direction:column;gap:6px;';
            if (!bookmarks.length) {
                const hint = document.createElement('div');
                hint.style.cssText = 'font:12px Arial;color:#9fb3c8;padding:6px 4px;line-height:1.5;';
                hint.innerHTML = 'No bookmarks yet.<br>Keep a view from the <b>Bookmarks</b> button.';
                list.appendChild(hint);
            } else {
                bookmarks.forEach((bk, i) => {
                    const b = document.createElement('button');
                    b.style.cssText = 'text-align:left;cursor:pointer;border:1px solid rgba(255,255,255,0.12);background:#0a1e3a;color:#e8f0fb;border-radius:8px;padding:8px 10px;font:13px Arial;';
                    b.innerHTML = '<div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(bk.name || ('view ' + (i + 1))) + '</div>';
                    b.onmouseenter = () => { b.style.background = '#123a63'; };
                    b.onmouseleave = () => { b.style.background = '#0a1e3a'; };
                    b.onclick = () => { try { goView(bk); } catch (e) { } };
                    list.appendChild(b);
                });
            }
            const footer = document.createElement('div');
            footer.style.cssText = 'flex:0 0 auto;padding:8px;border-top:1px solid rgba(255,255,255,0.12);';
            const dl = document.createElement('button');
            dl.title = 'Download';
            dl.style.cssText = 'width:100%;box-sizing:border-box;cursor:pointer;border:none;border-radius:8px;padding:9px 12px;font:700 13px Arial;background:#16a34a;color:#eafff2;display:flex;align-items:center;justify-content:center;gap:8px;';
            dl.innerHTML = '<span class="material-icons" style="font-size:18px;line-height:1;">file_download</span><span>Download</span>';
            dl.onclick = () => { try { downloadMenu(); } catch (e) { } };
            footer.appendChild(dl);
            let collapsed = false; try { collapsed = sessionStorage.getItem('baja.karyoBookNav.collapsed') === '1'; } catch (e) { }
            const apply = () => { list.hidden = collapsed; footer.hidden = collapsed; try { header.querySelector('#kn-min').textContent = collapsed ? '+' : '–'; } catch (e) { } try { sessionStorage.setItem('baja.karyoBookNav.collapsed', collapsed ? '1' : '0'); } catch (e) { } };
            panel.appendChild(header); panel.appendChild(list); panel.appendChild(footer);
            document.body.appendChild(panel); apply();
            header.querySelector('#kn-min').onclick = () => { collapsed = !collapsed; apply(); };
            header.querySelector('#kn-x').onclick = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
        };

        const bookmarkMenu = () => {
            const here = viewOf();
            const suggested = describeView(here);
            const when = (b) => { try { return b.at ? new Date(b.at).toLocaleString() : ''; } catch (e) { return ''; } };
            const keepCard = (name) => ({
                section: 'Keep this view',
                title: name ? 'Bookmark this view as \u201c' + name + '\u201d' : 'Bookmark this view',
                badge: 'showing now',
                blurb: suggested + (name ? '' : '  \u00b7  type a name in the box above to call it something else') + '. It is written into the file when you Save.',
                open: () => {
                    const v = viewOf();
                    if (!v) { graph.setMessage(' There is no view to bookmark yet. '); return; }
                    if (bookmarks.length >= BOOKMARK_CAP) {
                        graph.setMessage(' That is ' + BOOKMARK_CAP + ' bookmarks \u2014 remove one before adding another. ');
                        return;
                    }
                    const nm = ('' + (name || '')).trim().replace(/[\r\n]+/g, ' ').slice(0, 80) || describeView(v);
                    bookmarks.push({ name: nm, x0: v.x0, x1: v.x1, y0: v.y0, y1: v.y1, at: new Date().toISOString() });
                    graph.setMessage(' Bookmarked \u201c' + nm + '\u201d. Save the file to keep it. ');
                },
            });
            const viewCards = () => bookmarks.map((bk, k) => ({
                section: 'Saved views (' + bookmarks.length + ')',
                title: bk.name || ('view ' + (k + 1)),
                badge: 'view ' + (k + 1),
                blurb: describeView(bk) + (when(bk) ? '  \u00b7  ' + when(bk) : ''),
                open: async () => {
                    if (await goView(bk)) graph.setMessage(' ' + (bk.name || 'Bookmark') + '. ');
                    else graph.setMessage(' That bookmark could not be restored. ');
                },
            }));
            const removeCards = () => bookmarks.map((bk, k) => ({
                title: 'Remove \u201c' + (bk.name || ('view ' + (k + 1))) + '\u201d',
                badge: 'remove',
                blurb: describeView(bk) + '. Gone from this karyotype; save the file to keep the change.',
                open: () => {
                    const at = bookmarks.indexOf(bk);
                    const gone = at >= 0 ? bookmarks.splice(at, 1)[0] : null;
                    graph.setMessage(' Removed ' + (gone && gone.name ? gone.name : 'that bookmark') + '. Save the file to keep the change. ');
                },
            }));
            const panelCard = { section: 'Bookmark panel', title: 'Show / hide the bookmark panel', badge: 'panel', blurb: 'A small navigator in the lower-left corner with a Download button.', open: () => { bookmarkNav(); } };
            const booksFor = (name) => [panelCard, keepCard(name)].concat(viewCards(), bookmarks.length ? [{
                section: 'Saved views (' + bookmarks.length + ')',
                title: 'Remove a bookmark\u2026', badge: bookmarks.length + ' kept',
                blurb: 'Choose one to take out of this karyotype.',
                books: removeCards,
            }] : [{ section: 'Saved views', note: true, title: 'No bookmarks yet. Frame a view on the chromosomes and keep it with the card above.', blurb: '' }]);
            try {
                exec('baja/lib/shelf.js', {
                    id: 'baja-karyo-bookmarks',
                    title: 'Bookmarked views',
                    subtitle: (bookmarks.length ? bookmarks.length + ' bookmark' + (bookmarks.length === 1 ? '' : 's') + ' kept  \u00b7  ' : '')
                        + 'Showing now: ' + suggested,
                    searchPlaceholder: 'Name for a new bookmark\u2026',
                    books: booksFor(''),
                    search: async (text) => booksFor(text),
                    graph: graph,
                });
            } catch (e) {
                step('bookmark shelf threw: ' + e);
                graph.setMessage(' Bookmarks could not be opened: ' + (e && e.message ? e.message : e) + ' ');
            }
        };

        const regionMenu = () => {
            const act = (label, fn) => ({
                label: label,
                ionFunction: createIonFunction(async () => {
                    try { hideAllModal(); } catch (e) { }
                    try { await fn(); } catch (e) {
                        step('region action threw: ' + e);
                        graph.setMessage(' That did not run: ' + (e && e.message ? e.message : e) + ' ');
                    }
                })
            });
            const span = regions.reduce((t, x) => t + (x.hi - x.lo), 0);
            // THE BUTTON THAT ONLY EXISTS WHEN THERE IS SOMETHING TO PRESS. With no
            // regions there is nothing to open, and an always-present control that
            // answers "choose a region first" is a control that lies about being ready.
            const loadRow = regions.length ? [
                act('Open ' + regions.length + ' selected region'
                    + (regions.length === 1 ? '' : 's') + ' in the editor', async () => {
                        await openRegions(regions.slice());
                    })
            ] : [];
            const head = regions.length
                ? (regions.length + ' region' + (regions.length === 1 ? '' : 's') + ' selected, '
                    + (Math.round(span / 1e4) / 100) + ' Mb in total')
                : 'No regions selected. Drag with <b>Select sequence</b>, or name one with '
                    + '<b>Find gene</b>, to choose regions.';
            // The two kinds of action in this menu answer to different things, and saying
            // so is cheaper than someone finding out by being surprised.
            const scope = 'Delete and Remove act on the selected regions. The highlights '
                + 'always cover the whole genome.';
            showModal({
                wid: 'card',
                data: {
                    // HEIGHT IS NOT OPTIONAL. Every card that shows in a modal in this
                    // application sets one; without it the card collapses and the modal
                    // opens with nothing in it, which is exactly what "the menu does not
                    // show up" looked like.
                    // The same inset the Find a gene panel uses: card_padding holds the
                    // panel off the modal edge, padding gives the rows their rhythm.
                    card_padding: '20px 22px',
                    padding: '7px 0',
                    height: '500px',
                    cards: [[
                        {
                            'title': ' ', 'width': '100%',
                            'component': {
                                wid: 'html',
                                data: '<div style="padding:2px 0 10px;font:14px Arial;">'
                                    + '<b>Regions</b><div style="color:#5b6b7a;font:12.5px Arial;'
                                    + 'margin-top:4px;">' + head + '</div>'
                                    + '<div style="color:#8296ab;font:11.5px Arial;'
                                    + 'margin-top:6px;">' + scope + '</div></div>'
                            }
                        },
                        {
                            'title': ' ', 'width': '100%',
                            'component': {
                                wid: 'mt-button',
                                data: {
                                    buttons: loadRow.concat([
                                        act('Delete all selected', () => {
                                            if (!regions.length) { graph.setMessage(' Choose a region first. '); return; }
                                            rebuildKeeping((ci, p) => !inRegion(ci, p), 'Deleted the selected regions');
                                        }),
                                        act('Remove all else', () => {
                                            if (!regions.length) { graph.setMessage(' Choose a region first. '); return; }
                                            rebuildKeeping((ci, p) => inRegion(ci, p), 'Kept only the selected regions');
                                        }),
                                        act('Label protein coding SNPs', () => applyFilter('coding', 1)),
                                        act('Highlight intronic', () => applyFilter('intronic', 2)),
                                        act("Highlight 3' UTR", () => applyFilter('three_utr', 3)),
                                        act("Highlight 5' UTR", () => applyFilter('five_utr', 4)),
                                        act('Highlight pathogenic / likely pathogenic',
                                            () => applyFilter('pathogenic', HL_PATHOGENIC)),
                                        act('Clear highlights', () => clearHighlights()),
                                        act('Clear regions', () => {
                                            regions = [];
                                            geneCache.clear();
                                            activeRegion = null;
                                            if (graph.wake) graph.wake();
                                            graph.setMessage(' Regions cleared. ');
                                        }),
                                    ])
                                }
                            }
                        },
                    ]]
                }
            });
        };

        // ---- the two toolbar menus ---------------------------------------------------
        //
        // Same shape as regionMenu above, which is this application's menu: a card in a
        // modal, a heading saying what the menu is for, then the rows. Written twice rather
        // than shared with regionMenu because the two differ in every line that matters and
        // a common builder would be a parameter for each of them.
        const menuAct = (label, fn) => ({
            label: label,
            ionFunction: createIonFunction(async () => {
                try { hideAllModal(); } catch (e) { }
                try { await fn(); } catch (e) {
                    step('menu action threw: ' + e);
                    try { graph.setMessage(' That did not run: ' + (e && e.message ? e.message : e) + ' '); } catch (e2) { }
                }
            })
        });

        const menuPanel = (title, blurb, buttons) => {
            showModal({
                wid: 'card',
                data: {
                    // HEIGHT IS NOT OPTIONAL -- see regionMenu. Without one the card
                    // collapses and the modal opens empty.
                    card_padding: '20px 22px',
                    padding: '7px 0',
                    height: '380px',
                    cards: [[
                        {
                            'title': ' ', 'width': '100%',
                            'component': {
                                wid: 'html',
                                data: '<div style="padding:2px 0 10px;font:14px Arial;">'
                                    + '<b>' + title + '</b><div style="color:#5b6b7a;font:12.5px Arial;'
                                    + 'margin-top:4px;">' + blurb + '</div></div>'
                            }
                        },
                        {
                            'title': ' ', 'width': '100%',
                            'component': { wid: 'mt-button', data: { buttons: buttons } }
                        }
                    ]]
                }
            });
        };

        // THE INFORMATION WINDOW, as in the editor: a floating panel that says what is loaded
        // and what is on, toggled by the Info button. Pinned lower-right, read-only, folds away
        // on a second press or its own ✕. Reads the live state each time it is opened.
        const infoPanel = () => {
            const id = 'baja-karyo-info';
            try {
                const ex = document.getElementById(id);
                if (ex && ex.parentNode) { ex.parentNode.removeChild(ex); return; }
            } catch (e) { }
            const esc = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const nS = SAMPLES.length;
            const chromsWith = vdata.reduce((a, d) => a + (d && d.n ? 1 : 0), 0);
            const hasGt = vdata.some(d => d.gtw && d.gts);
            let curName = '';
            try { const c = '' + ((window.history.state || {}).karyotype || ''); curName = c ? c.split('/').filter(Boolean).pop() : ''; } catch (e) { }
            const modeName = { class: 'ClinVar class', sample: 'by sample', phase: 'by phase' }[colorMode] || colorMode;
            // What is glowing / highlighted right now.
            let hlStr = 'none';
            try {
                if (hlSamples && hlSamples.size) {
                    hlStr = 'samples ' + Array.from(hlSamples).map((si) => SAMPLES[si] || ('#' + (si + 1))).join(', ');
                } else if (hlActive) {
                    hlStr = HL_NAME[hlActive] || 'on';
                }
            } catch (e) { }
            const rows = [
                ['File', curName || 'not saved yet'],
                ['Species', (r && r.species) || 'human'],
                ['Variants', (vtotal || 0).toLocaleString()],
                ['Chromosomes with variants', chromsWith + ' of ' + drawn.length],
                ['Samples', nS ? (nS + ' — ' + SAMPLES.join(', ')) : 'none'],
                ['Genotypes', hasGt ? 'yes' : 'no'],
                ['Colour view', modeName],
                ['Highlighting', esc(hlStr)],
                ['Regions selected', '' + ((regions && regions.length) || 0)],
                ['Bookmarks', '' + ((bookmarks && bookmarks.length) || 0)],
                ['Patents', patOn ? ('shown' + (patNote ? ' — ' + patNote : '')) : 'off'],
            ];
            const panel = document.createElement('div');
            panel.id = id;
            panel.style.cssText = 'position:fixed;right:14px;bottom:14px;z-index:2147482000;width:290px;'
                + 'max-height:70vh;display:flex;flex-direction:column;background:#0b2545;color:#e8f0fb;'
                + 'border:1px solid rgba(255,255,255,0.16);border-radius:12px;box-shadow:0 10px 34px rgba(0,0,0,0.45);'
                + 'font-family:Arial,Helvetica,sans-serif;overflow:hidden;';
            const header = document.createElement('div');
            header.style.cssText = 'flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:10px 12px;'
                + 'background:#0a1e3a;border-bottom:1px solid rgba(255,255,255,0.12);';
            header.innerHTML = '<span style="font-size:15px;line-height:1;">ℹ️</span>'
                + '<span style="font:700 13px Arial;flex:1;">Karyotype info</span>'
                + '<button id="ki-x" title="Close" style="cursor:pointer;border:none;background:transparent;color:#9fb3c8;font:700 14px Arial;line-height:1;padding:2px 6px;">✕</button>';
            const body = document.createElement('div');
            body.style.cssText = 'flex:1 1 auto;overflow:auto;padding:10px 12px;font:12.5px Arial;line-height:1.5;';
            body.innerHTML = rows.map((rw) =>
                '<div style="display:flex;gap:10px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.06);">'
                + '<span style="flex:0 0 46%;color:#9fb3c8;">' + esc(rw[0]) + '</span>'
                + '<span style="flex:1;text-align:right;font-weight:600;word-break:break-word;">' + esc(rw[1]) + '</span></div>'
            ).join('');
            panel.appendChild(header);
            panel.appendChild(body);
            document.body.appendChild(panel);
            try { header.querySelector('#ki-x').onclick = () => { if (panel.parentNode) panel.parentNode.removeChild(panel); }; } catch (e) { }
        };

        // COLOUR IS A LIBRARY OF THREE. The same shelf as Search and Files: one card per
        // mode, the one that is on badged so, the ones the file cannot support greyed
        // with the reason rather than missing.
        const colorMenu = () => {
            if (!vtotal) { graph.setMessage(' Load a VCF first: there are no variants to color. '); return; }
            const nS = SAMPLES.length;
            const modeBadge = (m) => (colorMode === m ? 'on' : 'off');
            // Choosing a color scheme; clicking the one already on turns it off (back to the
            // default ClinVar-class colors). Reopens so the on/off badges refresh.
            const setMode = (m) => {
                try { setColorMode((colorMode === m && m !== 'class') ? 'class' : m); } catch (e) { }
                colorMenu();
            };
            // ONE BUTTON to flip the whole karyotype between its color views without hunting
            // for the individual scheme card. It cycles through the schemes the file can
            // actually show: ClinVar class always, and by-sample / by-phase when there are
            // samples. Its badge names the view that is on now.
            // SAMPLE COLOUR OPTIONS ARE FOR MULTI-SAMPLE FILES. One sample (or none) is just
            // plotted -- every carried variant is that one sample, so "which sample carries it"
            // has no answer worth a colour. `multi` gates the by-sample scheme, the per-sample
            // colour pickers and the per-sample glow. ClinVar class is always offered, and the
            // by-phase (haplotype) view is offered whenever the file carries genotypes, since
            // that reads a single sample too.
            const hasGt = vdata.some(d => d.gtw && d.gts);
            const multi = nS > 1;
            const schemeLabel = { class: 'ClinVar class', sample: 'By sample', phase: 'By phase' };
            const SCHEMES = ['class'].concat(multi ? ['sample'] : []).concat(hasGt ? ['phase'] : []);
            const cycleColorView = () => {
                const i = SCHEMES.indexOf(colorMode);
                const next = SCHEMES[(i + 1) % SCHEMES.length];
                try { setColorMode(next); } catch (e) { }
                try { graph.setMessage(' Color view: ' + (schemeLabel[next] || next) + '. '); } catch (e) { }
                colorMenu();
            };
            // The annotation highlights, now here as on/off toggles as well as under Search.
            // hlActive holds the one that is on; clicking it again clears it.
            const hlBadge = (code) => (hlActive === code ? 'on' : 'off');
            const toggleHl = async (kind, code) => {
                try { if (hlActive === code) { clearHighlights(); } else { await applyFilter(kind, code); } } catch (e) { }
                colorMenu();
            };
            // One card per sample: glow every variant that sample carries, genome-wide, in the
            // sample's own colour. Each toggles on and off ON ITS OWN, so several samples can
            // glow at once. Multi-sample only; needs genotypes.
            const sampleGlowCards = (multi && hasGt) ? SAMPLES.map((nm, si) => ({
                section: 'By sample (glowing)',
                title: nm || ('Sample ' + (si + 1)),
                badge: hlSamples.has(si) ? 'on' : 'off',
                blurb: 'Glow every variant ' + (nm || ('sample ' + (si + 1))) + ' carries, right across the genome.'
                    + (hlSamples.has(si) ? ' Click to turn it off.' : ''),
                open: () => {
                    try { toggleSampleHighlight(si); } catch (e) { }
                    colorMenu();
                },
            })) : (multi ? [{
                section: 'By sample (glowing)', title: 'No genotypes in this VCF', badge: '',
                ready: false, readyNote: 'no genotypes',
                blurb: 'This VCF has sample columns but no genotype calls, so per-sample glow is not available.',
                open: () => { },
            }] : []);
            // CHOOSE A SAMPLE'S COLOUR. A native colour picker, opened from within the card's
            // click so the browser still counts it as a user gesture. The chosen colour is
            // written into SAMPLE_COLOR (read live by colorOf, the density palette, the legend
            // and the glow), the canvas is woken, and if that sample is glowing now its glow
            // colour is updated too. The choice travels with the file (see stateDoc).
            const pickSampleColor = (si) => {
                try {
                    const inp = document.createElement('input');
                    inp.type = 'color';
                    inp.value = SAMPLE_COLOR[si] || '#1d9bf0';
                    // Anchored to the CENTRE of the screen, not parked off-screen: the OS colour
                    // dialog opens next to its input, so an input at left:-9999px opened the
                    // picker off the right edge. A 1px, invisible input in the middle puts the
                    // dialog in the middle.
                    inp.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);'
                        + 'width:1px;height:1px;opacity:0;border:0;padding:0;margin:0;z-index:2147483647;';
                    document.body.appendChild(inp);
                    inp.addEventListener('change', () => {
                        const c = ('' + inp.value).trim();
                        if (/^#[0-9a-fA-F]{6}$/.test(c)) {
                            SAMPLE_COLOR[si] = c;
                            if (hlSamples.has(si)) { HL_COLOR[SAMPLE_HL_BASE + si] = c; if (graph.wake) graph.wake(); }
                            try { if (graph.wake) graph.wake(); } catch (e) { }
                            try { if (colorMode === 'sample') legendShow(); } catch (e) { }
                            try { graph.setMessage(' ' + (SAMPLES[si] || ('Sample ' + (si + 1))) + ' is now ' + c + '. '); } catch (e) { }
                        }
                        try { if (inp.parentNode) inp.parentNode.removeChild(inp); } catch (e) { }
                        colorMenu();
                    }, { once: true });
                    inp.click();
                } catch (e) {
                    try { graph.setMessage(' The colour picker could not open. '); } catch (e2) { }
                }
            };
            const sampleColorCards = multi ? SAMPLES.map((nm, si) => ({
                section: 'Sample colors',
                title: nm || ('Sample ' + (si + 1)),
                swatch: SAMPLE_COLOR[si] || '#1d9bf0',
                badge: (SAMPLE_COLOR[si] || '').toUpperCase(),
                blurb: 'Pick the color for ' + (nm || ('sample ' + (si + 1)))
                    + ' — used in the by-sample view, its glow, and the legend.',
                open: () => pickSampleColor(si),
            })) : [];
            try {
                exec('baja/lib/shelf.js', {
                    id: 'baja-karyo-color',
                    title: 'Color & highlight',
                    subtitle: multi ? ('This VCF has ' + nS + ' samples: ' + SAMPLES.join(', ') + '.')
                        : (nS === 1
                            ? ('One sample (' + SAMPLES[0] + '): variants are plotted by ClinVar class'
                                + (hasGt ? ', with a haplotype view available' : '') + '.')
                            : 'This VCF carries no sample columns, so its variants are plotted by ClinVar class.'),
                    books: [
                        // The toggle only earns its place when there is more than one view to
                        // flip between; a single-sample file with no phase has only ClinVar class.
                        ...(SCHEMES.length > 1 ? [{
                            section: 'Color view', title: 'Toggle color view', icon: '🎨',
                            badge: (schemeLabel[colorMode] || colorMode),
                            blurb: 'Flip the whole karyotype through its color views — '
                                + SCHEMES.map((s) => schemeLabel[s] || s).join(', ')
                                + '. Now showing ' + (schemeLabel[colorMode] || colorMode) + '.',
                            open: () => cycleColorView(),
                        }] : []),
                        {
                            section: 'Color scheme', title: 'By ClinVar class', badge: modeBadge('class'),
                            blurb: 'Pathogenic red, benign green, uncertain amber, conflicting grey; unclassified in magenta.',
                            open: () => setMode('class'),
                        },
                        // By sample only for a multi-sample VCF; a single-sample file is just
                        // plotted (ClinVar class), which is what the user asked for.
                        ...(multi ? [{
                            section: 'Color scheme', title: 'By sample', badge: modeBadge('sample'),
                            blurb: 'Which sample carries the change: ' + SAMPLES.join(', ')
                                + '. Slate where more than one does, pale where none does.',
                            open: () => setMode('sample'),
                        }] : []),
                        // By phase whenever there are genotypes — a haplotype view reads a
                        // single sample as well as several.
                        ...(hasGt ? [{
                            section: 'Color scheme', title: 'By phase', badge: modeBadge('phase'),
                            blurb: 'Haplotype 1 blue, haplotype 2 pink, homozygous purple, unphased heterozygous amber.',
                            open: () => setMode('phase'),
                        }] : []),
                        // The annotation highlights: each turns on and off, and only one is on at
                        // a time (a variant shows one mark). The same set the Search window offers.
                        { section: 'Highlight (annotation)', title: 'Protein coding', badge: hlBadge(1), blurb: 'Mark the variants in coding sequence, genome-wide.', open: () => toggleHl('coding', 1) },
                        { section: 'Highlight (annotation)', title: 'Intronic', badge: hlBadge(2), blurb: 'Mark the variants that fall in introns.', open: () => toggleHl('intronic', 2) },
                        { section: 'Highlight (annotation)', title: "3' UTR", badge: hlBadge(3), blurb: "Mark the variants in 3' untranslated regions.", open: () => toggleHl('three_utr', 3) },
                        { section: 'Highlight (annotation)', title: "5' UTR", badge: hlBadge(4), blurb: "Mark the variants in 5' untranslated regions.", open: () => toggleHl('five_utr', 4) },
                        { section: 'Highlight (annotation)', title: 'Pathogenic / likely pathogenic', badge: hlBadge(HL_PATHOGENIC), blurb: 'Mark the variants ClinVar calls pathogenic or likely pathogenic.', open: () => toggleHl('pathogenic', HL_PATHOGENIC) },
                        ...sampleGlowCards,
                        ...sampleColorCards,
                        { section: 'Highlight (annotation)', title: 'Clear highlights', badge: hlActive ? 'on' : '', ready: !!hlActive, readyNote: 'nothing highlighted', blurb: 'Take every mark off and draw the variants in their own colors again.', open: () => { try { clearHighlights(); } catch (e) { } colorMenu(); } },
                    ],
                    graph: graph,
                });
            } catch (e) {
                step('color shelf threw: ' + e);
                graph.setMessage(' Color could not be opened: ' + (e && e.message ? e.message : e) + ' ');
            }
        };

        // FILES IS A LIBRARY TOO, the same shelf Search opens: three cards that say what
        // they do, under a subtitle that says which file this is and what is on it. The
        // shelf reports a card that throws, so a save that fails is a message rather
        // than a dead button.
        // Clear everything loaded and start from an empty karyotype (same species, no
        // variants). Confirms first when there is anything to lose.
        const newKaryotype = async () => {
            let ok = true;
            if (vtotal || (regions && regions.length) || (bookmarks && bookmarks.length)) {
                try {
                    ok = await exec('baja/lib/confirm-leave.js', {
                        title: 'Start a new karyotype?',
                        message: 'This clears every variant, region and bookmark now loaded. Save first if you want to keep them.',
                        confirmLabel: 'Start fresh'
                    });
                } catch (e) { ok = false; }
            }
            if (!ok) return;
            for (let ci = 0; ci < drawn.length; ci++) {
                const d = vdata[ci];
                d.n = 0; d.pos = new Float64Array(0); d.cls = new Uint8Array(0);
                d.ref = new Uint8Array(0); d.alt = new Uint8Array(0);
                d.cplx = new Map(); d.names = []; d.snps = [];
                d.gts = null; d.gtw = 0; d.hl = new Uint8Array(0); d.hlIdx = [];
                d.hist = new Uint32Array(HIST_BINS); d.histBy = null; d.histByKey = '';
            }
            vtotal = 0; vobjects = 0;
            regions = []; try { geneCache.clear(); } catch (e) { }
            bookmarks = []; activeRegion = null; hlActive = 0;
            try { SAMPLES.length = 0; } catch (e) { }
            try { setColorMode('class'); } catch (e) { }
            try { reindexHighlights(); } catch (e) { }
            try { const nav = document.getElementById('baja-karyo-booknav'); if (nav && nav.parentNode) nav.parentNode.removeChild(nav); } catch (e) { }
            try { window.history.replaceState({ karyotype: '' }, 'karyotype', '/app/manchester/karyotype'); } catch (e) { }
            try { if (graph.wake) graph.wake(); } catch (e) { }
            try { await fit(); pan(); } catch (e) { }
            graph.setMessage(' Started fresh — the karyotype is empty. Load a VCF to add variants. ');
        };

        const filesMenu = () => {
            let cur = '';
            try { cur = '' + ((window.history.state || {}).karyotype || ''); } catch (e) { cur = ''; }
            const curName = cur ? cur.split('/').filter(Boolean).pop() : '';
            const onIt = vtotal
                ? vtotal.toLocaleString() + ' variant' + (vtotal === 1 ? '' : 's')
                    + (regions.length ? ', ' + regions.length + ' region' + (regions.length === 1 ? '' : 's') + ' selected' : '')
                : 'no variants loaded';
            try {
                exec('baja/lib/shelf.js', {
                    id: 'baja-karyo-files',
                    title: 'Karyotype files',
                    subtitle: (curName ? curName + '  ·  ' : 'Not saved yet  ·  ') + onIt,
                    books: [
                        {
                            title: 'New…', badge: 'clear',
                            blurb: 'Clear the variants, regions and bookmarks loaded now and start from an empty karyotype. Asks first if there is anything to lose.',
                            open: () => newKaryotype(),
                        },
                        {
                            title: 'Open a saved karyotype', badge: 'My Files',
                            blurb: 'Browse My Files and open a karyotype you kept. A .baja file there opens in the editor instead.',
                            open: () => openJson(false),
                        },
                        {
                            title: curName ? 'Save this karyotype' : 'Save this karyotype as…',
                            badge: curName ? 'saved as ' + curName : 'unsaved',
                            blurb: 'Keep this genome, its variants and the selected regions in My Files, to reopen later or share by link.',
                            open: () => saveJson(),
                            ready: !!vtotal || !!regions.length,
                            readyNote: 'nothing to save yet',
                        },
                        {
                            title: 'Remove a saved karyotype', badge: 'My Files',
                            blurb: 'Browse My Files and delete a karyotype you no longer need. Asked before each one; it is not moved to a bin.',
                            open: () => openJson(true),
                        },
                    ],
                    graph: graph,
                });
            } catch (e) {
                step('files shelf threw: ' + e);
                graph.setMessage(' Files could not be opened: ' + (e && e.message ? e.message : e) + ' ');
            }
        };

        // UPLOAD IS A LIBRARY OF THE KINDS OF FILE IT TAKES. The button used to open the
        // picker straight away, which meant the only place that said what could be
        // uploaded was the tooltip. One card per kind, each opening the picker filtered
        // to it, and a card for anything else; the reader still decides from the bytes.
        const uploadMenu = () => {
            const n = SAMPLES.length;
            try {
                exec('baja/lib/shelf.js', {
                    id: 'baja-karyo-upload',
                    title: 'Upload',
                    subtitle: (vtotal ? vtotal.toLocaleString() + ' variant' + (vtotal === 1 ? '' : 's') + ' on the genome'
                            + (n ? ' from ' + n + ' sample' + (n === 1 ? '' : 's') : '') + '  \u00b7  '
                        : '') + 'Whatever is opened is also kept in My Files.',
                    books: [
                        {
                            title: 'A VCF', badge: 'variants',
                            blurb: 'Plain or bgzipped, any size: it is read in slices here and every variant is drawn. '
                                + 'Sample and phase columns are read too, and color the marks.',
                            open: () => pickFile('.vcf,.vcf.gz,.vcf.bgz,.gz,.bgz,text/vcf'),
                        },
                        {
                            title: 'A genetic report or lab PDF', badge: 'report',
                            blurb: 'A clinical report, a lab result, a paper, a screenshot of one. The genes and variants it names '
                                + 'are read out and placed on the genome from the annotation, not guessed.',
                            open: () => pickFile('.pdf,image/*,.docx,.doc,.rtf'),
                        },
                        {
                            title: 'A table of variants', badge: '23andMe · TSV',
                            blurb: 'A 23andMe or AncestryDNA export, an annotated spreadsheet, a BED-like list: the chromosome '
                                + 'and position columns are identified and the rows drawn.',
                            open: () => pickFile('.txt,.tsv,.csv,.bed,.xlsx,.xls'),
                        },
                        {
                            title: 'A gene list or anything else', badge: 'any file',
                            blurb: 'A panel, a list of symbols, a document. It is asked what it is, and whatever genetic '
                                + 'information it carries goes on the genome.',
                            open: () => pickFile(''),
                        },
                        {
                            note: true, blurb: '', title: 'Rows of a VCF can also be pasted straight onto the chromosomes: '
                                + 'copy them and press Ctrl+V with this view open.',
                        },
                    ],
                    graph: graph,
                });
            } catch (e) {
                step('upload shelf threw: ' + e);
                graph.setMessage(' Upload could not be opened: ' + (e && e.message ? e.message : e) + ' ');
            }
        };

        // SEARCH IS A LIBRARY, NOT A POPUP. The same shelf the region callouts and the
        // uploads open: a titled grid of cards, each saying what it does before it is
        // pressed, with the region actions and the highlights one level in rather than
        // twelve buttons in a column. What the selection currently is goes in the
        // subtitle, and the cards that need a selection say so instead of hiding.
        const searchMenu = () => {
            const n = regions.length;
            const span = regions.reduce((t, x) => t + (x.hi - x.lo), 0);
            const needRegion = { ready: n > 0, readyNote: 'select a region first' };
            const regionBooks = () => [
                Object.assign({
                    title: 'Open in the oligo editor', badge: 'transcripts',
                    blurb: 'List the transcripts in the selected region' + (n === 1 ? '' : 's') + ', tick the ones you '
                        + 'want, and load them into the editor with the variants that fall inside them.',
                    open: () => openRegions(regions.slice()),
                }, needRegion),
                Object.assign({
                    title: 'Delete the variants in the selected regions', badge: 'variants',
                    blurb: 'Drop every variant inside the selection and keep the rest of the genome.',
                    open: () => rebuildKeeping((ci, p) => !inRegion(ci, p), 'Deleted the selected regions'),
                }, needRegion),
                Object.assign({
                    title: 'Keep only the selected regions', badge: 'variants',
                    blurb: 'Drop every variant outside the selection; what is inside stays exactly as it is.',
                    open: () => rebuildKeeping((ci, p) => inRegion(ci, p), 'Kept only the selected regions'),
                }, needRegion),
                Object.assign({
                    title: 'Clear the selection', badge: 'regions',
                    blurb: 'Deselect every region. No variant is touched.',
                    open: () => {
                        regions = [];
                        geneCache.clear();
                        activeRegion = null;
                        if (graph.wake) graph.wake();
                        graph.setMessage(' Regions cleared. ');
                    },
                }, needRegion),
            ];
            const highlightBooks = () => [
                { title: 'Protein coding', badge: 'highlight', blurb: 'Mark the variants that fall in coding sequence, across the whole genome.', open: () => applyFilter('coding', 1) },
                { title: 'Intronic', badge: 'highlight', blurb: 'Mark the variants that fall in introns.', open: () => applyFilter('intronic', 2) },
                { title: "3' UTR", badge: 'highlight', blurb: "Mark the variants in 3' untranslated regions.", open: () => applyFilter('three_utr', 3) },
                { title: "5' UTR", badge: 'highlight', blurb: "Mark the variants in 5' untranslated regions.", open: () => applyFilter('five_utr', 4) },
                { title: 'Pathogenic / likely pathogenic', badge: 'ClinVar', blurb: 'Mark the variants ClinVar classifies as pathogenic or likely pathogenic.', open: () => applyFilter('pathogenic', HL_PATHOGENIC) },
                { title: 'Clear highlights', badge: 'highlight', blurb: 'Take every mark off and draw the variants in their own colors again.', open: () => clearHighlights(), ready: !!hlActive, readyNote: 'nothing highlighted' },
            ];
            try {
                exec('baja/lib/shelf.js', {
                    id: 'baja-karyo-search',
                    title: 'Search',
                    subtitle: n
                        ? (n + ' region' + (n === 1 ? '' : 's') + ' selected, ' + (Math.round(span / 1e4) / 100) + ' Mb in total')
                        : 'Nothing selected yet. Find a gene, or drag out a range, to select a region.',
                    books: [
                        {
                            title: 'Find a gene', badge: 'gene',
                            blurb: 'Type a symbol, an old name or a description and pick the gene from the list; '
                                + 'the view goes there and selects it.',
                            open: () => geneMenu(),
                        },
                        {
                            title: 'Selected regions', badge: n ? (n + ' selected') : 'none selected',
                            blurb: 'Open them in the oligo editor, or delete and keep variants by where they fall.',
                            books: regionBooks,
                        },
                        {
                            title: 'Highlight', badge: hlActive ? HL_NAME[hlActive] : 'genome-wide',
                            blurb: 'Mark the variants of one kind across the whole genome: coding, intronic, '
                                + 'UTR, or pathogenic. The rest are dimmed behind them.',
                            books: highlightBooks,
                        },
                        {
                            title: 'Patents', badge: patOn ? 'shown' : 'genome-wide',
                            blurb: 'Show where patented sequences fall down every chromosome; open again to hide the strip.',
                            open: () => patLoad(),
                        },
                    ],
                    graph: graph,
                });
            } catch (e) {
                step('search shelf threw: ' + e);
                graph.setMessage(' Search could not be opened: ' + (e && e.message ? e.message : e) + ' ');
            }
        };

        const saveJson = () => {
            // THE SAME WIDGET io/save-obj.js USES, which is this application's save.
            //
            // What was here before was a panel built with createElement and appended to
            // document.body -- a second way to do something the app already does, and one
            // that never rendered in production. The app's own save is a full-screen card
            // holding the file browser to choose the folder, a Name field, and the buttons;
            // this is that, with the karyotype's document in place of a graph.
            let comp = null;                       // the file browser, once it exists

            const restore = () => {
                try { CurrentLayout.clearComponent('mainPanel'); } catch (e) { }
                try { CurrentLayout.setComponent('mainPanel', main_layout); } catch (e) { }
                whenSized(() => {
                    try { if (graph.graph && graph.graph.grid && graph.graph.grid.rescale) graph.graph.grid.rescale(); } catch (e) { }
                    try { if (graph.rescale) graph.rescale(); } catch (e) { }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                });
            };

            const suggested = (('' + (r.species || 'karyotype')).toLowerCase().replace(/[^a-z0-9_-]+/g, '-'))
                + (vtotal ? '-' + vtotal + 'variants' : '') + SAVE_EXT;
            // Roughly 18 bytes of JSON per variant in version 2, measured by re-encoding
            // a real saved file (40.3 bytes each as version 1, 18.3 as version 2).
            const sizeHint = (n) => {
                const mb = (n * 18) / (1024 * 1024);
                return mb >= 1 ? (' (about ' + (mb >= 100 ? Math.round(mb) : mb.toFixed(1)) + ' MB)') : '';
            };
            const note = (vtotal > SAVE_CAP)
                ? ('Holding ' + vtotal.toLocaleString() + ' variants; the first '
                    + SAVE_CAP.toLocaleString() + ' are written. If the file came in through '
                    + 'Upload, all of it is already in My Files.')
                : (vtotal.toLocaleString() + ' variant' + (vtotal === 1 ? '' : 's')
                    + ' will be written' + sizeHint(vtotal) + '.'
                    + (vtotal > 1000000
                        ? ' A file this size takes a while to write and to read back.'
                        : ''));

            // THE BROWSER LISTS NOTHING UNTIL refresh() IS CALLED ON IT. save-obj.js does
            // this through refCallback and a short delay; without it the chrome renders --
            // search box and all -- over a pane that never fills, which is exactly what
            // "the search text shows up but nothing under it" is.
            const browserRef = createIonFunction(async (innerComponent) => {
                comp = innerComponent;
                setTimeout(async () => {
                    try { await comp.refresh(); } catch (e) { step('browser refresh threw: ' + e); }
                }, 700);
            });

            // Rooted at '/' + user, not the bare user id: save-obj.js roots it this way and
            // the browser resolves the drive from that leading slash.
            let init_path = '/' + getUser();
            if (init_path.endsWith('/')) init_path = init_path.substring(0, init_path.length - 1);

            const doSave = async (raw) => {
                let name = ('' + (raw || '')).trim().replace(/[\r\n]+/g, ' ');
                if (!name) { graph.setMessage(' A file name is needed. '); return; }
                // A trailing .json is dropped rather than kept alongside: it makes
                // "chr21.json" save as chr21.karyotype instead of chr21.json.karyotype,
                // and turns an old chr21.karyotype.json name back into chr21.karyotype.
                name = name.replace(/\.json$/i, '');
                if (!/\.karyotype$/i.test(name)) name += SAVE_EXT;
                if (name === SAVE_EXT) { graph.setMessage(' A file name is needed. '); return; }
                // The folder the browser is standing in is the folder it saves into.
                let spath = '';
                try { spath = (comp && comp.currentPath) ? comp.currentPath : ''; } catch (e) { spath = ''; }
                if (spath === '/') spath = '';
                graph.setMessage(' Saving ' + name + '… ');
                try {
                    const doc = stateDoc();
                    doc.name = name;
                    const rs = await POSTJSON({
                        name: name, key: 'user', user: getUser(), spath: spath,
                        value: JSON.stringify(doc),
                    }, window['env']['apiUrl'] + '/save-user-data');
                    if (rs && (rs.status === 'saved' || rs.path)) {
                        restore();
                        // The file now exists, so the view is showing it. Only when the
                        // server said where it put it -- a guessed path would send a
                        // reload somewhere that does not exist.
                        if (rs.path) rememberFile(rs.path);
                        graph.setMessage(' Saved ' + name + ' to My Files — '
                            + doc.variants.length.toLocaleString() + ' variant'
                            + (doc.variants.length === 1 ? '' : 's')
                            + (doc.truncated ? ' (of ' + vtotal.toLocaleString() + ')' : '') + '. ');
                        step('saved ' + name + ' into ' + (spath || '/'));
                    } else {
                        graph.setMessage(' ' + name + ' was not saved. ');
                        step('save failed: ' + JSON.stringify(rs).slice(0, 160));
                    }
                } catch (e) {
                    graph.setMessage(' ' + name + ' was not saved: ' + (e && e.message ? e.message : e) + ' ');
                    step('save threw: ' + e);
                }
            };

            const save_layout = {
                wid: 'card',
                height: '100%',
                componentRef: 'mainPanel',
                data: {
                    cards: [[
                        {
                            'width': '100%',
                            'component': {
                                wid: 'button-menu',
                                data: {
                                    buttons: [
                                        {
                                            label: 'Cancel', icon: 'close',
                                            tooltip: 'Back to the chromosomes without saving',
                                            ionFunction: createIonFunction(() => { restore(); })
                                        },
                                    ]
                                }
                            }
                        },
                        {
                            'title': ' ', 'body': ``,
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                width: '100%',
                                data: '<div style="padding:10px 14px;font:14px Arial;">'
                                    + '<b>Save karyotype</b><br>'
                                    + '<span style="color:#5b6b7a;">Choose a folder below, name the file, '
                                    + 'then Save. ' + note + ' Saved as <b>' + SAVE_EXT
                                    + '</b> (JSON inside) unless the name already ends in it.'
                                    + '</span></div>'
                            }
                        },
                        {
                            'title': ' ', 'body': ``,
                            'width': '90%',
                            'component': {
                                wid: 'input-param-items',
                                width: '100%',
                                data: {
                                    input_labels: ['Name'],
                                    default_values: { 'Name': suggested },
                                    // 'function', not ionFunction: this widget hands the button
                                    // its label and the field values, which is where the name
                                    // comes from.
                                    buttons: [{
                                        'label': 'Save',
                                        'function': createIonFunction(async (button_label, input_params) => {
                                            await doSave(input_params && input_params['Name']);
                                        })
                                    }]
                                }
                            }
                        },
                        {
                            'title': ' ', 'body': ``,
                            'width': '100%',
                            'component': {
                                wid: 'simple-file-browser',
                                width: '100%',
                                height: '100%',
                                refCallback: browserRef,
                                data: {
                                    showSearch: true, width: '100%', columns: 3,
                                    drive: 'user', user: getUser(), root: init_path,
                                    'ionfunction.cmd': createIonFunction(() => { }),
                                    'ionfunction.path': createIonFunction(() => { }),
                                    'ionfunction.openfile': createIonFunction(() => { }),
                                    'ionfunction.fileClick': createIonFunction(() => { }),
                                }
                            }
                        }
                    ]]
                }
            };

            try { CurrentLayout.clearComponent('mainPanel'); } catch (e) { }
            CurrentLayout.setComponent('mainPanel', save_layout);
            step('save view open, rooted at ' + init_path);
        };

        // Open uses the SAME file browser the editor's Open does -- simple-file-browser rooted
        // at the user's drive -- so there is one way to find a file in this application rather
        // than a second one that only this view knows about.
        let openRestore = null;
        // `deleting`: the same browser, but a click removes the file instead of opening
        // it. One panel rather than two, because a second copy of a hundred lines of file
        // browser is a second copy to keep in step.
        const openJson = async (deleting) => {
            const host_ = window['env']['apiUrl'];
            // Same two things save-obj.js does and this did not: refresh the browser once it
            // exists, and root it at '/' + user. Without the refresh the search box draws over
            // a pane that never fills; without the leading slash the root does not resolve.
            let openComp = null;
            const openBrowserRef = createIonFunction(async (innerComponent) => {
                openComp = innerComponent;
                setTimeout(async () => {
                    try { await openComp.refresh(); } catch (e) { step('browser refresh threw: ' + e); }
                }, 700);
            });
            let open_root = '/' + getUser();
            if (open_root.endsWith('/')) open_root = open_root.substring(0, open_root.length - 1);
            const browser = {
                wid: 'simple-file-browser',
                width: '100%',
                height: '100%',
                refCallback: openBrowserRef,
                data: {
                    showSearch: true, width: '100%', drive: 'user', user: getUser(),
                    root: open_root, columns: 3,
                    'ionfunction.cmd': createIonFunction(() => { }),
                    'ionfunction.path': createIonFunction(() => { }),
                    'ionfunction.openfile': createIonFunction(() => { }),
                    'ionfunction.fileClick': createIonFunction(async (element) => {
                        if (deleting) {
                            const dname = ('' + ((element && element.name) || 'that file'));
                            const dpath = ('' + ((element && element.path) || ''));
                            if (!dpath) { graph.setMessage(' That file has no path to remove. '); return; }
                            // Asked before, not undone after: /rm does not move anything to a
                            // bin. The browser stays open so several can be cleared in a row.
                            const ok = await exec('baja/lib/confirm-leave.js', {
                                title: 'Remove ' + dname + '?',
                                message: 'This deletes the file from My Files permanently. '
                                    + 'It is not moved to a bin and it cannot be undone.',
                                confirmLabel: 'Remove',
                                cancelLabel: 'Keep it'
                            });
                            if (!ok) return;
                            try {
                                await POSTJSON({ path: dpath, key: 'user', user: getUser() }, host_ + '/rm');
                                graph.setMessage(' Removed ' + dname + '. ');
                            } catch (e) {
                                graph.setMessage(' ' + dname + ' could not be removed: '
                                    + (e && e.message ? e.message : e) + ' ');
                            }
                            try { if (openComp) await openComp.refresh(); } catch (e) { }
                            return;
                        }
                        try { if (openRestore) openRestore(); } catch (e) { }
                        // A .baja IS NOT A KARYOTYPE. It is a saved editor screen -- tracks,
                        // compounds, annotations -- and reading it here got as far as
                        // "That file is not a saved karyotype", which is true and useless:
                        // the user clicked it to open it, and this browser is the one place
                        // it was reachable from. So it goes where it belongs, by the same
                        // handoff open-obj.js uses for the same file type.
                        const __name = ('' + ((element && element.name) || '')).trim();
                        const __path = ('' + ((element && element.path) || '')).trim();
                        if (/\.baja$/i.test(__name) || /\.baja$/i.test(__path)) {
                            graph.setMessage(' Opening ' + __name + ' in the editor… ');
                            try {
                                // Path as-is, and the same config open-obj.js passes:
                                // /load-file grants access on the folder id the browser is
                                // rooted at, not on the raw email.
                                exec('manchester/editor', element.path,
                                    { silent: true, user: getUser() });
                            } catch (e) {
                                graph.setMessage(' ' + __name + ' could not be opened: '
                                    + (e && e.message ? e.message : e) + ' ');
                            }
                            return;
                        }
                        graph.setMessage(' Opening ' + __name + '… ');
                        try {
                            // element.path as-is: the browser roots at the user's folder id and
                            // /load-file grants access on that id, not on the raw email.
                            const doc = await getJsonCounting(
                                host_ + '/load-file?path=' + element.path
                                + '&key=user&user=' + getUser(),
                                // No loading panel on this route -- the file browser is
                                // still on screen -- so the count goes to the status line.
                                (n) => graph.setMessage(' Reading ' + (element && element.name)
                                    + ' — ' + fmtBytes(n) + ' so far… '));
                            const parsed = (typeof doc === 'string') ? JSON.parse(doc) : doc;
                            // Only on success: a file that failed to apply is not the
                            // file this view is showing, and the URL should not claim it.
                            const applied = await applyDoc(parsed, (done, tot) => {
                                graph.setMessage(' Placing ' + done.toLocaleString() + ' of '
                                    + tot.toLocaleString() + ' variants… ');
                            });
                            if (applied) rememberFile(element.path);
                        } catch (e) {
                            graph.setMessage(' ' + (element && element.name) + ' could not be opened: '
                                + (e && e.message ? e.message : e) + ' ');
                            step('open failed: ' + e);
                        }
                    }),
                }
            };
            // THE WHOLE PANEL, not a modal. showModal renders into a dialog the host sizes,
            // and a file browser in a small box is a file browser you scroll instead of read.
            // Taking over mainPanel -- the way upload-data.js does -- gives it the screen, and
            // Close puts the karyotype back by setting the layout this app already built.
            const restore = () => {
                try { CurrentLayout.clearComponent('mainPanel'); } catch (e) { }
                try { CurrentLayout.setComponent('mainPanel', main_layout); } catch (e) { }
                // The canvas comes back into a panel that has just been resized, so it needs
                // the same nudge the first mount did or it draws against stale dimensions.
                whenSized(() => {
                    try { if (graph.graph && graph.graph.grid && graph.graph.grid.rescale) graph.graph.grid.rescale(); } catch (e) { }
                    try { if (graph.rescale) graph.rescale(); } catch (e) { }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                });
            };
            const browser_layout = {
                wid: 'card',
                height: '100%',
                componentRef: 'mainPanel',
                data: {
                    cards: [[
                        {
                            'width': '100%',
                            'component': {
                                wid: 'button-menu',
                                data: {
                                    buttons: [
                                        {
                                            label: 'Close', icon: 'close',
                                            tooltip: 'Back to the chromosomes',
                                            ionFunction: createIonFunction(() => { restore(); })
                                        },
                                        {
                                            // Not a control -- a label. Clicking a file in this
                                            // browser does two very different things depending
                                            // on how it was opened, and the browser itself looks
                                            // identical either way.
                                            label: deleting ? 'Click a file to REMOVE it'
                                                : 'Click a file to open it',
                                            icon: deleting ? 'delete' : 'folder_open',
                                            tooltip: deleting
                                                ? 'Removing is permanent. Close to leave without removing anything.'
                                                : 'Open a saved karyotype',
                                            ionFunction: createIonFunction(() => { })
                                        },
                                    ]
                                }
                            }
                        }
                    ], [
                        { 'width': '100%', 'height': '100%', 'component': browser }
                    ]]
                }
            };
            // fileClick restores the panel itself, so the karyotype is back before the file
            // has finished loading onto it.
            openRestore = restore;
            try {
                CurrentLayout.clearComponent('mainPanel');
                CurrentLayout.setComponent('mainPanel', browser_layout);
            } catch (e) { graph.setMessage(' The file browser could not be opened: ' + e + ' '); }
        };

        // ---- what is in the range that was just dragged out -------------------------------
        //
        // A selection is only worth making if something comes of it. The range goes to the
        // annotation, comes back as the genes and transcripts inside it, and the list is the
        // handover: tick what is wanted and it opens in the editor with the variants that fall
        // inside those transcripts already on them.
        // OVER SEVERAL REGIONS, NOT ONE. A range dragged out is one region; a gene found
        // by symbol is another; and the point of collecting regions is to ask about all of
        // them together. So the panel takes a LIST, and openRange below is the one-region
        // case of it -- one code path, so the transcript list, the tick boxes and the
        // handover to the editor cannot drift apart between the two ways in.
        // ---- HANDING A SELECTION TO THE OLIGO EDITOR ---------------------------
        //
        // Lifted out of the transcript panel's button so that a click on a single variant can
        // take the same road. The editor is a different app with a different graph, and it
        // stashes that graph as it boots -- so the wait is for the stash to CHANGE, not merely
        // to exist: this graph is already in there under the same key.
        const handToEditor = async (ids, inRange, focus) => {
            const list = (ids || []).filter(Boolean);
            if (!list.length) { graph.setMessage(' Nothing to open. '); return false; }
            step('opening ' + list.length + ' transcript(s) with ' + (inRange || []).length + ' variant(s)');
            graph.setMessage(' Opening the editor… ');
            const mine = graph;
            try { exec('manchester/editor', '', { mode: 'editor' }); } catch (e) { }
            let g2 = null;
            for (let t2 = 0; t2 < 100 && !g2; t2++) {
                await new Promise((res) => setTimeout(res, 200));
                try {
                    const st = CurrentLayout.getStashed('graph');
                    if (st && st !== mine) g2 = st;
                } catch (e) { }
            }
            if (!g2) {
                step('the editor did not report a graph');
                graph.setMessage(' The editor did not open. ');
                return false;
            }
            try {
                await exec('baja/data/load-transcripts-with-variants.js', server, g2,
                    g2.genegraph_panel_layout, list, inRange || []);
            } catch (e) {
                step('load failed: ' + (e && e.message ? e.message : e));
                return false;
            }
            if (focus && focus.chr && focus.pos > 0) {
                // Give the tracks a moment to finish laying themselves out; a zoom computed
                // against a track that has not sized itself frames nothing.
                await new Promise((res) => setTimeout(res, 250));
                await focusInEditor(g2, focus.chr, focus.pos);
            }
            return true;
        };

        // GO TO THE CHANGE, once it is loaded. Landing in the editor on a whole transcript
        // with the mutation somewhere in it is landing in the right room and being left to
        // find the thing; the point of arriving from a click on one variant is that variant.
        //
        // The same two steps points-of-interest.js uses to tour a mutation: focus-mutation.js
        // greys the others and lights this one, then the graph is framed on it through the
        // TRACK's own x-scale, because a variant's position is a track coordinate and not a
        // world one until tgraph.X has mapped it.
        const focusInEditor = async (g2, chr, pos) => {
            try {
                for (const t of (g2.track || [])) {
                    let wx = null;
                    try { wx = t.variantWorldX ? t.variantWorldX(chr, pos) : null; } catch (e) { wx = null; }
                    if (wx == null) continue;                   // this track does not hold it
                    // The mutation just placed there, found by where it sits rather than by
                    // name: the loader names it from the VCF and a track may hold several.
                    let snp = null;
                    for (const sp of (t.snpindels || [])) {
                        if (sp && Math.abs((+sp.xi) - wx) <= 1.5) { snp = sp; break; }
                    }
                    try {
                        if (snp) await exec('baja/manchester/menu/focus-mutation.js', g2, snp, 20000);
                    } catch (e) { }
                    const gg = g2.graph, tg = t.tgraph;
                    if (!gg || !tg || !tg.X) continue;
                    try { if (gg.rescale) gg.rescale(); } catch (e) { }
                    const W2 = 30;                              // bases either side of the change
                    const gi = tg.X(wx - W2), gf = tg.X(wx + W2), pad = 5;
                    const cy = (tg.yi + (tg.yi + (tg.height || 0))) / 2;
                    const span = Math.abs(tg.height || 0) || 0.1;
                    if (g2.zoomRect) await g2.zoomRect(gi - pad, gf + pad, cy + span * 3.6, cy - span * 2.2, 500);
                    try { if (g2.wake) g2.wake(); } catch (e) { }
                    step('focused ' + chr + ':' + pos + ' on ' + (t.name || 'a track'));
                    return true;
                }
                step('no loaded track holds ' + chr + ':' + pos);
            } catch (e) { step('focus failed: ' + (e && e.message ? e.message : e)); }
            return false;
        };

        const openRegions = async (list, focusBp, straight) => {
            const regs = (list || []).filter((q) => q && q.i >= 0 && q.i < drawn.length
                && isFinite(q.lo) && isFinite(q.hi) && q.hi >= q.lo);
            if (!regs.length) { graph.setMessage(' Nothing selected to look up. '); return; }
            const em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
            const genes = [], inRange = [];
            const seenTx = new Set();       // regions overlap; a transcript is listed once
            const seenV = new Set();
            let truncated = false, asked = 0, empty = 0, lastErr = '';
            for (let q = 0; q < regs.length; q++) {
                const reg = regs[q], c2 = drawn[reg.i];
                const bare2 = c2.name.replace(/^chr/, '');
                graph.setMessage(' Reading ' + c2.name + ':' + human(reg.lo) + '-' + human(reg.hi)
                    + (regs.length > 1 ? '  (' + (q + 1) + ' of ' + regs.length + ')' : '') + '… ');
                let r2 = null;
                try {
                    r2 = await exec(server + '/py/bio/genes-in-range.py', em, bare2,
                        '' + reg.lo, '' + reg.hi, (r.species || 'human'), '200');
                } catch (e) { r2 = null; }
                asked++;
                let gs = [];
                try { gs = JSON.parse((r2 && r2.genes) || '[]'); } catch (e) { gs = []; }
                if (r2 && r2.error) lastErr = '' + r2.error;
                if (!gs.length) { empty++; continue; }
                if (r2 && r2.truncated) truncated = true;
                // For a click on a mark the window is two bases wide -- enough to ask which
                // transcripts contain that point, far too narrow to be the variants worth
                // opening alongside them -- so the variant span widens to the genes found.
                let vLo = reg.lo, vHi = reg.hi;
                if (focusBp != null) {
                    for (const gn of gs) {
                        if (isFinite(+gn.start)) vLo = Math.min(vLo, +gn.start);
                        if (isFinite(+gn.end)) vHi = Math.max(vHi, +gn.end);
                    }
                }
                for (const gn of gs) {
                    const key = (gn.transcript || (gn.gene + '@' + c2.name + ':' + gn.start));
                    if (seenTx.has(key)) continue;
                    seenTx.add(key);
                    gn.__chr = c2.name;
                    genes.push(gn);
                }
                // The variants of this chromosome inside the range, as real records. Read
                // out of the typed arrays by binary search, so a whole-genome file costs
                // the window and not the file.
                const d = vdata[reg.i];
                if (d.n) {
                    let a2 = 0, z2 = d.n;
                    while (a2 < z2) { const m2 = (a2 + z2) >> 1; if (d.pos[m2] < vLo) a2 = m2 + 1; else z2 = m2; }
                    for (let k = a2; k < d.n && d.pos[k] <= vHi; k++) {
                        const vk = reg.i + ':' + d.pos[k];
                        if (seenV.has(vk)) continue;      // overlapping regions share variants
                        seenV.add(vk);
                        const ab = allelesAt(reg.i, k);
                        // WHO CARRIES IT GOES ALONG. The editor cannot compare samples it
                        // was never told about: the names, each genotype, and the phase
                        // word travel as annotation fields the track's variant tools read.
                        const gl = genotypesOf(d, k);
                        const annots = [];
                        if (gl.length) {
                            annots.push('SAMPLES=' + gl.map((g) => g[0]).join(','));
                            annots.push('GT=' + gl.map((g) => GT_TEXT[g[1]] || './.').join(','));
                            const ph = phaseOf(d, k);
                            if (ph) annots.push('PHASE=' + ph);
                        }
                        inRange.push({
                            chr: bare2, pos: d.pos[k], ref: ab[0], alt: ab[1],
                            name: (d.names[k] || (c2.name + ':' + d.pos[k])),
                            sig: sigOf(d, k),
                            source: 'VCF',
                            samples: gl.map((g) => g[0]),
                            genotypes: gl.map((g) => GT_TEXT[g[1]] || './.'),
                            phase: gl.length ? phaseOf(d, k) : '',
                            annotations: annots,
                        });
                    }
                }
            }
            const one = regs.length === 1 ? regs[0] : null;
            const c = one ? drawn[one.i] : null;
            const lo = one ? one.lo : 0, hi = one ? one.hi : 0;
            if (!genes.length) {
                graph.setMessage(' ' + (one
                    ? ((focusBp != null ? (c.name + ':' + human(focusBp))
                        : (c.name + ':' + human(lo) + '-' + human(hi))) + ' — '
                        + (lastErr || (focusBp != null
                            ? 'no gene annotated at that position'
                            : 'no genes annotated in that range')))
                    : (regs.length + ' regions — ' + (lastErr || 'no genes annotated in them')))
                    + '. ');
                return;
            }
            // STRAIGHT THROUGH, for a caller that has already decided what it wants. A click
            // on one variant is not a browse: the transcripts that contain it are the answer,
            // and a panel asking which of them to tick is a question with an obvious reply.
            // Coding ones where there are any -- a variant's consequence is a protein
            // consequence -- and everything else only when there is nothing coding here.
            if (straight) {
                const coding = genes.filter((gn) => gn.transcript && gn.coding);
                const pick = (coding.length ? coding : genes.filter((gn) => gn.transcript)).slice(0, 6);
                if (!pick.length) {
                    graph.setMessage(' Nothing here has a transcript in the annotation to open. ');
                    return;
                }
                await handToEditor(pick.map((gn) => gn.transcript), inRange, straight.focus || null);
                return;
            }
            const spanAll = regs.reduce((t, q) => t + (q.hi - q.lo), 0);
            const chrCount = new Set(regs.map((q) => q.i)).size;
            const headTitle = one
                ? (focusBp != null ? (c.name + ':' + human(focusBp))
                    : (c.name + ':' + human(lo) + '-' + human(hi)))
                : (regs.length + ' selected regions on ' + chrCount + ' chromosome'
                    + (chrCount === 1 ? '' : 's'));
            const headSpan = one
                ? (focusBp != null ? 'transcripts containing this position' : fmtSpan(hi - lo))
                : fmtSpan(spanAll) + ' in total';

            const panel = document.createElement('div');
            try { const old2 = document.getElementById('baja-karyo-range'); if (old2 && old2.parentNode) old2.parentNode.removeChild(old2); } catch (e) { }
            panel.id = 'baja-karyo-range';
            panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#fff;'
                + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';
            const esc2 = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const row2 = (gn, i2) =>
                '<label style="display:flex;align-items:flex-start;gap:10px;padding:11px 12px;margin-bottom:8px;'
                + 'border-radius:8px;background:#0a1e3a;border:1px solid rgba(255,255,255,0.16);cursor:pointer;">'
                + '<input type="checkbox" class="kr-g" data-i="' + i2 + '" style="margin-top:3px;"'
                + (gn.transcript && gn.coding ? ' checked' : '') + (gn.transcript ? '' : ' disabled') + '/>'
                + '<span style="min-width:0;">'
                + '<span style="font:700 13.5px Arial;color:#e8f0fb;">' + esc2(gn.gene) + '</span>'
                + (gn.coding ? '<span style="margin-left:8px;border-radius:20px;padding:2px 8px;font:700 10.5px Arial;'
                    + 'background:rgba(34,197,94,0.16);border:1px solid rgba(34,197,94,0.5);color:#8ff0b0;">coding</span>' : '')
                + '<br/><span style="font:12px Arial;color:#9fb3c8;">'
                + esc2(gn.transcript || 'no transcript in the annotation') + ' · ' + esc2(gn.biotype)
                + ' · ' + (gn.strand === '-' ? 'minus' : 'plus') + ' · '
                // With regions on more than one chromosome the position alone is ambiguous.
                + (one ? '' : esc2(gn.__chr || '') + ':')
                + human(gn.start) + '-' + human(gn.end) + '</span>'
                + '</span></label>';
            panel.innerHTML = ''
                + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:16px 22px 14px;'
                + 'background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);box-shadow:0 6px 20px rgba(0,0,0,0.35);">'
                + '<div style="min-width:0;"><div style="font:700 20px Arial;">'
                + esc2(headTitle) + '</div>'
                + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">'
                + headSpan + ' · ' + genes.length + ' gene' + (genes.length === 1 ? '' : 's')
                + (truncated ? ' (the closest 200 per region)' : '')
                + (empty ? ' · ' + empty + ' of ' + asked + ' with none' : '')
                + (inRange.length ? ' · ' + inRange.length.toLocaleString() + ' variant'
                    + (inRange.length === 1 ? '' : 's') + ' in range' : ' · no variants loaded here')
                + '</div></div>'
                + '<div style="margin-left:auto;display:flex;gap:10px;">'
                + '<button id="kr-cancel" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;'
                + 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Close</button>'
                + '<button id="kr-go" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 12.5px Arial;'
                + 'border:1px solid #22c55e;background:#22c55e;color:#04210f;">Open in editor</button>'
                + '</div></div>'
                + '<div style="flex:1 1 auto;overflow:auto;padding:24px 22px 32px;">'
                + '<div style="width:100%;max-width:760px;margin:0 auto;">'
                + '<div style="display:flex;gap:14px;margin-bottom:10px;font:12px Arial;">'
                + '<a id="kr-all" href="#" style="color:#8ab4ff;">Select all</a>'
                + '<a id="kr-none" href="#" style="color:#8ab4ff;">Select none</a>'
                + '<a id="kr-coding" href="#" style="color:#8ab4ff;">Coding only</a></div>'
                + genes.map(row2).join('')
                + '<div style="font:12px Arial;color:#9fb3c8;margin-top:16px;">'
                + 'The ticked transcripts open in the editor. Variants inside them come across '
                + 'and land on the track they belong to.</div>'
                + '</div></div>';
            document.body.appendChild(panel);
            for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
                panel.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
            }
            const q2 = (sel) => panel.querySelector(sel);
            const qa2 = (sel) => Array.prototype.slice.call(panel.querySelectorAll(sel));
            const close2 = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
            panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') close2(); });
            q2('#kr-cancel').onclick = () => close2();
            q2('#kr-all').onclick = (e) => { e.preventDefault(); qa2('.kr-g').forEach((cb) => { if (!cb.disabled) cb.checked = true; }); };
            q2('#kr-none').onclick = (e) => { e.preventDefault(); qa2('.kr-g').forEach((cb) => { cb.checked = false; }); };
            q2('#kr-coding').onclick = (e) => {
                e.preventDefault();
                qa2('.kr-g').forEach((cb) => { cb.checked = !cb.disabled && !!genes[+cb.getAttribute('data-i')].coding; });
            };
            q2('#kr-go').onclick = async () => {
                const ids = qa2('.kr-g').filter((cb) => cb.checked)
                    .map((cb) => genes[+cb.getAttribute('data-i')].transcript).filter(Boolean);
                if (!ids.length) { graph.setMessage(' Tick a transcript to open. '); return; }
                close2();
                await handToEditor(ids, inRange, null);
            };
        };

        // The one-region case, which is what a drag and a click on a mark each produce.
        const openRange = (ci, lo, hi, focusBp, straight) =>
            openRegions([{ i: ci, lo: lo, hi: hi }], focusBp, straight);

        // ---- frame the whole genome ----------------------------------------------------------
        // WAIT FOR REAL PIXELS. A component mounts asynchronously, and a zoomRect computed
        // against a zero-size grid produces a scale of zero -- which draws nothing and looks
        // identical to a bug in the drawing. editor.js hits the same problem on reload and
        // solves it the same way: poll until a canvas has a size, then fit.
        const canvasSize = () => {
            let w = 0, h = 0;
            try {
                for (const c of document.querySelectorAll('canvas')) {
                    if (c.width * c.height > w * h) { w = c.width; h = c.height; }
                }
            } catch (e) { }
            return { w: w, h: h };
        };
        const whenSized = (then) => {
            let tries = 0;
            const step = () => {
                tries++;
                try { window.dispatchEvent(new Event('resize')); } catch (e) { }
                const sz = canvasSize();
                if (sz.w > 2 && sz.h > 2) { then(); return; }
                if (tries < 30) setTimeout(step, 200);
            };
            setTimeout(step, 120);
        };
        const fit = async () => {
            // Top of the frame a little above base 0, bottom a little below the longest
            // chromosome's tail -- the labels are drawn under the bars and need the room.
            // FRAME THE NUCLEUS, not just the chromosomes. The envelope has to be about
            // 1.5 times the content to contain it (sqrt(2) to inscribe the box, plus a
            // margin), so a frame drawn around the chromosomes alone cuts the top and bottom
            // off the very thing that is supposed to enclose them. Both axes are scaled by
            // the same factor, so the 10.5:1 aspect that keeps animateTo's hands off the
            // frame is unchanged.
            // incr 30, not 0: a step count of zero is not a shortcut for "immediately".
            const fx0 = -0.4 * SLOT, fx1 = (drawn.length + 0.4) * SLOT;
            const fy0 = maxMb * 0.06, fy1 = -maxMb * 1.12;
            const fk = Math.SQRT2 * 1.06 * 1.04;
            const fcx = (fx0 + fx1) / 2, fcy = (fy0 + fy1) / 2;
            const fhx = ((fx1 - fx0) / 2) * fk, fhy = ((fy0 - fy1) / 2) * fk;
            await graph.zoomRect(fcx - fhx, fcx + fhx, fcy + fhy, fcy - fhy, 30);
            if (graph.wake) graph.wake();
        };
        // THE OVERLAY IS NOT SOMETHING THIS VIEW CAN AFFORD TO LOSE.
        //
        // highlightmethod is the per-frame hook, and half a dozen things in gene.js null it:
        // clearMouseListeners does, and so does every setMouseMode, since that calls
        // clearMouseListeners. For a tool that draws an overlay ON TOP of tracks that is
        // correct -- the overlay belongs to a mode and the mode ended. Here the overlay IS the
        // view, and there is nothing else on the canvas, so losing it means a blank screen.
        //
        // So it is defined rather than assigned: the getter always returns paint and the
        // setter ignores whatever is written, which makes every one of those nulls a no-op
        // for the life of this app. Anything that genuinely wants the hook back can delete
        // the property.
        try {
            Object.defineProperty(graph, 'highlightmethod', {
                configurable: true,
                get: () => paint,
                set: () => { },
            });
        } catch (e) { graph.highlightmethod = paint; }
        step('painting ' + drawn.length + ' chromosomes; waiting for the canvas to size');
        whenSized(async () => {
            step('canvas sized ' + canvasSize().w + 'x' + canvasSize().h
                + '; slot=' + SLOT.toFixed(1) + ' world units, aspect='
                + (((drawn.length + 0.8) * SLOT) / frameH).toFixed(2));
            try { if (graph.graph && graph.graph.grid && graph.graph.grid.rescale) graph.graph.grid.rescale(); } catch (e) { }
            try { if (graph.rescale) graph.rescale(); } catch (e) { }
            await fit();
            pan();
            step('framed; panning');
            // AFTER the frame, not before: applyDoc restores the saved view with
            // zoomRect, which needs a canvas that already knows its size.
            if (pendingDoc) {
                try {
                    const nvar = (pendingDoc.variants || []).length;
                    // The loading panel has been replaced by the karyotype by now, so
                    // this phase reports on the app's own status line rather than the
                    // bar -- the canvas exists, and setMessage updates live.
                    await applyDoc(pendingDoc, (done, tot) => {
                        graph.setMessage(' Placing ' + done.toLocaleString() + ' of '
                            + tot.toLocaleString() + ' variants… ');
                    });
                    if (nvar) step('placed ' + nvar.toLocaleString() + ' variants');
                    rememberFile(savedPath);
                    step('restored saved karyotype');
                    // A karyotype opened from a share: greet the recipient and, if it carries
                    // bookmarks, open the lower-left navigator so the sharer's saved views are
                    // right there.
                    if (__karyoShared) {
                        try {
                            if (__karyoShareInfo && __karyoShareInfo.failed) { graph.setError(__karyoShareInfo.message, 15); }
                            else if (__karyoShareInfo && __karyoShareInfo.owner && !__karyoShareInfo.mine) {
                                graph.setMessage(' ' + __karyoShareInfo.owner + ' shared this karyotype with you.'
                                    + (bookmarks.length ? (' ' + bookmarks.length + ' saved view' + (bookmarks.length === 1 ? '' : 's') + ' — see the Bookmarks panel, lower-left.') : '') + ' ');
                            }
                            if (bookmarks.length) { try { bookmarkNav(); } catch (e) { } }
                        } catch (e) { }
                    }
                } catch (e) {
                    step('applying the saved karyotype threw: ' + e);
                    try {
                        graph.setMessage(' That karyotype opened but its contents could not be '
                            + 'restored: ' + (e && e.message ? e.message : e) + ' ');
                    } catch (e2) { }
                }
            }
        });
        graph.setMessage(' ' + (r.species || wanted) + ' ' + (r.assembly ? '(' + r.assembly + ') ' : '')
            + '— ' + drawn.length + ' chromosomes, smallest first, all at one scale. '
            + 'Drag to move, scroll to zoom; Select sequence to choose a range. ');
        return { graph: graph, chromosomes: drawn, species: r.species, assembly: r.assembly, fit: fit };
    })();
}
