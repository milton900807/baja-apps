function (graph, model) {

    // WHERE A GENE IS CONSERVED, ACROSS EVERY SPECIES AT ONCE.
    //   exec('baja/bio/conservation-map.js', graph, { gene, length, species_rows, profile,
    //                                                 blocks, scoring, note })
    //
    // A list of homologs with one percentage each says how alike two proteins are overall
    // and nothing about WHERE. A protein can be 60% identical because every residue is a
    // coin flip, or because two domains are perfect and the linker between them is not,
    // and those are opposite facts about the same number.
    //
    // ONE ROW PER SPECIES, ONE COLUMN PER RESIDUE of the query, every row on the query's
    // own numbering because that is what Ensembl's pairwise alignments are all against.
    // Read down a column and you see what every species did at that residue; read along a
    // row and you see one species. The band above them is how many agree at each residue,
    // which is the thing the eye should land on first, so it is drawn largest and darkest.
    //
    // IT IS A PROTEIN MAP, AND IT SAYS SO. Ensembl's homology alignments are protein
    // alignments, so a column is a residue and not a base: a 6 kb transcript is 1,321
    // columns wide and nothing on the picture explained why. The lane across the top is
    // the transcript on the canvas that this started from, cut into its exons, which
    // answers the question that always follows "where is this conserved": which exon is
    // that. Residue k is codon k, so an exon that covers a run of codons covers a run of
    // residues, and the boundary lands where a reader would point.
    //
    // COLOUR SAYS WHAT KIND OF AGREEMENT, not how much: identical, a conservative
    // substitution, a different residue, or nothing aligned there at all. Those are four
    // different facts and a single shade of blue would lose three of them -- a stretch
    // that is "similar but never identical" is a domain under selection, and it looks
    // nothing like a stretch that is half identical and half unaligned.

    return (async () => {
        const m = model || {};
        const rows = (m.species_rows || []).filter((r) => r && r.states);
        const L = +m.length || 0;
        if (!rows.length || !L) return null;
        try { if (window.__bajaConservationMap && window.__bajaConservationMap.destroy) window.__bajaConservationMap.destroy(); } catch (e) { }

        const prof = m.profile || {};
        const nSp = +prof.n || rows.length;
        const ident = prof.identical || [], simil = prof.similar || [];
        const blocks = (m.blocks || []).slice().sort((a, b) => a.start - b.start);
        const gene = '' + (m.gene || 'this gene');
        const src = m.source || null;
        const exons = (src && Array.isArray(src.exons)) ? src.exons : [];
        // ONLY WHEN IT IS THE SAME PROTEIN. The track on the canvas may be a different
        // transcript from the one Ensembl aligned, and exon boundaries drawn from a
        // different protein would be confidently wrong. Within a residue or two is the
        // same protein; further apart is not, and the lane is dropped with a line saying
        // why rather than drawn and hoped for.
        const srcLen = +((src && src.residues) || 0);
        const exonsFit = !!(exons.length && srcLen && Math.abs(srcLen - L) <= 2);
        // The same test as the exons: a residue number from another transcript points at
        // the wrong column, and a variant drawn on the wrong column is worse than none.
        const vars = (src && Array.isArray(src.variants) && srcLen && Math.abs(srcLen - L) <= 2)
            ? src.variants.filter((v) => v && +v.residue >= 1 && +v.residue <= L) : [];
        const exonNote = (exons.length && !exonsFit)
            ? ('the track is ' + srcLen.toLocaleString() + ' residues and Ensembl aligned '
                + L.toLocaleString() + ', so they are different transcripts and the exon '
                + 'boundaries are not drawn')
            : '';

        const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const num = (x) => (Math.round(+x) || 0).toLocaleString();
        const pct1 = (x) => ((Math.round((+x || 0) * 1000) / 10).toFixed(1) + '%');

        // identical / similar / different / not aligned
        const CC = { '=': '#2f9e6f', '+': '#8fbf4d', '.': '#b4553f', '-': 'rgba(159,196,212,0.14)' };

        // Wide enough for "cynomolgus monkey · SPAG9", which is the longest name the
        // loadable set can produce; at 150 it ran off the left edge.
        const PAD = 198;                      // the species names sit here
        const RIGHT = 24;
        const LANE = 17, LGAP = 3;
        const PROF = 96;                      // the band of how many agree
        const EXON = 15;                      // the lane of exons, when they fit
        let W = 0, H = 0, innerW = 0;
        const measure = () => {
            W = Math.max(760, Math.floor(window.innerWidth - 56));
            innerW = W - PAD - RIGHT;
            H = 34 + PROF + 22 + (vars.length ? 20 : 0) + (exonsFit ? (EXON + 16) : 0)
                + rows.length * (LANE + LGAP) + 46;
        };
        measure();

        // A residue is usually thinner than a pixel, so each column of pixels takes the
        // WORST state in the residues it covers rather than the first. A single
        // unconserved residue inside a perfect domain is the thing worth seeing, and
        // sampling every nth residue is exactly how it would be lost.
        const RANK = { '-': 0, '.': 1, '+': 2, '=': 3 };
        const laneFor = (states, y) => {
            const px = Math.max(1, Math.floor(innerW));
            let out = '', runStart = 0, runChar = null;
            for (let x = 0; x < px; x++) {
                const i0 = Math.floor(x * L / px), i1 = Math.max(i0 + 1, Math.floor((x + 1) * L / px));
                let worst = null;
                for (let i = i0; i < i1 && i < states.length; i++) {
                    const c = states[i];
                    if (worst === null || RANK[c] < RANK[worst]) worst = c;
                }
                if (worst === null) worst = '-';
                if (runChar === null) { runChar = worst; runStart = x; }
                else if (worst !== runChar) {
                    out += '<rect x="' + (PAD + runStart) + '" y="' + y + '" width="' + (x - runStart)
                        + '" height="' + LANE + '" fill="' + CC[runChar] + '"></rect>';
                    runChar = worst; runStart = x;
                }
            }
            if (runChar !== null) {
                out += '<rect x="' + (PAD + runStart) + '" y="' + y + '" width="' + (px - runStart)
                    + '" height="' + LANE + '" fill="' + CC[runChar] + '"></rect>';
            }
            return out;
        };

        const build = () => {
            measure();
            const px = Math.max(1, Math.floor(innerW));
            let s = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" '
                + 'viewBox="0 0 ' + W + ' ' + H + '" style="display:block;max-width:100%;height:auto;">'
                + '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#07202f"></rect>';

            // ---- the band: how many species agree, per residue --------------------------
            const top = 30;
            s += '<text x="' + PAD + '" y="' + (top - 10) + '" font-size="11" fill="#9fc4d4">'
                + 'how many of the ' + nSp + ' agree · identical in dark, plus conservative substitutions in light</text>';
            s += '<rect x="' + PAD + '" y="' + top + '" width="' + px + '" height="' + PROF + '" fill="rgba(159,196,212,0.07)"></rect>';
            let dIdent = '', dSim = '';
            for (let x = 0; x < px; x++) {
                const i0 = Math.floor(x * L / px), i1 = Math.max(i0 + 1, Math.floor((x + 1) * L / px));
                let mi = nSp, ms = nSp;
                for (let i = i0; i < i1 && i < L; i++) {
                    mi = Math.min(mi, ident[i] == null ? 0 : ident[i]);
                    ms = Math.min(ms, simil[i] == null ? 0 : simil[i]);
                }
                const hi = (mi / (nSp || 1)) * PROF, hs = (ms / (nSp || 1)) * PROF;
                dSim += '<rect x="' + (PAD + x) + '" y="' + (top + PROF - hs) + '" width="1" height="' + hs + '" fill="rgba(143,191,77,0.55)"></rect>';
                dIdent += '<rect x="' + (PAD + x) + '" y="' + (top + PROF - hi) + '" width="1" height="' + hi + '" fill="#2f9e6f"></rect>';
            }
            s += dSim + dIdent;
            // The ceiling: every species agreeing. Without it the band has no scale and a
            // tall bar means nothing.
            s += '<line x1="' + PAD + '" y1="' + top + '" x2="' + (PAD + px) + '" y2="' + top
                + '" stroke="rgba(159,196,212,0.4)" stroke-dasharray="3 3"></line>'
                + '<text x="' + (PAD - 8) + '" y="' + (top + 4) + '" text-anchor="end" font-size="10" fill="#9fc4d4">'
                + nSp + '/' + nSp + '</text>'
                + '<text x="' + (PAD - 8) + '" y="' + (top + PROF) + '" text-anchor="end" font-size="10" fill="#9fc4d4">0</text>';

            // The conserved blocks, marked once under the band and never on every lane.
            for (const b of blocks) {
                const x0 = PAD + Math.floor((b.start - 1) * px / L);
                const x1 = PAD + Math.max(x0 - PAD + 1, Math.floor(b.end * px / L));
                s += '<rect x="' + x0 + '" y="' + (top + PROF + 3) + '" width="' + Math.max(1, x1 - x0)
                    + '" height="5" fill="#1aa3bd"><title>' + esc(num(b.start) + '–' + num(b.end)
                    + ' · ' + b.length + ' residues · ' + pct1(b.identity) + ' identical across all '
                    + nSp) + '</title></rect>';
            }

            // ---- the variants on the track, on the residues they change --------------------
            // Drawn against the band above them, which is what makes the point: a lollipop
            // standing over a column where all six species agree is a different claim from
            // one over a column where none do.
            let y = top + PROF + 22;
            if (vars.length) {
                s += '<text x="' + (PAD - 10) + '" y="' + (y + 11) + '" text-anchor="end" '
                    + 'font-size="11" fill="#ff9d92">variants</text>';
                for (const v of vars) {
                    const x = PAD + Math.floor((v.residue - 0.5) * px / L);
                    s += '<line x1="' + x + '" y1="' + (y - 18) + '" x2="' + x + '" y2="' + (y + 8)
                        + '" stroke="rgba(255,157,146,0.75)" stroke-width="1"></line>'
                        + '<circle cx="' + x + '" cy="' + (y + 10) + '" r="4" fill="#ff6a5a" '
                        + 'stroke="#07202f" stroke-width="0.8"><title>'
                        + esc((v.label || ('residue ' + v.residue)) + (v.id ? (' \u00b7 ' + v.id) : '')
                            + ' \u00b7 ' + (ident[v.residue - 1] || 0) + ' of ' + nSp
                            + ' species identical here') + '</title></circle>';
                }
                y += 20;
            }

            // ---- the transcript this started from, in its exons ---------------------------
            if (exonsFit) {
                s += '<text x="' + (PAD - 10) + '" y="' + (y + EXON - 3) + '" text-anchor="end" '
                    + 'font-size="12" fill="#eaf6f9">' + esc(src.track || gene)
                    + (src.transcript ? ('<tspan fill="#9fc4d4" font-size="10"> \u00b7 '
                        + esc(src.transcript) + '</tspan>') : '') + '</text>';
                for (const ex of exons) {
                    const x0 = PAD + Math.floor((ex.start - 1) * px / L);
                    const x1 = PAD + Math.floor(ex.end * px / L);
                    const w2 = Math.max(1, x1 - x0);
                    // Alternating, because a run of exons with no gap between them is one
                    // long bar unless they take it in turns.
                    s += '<rect x="' + x0 + '" y="' + y + '" width="' + w2 + '" height="' + EXON + '" '
                        + 'fill="' + ((ex.n % 2) ? 'rgba(26,163,189,0.55)' : 'rgba(26,163,189,0.28)') + '" '
                        + 'stroke="rgba(7,32,47,0.9)" stroke-width="0.6">'
                        + '<title>' + esc('exon ' + ex.n + ' \u00b7 residues ' + num(ex.start)
                            + '\u2013' + num(ex.end)) + '</title></rect>';
                    // A number only where it fits: a label wider than its exon spills onto
                    // the neighbours and reads as belonging to the wrong one.
                    if (w2 >= 16) {
                        s += '<text x="' + (x0 + w2 / 2) + '" y="' + (y + EXON - 4) + '" '
                            + 'text-anchor="middle" font-size="9" fill="#06212f" font-weight="700" '
                            + 'pointer-events="none">' + ex.n + '</text>';
                    }
                }
                y += EXON + 16;
            }

            // ---- a lane per species ------------------------------------------------------
            for (const r of rows) {
                // ON ONE LINE. Stacking the gene symbol under the species name put it
                // 13px below a lane that is 20px apart, so every label sat on the row
                // beneath it and the names ran together.
                s += '<text x="' + (PAD - 10) + '" y="' + (y + LANE - 4) + '" text-anchor="end" '
                    + 'font-size="12" fill="#eaf6f9">' + esc(r.species_common || r.species || '?')
                    + '<tspan fill="#9fc4d4" font-size="10"> \u00b7 ' + esc(r.symbol || '') + '</tspan></text>'
                    + laneFor(r.states, y)
                    + '<title>' + esc((r.species_common || '') + ' ' + (r.symbol || '')) + '</title>';
                y += LANE + LGAP;
            }

            // ---- the residue scale --------------------------------------------------------
            const ticks = 8;
            for (let k = 0; k <= ticks; k++) {
                const x = PAD + Math.round(k * px / ticks);
                const res = Math.round(k * L / ticks) || 1;
                s += '<line x1="' + x + '" y1="' + y + '" x2="' + x + '" y2="' + (y + 4)
                    + '" stroke="rgba(159,196,212,0.4)"></line>'
                    + '<text x="' + x + '" y="' + (y + 16) + '" text-anchor="middle" font-size="10" '
                    + 'fill="#9fc4d4">' + num(res) + '</text>';
            }
            s += '<text x="' + (PAD + px) + '" y="' + (y + 30) + '" text-anchor="end" font-size="10" '
                + 'fill="#9fc4d4">residue of ' + esc(gene) + '</text>';
            return s + '</svg>';
        };

        const BTN = (id, label) =>
            '<button type="button" data-id="' + id + '" style="background:transparent;'
            + 'border:1px solid rgba(159,196,212,0.5);color:#eaf6f9;border-radius:7px;'
            + 'padding:6px 13px;cursor:pointer;font:inherit;white-space:nowrap;">' + esc(label) + '</button>';

        const el = document.createElement('div');
        el.id = 'baja-conservation-map';
        el.setAttribute('role', 'dialog');
        el.style.cssText = 'position:fixed;inset:0;z-index:2147482460;display:flex;flex-direction:column;'
            + 'background:#0a2540;padding:16px 20px 12px 20px;overflow:auto;color:#eaf6f9;'
            + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:13px;';

        // WHAT WAS LEFT OFF AND WHY. A synonymous change alters no residue, a nonsense one
        // ends the protein rather than changing a residue in it, and an indel moves
        // everything after it: none of them is a point on a residue, and saying so is
        // better than a map that quietly holds fewer variants than the track does.
        const skippedNote = (sk) => {
            const bits = [];
            if (sk.synonymous) bits.push(sk.synonymous + ' synonymous');
            if (sk.nonsense) bits.push(sk.nonsense + ' nonsense');
            if (sk.indel) bits.push(sk.indel + ' indel' + (sk.indel === 1 ? '' : 's'));
            if (sk.outside) bits.push(sk.outside + ' outside the reading frame');
            return bits.length
                ? (' No missense variant is on the track to carry over (' + bits.join(', ') + ').')
                : '';
        };

        const key = (c, t) => '<span style="display:inline-flex;align-items:center;gap:5px;">'
            + '<span style="width:11px;height:11px;border-radius:2px;background:' + CC[c] + ';"></span>'
            + esc(t) + '</span>';

        const blockRows = blocks.slice()
            .sort((a, b) => (b.length - a.length) || (b.identity - a.identity))
            .slice(0, 40)
            .map((b) => '<tr><td style="padding:3px 12px 3px 0;white-space:nowrap;color:#9fc4d4;">'
                + num(b.start) + '–' + num(b.end) + '</td>'
                + '<td style="padding:3px 12px 3px 0;white-space:nowrap;">' + b.length + ' residues</td>'
                + '<td style="padding:3px 12px 3px 0;white-space:nowrap;">' + pct1(b.identity) + ' identical</td>'
                + '<td style="padding:3px 0;white-space:nowrap;color:#9fc4d4;">' + pct1(b.similarity) + ' identical or conservative</td></tr>')
            .join('');

        el.innerHTML =
            '<div style="display:flex;align-items:flex-start;gap:12px;padding:2px 4px 10px 4px;">'
            + '<div style="flex:1;min-width:0;">'
            + '<div style="font-weight:700;font-size:16px;">Conservation of ' + esc(gene) + '</div>'
            + '<div style="font-size:12px;color:#cfe9f3;margin-top:3px;">' + esc(m.note || '')
            + ' · similarity by ' + esc(m.scoring || 'BLOSUM62')
            + '. Every row is Ensembl’s own alignment of that species’ PROTEIN to the '
            + esc(gene) + ' protein, so every column is one amino acid, not one base.'
            + (src ? (' It starts from ' + esc(src.track || gene)
                + (src.transcript ? (' (' + esc(src.transcript) + ')') : '')
                + ', the track on your canvas'
                + (exonsFit ? ', whose exons are the lane under the band.' : '.')) : '')
            + (exonNote ? (' ' + esc(exonNote) + '.') : '')
            + (vars.length
                ? (' ' + vars.length + ' missense variant' + (vars.length === 1 ? '' : 's')
                    + ' from the track are marked on the residues they change.')
                : ((src && src.variants_skipped && !exonNote)
                    ? skippedNote(src.variants_skipped) : ''))
            + '</div></div>'
            + BTN('blocks', 'Conserved blocks') + BTN('svg', 'SVG') + BTN('close', 'Close')
            + '</div>'
            + '<div data-id="picture" style="background:#07202f;border-radius:9px;padding:8px 0;">' + build() + '</div>'
            + '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:#9fc4d4;padding:9px 4px 0 4px;">'
            + key('=', 'identical') + key('+', 'conservative substitution')
            + key('.', 'different residue') + key('-', 'nothing aligned there')
            + (exonsFit ? '<span>the lane of numbered blocks is the transcript\u2019s own exons</span>' : '')
            + (vars.length ? '<span style="color:#ff9d92;">a dot is a missense variant from the '
                + 'track, on the residue it changes</span>' : '')
            + '<span>a column of pixels takes the WORST residue it covers, so one break in a perfect domain still shows</span>'
            + '</div>'
            + (blockRows
                ? ('<div data-id="blocks-panel" style="display:none;margin-top:10px;border-top:1px solid '
                    + 'rgba(159,196,212,0.22);padding-top:9px;max-height:38vh;overflow:auto;">'
                    + '<div style="font-size:12px;color:#9fc4d4;padding-bottom:6px;">'
                    + 'Runs where every one of the ' + nSp + ' species agrees, longest first. '
                    + 'Residue numbers are ' + esc(gene) + '’s own.</div>'
                    + '<table style="border-collapse:collapse;font-size:12px;">' + blockRows + '</table></div>')
                : '')
            + '<div data-id="said" style="font-size:12px;color:#ffd9a0;padding:8px 4px 0 4px;min-height:16px;"></div>';

        document.body.appendChild(el);

        const pop = { el: el, destroy: null };
        function close() {
            try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { window.removeEventListener('resize', onResize); } catch (e) { }
            try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) { }
            if (window.__bajaConservationMap === pop) window.__bajaConservationMap = null;
        }
        const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
        document.addEventListener('keydown', onKey, true);
        let rt = null;
        const onResize = () => {
            if (rt) { try { clearTimeout(rt); } catch (e) { } }
            rt = setTimeout(() => {
                rt = null;
                try { const h = el.querySelector('[data-id="picture"]'); if (h) h.innerHTML = build(); } catch (e) { }
            }, 120);
        };
        window.addEventListener('resize', onResize);
        pop.destroy = close;
        window.__bajaConservationMap = pop;

        const say = (t) => { try { const n = el.querySelector('[data-id="said"]'); if (n) n.textContent = t || ''; } catch (e) { } };
        const stem = ('conservation-' + gene).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

        el.addEventListener('click', (e) => {
            const b = e.target && e.target.closest ? e.target.closest('button[data-id]') : null;
            if (!b) return;
            const id = b.getAttribute('data-id');
            if (id === 'close') { close(); return; }
            if (id === 'blocks') {
                const panel = el.querySelector('[data-id="blocks-panel"]');
                if (panel) panel.style.display = (panel.style.display === 'none') ? 'block' : 'none';
                return;
            }
            if (id === 'svg') {
                try {
                    const node = el.querySelector('[data-id="picture"] svg');
                    const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + node.outerHTML],
                        { type: 'image/svg+xml' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url; a.download = stem + '.svg';
                    document.body.appendChild(a); a.click();
                    setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch (e2) { } }, 400);
                    say('');
                } catch (e2) { say('The SVG could not be saved here.'); }
            }
        });
        for (const ev of ['mousedown', 'mouseup', 'wheel', 'dblclick']) {
            el.addEventListener(ev, (e) => { e.stopPropagation(); });
        }
        return pop;
    })();
}
