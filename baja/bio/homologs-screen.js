function (graph, genegraph_panel_layout, model) {

    // THE HOMOLOGS OF A TRACK, AS A SCREEN YOU LOAD FROM.
    //   exec('baja/bio/homologs-screen.js', graph, layout, { gene, species, kind, homologs, note })
    //
    // Paralogs and orthologs are the same screen: the same ranking, the same rows, the same
    // reason for wanting one. The only differences are the word at the top and a species
    // column that only orthologs need, which is not two screens' worth of difference.
    //
    // "list the closest paralog to this track" was refused outright: nothing in the editor
    // knew what a paralog was. Answering it in a sentence would be the smaller half of the
    // job, because what someone asks that for is the next thing -- put it beside this one
    // and compare them -- and a list you cannot act on leaves them to type the symbol back
    // in by hand.
    //
    // So every row loads. The gene goes through the same load-by-name path as any other
    // gene the editor opens, which means a paralog loaded here is a track like any other:
    // the comparison, the exon matching and the similarity map all work on it immediately.
    //
    // FULL SCREEN, because a family runs to dozens and each row carries what you need to
    // choose between them -- identity both ways, where it sits, what it is -- and because
    // the canvas behind a list of candidates is not what is being read.
    //
    // IDENTITY IS SHOWN BOTH WAYS. One number hides the case that matters: a short paralog
    // wholly inside a long one is 95% of itself and 30% of the query, and which of those a
    // person cares about depends on what they are about to do with it.

    return (async () => {
        const m = model || {};
        const list = (m.homologs || m.paralogs || []).filter(Boolean);
        const kind = ('' + (m.kind || 'paralogues')).toLowerCase();
        const WORD = (kind.indexOf('ortholog') === 0) ? 'Orthologs'
            : (kind === 'all' ? 'Homologs' : 'Paralogs');
        // Only worth a column when the rows differ in it: every paralog is in the gene's
        // own species, and a column of one repeated value is a column of noise.
        const showSpecies = list.some((p) => p && p.species_common
            && p.species_common !== (m.species || 'human'));
        try { if (window.__bajaHomologScreen && window.__bajaHomologScreen.destroy) window.__bajaHomologScreen.destroy(); } catch (e) { }

        const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const pct = (x) => (x == null || !isFinite(+x)) ? '—' : ((Math.round(+x * 10) / 10).toFixed(1) + '%');
        const num = (x) => (x == null || !isFinite(+x)) ? '' : (Math.round(+x)).toLocaleString();
        const gene = '' + (m.gene || 'this track');

        const el = document.createElement('div');
        el.id = 'baja-homolog-screen';
        el.setAttribute('role', 'dialog');
        el.style.cssText = 'position:fixed;inset:0;z-index:2147482450;display:flex;flex-direction:column;'
            + 'background:#0a2540;padding:16px 20px 12px 20px;overflow:auto;color:#eaf6f9;'
            + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:13px;';

        const BTN = (id, label, opts) =>
            '<button type="button" data-id="' + id + '"'
            + ((opts && opts.gene) ? (' data-gene="' + esc(opts.gene) + '"') : '')
            + ((opts && opts.species) ? (' data-species="' + esc(opts.species) + '"') : '')
            + ' style="background:' + ((opts && opts.primary) ? 'rgba(26,163,189,0.22)' : 'transparent')
            + ';border:1px solid rgba(159,196,212,0.5);color:#eaf6f9;border-radius:7px;'
            + 'padding:6px 13px;cursor:pointer;font:inherit;white-space:nowrap;">' + esc(label) + '</button>';

        // A FAMILY IS ONE PICTURE. The bar says how close each one is at a glance, so the
        // ordering is visible rather than something to be read off a column of numbers.
        const row = (p, i) => {
            const id = Math.max(0, Math.min(100, +p.identity || 0));
            const sym = '' + (p.symbol || p.id || '?');
            const where = p.chromosome ? ('chr' + p.chromosome + ':' + num(p.start) + '-' + num(p.end)
                + (p.strand ? ((+p.strand < 0) ? ' −' : ' +') : '')) : '';
            const kb = p.length ? (Math.round(p.length / 1000).toLocaleString() + ' kb') : '';
            const odd = (i % 2) ? 'background:rgba(159,196,212,0.05);' : '';
            // A gene split is an artefact of the annotation, not a duplication, and saying
            // so beats dropping the row or letting it pass as an ordinary paralog.
            const flag = /gene_split/.test('' + (p.subtype || p.type || ''))
                ? '<span style="color:#ffd9a0;font-size:11px;"> · gene split (an annotation artefact, not a duplication)</span>' : '';
            return '<tr style="' + odd + '">'
                + '<td style="padding:9px 10px;vertical-align:top;white-space:nowrap;">'
                + '<div style="font-weight:700;font-size:14px;">' + esc(sym) + '</div>'
                + '<div style="font-size:11px;color:#9fc4d4;">' + esc(p.id || '') + '</div></td>'
                + '<td style="padding:9px 10px;vertical-align:top;width:34%;">'
                + '<div style="display:flex;align-items:center;gap:8px;">'
                + '<div style="flex:1;height:8px;border-radius:4px;background:rgba(159,196,212,0.16);overflow:hidden;">'
                + '<div style="width:' + id.toFixed(1) + '%;height:100%;background:hsla(' + Math.round(190 - id) + ',70%,55%,0.9);"></div>'
                + '</div><div style="width:58px;text-align:right;font-weight:700;">' + pct(p.identity) + '</div></div>'
                + '<div style="font-size:11px;color:#9fc4d4;margin-top:3px;">'
                + pct(p.identity_query) + ' of ' + esc(gene) + ' · ' + pct(p.identity_target) + ' of ' + esc(sym)
                + '</div></td>'
                + '<td style="padding:9px 10px;vertical-align:top;font-size:12px;color:#cfe9f3;">'
                + esc(p.description || '') + flag
                + '<div style="font-size:11px;color:#9fc4d4;margin-top:3px;">' + esc(where) + (kb ? (' · ' + kb) : '') + '</div></td>'
                + (showSpecies
                    ? ('<td style="padding:9px 10px;vertical-align:top;white-space:nowrap;font-size:12px;">'
                        + esc(p.species_common || p.species || '') + '</td>')
                    : '')
                + '<td style="padding:9px 10px;vertical-align:top;text-align:right;white-space:nowrap;">'
                // NOT A BUTTON THAT FAILS. Ensembl has orthologs in hundreds of species and
                // this editor holds transcript indexes for eight; a row it cannot draw says
                // so, which is the honest half of offering the rest.
                + ((p.loadable === false)
                    ? ('<span style="font-size:11px;color:#9fc4d4;">no transcripts here for '
                        + esc(p.species_common || p.species || 'that species') + '</span>')
                    : BTN('load', 'Load as a track',
                        { gene: sym, primary: true,
                          species: (p.species_common && p.species_common !== (m.species || 'human'))
                              ? p.species_common : '' }))
                + '</td></tr>';
        };

        const head = '<tr style="color:#9fc4d4;font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">'
            + '<th style="text-align:left;padding:0 10px 6px 10px;">gene</th>'
            + '<th style="text-align:left;padding:0 10px 6px 10px;">identity</th>'
            + '<th style="text-align:left;padding:0 10px 6px 10px;">what it is</th>'
            + (showSpecies ? '<th style="text-align:left;padding:0 10px 6px 10px;">species</th>' : '')
            + '<th></th></tr>';

        const empty = '<div style="padding:26px 10px;color:#cfe9f3;">Ensembl lists no '
            + esc(WORD.toLowerCase()) + ' for ' + esc(gene) + ' in ' + esc(m.species || 'human')
            + (showSpecies || kind.indexOf('ortholog') === 0
                ? ' among the species this editor can open. '
                : '. A gene with no duplicated counterpart is an ordinary answer, not a failure.')
            + '</div>';

        el.innerHTML =
            '<div style="display:flex;align-items:flex-start;gap:12px;padding:2px 4px 12px 4px;">'
            + '<div style="flex:1;min-width:0;">'
            + '<div style="font-weight:700;font-size:16px;">' + esc(WORD) + ' of ' + esc(gene) + '</div>'
            + '<div style="font-size:12px;color:#cfe9f3;margin-top:3px;">'
            + (list.length
                ? (list.length + ' of them, closest first. Identity is over the aligned protein, '
                    + 'shown each way round: a short one inside a long one is most of itself '
                    + 'and little of the other.' + (m.note ? (' ' + esc(m.note)) : ''))
                : '')
            + '</div></div>'
            + (list.length ? BTN('conservation', 'Conservation map') : '')
            + BTN('close', 'Close')
            + '</div>'
            + (list.length
                ? ('<div style="background:#07202f;border-radius:9px;padding:12px 4px;">'
                    + '<table style="width:100%;border-collapse:collapse;">' + head
                    + list.map(row).join('') + '</table></div>')
                : empty)
            + '<div data-id="said" style="font-size:12px;color:#ffd9a0;padding:9px 4px 0 4px;min-height:16px;"></div>';

        document.body.appendChild(el);

        const pop = { el: el, destroy: null, loaded: [] };
        function close() {
            try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) { }
            if (window.__bajaHomologScreen === pop) window.__bajaHomologScreen = null;
        }
        const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
        document.addEventListener('keydown', onKey, true);
        pop.destroy = close;
        window.__bajaHomologScreen = pop;

        const say = (t) => { try { const n = el.querySelector('[data-id="said"]'); if (n) n.textContent = t || ''; } catch (e) { } };

        el.addEventListener('click', async (e) => {
            const b = e.target && e.target.closest ? e.target.closest('button[data-id]') : null;
            if (!b) return;
            const id = b.getAttribute('data-id');
            if (id === 'close') { close(); return; }
            // WHERE, NOT JUST HOW MUCH. The list answers "how alike", one number per
            // species; the map answers "where", which is the question behind it: a protein
            // 60% identical because two domains are perfect is a different protein from one
            // 60% identical because every residue is a coin flip.
            if (id === 'conservation') {
                b.disabled = true;
                say('');
                let w = null;
                try {
                    w = await exec('baja/lib/working.js', 'Conservation map for ' + gene,
                        'Asking Ensembl for the alignments. Each species is aligned when it '
                        + 'is asked for, so this usually takes half a minute.');
                } catch (e2) { w = null; }
                try {
                    const r = await exec('py/bio/homolog-conservation.py', gene,
                        (m.species || 'human'), (kind === 'paralogues' ? 'paralogues' : 'orthologues'),
                        JSON.stringify({ max_species: 12 }));
                    if (!r || r.status !== 'OK') {
                        const why = (r && r.error) || 'the conservation map could not be built';
                        try { if (w) w.fail(why); } catch (e3) { }
                        say(why);
                        b.disabled = false;
                        return;
                    }
                    if (!(r.species_rows || []).length) {
                        const why = r.note || 'no aligned homolog came back to build a map from';
                        try { if (w) w.fail(why); } catch (e3) { }
                        say(why);
                        b.disabled = false;
                        return;
                    }
                    try { if (w) w.step('Stacking ' + (r.species_rows || []).length
                        + ' species across ' + r.length + ' residues \u2026'); } catch (e3) { }
                    const made = await exec('baja/bio/conservation-map.js', graph, r);
                    try { if (w) w.done(); } catch (e3) { }
                    // Left open behind the map: closing the list would take away the thing
                    // the map is about, and Escape should come back to it.
                    if (made) say('');
                    else { say('the conservation map could not be drawn'); b.disabled = false; }
                } catch (e2) {
                    const why = 'the conservation map could not be built: '
                        + (e2 && e2.message ? e2.message : e2);
                    try { if (w) w.fail(why); } catch (e3) { }
                    say(why);
                    b.disabled = false;
                }
                return;
            }
            if (id !== 'load') return;
            const sym = b.getAttribute('data-gene');
            if (!sym) return;
            // A GENE IN ANOTHER SPECIES IS NAMED WITH IT. The loader works out species and
            // symbol from the words it is given, and mouse Spag9 and human SPAG9 are
            // different genes that differ only in case otherwise.
            const sp = b.getAttribute('data-species') || '';
            const query = sp ? (sp + ' ' + sym) : sym;
            // CLOSED BEFORE THE LOAD, not after. Loading a gene opens its own transcript
            // chooser, and leaving this full-screen panel over the top of that would bury
            // the question being asked.
            close();
            try { graph.setMessage('Loading ' + query + ' …', 10); } catch (e2) { }
            try {
                await exec('baja/manchester/menu/load-by-name.js', graph, genegraph_panel_layout,
                    { name: query, kind: 'gene' });
                pop.loaded.push(query);
            } catch (e2) {
                try { graph.setMessage('Could not load ' + query + ': '
                    + (e2 && e2.message ? e2.message : e2), 8); } catch (e3) { }
            }
        });
        for (const ev of ['mousedown', 'mouseup', 'wheel', 'dblclick']) {
            el.addEventListener(ev, (e) => { e.stopPropagation(); });
        }
        try { say(''); } catch (e) { }
        return pop;
    })();
}
