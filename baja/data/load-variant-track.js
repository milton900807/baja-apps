function (server, graph, genegraph_panel_layout) {
    // Load a variant track, in two steps.
    //
    //   1. say which gene, in words or as an id. The resolver returns the transcripts it
    //      thinks are meant -- the canonical one unless the description asks otherwise.
    //   2. tick the transcripts to load, say (optionally) which variants are wanted, and
    //      decide whether the load is confined to what was just ticked.
    //
    // The step-2 constraint is the point of the whole flow: variants are placed ONLY on the
    // transcripts chosen here, so a ClinVar load meant for SMN1 cannot scatter itself over
    // every other track that happens to be open.
    const PY = '/py/sequence/prompt-to-transcript.py';
    const TRANSCRIPT_ID_RE = /^ENS[A-Z]*T\d+$/i;
    const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const say = (m) => { try { graph.setMessage(' ' + m + ' '); } catch (e) { } };
    const restoreHover = () => { try { exec('baja/manchester/menu/mouse-over-highlight.js', graph, genegraph_panel_layout); } catch (e) { } };

    // ---- the modal shell, shared by both steps ---------------------------------------------
    // Full-screen navy panel, same shape as the other design dialogs: header with the title,
    // the step, and the buttons; one scrolling column of fields under it.
    const shell = (opts) => {
        try { const old = document.getElementById('baja-variant-track'); if (old && old.parentNode) old.parentNode.removeChild(old); } catch (e) { }
        const panel = document.createElement('div');
        panel.id = 'baja-variant-track';
        panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#fff;'
            + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';
        const btn = (id, text, primary) => '<button id="' + id + '" style="cursor:pointer;border-radius:8px;'
            + 'padding:9px ' + (primary ? '18px' : '16px') + ';font:700 12.5px Arial;'
            + (primary ? 'border:1px solid #22c55e;background:#22c55e;color:#04210f;'
                : 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;') + '">' + esc(text) + '</button>';
        panel.innerHTML = ''
            + '<div style="flex:0 0 auto;display:flex;align-items:center;gap:16px;padding:16px 22px 14px;'
            + 'background:#0b2545;border-bottom:1px solid rgba(255,255,255,0.12);box-shadow:0 6px 20px rgba(0,0,0,0.35);">'
            + '<div style="min-width:0;">'
            + '<div style="font:700 20px Arial;">' + esc(opts.title) + '</div>'
            + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">' + esc(opts.subtitle) + '</div></div>'
            + '<div style="margin-left:auto;display:flex;gap:10px;">'
            + (opts.back ? btn('vt-back', opts.back, false) : '')
            + btn('vt-cancel', 'Cancel', false) + btn('vt-go', opts.go || 'Continue', true)
            + '</div></div>'
            + '<div style="flex:1 1 auto;overflow:auto;padding:24px 22px 32px;">'
            + '<div style="width:100%;max-width:720px;margin:0 auto;">'
            + (opts.notice ? ('<div style="margin-bottom:16px;padding:12px 14px;border-radius:8px;'
                + 'background:rgba(224,112,59,0.12);border:1px solid rgba(224,112,59,0.55);'
                + 'color:#ffd9c7;font:13px Arial;">' + esc(opts.notice) + '</div>') : '')
            + opts.body
            + '</div></div>';
        document.body.appendChild(panel);
        // Keep the panel's own keys and pastes to itself: the editor listens on the window for
        // a paste and would otherwise read a pasted description as something for the canvas.
        for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
            panel.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (e2) { } });
        }
        return panel;
    };
    const LBL = 'display:block;font:600 12px Arial;color:#9fb3c8;margin:14px 0 4px;';
    const INP = 'width:100%;box-sizing:border-box;background:#0a1e3a;color:#e8f0fb;'
        + 'border:1px solid rgba(255,255,255,0.16);border-radius:8px;padding:9px 11px;font:13px Arial;';

    // ---- step 1: which gene ----------------------------------------------------------------
    const askGene = (pre) => new Promise((resolve) => {
        const p = pre || {};
        const panel = shell({
            title: 'Load a variant track', subtitle: 'Step 1 of 2 · which gene or transcript',
            notice: p.notice,
            body: '<label style="' + LBL + '">The gene or transcript</label>'
                + '<textarea id="vt-q" rows="3" placeholder="SMN1" style="' + INP + 'resize:vertical;"></textarea>'
                + '<div style="font:12px Arial;color:#9fb3c8;margin-top:6px;">'
                + 'e.g. <b>SMN1</b> &middot; <b>TP53</b> &middot; <b>all PTEN isoforms in mouse</b> &middot; <b>ENST00000380707</b><br/>'
                + 'The canonical transcript is used unless the description asks for something else.</div>'
        });
        const q = (s) => panel.querySelector(s);
        const close = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
        try { if (p.query) q('#vt-q').value = p.query; } catch (e) { }
        panel.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { close(); resolve(null); }
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) q('#vt-go').click();
        });
        q('#vt-cancel').onclick = () => { close(); resolve(null); };
        q('#vt-go').onclick = () => {
            const text = ('' + (q('#vt-q').value || '')).trim();
            if (!text) { try { q('#vt-q').focus(); } catch (e) { } return; }
            close(); resolve(text);
        };
        try { q('#vt-q').focus(); } catch (e) { }
    });

    // ---- step 2: which transcripts, which variants -----------------------------------------
    // Canonical hits are ticked to start with; that is the answer for most loads, and the
    // ones that are not canonical are there to be ticked deliberately.
    const askTranscripts = (list, gene, pre) => new Promise((resolve) => {
        const p = pre || {};
        const row = (it, i) => {
            const canon = !!it.canonical;
            const checked = (p.chosen ? (p.chosen.indexOf(it.id) >= 0) : canon) ? ' checked' : '';
            return '<label style="display:flex;align-items:flex-start;gap:10px;padding:11px 12px;margin-bottom:8px;'
                + 'border-radius:8px;background:#0a1e3a;border:1px solid rgba(255,255,255,0.16);cursor:pointer;">'
                + '<input type="checkbox" class="vt-t" data-i="' + i + '" style="margin-top:3px;"' + checked + '/>'
                + '<span style="min-width:0;">'
                + '<span style="font:700 13.5px Arial;color:#e8f0fb;">' + esc(it.id) + '</span>'
                + (it.gene ? '<span style="font:13px Arial;color:#9fb3c8;"> · ' + esc(it.gene) + '</span>' : '')
                + (canon ? '<span style="margin-left:8px;border-radius:20px;padding:2px 8px;font:700 10.5px Arial;'
                    + 'background:rgba(34,197,94,0.16);border:1px solid rgba(34,197,94,0.5);color:#8ff0b0;">canonical</span>' : '')
                + (it.biotype ? '<span style="margin-left:8px;font:11.5px Arial;color:#7f97ad;">' + esc(it.biotype) + '</span>' : '')
                + (it.why ? '<br/><span style="font:12px Arial;color:#9fb3c8;">' + esc(it.why) + '</span>' : '')
                + '</span></label>';
        };
        const panel = shell({
            title: 'Load a variant track',
            subtitle: 'Step 2 of 2 · ' + list.length + ' transcript' + (list.length === 1 ? '' : 's')
                + (gene ? ' for ' + gene : ''),
            back: 'Back', go: 'Load', notice: p.notice,
            body: '<label style="' + LBL + '">Transcripts to load</label>'
                + '<div style="display:flex;gap:14px;margin-bottom:10px;font:12px Arial;">'
                + '<a id="vt-all" href="#" style="color:#8ab4ff;">Select all</a>'
                + '<a id="vt-none" href="#" style="color:#8ab4ff;">Select none</a></div>'
                + list.map(row).join('')
                + '<label style="' + LBL + 'margin-top:22px;">Which variants to load <span style="font-weight:400;">(optional)</span></label>'
                + '<textarea id="vt-v" rows="3" placeholder="e.g. coronary heart disease &middot; ClinVar pathogenic &middot; gnomAD SNVs" style="' + INP + 'resize:vertical;"></textarea>'
                + '<div style="font:12px Arial;color:#9fb3c8;margin-top:6px;">'
                + 'Name a <b>database and class</b> (ClinVar pathogenic, gnomAD SNVs, indels) to load from that database.<br/>'
                + 'Name a <b>condition</b> (coronary heart disease) to load only the changes of these transcripts linked to it.<br/>'
                + 'Left empty, ClinVar is loaded whole.</div>'
                + '<label style="' + LBL + 'margin-top:22px;">Constraint</label>'
                + '<label style="display:flex;align-items:flex-start;gap:9px;font:13px Arial;cursor:pointer;">'
                + '<input type="checkbox" id="vt-only" checked style="margin-top:2px;"/>'
                + '<span>Load variants onto these transcripts only</span></label>'
                + '<div id="vt-note" style="font:12px Arial;color:#9fb3c8;margin:8px 0 0 27px;"></div>'
        });
        const q = (s) => panel.querySelector(s);
        const qa = (s) => Array.prototype.slice.call(panel.querySelectorAll(s));
        const close = () => { try { if (panel.parentNode) panel.parentNode.removeChild(panel); } catch (e) { } };
        try { if (p.variants) q('#vt-v').value = p.variants; } catch (e) { }
        const note = () => {
            q('#vt-note').innerHTML = q('#vt-only').checked
                ? 'Every variant found lands on the transcripts ticked above. Nothing else on the board is touched.'
                : 'Variants are also placed on the tracks already open, which may not be the gene you asked for.';
        };
        q('#vt-only').onchange = note; note();
        q('#vt-all').onclick = (e) => { e.preventDefault(); qa('.vt-t').forEach((c) => { c.checked = true; }); };
        q('#vt-none').onclick = (e) => { e.preventDefault(); qa('.vt-t').forEach((c) => { c.checked = false; }); };
        panel.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { close(); resolve(null); }
            else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) q('#vt-go').click();
        });
        q('#vt-cancel').onclick = () => { close(); resolve(null); };
        q('#vt-back').onclick = () => { close(); resolve({ back: true, variants: ('' + (q('#vt-v').value || '')).trim() }); };
        q('#vt-go').onclick = () => {
            const chosen = qa('.vt-t').filter((c) => c.checked).map((c) => list[+c.getAttribute('data-i')]);
            if (!chosen.length) { say('Tick at least one transcript to load.'); return; }
            const out = {
                chosen: chosen,
                variants: ('' + (q('#vt-v').value || '')).trim(),
                only: !!q('#vt-only').checked
            };
            close(); resolve(out);
        };
    });

    // ---- what "ClinVar pathogenic missense" means ------------------------------------------
    // Read deterministically, not by asking a model: the words that matter are a closed set,
    // and a filter that quietly means something other than what was typed is worse than one
    // that ignores a word it does not know. Whatever is understood is named back in the
    // status line, so a word that was ignored is visible.
    const readVariantWish = (text) => {
        const s = ('' + (text || '')).toLowerCase();
        let db = 'clinvar', dbLabel = 'ClinVar';
        if (/\bgnomad\b/.test(s)) { db = 'gnomad'; dbLabel = 'gnomAD'; }
        else if (/\bcosmic\b/.test(s)) { db = 'cosmic'; dbLabel = 'COSMIC'; }
        else if (/\bdb\s?snp\b/.test(s)) { db = 'dbsnp'; dbLabel = 'dbSNP'; }
        const types = [];
        if (/\b(snp|snv|snvs|point|missense|substitution|nonsense)\b/.test(s)) types.push('snp');
        if (/\bindels?\b/.test(s)) { types.push('ins'); types.push('del'); }
        else {
            if (/\binsertions?\b/.test(s)) types.push('ins');
            if (/\bdeletions?\b/.test(s)) types.push('del');
        }
        let clinsig = null;
        if (/\bpathogenic\b/.test(s)) clinsig = { any: ['pathogenic'], not: ['conflicting'] };
        else if (/\bbenign\b/.test(s)) clinsig = { any: ['benign'], not: ['conflicting'] };
        else if (/\b(uncertain|vus|conflicting)\b/.test(s)) clinsig = { any: ['uncertain', 'conflicting'] };
        // WHICH QUESTION IS THIS? Words that name a database or a class of change mean "load
        // from a database, filtered". Anything else that is not empty is a CONDITION, and a
        // condition means the changes of the loaded gene linked to it -- "coronary heart
        // disease" on an LPA transcript is not a filter over ClinVar, it is a different set.
        const named = /\b(clinvar|gnomad|cosmic|db\s?snp)\b/.test(s);
        if (!types.length && !clinsig) {
            if (s && !named) return { db: db, dbLabel: dbLabel, filter: null, context: text };
            return { db: db, dbLabel: dbLabel, filter: null, context: null };
        }
        // The label is read back to the user in the status line and on the track, so name the
        // classes the way they were asked for, not the way the filter spells them.
        const TYPE_WORD = { snp: 'SNVs', ins: 'insertions', del: 'deletions' };
        const parts = [];
        if (clinsig) parts.push(clinsig.any.join('/'));
        if (types.length) {
            parts.push((types.indexOf('ins') >= 0 && types.indexOf('del') >= 0)
                ? (types.indexOf('snp') >= 0 ? 'SNVs and indels' : 'indels')
                : types.map((t) => TYPE_WORD[t]).join(' and '));
        }
        const filter = { label: parts.join(' ') };
        if (types.length) filter.types = types;
        if (clinsig) filter.clinsig = clinsig;
        return { db: db, dbLabel: dbLabel, filter: filter, context: null };
    };

    // ---- run --------------------------------------------------------------------------------
    return (async () => {
        let prefill = null;
        // Step 1 and step 2 are a loop, not a line: a resolver that finds nothing, and a Back
        // from step 2, both put step 1 back with what was typed still in it.
        for (;;) {
            const query = await askGene(prefill);
            if (!query) { restoreHover(); return false; }
            prefill = { query: query };

            // Resolve. A bare transcript id is not a question for the model.
            let list = [], gene = '';
            if (TRANSCRIPT_ID_RE.test(query)) {
                list = [{ id: query.toUpperCase(), canonical: true, why: 'the id you gave' }];
            } else {
                say('Finding transcripts for "' + query + '"…');
                let res = null;
                const em = new EngineMonitor((m) => { try { log(m); graph.setMessage(' ' + m + ' '); } catch (e) { } });
                try { res = await exec(PY, em, query); } catch (e) { res = null; }
                if (!res) { prefill.notice = 'The transcript resolver did not answer. Try again, or paste a transcript id.'; continue; }
                try { list = JSON.parse(res.transcripts || '[]'); } catch (e) { list = []; }
                gene = res.gene || '';
                if (!list.length) {
                    prefill.notice = 'No transcripts found for "' + query + '"'
                        + (res.error ? ' — ' + res.error : '') + '. Edit the description and try again.';
                    continue;
                }
                // Canonical first, so the ticked ones are at the top of the list.
                list.sort((a, b) => (a.canonical ? 0 : 1) - (b.canonical ? 0 : 1));
            }

            const pick = await askTranscripts(list, gene, prefill);
            if (!pick) { restoreHover(); return false; }
            if (pick.back) { prefill = { query: query, variants: pick.variants }; continue; }

            // ---- load the ticked transcripts ---------------------------------------------
            const before = new Set((graph.track || []));
            let failed = [];
            for (let i = 0; i < pick.chosen.length; i++) {
                const it = pick.chosen[i];
                say('Loading ' + it.id + (it.gene ? ' (' + it.gene + ')' : '')
                    + ' — ' + (i + 1) + ' of ' + pick.chosen.length + '…');
                try { await exec('baja/data/prompt-load-transcript.js', server, graph, genegraph_panel_layout, it.id); }
                catch (e) { failed.push(it.id); }
            }
            const loaded = (graph.track || []).filter((t) => t && !before.has(t));
            if (!loaded.length) {
                prefill = { query: query, variants: pick.variants };
                prefill.notice = 'None of the chosen transcripts could be loaded'
                    + (failed.length ? ' (' + failed.join(', ') + ')' : '') + '. Try another transcript.';
                continue;
            }

            // ---- and the variants on them --------------------------------------------------
            const wish = readVariantWish(pick.variants);
            if (wish.context) {
                // A CONDITION, not a database. The changes of these transcripts that are linked
                // to it, each one checked against the transcript's own coding sequence before
                // it is drawn. The constraint is inherent here: only the tracks loaded above
                // are passed, so nothing else on the board is touched whatever the box says.
                let ok = false;
                try {
                    ok = await exec('baja/data/variant-from-prompt.js', server, graph,
                        genegraph_panel_layout, loaded, wish.context);
                } catch (e) { ok = false; }
                if (ok) { restoreHover(); return true; }
                // NOTHING VERIFIED. That is a real answer -- the changes linked to this
                // condition are not changes this transcript can carry, which happens when the
                // numbering in the literature belongs to a longer isoform, or when the link
                // runs through repeats or non-coding variants. Rather than leave the user with
                // loaded transcripts and nothing on them, fall back to the variant database
                // over those same transcripts, and say plainly that this is what happened.
                say('No coding change linked to "' + wish.context + '" could be verified against '
                    + (loaded.length === 1 ? 'this transcript' : 'these transcripts')
                    + '. Loading ClinVar over ' + (loaded.length === 1 ? 'it' : 'them') + ' instead…');
                try {
                    await exec('baja/data/load-variants.js', server, graph, genegraph_panel_layout,
                        'clinvar', 'ClinVar', false, loaded, null);
                } catch (e) {
                    say('No coding change linked to "' + wish.context + '" could be verified, and '
                        + 'the ClinVar fallback also failed: ' + (e && e.message ? e.message : e));
                    restoreHover(); return false;
                }
                restoreHover();
                return true;
            }
            const targets = pick.only ? loaded : null;
            say('Loading ' + wish.dbLabel + (wish.filter ? ' [' + wish.filter.label + ']' : '')
                + ' onto ' + loaded.length + ' transcript' + (loaded.length === 1 ? '' : 's') + '…');
            try {
                await exec('baja/data/load-variants.js', server, graph, genegraph_panel_layout,
                    wish.db, wish.dbLabel, !targets, targets, wish.filter);
            } catch (e) {
                say('Loaded ' + loaded.length + ' transcript' + (loaded.length === 1 ? '' : 's')
                    + ', but the ' + wish.dbLabel + ' load failed: ' + (e && e.message ? e.message : e));
                restoreHover(); return false;
            }
            restoreHover();
            return true;
        }
    })();
}
