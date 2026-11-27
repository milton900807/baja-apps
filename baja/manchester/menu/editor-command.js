function (graph, genegraph_panel_layout, options) {

    // ASK: SAY WHAT YOU WANT DONE, AND IT WORKS OUT WHICH OPERATION DOES IT.
    //   await exec('baja/manchester/menu/editor-command.js', graph, genegraph_panel_layout);
    //
    // "load clinvar pathogenic snp indels into selected sequence", "which RBP binds this",
    // "select all snps", "remove the benign ones", "are any of these pathogenic".
    //
    // Three parts, and the split between them is the whole design:
    //
    //   1. baja/manchester/menu/editor-capabilities.js DECLARES what the editor can do --
    //      each operation, the arguments it takes, and the values those arguments may hold.
    //   2. py/bio/editor/plan.py is handed that catalogue and the sentence, and returns a
    //      PLAN: which operations, with which arguments. It is given no other vocabulary.
    //   3. This file validates every step back against the same declarations, shows what
    //      the plan would actually do on THIS canvas, and only then runs it.
    //
    // WHY THE CATALOGUE AND NOT THE CODEBASE. Every file under baja/ is exec-able by path
    // with arbitrary arguments. A model that could name a path and its arguments would be a
    // remote shell on someone's unsaved work, and checking the sentence that produced it
    // would not change that, because the sentence is not what runs. So the model chooses
    // from an enumerated list and fills declared arguments, and anything else it returns is
    // dropped before it reaches a track: a path as an operation name is refused, an
    // unrecognised value refuses its step rather than being quietly replaced by a plausible
    // one, and an argument the operation has no notion of is dropped and named on screen.
    //
    // Nothing destructive runs without its own click, with its count in the label, and
    // history is pushed first so undo puts it back.
    //
    // TWO PLACES, ONE IMPLEMENTATION. Called with no options this is the full-screen panel
    // with its own input. Called with { host } it renders into that element instead and takes
    // the request from { prefill } -- which is how the toolbar's inline input uses it, so the
    // box in the toolbar and the box in the panel cannot drift into two different behaviours.
    //   opts.host      element to render into; no panel is created
    //   opts.prefill   the request, when the caller already has one
    //   opts.onDone    called with the number of records affected, when a plan finishes
    return (async () => {
        const OPT = options || {};
        const HOST = OPT.host || null;
        const result = (m) => { try { (graph.setResultMessage || graph.setMessage).call(graph, ' ' + m + ' '); } catch (e) { } };
        const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };

        const CAP = await exec('baja/manchester/menu/editor-capabilities.js', graph, genegraph_panel_layout);

        // EVERY REQUEST IS KEPT. A sentence that took a minute to get right used to exist
        // only in the box it was typed into, so the way to repeat it was to remember it,
        // and a remembered sentence is a slightly different sentence with a slightly
        // different plan. The log is a browser-local list of what was asked, what it was
        // read as, and how much of it ran; baja/lib/prompt-log.js holds it. A log that
        // cannot be written is never a reason for a request to fail, so every call to it
        // is guarded and the request goes on regardless.
        let LOG = null;
        try { LOG = await exec('baja/lib/prompt-log.js'); } catch (e) { LOG = null; }
        let askId = null;
        const logged = (e) => { try { if (LOG) askId = LOG.add(e); } catch (er) { } };
        const loggedRan = (n) => { try { if (LOG && askId) LOG.ran(askId, n); } catch (er) { } };
        const VS = CAP.VS, F = CAP.F;

        // NO TRACK IS NOT A REASON TO REFUSE TO OPEN. Loading one is itself an operation
        // here, and an empty canvas is exactly when someone types "load DNM1". Every
        // operation that does need a track says so for itself, before its button.

        // WHAT IS ACTUALLY ON SCREEN. A question like "are any of these pathogenic" means
        // the ones in view, not the four thousand on the track, and answering about the
        // whole track would be answering a question nobody asked.
        //
        // graph.grid holds the visible world window; t.tgraph.X(baseIndex) maps a variant's
        // index on its track into that same world frame, which is how every drawing path
        // here places one. The vertical test is the track's own band overlapping the window,
        // because tgraph.height is signed and a track scrolled off the top is not visible
        // however well its bases line up.
        const visibleVariants = () => {
            const all = CAP.vrows();
            let x0, x1, y0, y1;
            try {
                const g = graph.grid;
                x0 = g.getxmin(); x1 = g.getxmax();
                y0 = Math.min(g.getymin(), g.getymax());
                y1 = Math.max(g.getymin(), g.getymax());
            } catch (e) { return all; }
            if (!isFinite(x0) || !isFinite(x1)) return all;
            const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
            const okTrack = new Map();
            const trackVisible = (t) => {
                if (okTrack.has(t)) return okTrack.get(t);
                let v = true;
                try {
                    const tg = t.tgraph;
                    const a = tg.yi, b = tg.yi + (tg.height || 0);
                    v = (Math.max(a, b) >= y0) && (Math.min(a, b) <= y1);
                } catch (e) { v = true; }
                okTrack.set(t, v);
                return v;
            };
            return all.filter((r) => {
                if (!trackVisible(r.t)) return false;
                let wx;
                try { wx = r.t.tgraph.X(r.v.xi); } catch (e) { return false; }
                return isFinite(wx) && wx >= lo && wx <= hi;
            });
        };

        // The fields a question is answered from, and ONLY these. No sequence, nothing that
        // would let a question about what is on screen turn into a request for the design.
        const askRecord = (r, i) => {
            const rec = r.rec;
            const o = { i: i, name: rec.name || ('variant ' + (i + 1)) };
            if (rec.gene) o.gene = rec.gene;
            if (rec.change && rec.change !== '>') o.change = rec.change;
            if (rec.pos) o.pos = rec.pos;
            if (rec.consequence) o.consequence = ('' + rec.consequence).slice(0, 160);
            if (rec.clinsig) o.clinsig = rec.clinsig;
            if (rec.condition) o.condition = ('' + rec.condition).slice(0, 160);
            if (rec.source) o.source = rec.source;
            if (rec.type) o.type = rec.type;
            if (r.t && r.t.name) o.track = r.t.name;
            return o;
        };

        // WHAT IS ON THE CANVAS, sent with the request. Without it "the selected sequence"
        // and "these variants" are phrases a model has to guess the referent of, and a
        // relative request ("the low-scoring ones") lands on invented numbers.
        const context = () => {
            const sel = CAP.selTracks();
            const span = (get, list) => {
                let lo = Infinity, hi = -Infinity, seen = 0;
                for (const r of list) { const v = get(r.o); if (v == null) continue; seen++; lo = Math.min(lo, v); hi = Math.max(hi, v); }
                return seen ? [Math.round(lo * 10) / 10, Math.round(hi * 10) / 10] : null;
            };
            const cr = CAP.crows();
            return {
                tracks: CAP.tracks().map((t) => ({
                    name: t.name || '(unnamed)',
                    gene: t.geneID || undefined,
                    variants: (t.snpindels || []).length,
                    compounds: (t.oligos || []).length,
                    // So "select exon 5" can be checked against a transcript that has four,
                    // and a non-coding track is not asked for a UTR it has not got.
                    regions: CAP.regionInfo(t) || undefined,
                    // WHAT IS ON THE TRACK, BY NAME. Without this a request to remove or
                    // show a layer is planned blind: the layer a user calls "the rna seq
                    // layer" is called GRCh38illuminabrain1, and nothing in the request or
                    // the catalogue could tell anyone that. Name and kind both, because the
                    // name is what the user points at and the kind is what they mean.
                    layers: (() => {
                        try {
                            return (t.track_layers || []).slice(0, 20).map((l) => ({
                                name: ('' + ((l && l.name) || '(unnamed)')),
                                kind: ('' + ((l && l.data_type) || '')) || undefined
                            }));
                        } catch (e) { return undefined; }
                    })(),
                    selection: (t.markend > t.markstart)
                        ? { start: Math.floor(t.markstart), end: Math.ceil(t.markend),
                            length: Math.ceil(t.markend) - Math.floor(t.markstart) } : null
                })).slice(0, 12),
                has_selection: sel.length > 0,
                tracks_with_a_selection: sel.length,
                // What is picked out ON the canvas, which is a different thing from a marked
                // stretch of sequence. "the selected compounds" means these, and without the
                // counts a request about them reads as being about nothing.
                selected_now: {
                    compounds: CAP.selCountOf('compounds'),
                    variants: CAP.selCountOf('variants'),
                    annotations: CAP.selCountOf('annotations'),
                    primers: CAP.selCountOf('primers')
                },
                variants_total: CAP.vrows().length,
                variants_on_screen: visibleVariants().length,
                compounds_total: cr.length,
                flagged_compounds: cr.filter((r) => F.isRed(r.o)).length,
                compound_spans: { score: span(F.scoreOf, cr), gc: span(F.gcOf, cr), tm: span(F.tmOf, cr), length: span(F.lenOf, cr) }
            };
        };

        // --------------------------------------------------------------------- the panel ---
        return new Promise((resolve) => {
            const H = (s) => ('' + (s == null ? '' : s))
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            try { const old = document.getElementById('baja-editor-command'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }

            const ctx = context();
            // HOSTED: the caller owns the surface and supplies the request, so none of the
            // chrome below is built. Everything after this point -- the planner call, the
            // validation, the plan card, the answer -- is identical in both modes, which is
            // the point of having one file do both.
            // Shared by both modes: the plan card builds buttons with these, and the panel
            // builds its own input with them. Declared before the branch, or they end up
            // scoped to the branch that happens to have built the chrome.
            const inp = 'width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;'
                + 'border:1px solid rgba(255,255,255,0.22);border-radius:10px;padding:13px 15px;font:15px Arial;';
            const btn = 'cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;'
                + 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;';

            const panel = document.createElement('div');
            if (HOST) {
                panel.style.cssText = 'font-family:Arial,Helvetica,sans-serif;color:#fff;';
                panel.innerHTML = '<input id="ec-q" type="hidden"/>'
                    + '<div id="ec-busy" style="font:12.5px Arial;color:#9fb3c8;"></div>'
                    + '<div id="ec-out"></div>';
                try { HOST.innerHTML = ''; HOST.appendChild(panel); } catch (e) { }
            } else {
            panel.id = 'baja-editor-command';
            panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(3,10,20,0.62);'
                + 'font-family:Arial,Helvetica,sans-serif;display:flex;align-items:flex-start;justify-content:center;'
                + 'padding:72px 16px 16px;overflow:auto;';

            const selNote = ctx.has_selection
                ? (ctx.tracks_with_a_selection === 1
                    ? ('a selection of ' + (CAP.oneSelTrack() ? (Math.ceil(CAP.oneSelTrack().markend) - Math.floor(CAP.oneSelTrack().markstart)).toLocaleString() + ' nt' : 'some sequence') + ' on ' + (CAP.oneSelTrack().name || 'a track'))
                    : (ctx.tracks_with_a_selection + ' tracks have a selection'))
                : 'no sequence selected';

            panel.innerHTML = ''
                + '<div style="width:100%;max-width:680px;background:#071a30;color:#fff;border-radius:14px;'
                + 'border:1px solid rgba(255,255,255,0.14);box-shadow:0 18px 54px rgba(0,0,0,0.55);overflow:hidden;">'
                + '<div style="display:flex;align-items:center;gap:14px;padding:15px 20px 13px;background:#0b2545;'
                + 'border-bottom:1px solid rgba(255,255,255,0.12);">'
                // No title. The box says what it is by being a box you type in, and a heading
                // over it was a label on the obvious. What is left is the only thing the
                // header was ever for: what is on the canvas right now.
                + '<div style="min-width:0;">'
                + '<div style="font:12.5px Arial;color:#9fb3c8;">'
                + CAP.list.length + ' operations · ' + ctx.variants_total + ' variants ('
                + ctx.variants_on_screen + ' on screen) · ' + ctx.compounds_total + ' compounds'
                + (ctx.selected_now.compounds ? (' (' + ctx.selected_now.compounds + ' selected)') : '')
                + ' · ' + H(selNote) + '</div></div>'
                + '<div style="margin-left:auto;"><button id="ec-close" style="' + btn + '">Close</button></div>'
                + '</div>'
                + '<div style="padding:18px 20px 22px;">'
                + '<input id="ec-q" placeholder="load clinvar pathogenic snp indels into selected sequence" style="' + inp + '"/>'
                // NO BUTTONS. Enter sends it, which is what anyone types into a box this
                // shape already expects, and a Go button beside a box you have just typed
                // into is a second thing to aim at for no decision. What took its place is
                // the only thing the row was needed for: a visible sign that it is working.
                //
                // The examples that used to sit under it are gone too. Nine lines of prose
                // under a text field is a manual, read once and then permanently in the way
                // of the answers, which appear directly below. The placeholder carries one
                // example, and the full list of operations is a request away.
                + '<div id="ec-busy" style="min-height:18px;margin-top:12px;"></div>'
                // THE WAY BACK TO WHAT WAS ASKED BEFORE. One line, under the box, where
                // somebody staring at an empty field trying to remember last week's
                // sentence is already looking.
                + '<div style="margin-top:10px;font:12px Arial;color:#6b8299;">'
                + '<a id="ec-log" href="#" style="color:#7fb0e8;text-decoration:none;">'
                + 'What you have asked for before</a></div>'
                + '<div id="ec-out" style="margin-top:16px;"></div>'
                + '</div></div>';
            document.body.appendChild(panel);
            }

            const q = (s) => panel.querySelector(s);
            try {
                const lg = panel.querySelector('#ec-log');
                if (lg) lg.onclick = async (e) => {
                    try { e.preventDefault(); } catch (e2) { }
                    try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e2) { }
                    try {
                        const L = LOG || await exec('baja/lib/prompt-log.js');
                        await L.open(graph, genegraph_panel_layout);
                    } catch (e2) { }
                };
            } catch (e) { }
            const close = () => {
                if (HOST) { try { HOST.innerHTML = ''; } catch (e) { } return; }
                try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { }
            };
            const done = (n) => {
                close(); resolve(n || 0);
                if (OPT.onDone) { try { OPT.onDone(n || 0); } catch (e) { } }
            };

            // The editor listens on the window for keys and pastes; without this a typed
            // sentence is also read as something to do to the canvas.
            for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
                panel.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
            }
            if (!HOST) {
                panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(0); });
                panel.addEventListener('mousedown', (e) => { if (e.target === panel) done(0); });
                q('#ec-close').onclick = () => done(0);
            }

            let busy = false;

            // A REQUEST THAT IS STILL RUNNING HAS TO LOOK LIKE ONE.
            //
            // The only sign of work in flight was twelve-pixel grey text beside the button,
            // which on a dark panel is easy to miss entirely -- so a request that took a few
            // seconds looked like a box that had ignored the Enter key, and the natural
            // response is to press it again. Now the button says it is working and stops
            // accepting presses, the field goes quiet, and a spinner turns beside them.
            //
            // The elapsed seconds appear only after three, so a quick answer stays clean and
            // a slow one visibly keeps going rather than looking stuck. What is working is
            // nobody's business but ours: the wording stays "Working".
            let busyTimer = null, busyAt = 0;
            const BUSY_CSS = 'baja-ec-busy-css';
            const ensureBusyCss = () => {
                try {
                    if (document.getElementById(BUSY_CSS)) return;
                    const st = document.createElement('style');
                    st.id = BUSY_CSS;
                    st.textContent = '@keyframes bajaEcSpin{to{transform:rotate(360deg)}}'
                        + '.baja-ec-spin{display:inline-block;width:13px;height:13px;border-radius:50%;'
                        + 'border:2px solid rgba(255,255,255,0.25);border-top-color:#22c55e;'
                        + 'animation:bajaEcSpin 0.7s linear infinite;vertical-align:-2px;}';
                    document.head.appendChild(st);
                } catch (e) { }
            };
            const paintBusy = (label) => {
                const b = q('#ec-busy');
                if (!b) return;
                const secs = busyAt ? Math.floor((Date.now() - busyAt) / 1000) : 0;
                b.innerHTML = '<span class="baja-ec-spin"></span>'
                    + '<span style="margin-left:8px;font:700 12.5px Arial;color:#e2e8f0;">'
                    + H(label) + (secs >= 3 ? (' · ' + secs + 's') : '') + '</span>';
            };
            const setBusy = (on, label) => {
                const text = label || 'Working';
                // There is no Go button any more, so the spinner and the field ARE the
                // signal. q('#ec-run') is kept rather than deleted because the hosted layout
                // may still supply one; it is simply absent in the panel.
                const go = q('#ec-run'), inpEl = q('#ec-q');
                if (busyTimer) { try { clearInterval(busyTimer); } catch (e) { } busyTimer = null; }
                if (on) {
                    ensureBusyCss();
                    busyAt = Date.now();
                    paintBusy(text);
                    try { busyTimer = setInterval(() => paintBusy(text), 1000); } catch (e) { }
                    if (go) { go.disabled = true; go.textContent = 'Working…'; go.style.opacity = '0.6'; go.style.cursor = 'default'; }
                    if (inpEl) { try { inpEl.disabled = true; inpEl.style.opacity = '0.65'; } catch (e) { } }
                } else {
                    busyAt = 0;
                    const b = q('#ec-busy'); if (b) b.innerHTML = '';
                    if (go) { go.disabled = false; go.textContent = 'Go'; go.style.opacity = ''; go.style.cursor = 'pointer'; }
                    if (inpEl) {
                        try { inpEl.disabled = false; inpEl.style.opacity = ''; } catch (e) { }
                        try { inpEl.focus(); } catch (e) { }
                    }
                }
            };
            const parse = (v, d) => {
                if (v == null) return d;
                if (typeof v !== 'string') return v;
                try { return JSON.parse(v); } catch (e) { return d; }
            };
            const card = (inner, border) => '<div style="padding:13px 15px;border-radius:10px;background:#0a1e3a;'
                + 'border:1px solid ' + (border || 'rgba(255,255,255,0.12)') + ';">' + inner + '</div>';

            // A WAY OUT OF EVERY ANSWER. In the panel there is a Close button in the header;
            // in the toolbar's results panel there is nothing around the content, so the
            // content has to carry it. Some answers already end in Cancel or "Ask something
            // else"; this is for the ones that are a single line of text, which would
            // otherwise sit under the toolbar until the next request replaced them.
            const dismissRow = (id) => HOST
                ? ('<div style="margin-top:12px;"><button id="' + id + '" style="' + btn + '">Close</button></div>')
                : '';
            const wireDismiss = (id) => {
                if (!HOST) return;
                const el = q('#' + id);
                if (el) el.onclick = () => done(0);
            };

            // ------------------------------------------------------------- the catalogue ---
            // Asked for by name, because "what can it do" is the first thing anyone wants
            // from a box like this, and a guess that comes back "not something this can do"
            // teaches nothing about what is.
            const showAll = () => {
                q('#ec-out').innerHTML = card(
                    '<div style="font:700 13px Arial;color:#7fb0e8;margin-bottom:9px;">'
                    + CAP.list.length + ' operations</div>'
                    + CAP.list.map((c) => {
                        const b = CAP.blocker(c);
                        return '<div style="padding:7px 0;border-top:1px solid rgba(255,255,255,0.08);">'
                            + '<div style="font:700 12px Arial;color:' + (c.destructive ? '#fca5a5' : '#e8f0fb') + ';">'
                            + H(c.name.replace(/_/g, ' ')) + (c.destructive ? ' · deletes work' : '') + '</div>'
                            + '<div style="font:11.5px Arial;color:#9fb3c8;margin-top:2px;line-height:1.6;">'
                            + H(c.summary) + '</div>'
                            + (b ? '<div style="font:11px Arial;color:#fbbf24;margin-top:2px;">not available: ' + H(b) + '</div>' : '')
                            + '</div>';
                    }).join(''));
            };

            // ------------------------------------------------------------- answering -------
            const answer = async (step, ask) => {
                const out = q('#ec-out');
                let rows = visibleVariants();
                const narrowed = ('' + ((step.args && step.args.query) || '')).trim();
                if (narrowed) {
                    const qq = VS.compileQuery(narrowed);
                    if (qq) rows = rows.filter((x) => qq(x.rec));
                }
                if (!rows.length) {
                    out.innerHTML = card('<div style="font:13px Arial;color:#9fb3c8;">'
                        + (CAP.vrows().length
                            ? ('No variants are on screen' + (narrowed ? (' matching “' + H(narrowed) + '”') : '')
                                + '. Zoom out, or load some first.')
                            : 'There are no variants on the open tracks.') + '</div>'
                        + dismissRow('ec-x4'));
                    wireDismiss('ec-x4');
                    return 0;
                }
                // A HARD CAP, SAID OUT LOUD. Past a few hundred records the answer stops being
                // about what the user is looking at, and silently truncating would make "none
                // of these are pathogenic" a statement about an arbitrary prefix of the screen.
                const CAPN = 300;
                let capped = 0;
                if (rows.length > CAPN) { capped = rows.length - CAPN; rows = rows.slice(0, CAPN); }

                setBusy(true, 'Reading ' + rows.length + ' variant' + (rows.length === 1 ? '' : 's'));
                let a = null;
                try {
                    const em = new EngineMonitor((m) => { try { log(m); } catch (e) { } });
                    a = await exec(window['env']['apiUrl'] + '/py/bio/editor/variant-question.py',
                        em, ask, JSON.stringify(rows.map(askRecord)), '');
                } catch (e) {
                    setBusy(false);
                    out.innerHTML = '<div style="font:12.5px Arial;color:#fca5a5;">Could not answer that: '
                        + H(e && e.message ? e.message : e) + '</div>' + dismissRow('ec-x5');
                    wireDismiss('ec-x5');
                    return 0;
                }
                setBusy(false);
                if (!a || a.status !== 'OK') {
                    out.innerHTML = '<div style="font:12.5px Arial;color:#fca5a5;">Could not answer that'
                        + (a && a.error ? (': ' + H(a.error)) : '.') + '</div>' + dismissRow('ec-x6');
                    wireDismiss('ec-x6');
                    return 0;
                }

                const verdicts = parse(a.verdicts, []) || [];
                const matches = (parse(a.matches, []) || []).filter((i) => i >= 0 && i < rows.length);
                const hitRows = matches.map((i) => rows[i]).filter(Boolean);
                const VCOL = { pathogenic: '#fca5a5', likely_pathogenic: '#fdba74', uncertain: '#fcd34d', likely_benign: '#a7f3d0', benign: '#86efac', unknown: '#9fb3c8' };
                const VLAB = { pathogenic: 'pathogenic', likely_pathogenic: 'likely pathogenic', uncertain: 'uncertain', likely_benign: 'likely benign', benign: 'benign', unknown: 'not known to it' };

                const line = (v) => {
                    const row = rows[v.i];
                    if (!row) return '';
                    const rec = row.rec;
                    const who = [rec.name, rec.gene, (rec.change && rec.change !== '>') ? rec.change : '']
                        .map((x) => ('' + (x || '')).trim()).filter(Boolean).join(' · ');
                    // THE RECORD'S OWN CALL, ALWAYS, WHERE THERE IS ONE. Side by side rather
                    // than merged: where the model agrees this is corroboration, and where it
                    // disagrees that is something the user needs to see, not something for
                    // either side to win quietly.
                    const own = ('' + (rec.clinsig || '')).trim();
                    return '<div style="display:flex;gap:11px;align-items:flex-start;padding:9px 11px;'
                        + 'border-top:1px solid rgba(255,255,255,0.08);">'
                        + '<div style="flex:0 0 118px;font:700 11.5px Arial;color:' + (VCOL[v.verdict] || '#9fb3c8') + ';">'
                        + H(VLAB[v.verdict] || v.verdict)
                        + '<div style="font:400 10.5px Arial;color:#6b8299;margin-top:2px;">' + H(v.confidence) + ' confidence</div></div>'
                        + '<div style="min-width:0;flex:1 1 auto;">'
                        + '<div style="font:700 12.5px Arial;color:#e8f0fb;">' + H(who || '(unnamed)') + '</div>'
                        + (own ? '<div style="font:11.5px Arial;color:#7fb0e8;margin-top:2px;">record says: '
                            + H(own) + (rec.condition ? (' (' + H(rec.condition) + ')') : '') + '</div>' : '')
                        + (v.why ? '<div style="font:11.5px Arial;color:#9fb3c8;margin-top:3px;line-height:1.6;">' + H(v.why) + '</div>' : '')
                        + '</div></div>';
                };
                const withCall = rows.filter((x) => ('' + (x.rec.clinsig || '')).trim()).length;

                out.innerHTML = card(
                    '<div style="font:13.5px Arial;color:#e8f0fb;line-height:1.7;">' + H(a.answer || '(no answer)') + '</div>'
                    + '<div style="font:11.5px Arial;color:#6b8299;margin-top:7px;">'
                    + 'asked about ' + rows.length + ' variant' + (rows.length === 1 ? '' : 's') + ' on screen'
                    + (narrowed ? (' matching “' + H(narrowed) + '”') : '')
                    + ' · ' + withCall + ' of them already carry a clinical call'
                    + (capped ? (' · ' + capped + ' more on screen were NOT included, zoom in to cover them') : '')
                    + '</div>'
                    + (a.caveat ? '<div style="font:11.5px Arial;color:#fbbf24;margin-top:7px;">' + H(a.caveat) + '</div>' : ''))
                    + (verdicts.length
                        ? ('<div style="margin-top:12px;border-radius:10px;background:#071f3a;'
                            + 'border:1px solid rgba(255,255,255,0.12);overflow:hidden;">'
                            + '<div style="padding:9px 11px;font:700 11px Arial;color:#6b8299;letter-spacing:0.4px;">'
                            + 'PER VARIANT · a model reading the record, not a clinical determination</div>'
                            + verdicts.map(line).join('') + '</div>')
                        : '')
                    + '<div style="display:flex;gap:10px;margin-top:13px;">'
                    + (hitRows.length
                        ? ('<button id="ec-sel" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 12.5px Arial;'
                            + 'border:1px solid #22c55e;background:#22c55e;color:#04210f;">Select these ' + hitRows.length + '</button>')
                        : '')
                    + '<button id="ec-again" style="' + btn + '">Ask something else</button></div>';

                const again = q('#ec-again');
                if (again) again.onclick = () => {
                    if (HOST) { done(0); return; }
                    out.innerHTML = ''; try { q('#ec-q').value = ''; q('#ec-q').focus(); } catch (e) { }
                };
                const sel = q('#ec-sel');
                if (sel) sel.onclick = () => {
                    CAP.selectVariants(hitRows);
                    done(hitRows.length);
                    result('Selected ' + hitRows.length + ' variant' + (hitRows.length === 1 ? '' : 's') + '.');
                };
                return hitRows.length;
            };

            // ------------------------------------------------------------- the plan ---------
            const render = (r, ask) => {
                const out = q('#ec-out');
                const steps = parse(r.steps, []) || [];
                const unsupported = parse(r.unsupported, []) || [];
                const problems = parse(r.problems, []) || [];

                const warn = []
                    .concat(unsupported.map((u) => ['#fbbf24', 'not something the editor can do: ' + u]))
                    .concat(problems.map((p) => ['#fca5a5', 'refused: ' + p]))
                    .map(([c, t]) => '<div style="font:12.5px Arial;color:' + c + ';margin-top:7px;">&#9888; ' + H(t) + '</div>')
                    .join('');

                // Validated here as well as in the planner. Same declarations, both sides: a
                // check that lives in only one of the two is one refactor from being gone,
                // and this is the side holding the user's unsaved work.
                const plan = steps.map((s) => ({ step: s, p: CAP.preview(s) }));
                const bad = plan.filter((x) => !x.p.ok);
                const good = plan.filter((x) => x.p.ok);

                // NOTHING LEFT TO RUN is one outcome, whether the planner returned no steps
                // or returned steps this side refused. Rendering a plan card around zero
                // runnable steps read as "One operation" with a refusal underneath it.
                if (!good.length) {
                    // A SHELF BEATS A REFUSAL, AND THE CATALOGUE ALREADY SAYS SO.
                    //
                    // "run ml motilf" came back as "Nothing in the editor does that", with a
                    // note that the name is not one of the four models. That is true and it is
                    // not an answer: the request is plainly about running a model, and there
                    // is a shelf of them one click away. open_library exists for exactly this
                    // and the planner is told to reach for it, but a planner is a reading of a
                    // sentence and a misread leaves the user at a dead end. So when nothing can
                    // run and the request is recognisably about a KIND of thing on a shelf,
                    // the shelf opens. A name it cannot place is the strongest reason to show
                    // the list, not a reason to withhold it.
                    //
                    // Judged on the user's own words first, then on whatever the planner said
                    // it could not do -- that is where an unknown model name ends up.
                    const SHELVES = [
                        ['ml_models', /\b(ml|machine[ -]?learning|models?|predicts?|prediction|motifs?|clip|bajaclip|splice(net)?|bajasplice|psi(net)?|bajair|primers?|djprimer|binding|rbp|score|inference)\b/i],
                        ['data', /\b(data|datasets?|tracks? from|load|clinvar|gnomad|conservation|phylop|expression|annotations?)\b/i],
                        ['design_modalities', /\b(modality|modalities|design space|aso|sirna|gapmer|exon skipping|oligo)\b/i],
                        ['chemistry', /\b(chemistry|backbone|2'?-?o-?me|moe|lna|phosphorothioate)\b/i],
                        ['clinical_compounds', /\b(clinical|trial|approved|compounds?|drugs?)\b/i],
                        ['drawing', /\b(draw|annotate|label|shape|arrow)\b/i]
                    ];
                    const shelfFor = (text) => {
                        const t = '' + (text || '');
                        if (!t.trim()) return null;
                        for (const [lib, re] of SHELVES) { if (re.test(t)) return lib; }
                        return null;
                    };
                    // NOT FOR A REQUEST TO TAKE SOMETHING AWAY. A shelf of data that can be
                    // LOADED is the opposite of the answer to "remove the rna seq layers",
                    // and offering it reads as not having understood the request at all --
                    // which, when the planner has already said so in its own words, is worse
                    // than the plain refusal. The planner's words are what tripped this:
                    // "no operation exists to delete data layers from tracks" carries the
                    // word data, and the shelf matched on it.
                    const TAKING_AWAY = /\b(remove|removing|delete|deleting|clear|clearing|unload|hide|hiding|get rid of|take off|turn off|drop)\b/i;
                    const library = TAKING_AWAY.test('' + (ask || ''))
                        ? null
                        : (shelfFor(ask) || shelfFor(unsupported.join(' ')) || null);
                    if (library) {
                        let p = null;
                        try { p = CAP.preview({ capability: 'open_library', args: { library: library } }); }
                        catch (e) { p = null; }
                        if (p && p.ok) {
                            // Said before it opens, because a shelf appearing unasked is
                            // confusing without the sentence that explains it. The words the
                            // planner used are kept: they are usually the specific part the
                            // user got wrong, and the shelf is where to correct it.
                            out.innerHTML = card(
                                '<div style="font:700 13.5px Arial;color:#e8f0fb;">Nothing here runs that by name, '
                                + 'so here is the shelf it would be on.</div>'
                                + warn
                                + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:9px;line-height:1.7;">'
                                + 'Going to ' + H(p.text || library)
                                + '. Pick from there, or <a id="ec-all" href="#" style="color:#7fb0e8;">'
                                + 'see everything it can do</a>.</div>'
                                + dismissRow('ec-x1'));
                            wireDismiss('ec-x1');
                            const all0 = q('#ec-all');
                            if (all0) all0.onclick = (e) => { try { e.preventDefault(); } catch (e2) { } showAll(); };
                            (async () => {
                                try { await p.capability.run(p.args); loggedRan(1); }
                                catch (e) { try { result('Could not open the library: ' + ((e && e.message) || e)); } catch (e2) { } }
                            })();
                            return;
                        }
                    }

                    // ONE WORD SHORT IS NOT "NOTHING IN THE EDITOR DOES THAT".
                    //
                    // "add pathologic mutations to selected sequence" is load_variants over
                    // the selection with db unset: the editor does exactly that, and the
                    // refusal already knows which argument is missing and every value that
                    // would be accepted. Saying nothing does it, under a note naming an
                    // argument the user never saw a list for, is both wrong and a dead end.
                    //
                    // So the values are offered as buttons. Picking one puts it in the step
                    // and re-renders the plan, which lands on the ordinary card with its own
                    // run button -- the argument is supplied by the user's click, and nothing
                    // runs until they press run. That keeps the rule the planner side states:
                    // the guess is offered, never taken.
                    const askable = bad.filter((x) => x.p && x.p.missing
                        && Array.isArray(x.p.missingValues) && x.p.missingValues.length);
                    const askRows = askable.map((x, i) => {
                        const c = x.p.capability;
                        return '<div style="margin-top:9px;">'
                            + '<div style="font:12.5px Arial;color:#9fb3c8;">'
                            + H((c && c.name) || 'this operation') + ' needs <b>' + H(x.p.missing)
                            + '</b>' + (x.p.missingAbout ? (' \u2014 ' + H(x.p.missingAbout)) : '')
                            + '</div><div style="margin-top:6px;">'
                            + x.p.missingValues.map((v, j) =>
                                '<a href="#" id="ec-pick-' + i + '-' + j + '" '
                                + 'style="display:inline-block;margin:3px 6px 0 0;padding:4px 10px;'
                                + 'border-radius:6px;border:1px solid rgba(255,255,255,0.18);'
                                + 'font:12.5px Arial;color:#7fb0e8;text-decoration:none;">'
                                + H(v) + '</a>').join('')
                            + '</div></div>';
                    }).join('');

                    out.innerHTML = card(
                        '<div style="font:700 13.5px Arial;color:#e8f0fb;">'
                        + (askable.length ? 'Which one?' : 'Nothing in the editor does that.')
                        + '</div>'
                        + bad.map((x) => '<div style="font:12.5px Arial;color:#fca5a5;margin-top:7px;">'
                            + '&#9888; refused: ' + H(x.p.text) + '</div>').join('')
                        + askRows
                        + warn
                        + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:9px;line-height:1.7;">'
                        + '<a id="ec-all" href="#" style="color:#7fb0e8;">See everything it can do</a>'
                        + ', or ask to open a library \u2014 the models, the data, the modalities \u2014 '
                        + 'and pick from there.</div>'
                        + dismissRow('ec-x1'));
                    wireDismiss('ec-x1');
                    askable.forEach((x, i) => {
                        x.p.missingValues.forEach((v, j) => {
                            const el = q('#ec-pick-' + i + '-' + j);
                            if (!el) return;
                            el.onclick = (e) => {
                                try { e.preventDefault(); } catch (e2) { }
                                // Rebuilt rather than mutated: render() re-parses r.steps, so
                                // the filled argument has to go back the way it came.
                                const filled = steps.map((st) => (st === x.step)
                                    ? Object.assign({}, st, { args: Object.assign({}, st.args || {},
                                        { [x.p.missing]: v }) })
                                    : st);
                                render(Object.assign({}, r, { steps: JSON.stringify(filled) }), ask);
                            };
                        });
                    });
                    const all = q('#ec-all');
                    if (all) all.onclick = (e) => { try { e.preventDefault(); } catch (e2) { } showAll(); };
                    return;
                }

                // A single question is answered rather than planned.
                if (good.length === 1 && !bad.length && good[0].p.answers) { answer(good[0].step, ask); return; }

                // ONE GO PER TRACK. A one-track operation that fits several open tracks -- "goto
                // c.778" with three transcripts open, where c.778 is a different place on each --
                // lists them, each with its own Go, instead of refusing until a track is named.
                if (good.length === 1 && good[0].p.choices && !good[0].p.blocker) {
                    // Long lists (forty pathogenic variants) scroll, and stop at CHOICE_MAX with a
                    // note to narrow the words rather than drawing hundreds of buttons.
                    const CHOICE_MAX = 40;
                    const p0 = good[0].p, ch = p0.choices.slice(0, CHOICE_MAX);
                    out.innerHTML = card(
                        '<div style="font:700 13px Arial;color:#7fb0e8;">' + (p0.choiceTitle ? H(p0.choiceTitle)
                            : (H(p0.text.replace(/^(\S+)/, (w) => w.charAt(0).toUpperCase() + w.slice(1))) + ' — on which track?')) + '</div>'
                        + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:5px;">from “' + H(ask) + '”'
                        + (p0.choiceTitle ? '' : (' · ' + ch.length + ' open tracks have it'))
                        + (p0.choices.length > CHOICE_MAX ? (' · showing the first ' + CHOICE_MAX + '; add a word to narrow it') : '') + '</div>'
                        + '<div style="max-height:46vh;overflow-y:auto;">'
                        + ch.map((o, i) => '<div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid rgba(255,255,255,0.08);">'
                            + '<div style="min-width:0;flex:1 1 auto;"><div style="font:700 12.5px Arial;color:#e8f0fb;">' + H(o.label) + '</div>'
                            + (o.detail ? ('<div style="font:11px Arial;color:#6b8299;margin-top:3px;">' + H(o.detail) + '</div>') : '')
                            + '</div>'
                            + '<button id="ec-c' + i + '" style="cursor:pointer;border-radius:8px;padding:8px 16px;font:700 12.5px Arial;'
                            + 'border:1px solid #22c55e;background:#22c55e;color:#04210f;flex:0 0 auto;">GO</button></div>').join('')
                        + '</div>'
                        + warn
                        + '<div style="display:flex;gap:10px;margin-top:13px;"><button id="ec-no" style="' + btn + '">Cancel</button></div>');
                    q('#ec-no').onclick = () => {
                        if (HOST) { done(0); return; }
                        out.innerHTML = ''; try { q('#ec-q').focus(); } catch (e) { }
                    };
                    ch.forEach((o, i) => {
                        const b = q('#ec-c' + i);
                        if (b) b.onclick = async () => {
                            b.disabled = true;
                            close();
                            // The per-track GO is a run like any other, so it gets the same
                            // strip. It used to be the one path that closed the card and then
                            // went quiet.
                            try { await withSpinner(p0, () => p0.capability.run(o.args)); loggedRan(1); done(1); }
                            catch (e) { result(p0.capability.name + ': ' + (e && e.message ? e.message : e)); done(0); }
                        };
                    });
                    return;
                }

                const danger = good.some((x) => x.p.destructive);
                // A LATER STEP'S PRECONDITION IS USUALLY THE EARLIER STEP'S OUTPUT. "select the
                // 3' UTR, then run BajaCLIP on it" has no selection at the moment the plan is
                // drawn, so judging step 2 against the canvas as it stands now drops the very
                // step the first one exists to enable. Only the FIRST step is blocked on the
                // state in front of us; a later one's unmet need is shown as what it expects,
                // and re-checked for real immediately before it runs.
                const runnable = good.filter((x, i) => (i === 0 ? !x.p.blocker : true));

                // EACH STEP IS ITS OWN DECISION.
                //
                // A plan used to be all of it or none of it, which is the wrong shape for a
                // reading of a sentence: the second step is often right while the first is
                // not, or the user wants the selection made without the view jumping. A
                // checkbox per step costs nothing and turns one guess into a list to correct.
                //
                // A first step that cannot run is shown unticked and not tickable -- its
                // blocker is a fact about the canvas, not a preference. Later steps stay
                // tickable even when they say what they expect, because the step before them
                // is usually what provides it; what they are checked against for real is the
                // canvas as the earlier steps leave it, immediately before each one runs.
                const pickable = good.length > 1;
                const row = (x, i) => {
                    const p = x.p;
                    const n = (p.count == null) ? '' : (' · ' + p.count + ' match' + (p.count === 1 ? '' : 'es'));
                    const args = Object.keys(x.step.args || {});
                    const stuck = (i === 0 && !!p.blocker);
                    const box = pickable
                        ? ('<input type="checkbox" id="ec-s' + i + '" class="ec-step" data-i="' + i + '"'
                            + (stuck ? '' : ' checked') + (stuck ? ' disabled' : '')
                            + ' style="width:15px;height:15px;accent-color:' + (p.destructive ? '#ef4444' : '#22c55e')
                            + ';margin:1px 10px 0 0;cursor:' + (stuck ? 'default' : 'pointer') + ';flex:0 0 auto;'
                            + (stuck ? 'opacity:0.45;' : '') + '"/>')
                        : '';
                    return '<div style="padding:10px 0;border-top:1px solid rgba(255,255,255,0.08);'
                        + (pickable ? 'display:flex;align-items:flex-start;' : '') + '">'
                        + box
                        + (pickable ? '<label for="ec-s' + i + '" style="min-width:0;flex:1 1 auto;'
                            + (stuck ? '' : 'cursor:pointer;') + '">' : '')
                        + '<div style="font:700 12.5px Arial;color:' + (p.destructive ? '#fca5a5' : '#e8f0fb') + ';">'
                        + (good.length > 1 ? ((i + 1) + '. ') : '') + H(p.text) + H(n)
                        + (p.opens ? ' <span style="font:400 11px Arial;color:#9fb3c8;">(opens a dialog)</span>' : '')
                        + '</div>'
                        + '<div style="font:11px Arial;color:#6b8299;margin-top:3px;">'
                        + H(p.capability.name) + (args.length ? (' · ' + args.map((k) => k + '=' + JSON.stringify(x.step.args[k])).join(' ')) : ' · no arguments')
                        + '</div>'
                        + (x.step.dropped && x.step.dropped.length
                            ? '<div style="font:11px Arial;color:#fbbf24;margin-top:3px;">ignored, not a parameter of this operation: '
                                + H(x.step.dropped.join(', ')) + '</div>' : '')
                        + (p.blocker
                            ? ('<div style="font:11.5px Arial;color:#fbbf24;margin-top:3px;">'
                                + (i === 0 ? 'cannot run: ' : 'expects, from the step before it: ')
                                + H(p.blocker) + '</div>')
                            : '')
                        + (pickable ? '</label>' : '')
                        + '</div>';
                };

                const verb = danger ? 'GO' : (runnable.length > 1 ? ('GO · ' + runnable.length + ' steps') : 'GO');
                // THE BUTTON SAYS GO, and the step count rides along after it when there is
                // more than one. What it says depends on what is ticked, so it is written
                // once here and recomputed on every change rather than baked into the markup.
                const labelFor = (k) => (k === 0 ? 'Nothing selected'
                    : (k === 1 ? 'GO' : ('GO · ' + k + ' steps')));
                const nShown = good.length;
                // A REFUSAL WITH A WAY FORWARD. "run bajasplice psi" with two transcripts
                // open used to end at "cannot run: say which track to run it on" over a
                // Cancel button, which answers a request for a model by closing. A capability
                // that knows where its own user interface lives says so (whenStuck), and when
                // nothing can run, that goes beside Cancel: the shelf lists the model with the
                // tracks to run it on, which is the thing the request was after.
                const __stuck = (!runnable.length && good.length === 1) ? good[0].p.whenStuck : null;
                const stuckBtn = __stuck
                    ? ('<button id="ec-stuck" style="cursor:pointer;border-radius:8px;padding:9px 18px;'
                        + 'font:700 12.5px Arial;border:1px solid #7fb0e8;background:transparent;color:#7fb0e8;">'
                        + H(__stuck.label || 'Open it') + '</button>')
                    : '';
                out.innerHTML = card(
                    '<div style="font:700 13px Arial;color:' + (danger ? '#fca5a5' : '#7fb0e8') + ';">'
                    + (nShown > 1 ? ('A plan, ' + nShown + ' steps') : 'One operation') + '</div>'
                    + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:5px;">from “' + H(ask) + '”'
                    + (r.explain ? ('<br>read as: ' + H(r.explain)) : '') + '</div>'
                    + good.map(row).join('')
                    + bad.map((x) => '<div style="font:11.5px Arial;color:#fca5a5;padding:8px 0;'
                        + 'border-top:1px solid rgba(255,255,255,0.08);">refused: ' + H(x.p.text) + '</div>').join('')
                    + warn
                    + (danger ? '<div style="font:12.5px Arial;color:#fca5a5;margin-top:9px;">'
                        + 'This deletes work. Undo restores it.</div>' : '')
                    + '<div style="display:flex;gap:10px;margin-top:13px;">'
                    + (runnable.length
                        ? ('<button id="ec-go" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 12.5px Arial;'
                            + (danger ? 'border:1px solid #ef4444;background:#ef4444;color:#2a0505;'
                                : 'border:1px solid #22c55e;background:#22c55e;color:#04210f;') + '">' + H(verb) + '</button>')
                        : '')
                    + stuckBtn
                    + '<button id="ec-no" style="' + btn + '">Cancel</button></div>',
                    danger ? 'rgba(248,113,113,0.5)' : null);

                q('#ec-no').onclick = () => {
                    if (HOST) { done(0); return; }
                    out.innerHTML = ''; try { q('#ec-q').focus(); } catch (e) { }
                };
                const stuckEl = q('#ec-stuck');
                if (stuckEl && __stuck) stuckEl.onclick = async () => {
                    stuckEl.disabled = true;
                    // Closed first, as GO does: a shelf opening behind this panel is the
                    // same bug twice.
                    close();
                    try { await __stuck.run(); } catch (e) { result('Could not open it: ' + (e && e.message ? e.message : e)); }
                    done(0);
                };
                const go = q('#ec-go');

                // The ticked steps, in plan order. Read from the DOM at the moment it matters
                // rather than kept in a parallel array that can drift from what is on screen.
                const chosen = () => {
                    if (!pickable) return runnable.slice();
                    const picked = [];
                    for (let i = 0; i < good.length; i++) {
                        const b = q('#ec-s' + i);
                        if (b && b.checked && !b.disabled) picked.push(good[i]);
                    }
                    return picked;
                };
                const syncGo = () => {
                    if (!go) return;
                    const k = chosen().length;
                    go.textContent = danger && k ? 'GO' : labelFor(k);
                    go.disabled = (k === 0);
                    go.style.opacity = k ? '' : '0.5';
                    go.style.cursor = k ? 'pointer' : 'default';
                };
                if (pickable) {
                    for (let i = 0; i < good.length; i++) {
                        const b = q('#ec-s' + i);
                        if (b) b.onchange = syncGo;
                    }
                    syncGo();
                }

                // EVERY OPERATION THAT TAKES TIME SAYS SO, WITHOUT BEING ASKED TO.
                //
                // The panel was opt-in: an operation had to raise it itself, so most of them
                // did not, and pressing GO on anything slow gave a closed card and a silent
                // canvas. Which operations are slow is not knowable in advance either -- the
                // same comparison is instant on two short tracks and a minute on two
                // genomic ones -- so it cannot be decided per operation at all.
                //
                // It is decided by the clock instead, at the one place every operation runs
                // through. Anything still going after a moment gets the spinner, with the
                // card's own description of the step as its title, so what is running is
                // named rather than being "Working". Anything that finishes before that
                // shows nothing, because a flash of a panel on an instant operation is its
                // own kind of noise.
                //
                // An operation that raises its own panel keeps it: working.js is a
                // singleton, and a second one would replace the first and lose the detail
                // it was reporting. So this only opens one where there is none.
                // NOTHING TO LOAD, NOTHING TO RACE: THE STRIP IS BUILT HERE.
                //
                // This has now been reported three times as showing no feedback at all, and
                // the reason it kept not being fixed is that every version of it depended on
                // something else working first -- a module fetched through exec, a singleton
                // another panel might hold, a timer that had to win a race against the work
                // starting. Any one of those failing leaves a closed card and a silent
                // canvas, which is exactly what it looks like when nothing ran.
                //
                // So the thing that says "this is running" is a few lines of DOM made right
                // here, synchronously, out of nothing but document.createElement. It cannot
                // fail to load because there is nothing to load.
                //
                // It counts the seconds rather than only spinning: a number going up is
                // proof the page is alive, where a spinner alone can be a frozen animation.
                // And it stands aside for working.js -- an operation that raises its own
                // panel is saying something more specific ("Searching exon 3 of 22") and
                // should not have this underneath it.
                const SPIN_AFTER = 150;
                const runStrip = (label) => {
                    let el = null, tick = null, t0 = Date.now();
                    try {
                        el = document.createElement('div');
                        el.id = 'ec-running';
                        el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);'
                            + 'bottom:26px;z-index:2147483400;display:flex;align-items:center;'
                            + 'gap:12px;padding:12px 18px;border-radius:14px;'
                            + 'background:rgba(10,26,43,0.96);border:1px solid #1e4a6d;'
                            + 'box-shadow:0 10px 30px rgba(0,0,0,0.45);font:13px Arial;'
                            + 'color:#e8f1f8;max-width:min(92vw,820px);';
                        // The dot is drawn with a border and a keyframe added once, so there
                        // is no image, no SVG and no stylesheet to fetch.
                        if (!document.getElementById('ec-running-kf')) {
                            const st = document.createElement('style');
                            st.id = 'ec-running-kf';
                            st.textContent = '@keyframes ecspin{to{transform:rotate(360deg)}}';
                            document.head.appendChild(st);
                        }
                        el.innerHTML = '<span style="width:15px;height:15px;border-radius:50%;'
                            + 'border:2px solid rgba(159,196,212,0.35);border-top-color:#7fb0e8;'
                            + 'display:inline-block;animation:ecspin 0.9s linear infinite;"></span>'
                            + '<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;'
                            + 'white-space:nowrap;">' + H(label) + '</span>'
                            + '<span data-id="secs" style="color:#9fb3c8;white-space:nowrap;">0s</span>';
                        document.body.appendChild(el);
                        try { if (window.__bajaWorking) el.style.display = 'none'; } catch (e) { }
                        // A quarter second, not a second: the hand-off to an operation's own
                        // panel should not leave the two of them stacked for a whole beat.
                        tick = setInterval(() => {
                            try {
                                const n = el.querySelector('[data-id="secs"]');
                                if (n) n.textContent = Math.round((Date.now() - t0) / 1000) + 's';
                                // Out of the way of an operation's own panel, and back when
                                // that one goes.
                                el.style.display = window.__bajaWorking ? 'none' : 'flex';
                            } catch (e) { }
                        }, 250);
                    } catch (e) { el = null; }
                    return () => {
                        try { if (tick) clearInterval(tick); } catch (e) { }
                        try { if (el && el.parentNode) el.parentNode.removeChild(el); } catch (e) { }
                    };
                };
                const withSpinner = async (p0, run) => {
                    const title = (p0 && p0.text) ? ('' + p0.text) : 'Working';
                    const label = title.length > 110 ? (title.slice(0, 108) + '\u2026') : title;
                    let stop = null, settled = false;
                    const timer = setTimeout(() => {
                        if (settled) return;
                        stop = runStrip(label);
                    }, SPIN_AFTER);
                    try {
                        return await run();
                    } finally {
                        settled = true;
                        try { clearTimeout(timer); } catch (e) { }
                        try { if (stop) stop(); } catch (e) { }
                    }
                };

                if (go) go.onclick = async () => {
                    // Read BEFORE the panel closes: the boxes go with it.
                    const picked = chosen();
                    if (!picked.length) return;
                    go.disabled = true;
                    // CLOSED BEFORE THE WORK, not after. A step that opens a dialog of its
                    // own -- the tiling designer, a library, a confirm -- was opening BEHIND
                    // this, because this was the newer layer on the screen. The plan has been
                    // read and accepted by the time this runs, so there is nothing left here
                    // to look at, and what the steps report goes to the status line anyway.
                    close();
                    // IN ORDER, AND STOPPING AT THE FIRST FAILURE. A later step is usually
                    // written against what an earlier one produced, so carrying on past a
                    // failure runs the rest against a canvas that never reached the state
                    // they assume.
                    let ran = 0, failed = null;
                    for (const x of picked) {
                        // Re-checked HERE, against the canvas as the previous steps left it.
                        // This is the only check that can be trusted for a later step, and it
                        // is what makes allowing them above safe rather than optimistic.
                        let now = null;
                        try { now = CAP.preview(x.step); } catch (e) { now = null; }
                        if (now && now.ok && now.blocker) { failed = now.capability.name + ': ' + now.blocker; break; }
                        // Inside a multi-step plan there is no card to ask on: a step that fits
                        // several tracks stops the plan and names them.
                        if (now && now.ok && now.choices) {
                            failed = now.capability.name + ': more than one track fits (' + now.choices.map((o) => o.label).join(', ') + '): name the one you mean';
                            break;
                        }
                        try { await withSpinner(now && now.ok ? now : x.p,
                            () => (now && now.ok ? now.capability.run(now.args) : x.p.capability.run(x.p.args))); ran++; }
                        catch (e) { failed = (x.p.capability.name + ': ' + (e && e.message ? e.message : e)); break; }
                    }
                    // Operations report their own outcome; only a multi-step plan or a
                    // failure needs a line of its own, or the roll-up buries what they said.
                    loggedRan(ran);
                    if (failed) result('Stopped after ' + ran + ' of ' + picked.length + ': ' + failed);
                    else if (picked.length > 1) result('Ran ' + ran + ' steps.');
                    else if (picked.length < good.length) result('Ran the one step you picked.');
                    done(ran);
                };
            };

            // A PLAN THAT COULD NOT BE MADE IS NOT THE END OF THE ASK BOX.
            //
            // The planner is a server call: the service can be down, the request can time
            // out, or the model can decline it. "add pathological mutations in selected
            // sequence on smn1" was declined outright, though in this editor that is
            // load_variants with ClinVar over the selection -- the annotation job a genome
            // browser does. The card said "Could not read that" and stopped, which leaves
            // someone with a correct request and nowhere to go.
            //
            // So the editor says what it thinks the request is about, from its own catalogue,
            // and offers those operations as cards to open. It does not run them and it does
            // not fill in arguments: a guess is offered, never taken.
            const planFailed = (why) => {
                // THE EDITOR PLANS ITS OWN ADVERTISED REQUEST. The bar above this box offers
                // "load clinvar pathogenic snps" in those words; when the planner cannot
                // answer, the catalogue can still place that one itself. It is a real plan
                // card with a GO, not a button that opens an empty form, because the request
                // was complete -- the database and the filter were in the sentence.
                let own = null;
                try { own = CAP.localPlan(q('#ec-q').value); } catch (e) { own = null; }
                if (own) {
                    const p0 = CAP.preview(own);
                    if (p0 && p0.ok) {
                        render({ status: 'OK', steps: [own],
                            explain: 'planned here: the service could not be reached' },
                            ('' + q('#ec-q').value).trim());
                        return;
                    }
                }
                let near = [];
                try { near = CAP.suggest(q('#ec-q').value, 3) || []; } catch (e) { near = []; }
                const btn = 'cursor:pointer;border-radius:8px;padding:7px 12px;font:700 12px Arial;'
                    + 'border:1px solid #2d6b9a;background:transparent;color:#9fd0f5;margin:6px 6px 0 0;';
                q('#ec-out').innerHTML =
                    '<div style="font:12.5px Arial;color:#fca5a5;">Could not plan that here'
                    + (why ? (': ' + H(why)) : '.') + '</div>'
                    + (near.length
                        ? ('<div style="font:12.5px Arial;color:#9fb3c8;margin-top:9px;">'
                            + 'The editor has these, which may be what you meant:</div>'
                            + '<div>' + near.map((c) => '<button data-cap="' + H(c.name) + '" style="' + btn + '">'
                                + H(c.name.replace(/_/g, ' ')) + '</button>').join('') + '</div>')
                        : '')
                    + dismissRow('ec-x2');
                wireDismiss('ec-x2');
                for (const b of q('#ec-out').querySelectorAll('button[data-cap]')) {
                    b.onclick = () => render({ status: 'OK', steps: [{ capability: b.getAttribute('data-cap'), args: {} }] },
                        ('' + q('#ec-q').value).trim());
                }
            };

            // ONE MISSING FACT IS A QUESTION, NOT A REFUSAL. "What motifs are created from
            // the variants on the screen" was answered with a paragraph explaining that the
            // question did not really apply, which is both wrong and the least useful thing
            // to do with a reasonable request: it is a good question with two good answers,
            // peptide motifs or sequence elements, and which one is meant is one press away.
            // Asked here, before the planner, and only when the sentence is short of
            // exactly that fact.
            const renderChoice = (c, ask) => {
                const out = q('#ec-out');
                out.innerHTML = card(
                    '<div style="font:700 13px Arial;color:#7fb0e8;">' + H(c.title) + '</div>'
                    + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:5px;">from \u201c'
                    + H(ask) + '\u201d \u00b7 ' + H(c.subtitle || '') + '</div>'
                    + c.options.map((o2, i) => '<div style="display:flex;align-items:center;gap:12px;'
                        + 'padding:10px 0;border-top:1px solid rgba(255,255,255,0.08);">'
                        + '<div style="min-width:0;flex:1 1 auto;">'
                        + '<div style="font:700 12.5px Arial;color:#e8f0fb;">' + H(o2.label) + '</div>'
                        + (o2.detail ? ('<div style="font:11px Arial;color:#6b8299;margin-top:3px;">'
                            + H(o2.detail) + '</div>') : '')
                        + '</div>'
                        + '<button id="ec-k' + i + '" style="cursor:pointer;border-radius:8px;'
                        + 'padding:8px 16px;font:700 12.5px Arial;border:1px solid #22c55e;'
                        + 'background:#22c55e;color:#04210f;flex:0 0 auto;">GO</button></div>').join('')
                    + '<div style="display:flex;gap:10px;margin-top:13px;">'
                    + '<button id="ec-kno" style="' + btn + '">Ask something else</button></div>');
                const no = q('#ec-kno');
                if (no) no.onclick = () => {
                    if (HOST) { done(0); return; }
                    out.innerHTML = ''; try { q('#ec-q').value = ''; q('#ec-q').focus(); } catch (e) { }
                };
                c.options.forEach((o2, i) => {
                    const b = q('#ec-k' + i);
                    if (!b) return;
                    b.onclick = async () => {
                        b.disabled = true;
                        // The choice is part of the request, so it is what the log keeps:
                        // "the peptide half of this sentence" is what would be run again.
                        logged({ ask: ask, status: 'OK',
                                 steps: [{ capability: o2.capability.name, args: o2.args || {} }] });
                        close();
                        try { await o2.capability.run(o2.args || {}); loggedRan(1); done(1); }
                        catch (e) {
                            result(o2.capability.name + ': ' + (e && e.message ? e.message : e));
                            done(0);
                        }
                    };
                });
            };

            const run = async () => {
                if (busy) return;
                const ask = ('' + q('#ec-q').value).trim();
                if (!ask) { try { q('#ec-q').focus(); } catch (e) { } return; }
                {
                    let c = null;
                    try { c = CAP.clarify ? CAP.clarify(ask) : null; } catch (e) { c = null; }
                    if (c && c.options && c.options.length > 1) { renderChoice(c, ask); return; }
                }
                // ONE REQUEST AT A TIME, ACROSS INSTANCES.
                //
                // `busy` only guards this one. The toolbar's input execs a fresh copy of this
                // module on every Enter, each with its own busy=false, so pressing Enter twice
                // -- the obvious thing to do when the first press seemed to do nothing -- used
                // to start a second request alongside the first. The flag lives on the graph,
                // where every copy can see it, and is cleared in a finally so a failure cannot
                // wedge the box shut.
                try { if (graph.__ecInFlight) { setBusy(true, 'Working'); return; } } catch (e) { }
                try { graph.__ecInFlight = true; } catch (e) { }
                busy = true;
                setBusy(true, 'Working');
                q('#ec-out').innerHTML = '';
                let r = null;
                try {
                    const em = new EngineMonitor((m) => { try { log(m); } catch (e) { } });
                    r = await exec(window['env']['apiUrl'] + '/py/bio/editor/plan.py',
                        em, ask, JSON.stringify(CAP.catalogue()), JSON.stringify(context()), '');
                } catch (e) {
                    busy = false; try { graph.__ecInFlight = false; } catch (e2) { } setBusy(false);
                    planFailed(e && e.message ? e.message : e);
                    return;
                }
                busy = false; try { graph.__ecInFlight = false; } catch (e) { } setBusy(false);
                if (!r || r.status !== 'OK') {
                    // A request that found no plan is kept too: "it did not understand this"
                    // is the thing worth looking back at, and losing it leaves the log
                    // reading as though the editor always knew what was meant.
                    logged({ ask: ask, status: (r && r.status) || 'NO PLAN',
                             error: (r && r.error) || '', steps: [] });
                    planFailed(r && r.error ? r.error : '');
                    return;
                }
                logged({ ask: ask, status: 'OK', steps: (r.steps || []) });
                render(r, ask);
            };

            if (!HOST) {
                q('#ec-q').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); run(); } };
                try { q('#ec-q').focus(); } catch (e) { }
                // Typed in the toolbar: the panel opens with the request already in it and
                // already read, rather than an empty box to type it into a second time.
                const pre = ('' + (OPT.prefill || '')).trim();
                if (pre) { q('#ec-q').value = pre; run(); }
            } else {
                // Hosted: the request came with the call, so run it straight away rather
                // than waiting for an input that is not here.
                q('#ec-q').value = ('' + (OPT.prefill || '')).trim();
                if (q('#ec-q').value) run(); else done(0);
            }
        });
    })();
}
