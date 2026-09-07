function (server, graph, genegraph_panel_layout, text) {
    // A PAGE OF TEXT WAS PASTED ONTO THE CANVAS. What in it can be put on the board?
    //
    // Pasting a sequence has always worked, and pasting a transcript id has always worked.
    // Pasting an abstract, a clinical letter or a paragraph from a paper did nothing at all --
    // the handler looked for runs of ACGT, found none, and dropped it. But that text usually
    // names exactly the things this application loads: a transcript, a gene, a condition, a
    // specific change. So it is read, and what is in it is offered.
    //
    // NOTHING IS LOADED WITHOUT BEING SHOWN FIRST. The list is a proposal with tickboxes, not
    // an action -- a paste is a cheap gesture and it must not be able to rearrange the board
    // on its own. And nothing on the list was invented: py/bio/read-pasted-text.py drops any
    // transcript id or mutation label that does not appear VERBATIM in the pasted text, so a
    // CFTR paper cannot come back offering F508del unless the paper says F508del.
    //
    // What it does with the answer is what the rest of the application already does:
    //   transcripts / genes   baja/data/prompt-load-transcript.js
    //   mutations, disease    baja/data/variant-from-prompt.js, pinned to what was just loaded
    // so a change lands only on the transcripts this paste brought in.
    const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };
    const restoreHover = () => { try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { } };

    return (async () => {
        const src = ('' + (text || '')).trim();
        if (!src) return false;

        let r = null;
        try {
            const em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
            say('Reading the pasted text…');
            r = await exec(server + '/py/bio/read-pasted-text.py', em, src);
        } catch (e) { r = null; }

        if (!r || r.error) {
            say('The pasted text could not be read' + ((r && r.error) ? ': ' + r.error : '') + '.');
            return false;
        }
        let transcripts = [], genes = [], diseases = [], mutations = [];
        try { transcripts = JSON.parse(r.transcripts || '[]'); } catch (e) { }
        try { genes = JSON.parse(r.genes || '[]'); } catch (e) { }
        try { diseases = JSON.parse(r.diseases || '[]'); } catch (e) { }
        try { mutations = JSON.parse(r.mutations || '[]'); } catch (e) { }

        if (!transcripts.length && !genes.length && !diseases.length && !mutations.length) {
            // Say so and stop. A paste that names nothing loadable is not an error, and a
            // dialog offering an empty list is worse than a sentence.
            say('Nothing loadable was found in the pasted text'
                + (r.note ? ' — ' + r.note : '') + '.');
            return false;
        }

        // ---- the panel ----------------------------------------------------------------------
        const shell = (opts) => {
            try { const old = document.getElementById('baja-paste-read'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
            const panel = document.createElement('div');
            panel.id = 'baja-paste-read';
            panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#fff;'
                + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';
            const btn = (id, t, primary) => '<button id="' + id + '" style="cursor:pointer;border-radius:8px;'
                + 'padding:9px ' + (primary ? '18px' : '16px') + ';font:700 12.5px Arial;'
                + (primary ? 'border:1px solid #22c55e;background:#22c55e;color:#04210f;'
                    : 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;') + '">' + esc(t) + '</button>';
            panel.innerHTML = ''
                + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:16px 22px 14px;'
                + 'background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);box-shadow:0 6px 20px rgba(0,0,0,0.35);">'
                + '<div style="min-width:0;">'
                + '<div style="font:700 20px Arial;">' + esc(opts.title) + '</div>'
                + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">' + esc(opts.subtitle) + '</div></div>'
                + '<div style="margin-left:auto;display:flex;gap:10px;">'
                + btn('pt-cancel', 'Cancel', false) + btn('pt-go', 'Load', true)
                + '</div></div>'
                + '<div style="flex:1 1 auto;overflow:auto;padding:24px 22px 32px;">'
                + '<div style="width:100%;max-width:720px;margin:0 auto;">' + opts.body + '</div></div>';
            document.body.appendChild(panel);
            for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
                panel.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
            }
            return panel;
        };

        const LBL = 'display:block;font:600 12px Arial;color:#9fb3c8;margin:20px 0 6px;';
        const row = (kind, i, head, sub, checked, badge) =>
            '<label style="display:flex;align-items:flex-start;gap:10px;padding:11px 12px;margin-bottom:8px;'
            + 'border-radius:8px;background:#0a1e3a;border:1px solid rgba(255,255,255,0.16);cursor:pointer;">'
            + '<input type="checkbox" class="pt-' + kind + '" data-i="' + i + '" style="margin-top:3px;"'
            + (checked ? ' checked' : '') + '/>'
            + '<span style="min-width:0;">'
            + '<span style="font:700 13.5px Arial;color:#e8f0fb;">' + esc(head) + '</span>'
            + (badge ? '<span style="margin-left:8px;border-radius:20px;padding:2px 8px;font:700 10.5px Arial;'
                + 'background:rgba(148,163,184,0.16);border:1px solid rgba(148,163,184,0.45);color:#cbd5e1;">'
                + esc(badge) + '</span>' : '')
            + (sub ? '<br/><span style="font:12px Arial;color:#9fb3c8;">' + esc(sub) + '</span>' : '')
            + '</span></label>';

        let body = '';
        if (r.summary) {
            body += '<div style="padding:12px 14px;border-radius:8px;background:rgba(56,189,248,0.10);'
                + 'border:1px solid rgba(56,189,248,0.35);color:#cfe9ff;font:13px Arial;">'
                + esc(r.summary) + '</div>';
        }
        if (transcripts.length) {
            body += '<label style="' + LBL + '">Transcripts named in the text</label>'
                + transcripts.map((t, i) => row('t', i, t.id, t.why, true, '')).join('');
        }
        if (genes.length) {
            // A gene is ticked only when the text does not already name a transcript: loading
            // the canonical transcript of a gene the paper gave an id for would put the same
            // gene on the board twice.
            body += '<label style="' + LBL + '">Genes</label>'
                + genes.map((g, i) => row('g', i, g.symbol, g.why, !transcripts.length,
                    g.quoted ? '' : 'inferred')).join('');
        }
        if (mutations.length) {
            body += '<label style="' + LBL + '">Changes named in the text</label>'
                + mutations.map((m, i) => row('m', i, (m.gene ? m.gene + ' ' : '') + m.label, m.why, true, '')).join('');
        }
        if (diseases.length) {
            // Not ticked by default when the text already names its changes: those ARE what
            // the paper is about, and enumerating the condition on top of them puts a second,
            // broader set beside the specific ones that were asked for.
            body += '<label style="' + LBL + '">Conditions</label>'
                + diseases.map((d, i) => row('d', i, d.name, d.why, !mutations.length,
                    d.quoted ? '' : 'inferred')).join('');
        }
        body += '<div style="font:12px Arial;color:#9fb3c8;margin-top:18px;">'
            + 'Transcripts and genes are loaded first; the changes are then placed on those '
            + 'transcripts only. Nothing already on the board is touched.</div>';

        const pick = await new Promise((resolve) => {
            const panel = shell({
                title: 'Found in the pasted text',
                subtitle: src.length.toLocaleString() + ' characters read'
                    + (r.note ? ' · ' + r.note : ''),
                body: body,
            });
            const q = (s) => panel.querySelector(s);
            const qa = (s) => Array.prototype.slice.call(panel.querySelectorAll(s));
            const close = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
            panel.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') { close(); resolve(null); }
                else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) q('#pt-go').click();
            });
            q('#pt-cancel').onclick = () => { close(); resolve(null); };
            q('#pt-go').onclick = () => {
                const chosen = (kind, list) => qa('.pt-' + kind).filter((c) => c.checked)
                    .map((c) => list[+c.getAttribute('data-i')]).filter(Boolean);
                const out = {
                    transcripts: chosen('t', transcripts), genes: chosen('g', genes),
                    mutations: chosen('m', mutations), diseases: chosen('d', diseases),
                };
                if (!out.transcripts.length && !out.genes.length
                    && !out.mutations.length && !out.diseases.length) {
                    say('Tick something to load.'); return;
                }
                close(); resolve(out);
            };
        });
        if (!pick) { restoreHover(); return false; }

        // ---- load the transcripts -----------------------------------------------------------
        const before = new Set((graph.track || []));
        const wanted = pick.transcripts.map((t) => t.id)
            .concat(pick.genes.map((g) => 'canonical ' + g.symbol + ' in human'));
        for (let i = 0; i < wanted.length; i++) {
            say('Loading ' + wanted[i] + ' — ' + (i + 1) + ' of ' + wanted.length + '…');
            try { await exec('baja/data/prompt-load-transcript.js', server, graph, genegraph_panel_layout, wanted[i]); }
            catch (e) { }
        }
        const loaded = (graph.track || []).filter((t) => t && !before.has(t));

        // ---- and the changes on them --------------------------------------------------------
        // Pinned to what this paste loaded. A change named in a CFTR paper belongs on the CFTR
        // transcript that came with it, not on whatever else the board happens to be showing.
        const asks = pick.mutations.map((m) => ((m.gene ? m.gene + ' ' : '') + m.label))
            .concat(pick.diseases.map((d) => d.name));
        if (!loaded.length) {
            say(wanted.length
                ? 'No transcript could be loaded from the pasted text.'
                : 'Nothing was loaded: tick a transcript or a gene to place changes on.');
            restoreHover();
            return false;
        }
        let placed = 0;
        for (const ask of asks) {
            say('Placing ' + ask + '…');
            try {
                const ok = await exec('baja/data/variant-from-prompt.js', server, graph,
                    genegraph_panel_layout, loaded, ask);
                if (ok) placed++;
            } catch (e) { }
        }
        say('Loaded ' + loaded.length + ' transcript' + (loaded.length === 1 ? '' : 's')
            + (asks.length ? ' and placed ' + placed + ' of ' + asks.length + ' change'
                + (asks.length === 1 ? '' : 's') : '')
            + ' from the pasted text.');
        try { if (graph.wake) graph.wake(); } catch (e) { }
        restoreHover();
        return true;
    })();
}
