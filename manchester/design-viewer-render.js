function () {
    // Draws a saved LOH design strategy into `root`. Read-only: what the Genome Viewer showed
    // when it was saved, from the file alone. Returns nothing; the buttons do the work.
    return (root, doc, opts) => {
        const O = opts || {};
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const pct = (x) => (Math.round(1000 * x) / 10) + '%';
        const mb = (n) => (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' Mb';
        const word = (e) => ('' + (e || '')).replace(/_/g, ' ');
        const N = doc.numbers || {};
        const handoff = doc.handoff || {};
        const DM = doc.depmap || {};
        const picked = new Set();

        const chip = (text, col) => '<span style="display:inline-block;border-radius:20px;padding:2px 9px;font:700 11px Arial;white-space:nowrap;'
            + 'background:' + col + '22;border:1px solid ' + col + '99;color:' + col + ';">' + esc(text) + '</span>';
        const card = (inner) => '<div style="background:#0a1e3a;border:1px solid rgba(255,255,255,0.12);border-radius:10px;padding:12px 14px;margin-bottom:8px;">' + inner + '</div>';
        const section = (title, sub, inner) => '<div style="margin:26px 0 10px;font:700 15px Arial;color:#e8f0fb;">' + esc(title) + '</div>'
            + (sub ? '<div style="font:12px Arial;color:#9fb3c8;margin:-4px 0 10px;">' + sub + '</div>' : '') + inner;

        const vLine = (v) => esc((v.change || '') + (v.effect ? ' (' + word(v.effect) + ')' : ''))
            + (v.origin ? ' &middot; ' + esc(v.origin === 'somatic' ? 'somatic' : 'germline') : '')
            + (v.state ? ' &middot; ' + esc({ retained: 'on every copy left', both: 'tumor reads both alleles', lost: 'on the copy lost', uncalled: 'not called in the tumor' }[v.state] || v.state) : '')
            + (v.baf >= 0 ? ' &middot; VAF ' + Math.round(v.baf * 100) + '%' : '');
        const dmLine = (gene) => {
            const d = DM[('' + gene).toUpperCase()];
            if (!d) return '';
            if (!d.screened) return '<br/><span style="color:#9fb3c8;">DepMap: not in the screen</span>';
            const bits = [d['class'] + ', a dependency in ' + Math.round((d.dep_frac || 0) * 100) + '% of '
                + (d.n_models || doc.depmapModels || 0).toLocaleString() + ' lines (mean ' + d.effect_mean + ')'];
            if (d.lineages && d.lineages.length) bits.push('most in ' + d.lineages.slice(0, 2).map((l) => l[0] + ' (' + l[1] + ')').join(', '));
            const ds = d.dosage || {};
            if (ds.tested) bits.push(ds.confirmed ? 'worse when the line is down to one copy: ' + ds.delta + ' over ' + ds.n_hemizygous + ' hemizygous lines, FDR ' + ds.fdr
                : (ds.delta < 0 ? 'leans worse at one copy, not significant (FDR ' + ds.fdr + ')' : 'no worse at one copy'));
            if (d.paralog) bits.push('closest paralog ' + d.paralog.gene + ' (model ' + d.paralog.pred + ')');
            return '<br/><span style="color:#9fb3c8;">' + esc('DepMap: ' + bits.join('; ')) + '</span>';
        };
        // What the gene is for, saved with its DepMap row: the description, the functional
        // categories and the process terms behind them.
        const FN_HOT = { 'stem cell / self-renewal': '#fbbf24', 'cancer-associated pathway': '#f87171', 'telomere maintenance': '#fbbf24' };
        const fnHtml = (gene) => {
            const d = DM[('' + gene).toUpperCase()], f = d && d.fn;
            if (!f) return '';
            const chipf = (t) => { const c = FN_HOT[t] || '#a78bfa';
                return '<span style="display:inline-block;border-radius:20px;padding:1px 8px;margin:0 6px 4px 0;font:700 11px Arial;white-space:nowrap;'
                    + 'background:' + c + '22;border:1px solid ' + c + '99;color:' + c + ';">' + esc(t) + '</span>'; };
            return '<div style="margin-top:6px;font:12px Arial;color:#cfe0f5;line-height:1.55;">'
                + (f.desc ? '<span style="color:#e8f0fb;">' + esc(f.desc) + '</span>' : '')
                + ((f.cats && f.cats.length) ? '<div style="margin-top:4px;">' + f.cats.map(chipf).join('') + '</div>' : '')
                + ((f.terms && f.terms.length) ? '<div style="font:11.5px Arial;color:#9fb3c8;">' + esc(f.terms.join(' \u00b7 ')) + '</div>' : '')
                + '</div>';
        };
        // Tissue expression (GTEx median TPM), saved with the gene's DepMap row: CNS first.
        const tpmFmt = (v) => v >= 100 ? Math.round(v).toLocaleString() : v >= 10 ? v.toFixed(0) : v.toFixed(1);
        const tpmColor = (v) => v >= 100 ? '#fbbf24' : v >= 10 ? '#86efac' : v >= 1 ? '#8ab4ff' : '#64748b';
        const tpmHtml = (gene) => {
            const d = DM[('' + gene).toUpperCase()], t = d && d.tpm;
            if (!t) return '';
            const row = (name, list) => (list && list.length) ? '<div style="margin-top:3px;"><span style="color:#9fb3c8;">' + name + ':</span> '
                + list.map((x) => '<span style="white-space:nowrap;margin-right:8px;">' + esc(x[0]) + ' <b style="color:' + tpmColor(x[1]) + ';">' + tpmFmt(x[1]) + '</b></span>').join(' ')
                + '</div>' : '';
            return '<div style="margin-top:6px;font:11.5px Arial;color:#cfe0f5;line-height:1.6;">'
                + '<span style="color:#9fb3c8;">Tissue expression (' + esc(t.source || 'GTEx median TPM') + ')</span>'
                + row('CNS', t.cns) + row('Other tissues', t.other) + '</div>';
        };
        // A tract's genes against the tissues (doc.tractTpm: labels once, values per gene).
        const TT = doc.tractTpm || null;
        const tpmTableHtml = (genes) => {
            if (!TT || !TT.tissues) return '';
            const ncns = TT.n_cns || 0;
            const shade = (v) => v >= 100 ? 'rgba(251,191,36,0.45)' : v >= 10 ? 'rgba(134,239,172,0.30)' : v >= 1 ? 'rgba(138,180,255,0.20)' : 'transparent';
            const th = (label, k) => '<th style="position:sticky;top:0;background:#0b2545;padding:4px 3px;font:600 10.5px Arial;color:' + (k < ncns ? '#c4b5fd' : '#9fb3c8') + ';'
                + (k === ncns ? 'border-left:2px solid rgba(255,255,255,0.3);' : '') + 'writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;">' + esc(label) + '</th>';
            const rows = genes.map((g) => {
                const v = (TT.values || {})[('' + g).toUpperCase()];
                return '<tr><td style="position:sticky;left:0;background:#0a1e3a;padding:2px 8px 2px 0;font:700 11px Arial;color:#e8f0fb;">' + esc(g) + '</td>'
                    + (v ? v.map((x, k) => '<td style="padding:2px 4px;text-align:right;background:' + shade(x) + ';' + (k === ncns ? 'border-left:2px solid rgba(255,255,255,0.3);' : '') + '">' + tpmFmt(x) + '</td>').join('')
                        : '<td colspan="' + TT.tissues.length + '" style="color:#64748b;padding:2px 4px;">not in GTEx</td>') + '</tr>';
            }).join('');
            return '<div style="max-height:420px;overflow:auto;margin-top:6px;"><table style="border-collapse:collapse;font:11px Arial;color:#cfe0f5;">'
                + '<thead><tr><th style="position:sticky;top:0;left:0;z-index:1;background:#0b2545;"></th>' + TT.tissues.map(th).join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
                + '<div style="font:11px Arial;color:#9fb3c8;margin-top:4px;">' + esc(TT.source || 'GTEx median TPM') + '. CNS columns first (purple), then other tissues.</div>';
        };
        // A gene row. It can go to the editor when the file carries its transcript.
        const geneRow = (gene, chips, lines, after) => {
            const h = handoff[('' + gene).toUpperCase()];
            const can = !!(h && h.transcript);
            return card('<div style="display:flex;align-items:flex-start;gap:12px;">'
                + (can ? '<input type="checkbox" class="dv-pick" data-g="' + esc(('' + gene).toUpperCase()) + '" style="margin-top:4px;"/>' : '<span style="width:13px;"></span>')
                + '<div style="flex:1;min-width:0;"><span style="font:700 14px Arial;color:#e8f0fb;">' + esc(gene) + '</span> ' + chips
                + '<div style="font:12.5px Arial;color:#cfe0f5;margin-top:5px;line-height:1.5;">' + lines + dmLine(gene) + (after || '') + '</div></div>'
                + (can ? '<button class="dv-design" data-g="' + esc(('' + gene).toUpperCase()) + '" style="flex:0 0 auto;cursor:pointer;border-radius:8px;padding:7px 12px;'
                    + 'font:700 12px Arial;border:1px solid #22c55e;background:transparent;color:#86efac;">Design in editor</button>' : '')
                + '</div>');
        };

        let h = '';
        // HEADER
        h += '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:16px 22px 14px;background:#0b2545;'
            + 'border-bottom:1px solid rgba(255,255,255,0.12);position:sticky;top:0;z-index:2;">'
            + '<div style="min-width:0;"><div style="font:700 20px Arial;">LOH Design Strategy</div>'
            + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">' + esc(O.fileName || '') + ' &middot; ' + esc(doc.tumor) + ' (tumor) against '
            + esc(doc.germline) + ' (germline)'
            + (O.shared ? '<br/>Shared with you, view only' : '')
            + '<br/>Saved ' + esc(doc.saved ? new Date(doc.saved).toLocaleString() : '') + ' &middot; ' + esc((doc.species || '') + ' ' + (doc.assembly || '')) + '</div></div>'
            + '<div style="margin-left:auto;display:flex;gap:10px;flex-wrap:wrap;">'
            + (O.onShare ? '<button id="dv-share" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;border:1px solid #f59e0b;background:transparent;color:#fbbf24;">Share</button>' : '')
            + (O.onClose ? '<button id="dv-close" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;">Close</button>' : '')
            + (doc.genome ? '<button id="dv-genome" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;border:1px solid rgba(139,180,255,0.55);background:transparent;color:#8ab4ff;">Open the genome</button>' : '')
            + '<button id="dv-design-picked" disabled style="cursor:pointer;opacity:0.5;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;border:1px solid #22c55e;background:#22c55e;color:#04210f;">Design ticked in editor</button>'
            + '</div></div>';
        h += '<div id="dv-msg" style="display:none;padding:8px 22px;background:#0a1e3a;font:12.5px Arial;color:#cfe0f5;"></div>';
        h += '<div style="max-width:1100px;margin:0 auto;padding:22px 22px 40px;">';

        // NUMBERS AND MAP
        const stat = (n, l, col) => '<div style="flex:1 1 170px;border-radius:10px;padding:12px 14px;background:#0a1e3a;border:1px solid ' + (col || 'rgba(255,255,255,0.14)') + ';">'
            + '<div style="font:700 22px Arial;color:' + (col || '#e8f0fb') + ';">' + n + '</div><div style="font:12px Arial;color:#9fb3c8;">' + l + '</div></div>';
        h += '<div style="display:flex;gap:10px;flex-wrap:wrap;">'
            + stat(pct(N.het ? N.loh / N.het : 0), (N.loh || 0).toLocaleString() + ' of ' + (N.het || 0).toLocaleString() + ' heterozygous sites lost an allele')
            + stat(N.tracts || 0, 'tracts, ' + mb(N.lohBp || 0))
            + stat(N.biallelic || 0, 'tumor suppressors inactivated on both copies', N.biallelic ? '#f87171' : '')
            + stat(N.gofHomozygous || 0, 'activating changes made homozygous by LOH', N.gofHomozygous ? '#fbbf24' : '')
            + stat(N.essential == null ? '-' : N.essential, 'essential genes with a tumor-specific change', '#60a5fa')
            + '</div>';
        if (doc.figure) h += '<img src="' + doc.figure + '" style="width:100%;margin-top:16px;border-radius:10px;background:#fff;"/>';

        // TRACTS
        const tr = doc.tracts || [];
        h += section('Tracts', 'Largest first, with the protein-coding genes inside each.',
            tr.length ? tr.map((t, i) => card('<span style="font:700 13.5px Arial;">' + esc(t.bands || t.chr) + '</span> '
                + chip(t.extent, t.rank <= 1 ? '#a855f7' : t.rank === 2 ? '#f97316' : '#94a3b8')
                + '<div style="font:12px Arial;color:#9fb3c8;margin-top:4px;">' + esc(t.chr + ':' + (+t.lo).toLocaleString() + '-' + (+t.hi).toLocaleString())
                + ' &middot; ' + mb(t.len || 0) + ' &middot; ' + (t.n || 0).toLocaleString() + ' sites lost</div>'
                + ((t.genes && t.genes.length) ? '<details style="margin-top:6px;font:12px Arial;color:#cfe0f5;"><summary style="cursor:pointer;color:#8ab4ff;">'
                    + t.genes.length + ' gene' + (t.genes.length === 1 ? '' : 's') + '</summary><div style="margin-top:6px;line-height:1.6;">' + esc(t.genes.join(', ')) + '</div></details>' : '')
                + ((t.genes && t.genes.length && TT) ? '<details class="dv-tpm" data-t="' + i + '" style="margin-top:6px;font:12px Arial;color:#cfe0f5;"><summary style="cursor:pointer;color:#8ab4ff;">Tissue expression of the '
                    + t.genes.length + ' gene' + (t.genes.length === 1 ? '' : 's') + ' (GTEx TPM)</summary><div class="dv-tpm-body"></div></details>' : ''))).join('')
            : card('No tract.'));

        // ONCOGENES
        if (Array.isArray(doc.oncogenes)) {
            const on = doc.oncogenes.slice().sort((a, b) => a.rank - b.rank);
            h += section('Oncogenes in LOH', '',
                on.length ? on.map((g) => {
                    const col = g.rank === 0 ? '#fbbf24' : g.rank === 1 ? '#fb923c' : '#94a3b8';
                    const w = g.rank === 0 ? 'activating, homozygous by LOH' : g.rank === 1 ? 'activating, both alleles read' : g.rank === 2 ? 'possible change' : g.rank === 3 ? 'no change' : 'not assessed';
                    return geneRow(g.gene, chip(w, col), esc(g.status)
                        + '<br/><span style="color:#9fb3c8;">' + ((g.lost + g.kept) ? esc(g.lost + ' of ' + (g.lost + g.kept) + ' heterozygous sites in the gene lost an allele (' + pct(g.frac) + ')')
                            : 'No heterozygous site inside the gene; the tract around it carries the call') + '</span>'
                        + ((g.variants || []).length ? '<br/>' + g.variants.slice(0, 6).map(vLine).join('<br/>') : ''), tpmHtml(g.gene));
                }).join('') : card('No oncogene from the catalogue lies inside a tract.'));
        }

        // TUMOR SUPPRESSORS
        const ts = (doc.tsg || []).slice().sort((a, b) => a.rank - b.rank);
        h += section('Tumor suppressors in LOH', '',
            ts.length ? ts.map((g) => geneRow(g.gene, chip(g.rank === 0 ? 'biallelic' : g.rank <= 2 ? 'possible second hit' : 'one copy left',
                g.rank === 0 ? '#f87171' : g.rank <= 2 ? '#fbbf24' : '#94a3b8'),
                esc(g.verdict) + ((g.variants || []).length ? '<br/>' + g.variants.slice(0, 6).map(vLine).join('<br/>') : ''), tpmHtml(g.gene))).join('')
            : card('No gene on the tumor-suppressor list lies inside a tract.'));

        // ESSENTIAL GENES IN THE LOH REGION -- or, in a file saved before that section, the
        // gain-of-function section it was saved with.
        if (Array.isArray(doc.essentialInLoh)) {
            h += section('Essential genes in LOH region', '', doc.essentialInLoh.length ? doc.essentialInLoh.map((x) => {
                const changed = (x.variants || []).length > 0;
                const lohTxt = (x.bands ? 'In ' + x.bands + (x.extent ? ' (' + x.extent + ')' : '') + '. ' : '')
                    + ((x.lost != null && (x.lost + x.kept)) ? x.lost + ' of ' + (x.lost + x.kept) + ' heterozygous sites in the gene lost an allele.'
                        : 'No heterozygous site inside the gene; the tract around it carries the call.');
                return geneRow(x.gene, chip(x.cls, '#60a5fa') + ' ' + chip(changed ? 'tumor-specific change' : 'no change', changed ? '#fbbf24' : '#94a3b8'),
                    '<span style="color:#9fb3c8;">' + esc(lohTxt) + '</span>' + (changed ? '<br/>' + x.variants.slice(0, 6).map(vLine).join('<br/>') : ''),
                    fnHtml(x.gene) + tpmHtml(x.gene));
            }).join('') : card('No essential gene lies inside an LOH tract.'));
        }
        const gl = Array.isArray(doc.essentialInLoh) ? [] : ((doc.gof && doc.gof.list) || []);
        const gGenes = Array.from(new Set(gl.map((x) => x.gene)));
        if (!Array.isArray(doc.essentialInLoh)) h += section('Gain-of-function mutations and LOH', doc.gof ? 'Changes the tumor carries in ' + (doc.gof.checked || 0) + ' oncogenes.' : 'Not assessed in this file.',
            gGenes.length ? gGenes.map((gn) => {
                const xs = gl.filter((x) => x.gene === gn), top = xs[0];
                const col = top.inLoh && top.state === 'retained' ? '#fbbf24' : top.level === 'hotspot' ? '#fb923c' : '#94a3b8';
                return geneRow(gn, chip(top.level, col) + (top.inLoh ? ' ' + chip(top.state === 'retained' ? 'homozygous by LOH' : 'in an LOH tract', '#a855f7') : ''),
                    xs.slice(0, 6).map((x) => vLine(x) + '<br/><span style="color:#9fb3c8;">' + esc(x.why) + (x.stateWord ? '; ' + esc(x.stateWord) : '') + '</span>').join('<br/>'));
            }).join('') : card('No protein-altering change in the oncogenes checked.'));

        // ESSENTIAL GENES
        if (doc.essential) {
            h += section('Essential genes with tumor-specific changes', 'Insertions and deletions first, missense last.',
                doc.essential.length ? doc.essential.slice(0, 60).map((c) => geneRow(c.gene, chip(c.cls, '#60a5fa') + (c.inLoh ? ' ' + chip('in an LOH tract', '#a855f7') : ''),
                    (c.variants || []).slice(0, 6).map(vLine).join('<br/>'), fnHtml(c.gene) + tpmHtml(c.gene))).join('')
                    : card('None of the essential genes carries a protein-altering change that is the tumor\'s own.'));
            // Where the dependency numbers come from, as the strategy cited them when it was saved.
            const cites = (doc.depmapCitations && doc.depmapCitations.length) ? doc.depmapCitations : [
                { text: 'Tsherniak A, Vazquez F, Montgomery PG, et al. Defining a Cancer Dependency Map. Cell. 2017;170(3):564-576.e16.', doi: '10.1016/j.cell.2017.06.014' },
                { text: 'Dempster JM, Boyle I, Vazquez F, et al. Chronos: a cell population dynamics model of CRISPR experiments that improves inference of gene fitness effects. Genome Biology. 2021;22:343.', doi: '10.1186/s13059-021-02540-7' }];
            const portal = doc.depmapPortal || 'https://depmap.org/portal/';
            h += '<div style="font:11.5px Arial;color:#9fb3c8;margin:4px 0 6px;line-height:1.55;">Dependency data: DepMap (<a href="' + esc(portal)
                + '" target="_blank" rel="noopener" style="color:#8ab4ff;">depmap.org</a>). '
                + cites.map((c) => esc(c.text) + ' <a href="https://doi.org/' + esc(c.doi) + '" target="_blank" rel="noopener" style="color:#8ab4ff;">doi:' + esc(c.doi) + '</a>').join(' ')
                + '</div>';
        }
        if (!Array.isArray(doc.essentialInLoh) && (doc.singleCopy || []).length) {
            h += section('Essential genes at one copy, unmutated', 'Single-copy dependencies: a partial knockdown the diploid normal tissue tolerates.',
                doc.singleCopy.map((g) => geneRow(g.gene, chip(g.cls, '#60a5fa'), '')).join(''));
        }

        // THE ASSESSMENT
        const A = doc.assessment;
        if (A) {
            const confCol = { high: '#86efac', medium: '#fbbf24', low: '#94a3b8' };
            h += section('Selective lethality assessment', '',
                card('<div style="font:12px Arial;color:#9fb3c8;">Hypotheses, not findings, written by a language model'
                    + (A.assessedAt ? ' on ' + esc(new Date(A.assessedAt).toLocaleString()) : '') + '.</div>'
                    + '<div style="font:13px Arial;color:#e8f0fb;margin-top:6px;line-height:1.5;">' + esc(A.summary || '') + '</div>')
                + (A.findings || []).map((f) => geneRow(f.gene, chip(f.mechanism, '#c4b5fd') + ' ' + chip(f.confidence + ' confidence', confCol[f.confidence] || '#94a3b8'),
                    '<b>' + esc(f.variant) + '</b><br/>' + esc(f.rationale)
                    + '<details style="margin-top:6px;"><summary style="cursor:pointer;color:#8ab4ff;">Approach, normal cells, caveats</summary>'
                    + '<div style="margin-top:6px;"><b>Approach:</b> ' + esc(f.approach) + '</div><div style="margin-top:4px;"><b>In normal cells:</b> ' + esc(f.normal_cells) + '</div>'
                    + '<div style="margin-top:4px;"><b>Caveats:</b> ' + esc(f.caveats) + '</div></details>')).join('')
                + (A.not_pursued ? card('<div style="font:12px Arial;color:#9fb3c8;"><b>Not pursued:</b> ' + esc(A.not_pursued) + '</div>') : ''));
        }
        h += '</div>';
        root.innerHTML = h;

        // ACTIONS
        const q = (sel) => root.querySelector(sel);
        const say = (m) => { const el = q('#dv-msg'); if (el) { el.style.display = m ? 'block' : 'none'; el.textContent = m || ''; } };
        // TO THE EDITOR: each gene as two tracks, the germline and the tumor, each with the
        // variants the file carries for it. The same hand-off the Genome Viewer uses: the payload
        // under a one-time key in localStorage, and the editor opened on that key -- in a new tab,
        // or in this one if the browser will not open a tab.
        const HANDOFF_MAX_VARIANTS = 3000;
        const design = async (keys) => {
            const ids = [], vars = [];
            for (const k of keys) {
                const g = handoff[k];
                if (!g || !g.transcript || ids.length >= 12) continue;
                ids.push({ id: g.transcript, group: 'germline', label: 'Germline — ' + (doc.germline || 'normal') });
                ids.push({ id: g.transcript, group: 'tumor', label: 'Tumor — ' + (doc.tumor || 'tumor') });
                for (const v of (g.germline || [])) vars.push(v);
                for (const v of (g.tumor || [])) vars.push(v);
            }
            if (!ids.length) { say('Nothing here can go to the editor: the file carries no transcript for it.'); return; }
            const first = vars.find((v) => v.group === 'tumor') || vars[0];
            const payload = { v: 1, from: 'design', at: Date.now(), species: doc.species || 'human',
                list: ids, focus: first ? { chr: first.chr, pos: first.pos } : null, variants: vars.slice(0, HANDOFF_MAX_VARIANTS) };
            const key = 'baja.editorHandoff.' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
            try { localStorage.setItem(key, JSON.stringify(payload)); }
            catch (e) { say('The browser would not hold the hand-off: ' + (e && e.message ? e.message : e)); return; }
            const url = window.location.origin + '/app/manchester/editor?handoff=' + encodeURIComponent(key);
            const genes = keys.map((k) => (handoff[k] && handoff[k].gene) || k).join(', ');
            let win = null;
            try { win = window.open(url, '_blank'); } catch (e) { win = null; }
            if (win) { say('Opening ' + genes + ' in the oligo editor in a new tab: a germline track and a tumor track for each.'); return; }
            window.location.assign(url);
        };
        const sync = () => {
            const b = q('#dv-design-picked');
            if (!b) return;
            b.disabled = !picked.size;
            b.style.opacity = picked.size ? '' : '0.5';
            b.textContent = picked.size ? 'Design ' + picked.size + ' ticked in editor' : 'Design ticked in editor';
        };
        Array.prototype.forEach.call(root.querySelectorAll('.dv-pick'), (cb) => {
            cb.onchange = () => {
                const g = cb.getAttribute('data-g');
                if (cb.checked) picked.add(g); else picked.delete(g);
                // The same gene can appear in more than one section; its boxes move together.
                Array.prototype.forEach.call(root.querySelectorAll('.dv-pick[data-g="' + g + '"]'), (x) => { x.checked = cb.checked; });
                sync();
            };
        });
        // Tract tables are built when opened: a whole-chromosome tract has hundreds of rows.
        Array.prototype.forEach.call(root.querySelectorAll('.dv-tpm'), (d2) => {
            d2.addEventListener('toggle', () => {
                const body = d2.querySelector('.dv-tpm-body'), t = tr[+d2.getAttribute('data-t')];
                if (d2.open && body && t && !body.innerHTML) body.innerHTML = tpmTableHtml(t.genes || []);
            });
        });
        Array.prototype.forEach.call(root.querySelectorAll('.dv-design'), (b) => { b.onclick = () => design([b.getAttribute('data-g')]); });
        const bp = q('#dv-design-picked');
        if (bp) bp.onclick = () => { if (picked.size) design(Array.from(picked)); };
        const bs = q('#dv-share');
        if (bs && O.onShare) bs.onclick = () => O.onShare();
        const bc = q('#dv-close');
        if (bc && O.onClose) bc.onclick = () => O.onClose();
        const bg = q('#dv-genome');
        if (bg) bg.onclick = () => { try { window.open(window.location.origin + '/app/manchester/karyotype?path=' + doc.genome, '_blank'); } catch (e) { } };
    };
}
