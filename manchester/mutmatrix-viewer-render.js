function () {
    // DRAWING A SAVED MUTATIONAL MATRIX (.mutmax). The same reading as the panel it was saved
    // from: the three counts, the gene table with each gene's variants under it, and the
    // substitution spectrum. Nothing is computed here -- the file carries what was shown.
    return (root, doc, opts) => {
        const O = opts || {};
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        // The same classes, colours and wording the Genome Viewer's matrix uses, so a saved
        // matrix reads exactly as it did there: A red, B blue, both purple.
        const COL = { A: '#f87171', B: '#60a5fa', S: '#a78bfa' };
        const PROTEIN = new Set(['frameshift', 'stop_gained', 'start_lost', 'splice_donor', 'splice_acceptor',
            'hotspot_missense', 'pathogenic_missense', 'stop_lost', 'inframe_indel', 'missense']);
        const LOF = new Set(['frameshift', 'stop_gained', 'start_lost', 'splice_donor', 'splice_acceptor',
            'hotspot_missense', 'pathogenic_missense']);
        const word = (e) => ('' + (e || '')).replace(/_/g, ' ');
        const P = doc.pair || {};
        const classes = doc.sbsClasses || ['C>A', 'C>G', 'C>T', 'T>A', 'T>C', 'T>G'];
        let protOnly = !!doc.proteinOnly;
        const expanded = new Set();

        const chip = (who, text) => '<span style="display:inline-block;border-radius:20px;padding:2px 9px;font:700 11px Arial;white-space:nowrap;'
            + 'background:' + COL[who] + '22;border:1px solid ' + COL[who] + '99;color:' + COL[who] + ';">' + esc(text) + '</span>';
        const btn = (id, label, style) => '<button id="' + id + '" style="cursor:pointer;border-radius:8px;padding:9px 16px;font:700 12.5px Arial;'
            + (style || 'border:1px solid rgba(255,255,255,0.22);background:transparent;color:#fff;') + '">' + label + '</button>';
        const cell = (who, n, max) => {
            const a = n ? (0.18 + 0.62 * Math.min(1, n / Math.max(1, max))) : 0;
            return '<td style="text-align:center;padding:8px 6px;font:700 13px Arial;'
                + (n ? 'background:' + COL[who] + Math.round(a * 255).toString(16).padStart(2, '0') + ';color:#fff;' : 'color:#4b6480;') + '">' + (n || '·') + '</td>';
        };
        // A gene under the current filter: the counts, the worst change private to each side.
        const rowOf = (g) => {
            const inF = (v) => !protOnly || PROTEIN.has(v.effect);
            const n = (protOnly ? g.prot : g.all) || { A: 0, B: 0, S: 0 };
            const worst = (who) => { const v = (g.vars || []).find((x) => x.who === who && inF(x)); return v ? v.effect : ''; };
            const call = n.A && n.B ? 'both, differently' : n.A ? 'A only' : n.B ? 'B only' : n.S ? 'shared' : '';
            return { n: n, worstA: worst('A'), worstB: worst('B'), call: call,
                lofPrivate: (g.vars || []).some((x) => x.who !== 'S' && LOF.has(x.effect)), shown: (g.vars || []).filter(inF) };
        };

        const render = () => {
            const T = doc.tally || { A: 0, B: 0, S: 0 };
            const rows = (doc.genes || []).map((g) => ({ g: g, x: rowOf(g) })).filter((o) => o.x.call);
            const rank = (o) => (o.x.call === 'shared' ? 2 : 0) + (o.x.lofPrivate ? 0 : 1);
            rows.sort((p, q) => rank(p) - rank(q) || (q.x.n.A + q.x.n.B) - (p.x.n.A + p.x.n.B) || ('' + p.g.gene).localeCompare('' + q.g.gene));
            const nDiff = rows.filter((o) => o.x.call !== 'shared').length;
            const maxN = rows.reduce((m, o) => Math.max(m, o.x.n.A, o.x.n.B, o.x.n.S), 1);

            let h = '<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:16px 22px 14px;background:#0b2545;'
                + 'border-bottom:1px solid rgba(255,255,255,0.12);position:sticky;top:0;z-index:2;">'
                + '<div style="min-width:0;"><div style="font:700 20px Arial;">Differential mutational matrix</div>'
                + '<div style="font:12.5px Arial;color:#9fb3c8;margin-top:3px;">' + esc(O.fileName || '') + (doc.region ? ' &middot; ' + esc(doc.region) : '')
                + ' &middot; <b style="color:' + COL.A + '">A</b> ' + esc(P.labelA) + ' against <b style="color:' + COL.B + '">B</b> ' + esc(P.labelB)
                + (P.kind === 'side' ? ' (two files)' : ' (two samples of one file)')
                + (O.shared ? '<br/>Shared with you, view only' : '')
                + '<br/>Saved ' + esc(doc.saved ? new Date(doc.saved).toLocaleString() : '') + ' &middot; ' + esc((doc.species || '') + ' ' + (doc.assembly || '')) + '</div></div>'
                + '<div style="margin-left:auto;display:flex;gap:10px;flex-wrap:wrap;">'
                + btn('mx-close', 'Close')
                + (O.onShare ? btn('mx-share', 'Share', 'border:1px solid #f59e0b;background:transparent;color:#fbbf24;') : '')
                + btn('mx-csv', 'Download CSV', 'border:1px solid #22c55e;background:#22c55e;color:#04210f;')
                + '</div></div>'
                + '<div id="mx-note" style="display:none;padding:10px 22px;background:#08203c;border-bottom:1px solid rgba(255,255,255,0.10);font:12.5px Arial;color:#cfe0f5;"></div>'
                + '<div style="max-width:1100px;margin:0 auto;padding:22px 22px 40px;">'
                + '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">'
                + [['A', 'only in A · ' + P.labelA, T.A], ['S', 'in both', T.S], ['B', 'only in B · ' + P.labelB, T.B]].map((t) =>
                    '<div style="flex:1 1 200px;border-radius:10px;padding:12px 14px;background:#0a1e3a;border:1px solid ' + COL[t[0]] + '66;">'
                    + '<div style="font:700 22px Arial;color:' + COL[t[0]] + ';">' + (+t[2] || 0).toLocaleString() + '</div>'
                    + '<div style="font:12px Arial;color:#9fb3c8;">variant' + (t[2] === 1 ? '' : 's') + ' ' + esc(t[1]) + '</div></div>').join('')
                + '</div>'
                + '<div style="display:flex;align-items:center;gap:18px;flex-wrap:wrap;margin-bottom:10px;">'
                + '<label style="font:12.5px Arial;color:#cfe0f5;cursor:pointer;"><input type="checkbox" id="mx-prot"' + (protOnly ? ' checked' : '')
                + ' style="margin-right:6px;"/>Protein-altering changes only</label>'
                + '<span style="font:12.5px Arial;color:#9fb3c8;">' + nDiff + ' gene' + (nDiff === 1 ? '' : 's') + ' differ' + (nDiff === 1 ? 's' : '')
                + ' &middot; ' + rows.length + ' mutated</span></div>'
                + '<div style="font:12px Arial;color:#9fb3c8;margin-bottom:14px;">'
                + (doc.highConfidenceOnly ? 'High-confidence calls only, as in the loss matrix. ' : 'Every call, whatever its confidence. ')
                + (P.kind === 'side'
                    ? 'Two files cannot show whether the other was sequenced at a site: "only in A" means no call in B\'s file, which may be a reference call or a coverage gap.'
                    : 'For each private variant the other sample\'s call at that site is shown: a confident reference call is evidence of absence; a low-confidence call means it may be there and unseen.')
                + (doc.outside ? ' ' + (+doc.outside).toLocaleString() + ' variant' + (doc.outside === 1 ? ' falls' : 's fall') + ' outside any gene.' : '')
                + (doc.unread ? ' ' + (+doc.unread).toLocaleString() + ' variant' + (doc.unread === 1 ? ' was' : 's were') + ' past the limit whose consequence is read.' : '')
                + '</div>';

            if (!rows.length) {
                h += '<div style="padding:26px;border-radius:10px;background:#0a1e3a;font:14px Arial;color:#cfe0f5;">No gene here carries a '
                    + (protOnly ? 'protein-altering ' : '') + 'change in either sample.'
                    + (protOnly ? ' Untick "Protein-altering changes only" to see every change.' : '') + '</div>';
            } else {
                const th = (t, al) => '<th style="position:sticky;top:0;background:#0b2545;padding:9px 8px;font:700 11.5px Arial;color:#9fb3c8;text-align:' + (al || 'left') + ';">' + t + '</th>';
                h += '<table style="width:100%;border-collapse:separate;border-spacing:0 3px;">'
                    + '<tr>' + th('Gene') + th('<span style="color:' + COL.A + '">A only</span>', 'center') + th('<span style="color:' + COL.S + '">Both</span>', 'center')
                    + th('<span style="color:' + COL.B + '">B only</span>', 'center') + th('Worst private to A') + th('Worst private to B') + th('Call') + '</tr>';
                for (const o of rows) {
                    const g = o.g, x = o.x, open = expanded.has(g.gene);
                    const callWho = x.call === 'A only' ? 'A' : x.call === 'B only' ? 'B' : 'S';
                    h += '<tr class="mx-g" data-g="' + esc(g.gene) + '" style="cursor:pointer;background:#0a1e3a;">'
                        + '<td style="padding:8px 10px;border-radius:8px 0 0 8px;"><span style="font:700 13.5px Arial;color:#e8f0fb;">' + (open ? '▾ ' : '▸ ') + esc(g.gene) + '</span>'
                        + '<br/><span style="font:11.5px Arial;color:#9fb3c8;">' + esc(g.transcript || '') + '</span></td>'
                        + cell('A', x.n.A, maxN) + cell('S', x.n.S, maxN) + cell('B', x.n.B, maxN)
                        + '<td style="padding:8px;font:12.5px Arial;color:' + (LOF.has(x.worstA) ? '#fca5a5' : '#cfe0f5') + ';">' + esc(word(x.worstA) || '—') + '</td>'
                        + '<td style="padding:8px;font:12.5px Arial;color:' + (LOF.has(x.worstB) ? '#93c5fd' : '#cfe0f5') + ';">' + esc(word(x.worstB) || '—') + '</td>'
                        + '<td style="padding:8px 10px;border-radius:0 8px 8px 0;">' + chip(callWho, x.call)
                        + (g.transcript ? ' <button class="mx-design" data-g="' + esc(g.gene) + '" title="Open both samples in the oligo editor, one track each"'
                            + ' style="cursor:pointer;margin-left:8px;border-radius:7px;padding:5px 10px;font:700 11.5px Arial;border:1px solid #22c55e;background:transparent;color:#86efac;">Design ASO</button>' : '')
                        + '</td></tr>';
                    if (!open) continue;
                    h += '<tr><td colspan="7" style="padding:4px 10px 12px 28px;"><table style="width:100%;border-collapse:collapse;font:12px Arial;">'
                        + '<tr style="color:#9fb3c8;"><td style="padding:4px 6px;">Position</td><td>Change</td><td>Consequence</td><td>Protein</td>'
                        + '<td>A (' + esc(P.labelA) + ')</td><td>B (' + esc(P.labelB) + ')</td><td>The other sample shows</td><td></td></tr>'
                        + x.shown.map((v) => '<tr style="border-top:1px solid rgba(255,255,255,0.08);">'
                            + '<td style="padding:5px 6px;white-space:nowrap;">' + esc(v.chr + ':' + (+v.pos).toLocaleString()) + '</td>'
                            + '<td style="font-family:monospace;">' + esc((v.ref.length > 12 ? v.ref.slice(0, 12) + '…' : v.ref) + '>' + (v.alt.length > 12 ? v.alt.slice(0, 12) + '…' : v.alt)) + '</td>'
                            + '<td style="color:' + (LOF.has(v.effect) ? '#fca5a5' : '#e8f0fb') + ';">' + esc(word(v.effect)) + '</td>'
                            + '<td>' + esc(v.hgvs_p || v.hgvs_c || '') + '</td>'
                            + '<td style="color:' + (v.who === 'A' || v.who === 'S' ? COL.A : '#6b819b') + ';">' + esc(v.gtA || '—') + '</td>'
                            + '<td style="color:' + (v.who === 'B' || v.who === 'S' ? COL.B : '#6b819b') + ';">' + esc(v.gtB || '—') + '</td>'
                            + '<td style="color:' + (v.absence === 'confident reference' ? '#8ff0b0' : '#fcd34d') + ';">' + esc(v.absence || '') + '</td>'
                            + '<td style="text-align:right;">' + (g.transcript ? '<button class="mx-vdesign" data-g="' + esc(g.gene) + '" data-v="' + esc(v.pos + ':' + v.ref + ':' + v.alt) + '"'
                                + ' title="Design an allele-selective oligo against this change" style="cursor:pointer;border-radius:6px;padding:3px 8px;font:700 11px Arial;'
                                + 'border:1px solid ' + COL[v.who] + '99;background:transparent;color:' + COL[v.who] + ';">Design against this</button>' : '') + '</td></tr>').join('')
                        + '</table></td></tr>';
                }
                h += '</table>';
            }

            // THE SPECTRUM, as saved: each class as a share of that side's single-base changes.
            const sbs = doc.sbs || { A: {}, B: {}, S: {} };
            h += '<div style="margin-top:26px;font:700 13px Arial;color:#e8f0fb;">Substitution spectrum</div>'
                + '<div style="font:12px Arial;color:#9fb3c8;margin:4px 0 8px;">Every single-base change in the region, genes or not, folded to the pyrimidine.</div>'
                + '<table style="border-collapse:collapse;"><tr><td></td>' + classes.map((s) => '<td style="padding:0 6px;font:700 11.5px Arial;color:#9fb3c8;">' + esc(s) + '</td>').join('') + '</tr>'
                + ['A', 'S', 'B'].map((who) => {
                    const c = sbs[who] || {}, tot = classes.reduce((t, s) => t + (c[s] || 0), 0);
                    return '<tr><td style="padding:5px 10px 5px 0;white-space:nowrap;">' + chip(who, who === 'S' ? 'shared' : who + ' only')
                        + ' <span style="color:#9fb3c8;font:12px Arial;">' + tot.toLocaleString() + ' SNV' + (tot === 1 ? '' : 's') + '</span></td>'
                        + classes.map((s) => {
                            const f = tot ? (c[s] || 0) / tot : 0;
                            return '<td style="padding:5px 6px;min-width:74px;"><div style="height:10px;border-radius:3px;background:rgba(255,255,255,0.08);">'
                                + '<div style="height:10px;border-radius:3px;width:' + Math.round(f * 100) + '%;background:' + COL[who] + ';"></div></div>'
                                + '<div style="font:11px Arial;color:#9fb3c8;margin-top:2px;">' + (tot ? Math.round(f * 100) + '%' : '—') + ' &middot; ' + (c[s] || 0) + '</div></td>';
                        }).join('') + '</tr>';
                }).join('') + '</table></div>';

            root.innerHTML = h;
            const q = (sel) => root.querySelector(sel);
            if (q('#mx-close')) q('#mx-close').onclick = () => { if (O.onClose) O.onClose(); };
            if (q('#mx-share') && O.onShare) q('#mx-share').onclick = () => O.onShare();
            if (q('#mx-prot')) q('#mx-prot').onchange = (e) => { protOnly = !!e.target.checked; render(); };
            if (q('#mx-csv')) q('#mx-csv').onclick = () => csv();
            const geneByName = (nm) => (doc.genes || []).find((g) => ('' + g.gene) === nm);
            Array.prototype.forEach.call(root.querySelectorAll('.mx-design'), (b2) => {
                b2.onclick = (e) => { e.stopPropagation(); design(geneByName(b2.getAttribute('data-g')), null); };
            });
            Array.prototype.forEach.call(root.querySelectorAll('.mx-vdesign'), (b2) => {
                b2.onclick = (e) => {
                    e.stopPropagation();
                    const g = geneByName(b2.getAttribute('data-g'));
                    if (!g) return;
                    const k = ('' + b2.getAttribute('data-v')).split(':');
                    design(g, (g.vars || []).find((x) => x.pos === +k[0] && x.ref === k[1] && x.alt === k[2]) || null);
                };
            });
            Array.prototype.forEach.call(root.querySelectorAll('.mx-g'), (tr2) => {
                tr2.onclick = () => { const g = tr2.getAttribute('data-g'); if (expanded.has(g)) expanded.delete(g); else expanded.add(g); render(); };
            });
        };

        // ALLELE-SELECTIVE DESIGN. The editor opens with two tracks of the same transcript --
        // one per sample -- each carrying only the alleles that sample has, so an oligo can be
        // aimed at one allele and checked against the other. A single change can be targeted.
        const MAX_VARS = 4000;
        const design = async (g, target) => {
            if (!g || !g.transcript) { note('That gene has no transcript in this file.'); return; }
            const ids = [{ id: g.transcript, group: 'A', label: 'A \u2014 ' + (P.labelA || 'A') }, { id: g.transcript, group: 'B', label: 'B \u2014 ' + (P.labelB || 'B') }];
            const vars = [];
            for (const v of (g.vars || []).slice(0, 400)) {
                const annots = ['GENE=' + g.gene, 'CONSEQUENCE=' + (v.effect || ''),
                    'CARRIED_BY=' + (v.who === 'S' ? 'both' : v.who === 'A' ? (P.labelA || 'A') : (P.labelB || 'B'))];
                if (v.hgvs_p || v.hgvs_c) annots.push('HGVS=' + (v.hgvs_p || v.hgvs_c));
                if (target && v === target) annots.push('ALLELE_SELECTIVE_TARGET=1');
                const base = { chr: ('' + v.chr).replace(/^chr/, ''), pos: v.pos, ref: v.ref, alt: v.alt,
                    name: g.gene + ' ' + (v.hgvs_p || v.hgvs_c || (v.ref + '>' + v.alt)), source: 'VCF', annotations: annots };
                if (v.who === 'A' || v.who === 'S') vars.push(Object.assign({}, base, { group: 'A', genotypes: [v.gtA || ''], samples: [P.labelA || 'A'] }));
                if (v.who === 'B' || v.who === 'S') vars.push(Object.assign({}, base, { group: 'B', genotypes: [v.gtB || ''], samples: [P.labelB || 'B'] }));
            }
            const f = target || (g.vars || [])[0];
            const payload = { v: 1, from: 'mutmatrix', at: Date.now(), species: doc.species || 'human', list: ids,
                focus: f ? { chr: ('' + f.chr).replace(/^chr/, ''), pos: f.pos } : null, variants: vars.slice(0, MAX_VARS) };
            const key = 'baja.editorHandoff.' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
            try { localStorage.setItem(key, JSON.stringify(payload)); }
            catch (e) { note('The browser would not hold the hand-off: ' + (e && e.message ? e.message : e)); return; }
            const url = window.location.origin + '/app/manchester/editor?handoff=' + encodeURIComponent(key);
            let win = null;
            try { win = window.open(url, '_blank'); } catch (e) { win = null; }
            if (win) { note('Opening ' + g.gene + ' in the oligo editor in a new tab: one track per sample' + (target ? ', on ' + (target.hgvs_p || target.hgvs_c || (target.ref + '>' + target.alt)) : '') + '.'); return; }
            window.location.assign(url);
        };
        // A line under the header, for what just happened.
        const note = (t) => { const n = root.querySelector('#mx-note'); if (n) { n.textContent = t; n.style.display = 'block'; } };

        // The same columns the Genome Viewer's CSV has, from the file.
        const csv = () => {
            const head = ['gene', 'transcript', 'chrom', 'pos', 'ref', 'alt', 'effect', 'protein_altering', 'hgvs_c', 'hgvs_p',
                'carried_by', 'sample_A', 'gt_A', 'sample_B', 'gt_B', 'other_sample_shows', 'substitution'];
            const q = (v) => { const t = '' + (v == null ? '' : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
            const lines = [head.join(',')];
            for (const g of (doc.genes || [])) {
                for (const v of (g.vars || [])) {
                    lines.push([g.gene, g.transcript || '', v.chr, v.pos, v.ref, v.alt, v.effect, PROTEIN.has(v.effect) ? 1 : 0, v.hgvs_c || '', v.hgvs_p || '',
                        v.who === 'S' ? 'both' : v.who === 'A' ? 'A only' : 'B only', P.labelA, v.gtA || '', P.labelB, v.gtB || '', v.absence || '', v.sbs || ''].map(q).join(','));
                }
            }
            const name = ('' + (O.fileName || 'mutational_matrix')).replace(/\.mutmax$/i, '') + '.csv';
            try {
                const a = document.createElement('a');
                a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
                a.download = name;
                document.body.appendChild(a); a.click();
                setTimeout(() => { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) { } }, 1000);
            } catch (e) { }
        };

        render();
    };
}
