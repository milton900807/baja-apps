function (graph, oligos) {

    // THE OFF-TARGET GENES OF THE SELECTED COMPOUNDS, as a table you can read and download.
    //   await exec('baja/manchester/menu/selected-off-target-genes.js', graph, list);
    //
    // The screen already stores, per compound, which genes it hits. Until now that was a
    // count on a badge and an arc on the canvas: enough to say "this one is dirty", not
    // enough to say WHICH gene, and no way at all to take the list somewhere else.
    //
    // Two tables, because they answer different questions. By gene says which genes this set
    // keeps running into and how many compounds hit each, which is the one that decides
    // whether a design has a problem or a compound does. By compound says what each one hits,
    // which is the one that decides which to drop.
    //
    // WHAT IS AND IS NOT KNOWN IS STATED RATHER THAN SMOOTHED OVER. Three different things
    // look like "no genes" on a compound and only one of them means it is clean:
    //
    //   not screened      offtargetsRun is false: nothing has been run, so nothing is known
    //   screened, zero    offtarget is "0": a real result, and a good one
    //   too many to keep  offtarget came back as a count (over 1000 hits) and the hit list
    //                     was discarded, so the genes behind it are not recoverable here
    //
    // And the stored gene list is CAPPED AT 30 by run-off-targets.js, for the canvas arc.
    // offtargetGeneCount keeps the true number, so where the two disagree the table says the
    // list is partial instead of quietly handing over 30 genes as though they were all of
    // them. A truncated list presented as complete is the one failure here that would be
    // acted on without being noticed.
    return (async () => {
        const say = (m) => { try { (graph.setResultMessage || graph.setMessage).call(graph, ' ' + m + ' '); } catch (e) { } };
        const list = (oligos || []).filter(Boolean);
        if (!list.length) { say('No compounds selected.'); return 0; }

        const esc = (s) => ('' + (s == null ? '' : s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const nameOf = (o) => ('' + (o.name || o.id || 'compound')).trim();

        // Genes for one compound, and how much of the truth we have.
        //   genes    the symbols we can name
        //   total    how many distinct genes it really hit, when that is known
        //   state    'none' | 'ok' | 'partial' | 'countonly' | 'unscreened'
        const genesOf = (o) => {
            const run = !!(o && o.offtargetsRun);
            const raw = o ? o.offtarget : null;
            const capped = Array.isArray(o && o.offtargetsymbols)
                ? o.offtargetsymbols.map((s) => ('' + s).trim()).filter(Boolean) : [];
            const trueCount = Number.isFinite(+(o && o.offtargetGeneCount)) ? +o.offtargetGeneCount : null;

            if (!run && raw == null) return { genes: [], total: null, state: 'unscreened' };

            // The hit list itself when it survived: every hit carries its gene, so this is
            // the complete set rather than the capped display list.
            if (Array.isArray(raw)) {
                const set = new Set();
                for (const h of raw) {
                    const s = ('' + ((h && (h.symbol || h.gene || h.gene_symbol)) || '')).trim();
                    if (s) set.add(s);
                }
                if (set.size) {
                    const genes = Array.from(set).sort();
                    return { genes: genes, total: genes.length, state: 'ok' };
                }
                // Hits with no gene attached: the capped list is all there is.
                if (capped.length) {
                    return {
                        genes: capped.slice().sort(), total: trueCount,
                        state: (trueCount != null && trueCount > capped.length) ? 'partial' : 'ok'
                    };
                }
                // Hits exist but none names a gene: the number of GENES is unknown, which
                // is not the same as zero. Only an empty hit list means zero.
                return { genes: [], total: raw.length ? trueCount : 0, state: raw.length ? 'countonly' : 'none' };
            }

            // A count, not a list: over a thousand hits and the hit list was not kept.
            if (typeof raw === 'string' || typeof raw === 'number') {
                const n = parseInt(raw, 10);
                if (n === 0 && !capped.length) return { genes: [], total: 0, state: 'none' };
                if (capped.length) {
                    return {
                        genes: capped.slice().sort(), total: trueCount,
                        state: (trueCount != null && trueCount > capped.length) ? 'partial' : 'ok'
                    };
                }
                return { genes: [], total: trueCount, state: 'countonly' };
            }
            return { genes: [], total: null, state: 'unscreened' };
        };

        const rows = list.map((o) => ({ o: o, name: nameOf(o), g: genesOf(o) }));

        // By gene: which compounds hit it. Sorted by how many, so the gene this design keeps
        // running into is the first thing read.
        const byGene = new Map();
        for (const r of rows) {
            for (const gene of r.g.genes) {
                if (!byGene.has(gene)) byGene.set(gene, []);
                byGene.get(gene).push(r.name);
            }
        }
        const geneRows = Array.from(byGene.entries())
            .map(([gene, who]) => ({ gene: gene, n: who.length, who: who }))
            .sort((a, b) => (b.n - a.n) || (a.gene < b.gene ? -1 : 1));

        const nScreened = rows.filter((r) => r.g.state !== 'unscreened').length;
        const nClean = rows.filter((r) => r.g.state === 'none').length;
        const nPartial = rows.filter((r) => r.g.state === 'partial').length;
        const nCountOnly = rows.filter((r) => r.g.state === 'countonly').length;

        // ---- the two downloads ---------------------------------------------------
        const csvCell = (v) => {
            const s = '' + (v == null ? '' : v);
            return /[",\n]/.test(s) ? ('"' + s.replace(/"/g, '""') + '"') : s;
        };
        const download = (text, filename, mime) => {
            try {
                const blob = new Blob([text], { type: (mime || 'text/csv') + ';charset=utf-8;' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = filename;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => { try { URL.revokeObjectURL(a.href); } catch (e) { } }, 4000);
                say('Downloaded ' + filename + '.');
            } catch (e) { say('Could not download: ' + e); }
        };
        const stamp = () => {
            const d = new Date();
            const p = (n) => (n < 10 ? '0' : '') + n;
            return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
        };
        // STATE TRAVELS WITH THE ROW. A csv of gene names alone loses the difference between
        // a compound that is clean and one nothing was ever run on, and that difference is
        // the whole point of reading this.
        const STATE_TEXT = {
            none: 'screened, no off-target genes',
            ok: 'screened',
            partial: 'screened, gene list truncated at 30 by the screen',
            countonly: 'screened, too many hits to keep the gene list',
            unscreened: 'not screened'
        };
        const csvByCompound = () => {
            const out = ['compound,genes_known,genes_total,status,gene'];
            for (const r of rows) {
                const known = r.g.genes.length;
                const total = (r.g.total == null) ? '' : r.g.total;
                if (!known) {
                    out.push([r.name, known, total, STATE_TEXT[r.g.state], ''].map(csvCell).join(','));
                    continue;
                }
                for (const gene of r.g.genes) {
                    out.push([r.name, known, total, STATE_TEXT[r.g.state], gene].map(csvCell).join(','));
                }
            }
            return out.join('\n') + '\n';
        };
        const csvByGene = () => {
            const out = ['gene,compounds_hitting,compounds'];
            for (const g of geneRows) out.push([g.gene, g.n, g.who.join(' ')].map(csvCell).join(','));
            return out.join('\n') + '\n';
        };
        const genesTxt = () => geneRows.map((g) => g.gene).join('\n') + '\n';

        // ---- the panel -----------------------------------------------------------
        const old = document.getElementById('baja-off-genes');
        if (old && old.parentNode) old.parentNode.removeChild(old);
        const panel = document.createElement('div');
        panel.id = 'baja-off-genes';
        panel.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#071a30;color:#fff;'
            + 'font-family:Arial,Helvetica,sans-serif;display:flex;flex-direction:column;overflow:hidden;';

        const note = [];
        if (nScreened < rows.length) note.push((rows.length - nScreened) + ' not screened');
        if (nClean) note.push(nClean + ' with none');
        if (nPartial) note.push(nPartial + ' with a truncated list');
        if (nCountOnly) note.push(nCountOnly + ' with too many hits to list');

        const btn = (id, label, primary) => '<button id="' + id + '" style="cursor:pointer;border-radius:9px;'
            + 'padding:10px 16px;font:700 13px Arial;border:1px solid '
            + (primary ? '#22c55e;background:#22c55e;color:#04210f;' : 'rgba(255,255,255,0.28);background:transparent;color:#e8f0fb;')
            + '">' + label + '</button>';
        const th = 'text-align:left;font:700 12px Arial;color:#9fb3c8;padding:6px 10px;'
            + 'border-bottom:1px solid rgba(255,255,255,0.16);position:sticky;top:0;background:#071a30;';
        const td = 'font:13px Arial;color:#e8f0fb;padding:5px 10px;border-bottom:1px solid rgba(255,255,255,0.06);vertical-align:top;';

        panel.innerHTML =
            '<div style="padding:18px 24px 12px;border-bottom:1px solid rgba(255,255,255,0.12);">'
            + '<div style="font:700 17px Arial;">Off-target genes</div>'
            + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:4px;">'
            + rows.length + ' selected compound' + (rows.length === 1 ? '' : 's') + ' · '
            + geneRows.length + ' distinct gene' + (geneRows.length === 1 ? '' : 's')
            + (note.length ? (' · ' + note.join(' · ')) : '')
            + '</div></div>'
            + '<div style="flex:1;overflow:auto;padding:16px 24px 24px;display:flex;gap:28px;flex-wrap:wrap;align-items:flex-start;">'

            + '<div style="flex:1 1 320px;min-width:300px;">'
            + '<div style="font:700 13px Arial;color:#4fd0e6;margin-bottom:8px;">By gene</div>'
            + (geneRows.length
                ? ('<table style="border-collapse:collapse;width:100%;"><thead><tr>'
                    + '<th style="' + th + '">Gene</th><th style="' + th + '">Compounds</th>'
                    + '<th style="' + th + '">Which</th></tr></thead><tbody>'
                    + geneRows.map((g) => '<tr><td style="' + td + '">' + esc(g.gene) + '</td>'
                        + '<td style="' + td + '">' + g.n + '</td>'
                        + '<td style="' + td + 'color:#9fb3c8;">' + esc(g.who.join(', ')) + '</td></tr>').join('')
                    + '</tbody></table>')
                : '<div style="font:13px Arial;color:#9fb3c8;">No off-target genes are known for these compounds.</div>')
            + '</div>'

            + '<div style="flex:1 1 320px;min-width:300px;">'
            + '<div style="font:700 13px Arial;color:#4fd0e6;margin-bottom:8px;">By compound</div>'
            + '<table style="border-collapse:collapse;width:100%;"><thead><tr>'
            + '<th style="' + th + '">Compound</th><th style="' + th + '">Genes</th>'
            + '</tr></thead><tbody>'
            + rows.map((r) => '<tr><td style="' + td + '">' + esc(r.name) + '</td><td style="' + td + '">'
                + (r.g.genes.length ? esc(r.g.genes.join(', ')) : '')
                + ((r.g.state !== 'ok')
                    ? ('<span style="color:' + (r.g.state === 'none' ? '#7fdca0' : '#e0a33b') + ';font:12px Arial;">'
                        + (r.g.genes.length ? ' — ' : '') + esc(STATE_TEXT[r.g.state]) + '</span>')
                    : '')
                + (r.g.state === 'partial' && r.g.total != null
                    ? ('<span style="color:#e0a33b;font:12px Arial;"> (' + r.g.genes.length + ' of ' + r.g.total + ')</span>')
                    : '')
                + '</td></tr>').join('')
            + '</tbody></table></div>'

            + '</div>'
            + '<div style="padding:14px 24px;border-top:1px solid rgba(255,255,255,0.12);display:flex;gap:10px;flex-wrap:wrap;">'
            + btn('og-csv1', 'Download by compound (CSV)', true)
            + btn('og-csv2', 'Download by gene (CSV)')
            + btn('og-txt', 'Download gene list (TXT)')
            + btn('og-close', 'Close')
            + '</div>';
        document.body.appendChild(panel);

        const q = (s) => panel.querySelector(s);
        const close = () => { try { panel.parentNode.removeChild(panel); } catch (e) { } };
        q('#og-csv1').onclick = () => download(csvByCompound(), 'off-targets-by-compound-' + stamp() + '.csv');
        q('#og-csv2').onclick = () => download(csvByGene(), 'off-targets-by-gene-' + stamp() + '.csv');
        q('#og-txt').onclick = () => download(genesTxt(), 'off-target-genes-' + stamp() + '.txt', 'text/plain');
        q('#og-close').onclick = () => close();
        return geneRows.length;
    })();
}
