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
        const VS = CAP.VS, F = CAP.F;

        if (!CAP.tracks().length) { say('Load a track first.'); return 0; }

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
                    selection: (t.markend > t.markstart)
                        ? { start: Math.floor(t.markstart), end: Math.ceil(t.markend),
                            length: Math.ceil(t.markend) - Math.floor(t.markstart) } : null
                })).slice(0, 12),
                has_selection: sel.length > 0,
                tracks_with_a_selection: sel.length,
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
                + '<div style="min-width:0;"><div style="font:700 17px Arial;">Ask the editor</div>'
                + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">'
                + CAP.list.length + ' operations · ' + ctx.variants_total + ' variants ('
                + ctx.variants_on_screen + ' on screen) · ' + ctx.compounds_total + ' compounds · '
                + H(selNote) + '</div></div>'
                + '<div style="margin-left:auto;"><button id="ec-close" style="' + btn + '">Close</button></div>'
                + '</div>'
                + '<div style="padding:18px 20px 22px;">'
                + '<input id="ec-q" placeholder="load clinvar pathogenic snp indels into selected sequence" style="' + inp + '"/>'
                + '<div style="display:flex;align-items:center;gap:10px;margin-top:11px;">'
                + '<button id="ec-run" style="cursor:pointer;border-radius:8px;padding:10px 20px;font:700 13px Arial;'
                + 'border:1px solid #22c55e;background:#22c55e;color:#04210f;">Go</button>'
                + '<button id="ec-what" style="' + btn + '">What can it do?</button>'
                + '<div id="ec-busy" style="font:12.5px Arial;color:#9fb3c8;"></div></div>'
                + '<div style="font:12px Arial;color:#9fb3c8;margin-top:14px;line-height:1.8;">'
                + '<b>Load:</b> clinvar pathogenic snps and indels over the selection · gnomad variants · '
                + 'put the known ASO and siRNA layer on<br>'
                + '<b>Run a model:</b> which RBP binds this · splice site strength here · '
                + 'microRNA sites in the selection<br>'
                + '<b>Select a region:</b> select the 3\u2032 UTR · select exon 5 · select the CDS · '
                + 'deselect the sequence<br>'
                + '<b>Select or remove:</b> select all snps · select every red compound · '
                + 'remove the benign ones · go to DNM3<br>'
                + '<b>Ask:</b> are any of these snps pathogenic · which of these hit a splice site<br>'
                + 'It picks from the operations the editor has, shows you which and with what, '
                + 'and runs nothing until you say so.'
                + '</div>'
                + '<div id="ec-out" style="margin-top:16px;"></div>'
                + '</div></div>';
            document.body.appendChild(panel);
            }

            const q = (s) => panel.querySelector(s);
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
            if (q('#ec-what')) q('#ec-what').onclick = () => {
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

                q('#ec-busy').textContent = 'reading ' + rows.length + ' variant' + (rows.length === 1 ? '' : 's') + '…';
                let a = null;
                try {
                    const em = new EngineMonitor((m) => { try { log(m); } catch (e) { } });
                    a = await exec(window['env']['apiUrl'] + '/py/bio/editor/variant-question.py',
                        em, ask, JSON.stringify(rows.map(askRecord)), '');
                } catch (e) {
                    q('#ec-busy').textContent = '';
                    out.innerHTML = '<div style="font:12.5px Arial;color:#fca5a5;">Could not answer that: '
                        + H(e && e.message ? e.message : e) + '</div>' + dismissRow('ec-x5');
                    wireDismiss('ec-x5');
                    return 0;
                }
                q('#ec-busy').textContent = '';
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
                    out.innerHTML = card(
                        '<div style="font:700 13.5px Arial;color:#e8f0fb;">Nothing in the editor does that.</div>'
                        + bad.map((x) => '<div style="font:12.5px Arial;color:#fca5a5;margin-top:7px;">'
                            + '&#9888; refused: ' + H(x.p.text) + '</div>').join('')
                        + warn
                        + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:9px;line-height:1.7;">'
                        + (HOST ? 'Ask the editor for the full list of operations.'
                            : 'Press “What can it do?” for the full list.') + '</div>'
                        + dismissRow('ec-x1'));
                    wireDismiss('ec-x1');
                    return;
                }

                // A single question is answered rather than planned.
                if (good.length === 1 && !bad.length && good[0].p.answers) { answer(good[0].step, ask); return; }

                const danger = good.some((x) => x.p.destructive);
                // A LATER STEP'S PRECONDITION IS USUALLY THE EARLIER STEP'S OUTPUT. "select the
                // 3' UTR, then run BajaCLIP on it" has no selection at the moment the plan is
                // drawn, so judging step 2 against the canvas as it stands now drops the very
                // step the first one exists to enable. Only the FIRST step is blocked on the
                // state in front of us; a later one's unmet need is shown as what it expects,
                // and re-checked for real immediately before it runs.
                const runnable = good.filter((x, i) => (i === 0 ? !x.p.blocker : true));

                const row = (x, i) => {
                    const p = x.p;
                    const n = (p.count == null) ? '' : (' · ' + p.count + ' match' + (p.count === 1 ? '' : 'es'));
                    const args = Object.keys(x.step.args || {});
                    return '<div style="padding:10px 0;border-top:1px solid rgba(255,255,255,0.08);">'
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
                        + '</div>';
                };

                const verb = danger ? 'Run it' : (runnable.length > 1 ? ('Run all ' + runnable.length) : 'Run it');
                const nShown = good.length;
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
                    + '<button id="ec-no" style="' + btn + '">Cancel</button></div>',
                    danger ? 'rgba(248,113,113,0.5)' : null);

                q('#ec-no').onclick = () => {
                    if (HOST) { done(0); return; }
                    out.innerHTML = ''; try { q('#ec-q').focus(); } catch (e) { }
                };
                const go = q('#ec-go');
                if (go) go.onclick = async () => {
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
                    for (const x of runnable) {
                        // Re-checked HERE, against the canvas as the previous steps left it.
                        // This is the only check that can be trusted for a later step, and it
                        // is what makes allowing them above safe rather than optimistic.
                        let now = null;
                        try { now = CAP.preview(x.step); } catch (e) { now = null; }
                        if (now && now.ok && now.blocker) { failed = now.capability.name + ': ' + now.blocker; break; }
                        try { await (now && now.ok ? now.capability.run(now.args) : x.p.capability.run(x.p.args)); ran++; }
                        catch (e) { failed = (x.p.capability.name + ': ' + (e && e.message ? e.message : e)); break; }
                    }
                    // Operations report their own outcome; only a multi-step plan or a
                    // failure needs a line of its own, or the roll-up buries what they said.
                    if (failed) result('Stopped after ' + ran + ' of ' + runnable.length + ': ' + failed);
                    else if (runnable.length > 1) result('Ran all ' + ran + ' steps.');
                    done(ran);
                };
            };

            const run = async () => {
                if (busy) return;
                const ask = ('' + q('#ec-q').value).trim();
                if (!ask) { try { q('#ec-q').focus(); } catch (e) { } return; }
                busy = true;
                q('#ec-busy').textContent = 'working out what to run…';
                q('#ec-out').innerHTML = '';
                let r = null;
                try {
                    const em = new EngineMonitor((m) => { try { log(m); } catch (e) { } });
                    r = await exec(window['env']['apiUrl'] + '/py/bio/editor/plan.py',
                        em, ask, JSON.stringify(CAP.catalogue()), JSON.stringify(context()), '');
                } catch (e) {
                    busy = false; q('#ec-busy').textContent = '';
                    q('#ec-out').innerHTML = '<div style="font:12.5px Arial;color:#fca5a5;">Could not read that: '
                        + H(e && e.message ? e.message : e) + '</div>' + dismissRow('ec-x2');
                    wireDismiss('ec-x2');
                    return;
                }
                busy = false; q('#ec-busy').textContent = '';
                if (!r || r.status !== 'OK') {
                    q('#ec-out').innerHTML = '<div style="font:12.5px Arial;color:#fca5a5;">Could not read that'
                        + (r && r.error ? (': ' + H(r.error)) : '.') + '</div>' + dismissRow('ec-x3');
                    wireDismiss('ec-x3');
                    return;
                }
                render(r, ask);
            };

            if (q('#ec-run')) q('#ec-run').onclick = run;
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
