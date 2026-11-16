function (graph, options) {

    // SEARCH THE VARIANTS ON THE OPEN TRACKS, AND LIGHT UP WHAT MATCHES.
    //   await exec('baja/data/variant-search.js', graph);
    //   await exec('baja/data/variant-search.js', graph, { track: t, query: 'patho* -conflict' });
    //
    // A track can carry hundreds of variants and the only ways to find one were to know
    // where it sits or to read every marker. This searches what each record actually says
    // -- its name, gene, clinical call, condition, consequence, source, alleles and raw
    // annotation fields -- and selects the hits, which is the same highlight a click gives,
    // so every other part of the app already knows what a selected variant means.
    //
    // WILDCARDS, AND WHY A BARE WORD IS NOT ONE. A term containing * or ? is matched as a
    // pattern against the WHOLE field: 'patho*' is a field starting with patho, '?73?' is
    // four characters. A term without either is matched as a SUBSTRING, because that is
    // what someone typing 'arg175' means, and making them type '*arg175*' to get it would
    // be a worse tool that was easier to describe.
    //
    // THE QUERY IS NOT A REGULAR EXPRESSION, deliberately. Everything except * and ? is
    // escaped before the pattern is built, so a condition like "Li-Fraumeni syndrome 1"
    // searches for the characters the user typed rather than quietly meaning something
    // else, and no input can cost more than a linear scan.

    const o = options || {};

    // ---------------------------------------------------------------- the matcher ------
    // Separated out and free of the DOM and of SnpIndel on purpose: this is the part that
    // has to be right, and it can be run against a table of records on its own.

    // One term of the query, already split off from the rest.
    //   -x      the field must NOT match x
    //   f:x     only field f is tested
    //   "a b"   spaces kept
    const TERM = /"([^"]*)"|(\S+)/g;
    // Every field a record carries, in the order the dialog lists them. Declared here
    // because the matcher walks it for an unscoped pattern.
    const FIELDS = ['name', 'gene', 'clinsig', 'condition', 'consequence', 'source',
        'type', 'ref', 'alt', 'change', 'pos', 'annotations', 'batch'];
    const esc = (s) => ('' + s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const compileTerm = (raw) => {
        let t = '' + raw;
        let negate = false;
        if (t[0] === '-' && t.length > 1) { negate = true; t = t.slice(1); }
        let field = null;
        const c = t.indexOf(':');
        if (c > 0 && !/[*?]/.test(t.slice(0, c))) { field = t.slice(0, c).toLowerCase(); t = t.slice(c + 1); }
        if (!t) return null;
        const wild = /[*?]/.test(t);
        let test;
        if (wild) {
            // * and ? survive escaping as themselves, then become their regex equivalents.
            // Anchored, because a pattern is a statement about the whole field.
            const rx = new RegExp('^' + esc(t).replace(/\\\*/g, '[\\s\\S]*').replace(/\\\?/g, '[\\s\\S]') + '$', 'i');
            test = (s) => rx.test(s);
        } else {
            const needle = t.toLowerCase();
            test = (s) => ('' + s).toLowerCase().indexOf(needle) >= 0;
        }
        return { field: field, negate: negate, wild: wild, test: test, text: raw };
    };

    // rec is { all: str, <field>: str }. A term naming a field this record has not got
    // cannot match, which is what makes `gene:TP53` exclude records carrying no gene rather
    // than silently passing them.
    //
    // AN UNSCOPED WILDCARD IS TESTED FIELD BY FIELD, not against `all`. `all` is a
    // concatenation, not a field, and anchoring a pattern to it asks the pattern to describe
    // the entire record: 'patho*' against it means "a record whose text STARTS with patho",
    // which is nothing, and the user who typed it meant "something here starts with patho".
    // So a pattern matches when any one field matches it whole. A bare word is a substring
    // either way, and `all` is the cheaper way to ask the same question.
    const compileQuery = (text) => {
        const terms = [];
        let m;
        TERM.lastIndex = 0;
        while ((m = TERM.exec('' + (text || ''))) !== null) {
            const t = compileTerm(m[1] != null ? m[1] : m[2]);
            if (t) terms.push(t);
        }
        if (!terms.length) return null;
        const fn = (rec) => {
            for (const t of terms) {
                let hit;
                if (t.field != null) {
                    const hay = rec[t.field];
                    hit = (hay == null) ? false : t.test(hay);
                } else if (t.wild) {
                    hit = false;
                    for (const k of FIELDS) { if (rec[k] != null && t.test(rec[k])) { hit = true; break; } }
                } else {
                    hit = t.test(rec.all);
                }
                if (t.negate ? hit : !hit) return false;
            }
            return true;
        };
        fn.terms = terms;
        return fn;
    };

    // ---------------------------------------------------------------- the record -------
    const recordOf = (v) => {
        const g = (f) => { try { return f(); } catch (e) { return ''; } };
        let cons = '';
        try {
            const c = v._consequence ? v._consequence() : null;
            if (c) cons = (c.term || '') + ' ' + (c.phrase || '');
            else cons = '' + (v.structure || '');
        } catch (e) { cons = '' + (v.structure || ''); }
        const rec = {
            name: '' + ((v.name || v.id || '') + ''),
            gene: g(() => (v.geneSymbol ? v.geneSymbol() : '')) || '',
            clinsig: '' + (v.clinsig || ''),
            condition: '' + (v.clindn || ''),
            consequence: cons,
            source: '' + (v.source || ''),
            type: '' + (v.type || ''),
            ref: '' + (v.reference || ''),
            alt: '' + (v.alternate || ''),
            change: ('' + (v.reference || '')) + '>' + ('' + (v.alternate || '')),
            pos: '' + (v.xi != null ? v.xi : ''),
            annotations: (Array.isArray(v.annotations) ? v.annotations.join(' ') : ('' + (v.annotations || ''))),
            batch: '' + (v.batchLabel || '')
        };
        rec.all = FIELDS.map((k) => rec[k]).join(' ');
        return rec;
    };

    // Callers that only want the engine (a test, or another module) take it and stop here.
    if (o.engineOnly) return { compileQuery: compileQuery, recordOf: recordOf, FIELDS: FIELDS };

    return (async () => {
        const tracks = (o.track ? [o.track] : (graph.track || [])).filter((t) => t && t.snpindels);
        const say = (m) => { try { graph.setResultMessage(' ' + m + ' '); } catch (e) { } };

        // Every variant in scope, paired with the record searched and the track it is on.
        const rows = [];
        for (const t of tracks) for (const v of (t.snpindels || [])) rows.push({ t: t, v: v, rec: recordOf(v) });

        if (!rows.length) { say('No variants on the open tracks to search.'); return { matched: 0 }; }

        const clearAll = () => { for (const r of rows) { try { r.v.deselect(); } catch (e) { } } };
        const redraw = () => { try { if (graph.wake) graph.wake(); } catch (e) { } };

        // A run with a query already in hand (a menu entry, a repeat) skips the dialog.
        const run = (text) => {
            const q = compileQuery(text);
            clearAll();
            if (!q) { redraw(); return []; }
            const hits = rows.filter((r) => q(r.rec));
            for (const r of hits) { try { r.v.select(); } catch (e) { } }
            redraw();
            return hits;
        };

        if (o.query != null) {
            const hits = run(o.query);
            say(hits.length + ' variant' + (hits.length === 1 ? '' : 's') + ' matched "' + o.query + '".');
            return { matched: hits.length, hits: hits.map((h) => h.v) };
        }

        return new Promise((resolve) => {
            const H = (s) => ('' + (s == null ? '' : s))
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            try { const old = document.getElementById('baja-variant-search'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
            const inp = 'width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;'
                + 'border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:9px 11px;font:13px Arial;';
            const panel = document.createElement('div');
            panel.id = 'baja-variant-search';
            panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#fff;'
                + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';
            panel.innerHTML = ''
                + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:16px 22px 14px;'
                + 'background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);box-shadow:0 6px 20px rgba(0,0,0,0.35);">'
                + '<div style="min-width:0;"><div style="font:700 20px Arial;">Find variants</div>'
                + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">'
                + 'Searches ' + rows.length + ' variant' + (rows.length === 1 ? '' : 's') + ' on '
                + tracks.length + ' track' + (tracks.length === 1 ? '' : 's') + '. Matches are selected on the track.</div></div>'
                + '<div style="margin-left:auto;display:flex;gap:10px;">'
                + '<button id="vs-clear" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Clear</button>'
                + '<button id="vs-done" style="cursor:pointer;border-radius:8px;padding:9px 18px;font:700 12.5px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">Done</button>'
                + '</div></div>'
                + '<div style="flex:1 1 auto;overflow:auto;padding:24px 22px 32px;">'
                + '<div style="width:100%;max-width:760px;margin:0 auto;">'
                + '<input id="vs-q" placeholder="patho*  -conflict" style="' + inp + '"/>'
                + '<div style="font:12px Arial;color:#9fb3c8;margin-top:8px;line-height:1.7;">'
                + '<b>*</b> any run, <b>?</b> one character, matched against the whole field. '
                + 'A word with neither is matched anywhere in the text.<br>'
                + 'Terms are separated by spaces and ALL must match. <b>-term</b> excludes. '
                + '<b>"two words"</b> keeps the space.<br>'
                + 'Restrict to one field with <b>field:term</b> &mdash; ' + FIELDS.join(', ') + '.'
                + '</div>'
                + '<div id="vs-count" style="font:700 13px Arial;color:#7fb0e8;margin:16px 0 8px;"></div>'
                + '<div id="vs-list"></div>'
                + '</div></div>';
            document.body.appendChild(panel);
            const q = (s) => panel.querySelector(s);
            const close = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };

            let hits = [];
            const render = () => {
                const text = q('#vs-q').value;
                hits = run(text);
                if (!('' + text).trim()) {
                    q('#vs-count').textContent = '';
                    q('#vs-list').innerHTML = '';
                    return;
                }
                q('#vs-count').textContent = hits.length + ' of ' + rows.length + ' matched';
                // A COUNT IS NOT AN ANSWER when the hits are off screen. The first forty are
                // listed with what matched about them, and each one zooms to its own marker.
                const show = hits.slice(0, 40);
                q('#vs-list').innerHTML = show.map((h, i) => {
                    const r = h.rec;
                    const bits = [r.gene, r.change, r.clinsig, r.consequence, r.condition]
                        .map((x) => ('' + x).trim()).filter(Boolean).join(' · ');
                    return '<div data-i="' + i + '" style="cursor:pointer;padding:9px 12px;margin-bottom:6px;'
                        + 'border-radius:8px;background:#0a1e3a;border:1px solid rgba(255,255,255,0.12);">'
                        + '<div style="font:700 13px Arial;color:#e8f0fb;">' + H(r.name || '(unnamed)') + '</div>'
                        + (bits ? '<div style="font:12px Arial;color:#9fb3c8;margin-top:3px;">' + H(bits) + '</div>' : '')
                        + '</div>';
                }).join('') + (hits.length > show.length
                    ? ('<div style="font:12px Arial;color:#9fb3c8;margin-top:6px;">'
                        + (hits.length - show.length) + ' more are selected on the track but not listed here.</div>')
                    : '');
                for (const el of q('#vs-list').querySelectorAll('[data-i]')) {
                    el.onclick = async () => {
                        const h = show[+el.getAttribute('data-i')];
                        if (!h) return;
                        // Zoom to it, but do NOT focus-mutation it: that greys out every other
                        // match, which is the opposite of what a search result wants.
                        try {
                            const tg = h.t.tgraph, w = 40;
                            const cy = (tg.yi + (tg.yi + (tg.height || 0))) / 2, span = Math.abs(tg.height || 0) || 0.1;
                            if (graph.zoomRect) graph.zoomRect(tg.X(h.v.xi - w), tg.X(h.v.xi + w), cy + span * 3.6, cy - span * 2.2, 400);
                        } catch (e) { }
                        redraw();
                    };
                }
            };

            // The editor listens on the window for keys and pastes; without this a typed
            // query is also read as something to do to the canvas.
            for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
                panel.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
            }
            panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); resolve({ matched: hits.length }); } });
            q('#vs-q').oninput = render;
            q('#vs-clear').onclick = () => { q('#vs-q').value = ''; render(); };
            q('#vs-done').onclick = () => {
                close();
                say(hits.length + ' variant' + (hits.length === 1 ? '' : 's') + ' selected'
                    + (hits.length ? '. Click an empty part of a track to clear the selection.' : '.'));
                resolve({ matched: hits.length, hits: hits.map((h) => h.v) });
            };
            if (o.prefill) { q('#vs-q').value = '' + o.prefill; }
            try { q('#vs-q').focus(); } catch (e) { }
            render();
        });
    })();
}
