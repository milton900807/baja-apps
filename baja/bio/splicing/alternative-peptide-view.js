function (model) {

    // THE EXON, THE MESSAGE AND THE PROTEIN IT WOULD MAKE, in that order down the page.
    //   exec('baja/bio/splicing/alternative-peptide-view.js', result)  // from alternative-exon.js
    //
    // A rank in a table says a site scores well. It does not say whether using it would add
    // thirty residues to the protein or destroy it, and those are the two outcomes anyone
    // cares about. The three rows are the three steps of the claim, each drawn from the one
    // above it:
    //
    //   the intron, with the proposed exon in it between its acceptor and its donor
    //   the message, exon by exon, with the new one in its place
    //   the protein, with the part that is no longer the known protein marked
    //
    // The donor is a CHOICE and is shown as one: the other pairings sit under the picture
    // with what each would do, because "in frame, 30 residues" and "frameshift to a
    // premature stop" come from the same acceptor and differ only in where the exon ends.
    //
    // Nothing here says the site is used. It says what the sequence would make if it were.

    return (async () => {
        const m = model || {};
        if (!m.ok || !m.pairings || !m.pairings.length) return null;
        try { if (window.__bajaAltPeptideView) window.__bajaAltPeptideView.destroy(); } catch (e) { }

        let pick = 0;
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const num = (x) => (Math.round(+x) || 0).toLocaleString();

        const el = document.createElement('div');
        el.id = 'baja-alt-peptide-view';
        el.style.cssText = 'position:fixed;inset:0;z-index:2147482400;display:flex;'
            + 'flex-direction:column;background:#0a2540;padding:16px 20px 12px 20px;overflow:auto;'
            + 'color:#eaf6f9;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;'
            + 'font-size:13px;';

        const BTN = (id, label) => '<button type="button" data-id="' + id + '" '
            + 'style="background:transparent;border:1px solid rgba(159,196,212,0.5);color:#eaf6f9;'
            + 'border-radius:7px;padding:6px 13px;cursor:pointer;font:inherit;white-space:nowrap;">'
            + label + '</button>';

        // Three bands, each the full width, each with its own coordinate system: the intron
        // is drawn in bases, the message in spliced bases, the protein in residues. They are
        // not the same axis and are not drawn as though they were.
        const band = (title, inner, note) =>
            '<div style="margin-top:14px;">'
            + '<div style="font-size:11px;color:#9fc4d4;text-transform:uppercase;'
            + 'letter-spacing:0.08em;">' + esc(title) + '</div>'
            + inner
            + (note ? ('<div style="font-size:11.5px;color:#9fc4d4;margin-top:4px;">'
                + esc(note) + '</div>') : '')
            + '</div>';

        const paint = () => {
            const p = m.pairings[pick];
            const W = Math.max(520, Math.floor(window.innerWidth - 80));
            const PAD = 8;
            const inner = W - PAD * 2;

            // ---- 1. the intron, and the exon proposed inside it -------------------------
            const iv = m.acceptor;
            const span = Math.max(1, iv.hi - iv.lo);
            const X = (x) => PAD + ((Math.max(iv.lo, Math.min(iv.hi, x)) - iv.lo) / span) * inner;
            // A 90 nt exon in a 22 kb intron is four pixels, and its two labels land on top
            // of each other: "acceptor" and "donor 0.81" printed at the same x read as one
            // smeared word. The mark gets a minimum width, and the labels stack when they
            // would collide, which at this scale is nearly always.
            const ex0r = X(p.exon.xi), ex1r = X(p.exon.xf);
            const exW = Math.max(12, ex1r - ex0r);
            const ex0 = (ex0r + ex1r) / 2 - exW / 2, ex1 = ex0 + exW;
            const aX = X(m.acceptor.x), dX = X(p.donorX);
            const stacked = Math.abs(dX - aX) < 90;
            const intronSvg = '<svg width="' + W + '" height="74" viewBox="0 0 ' + W + ' 74" '
                + 'style="display:block;max-width:100%;height:auto;">'
                + '<line x1="' + PAD + '" y1="42" x2="' + (PAD + inner) + '" y2="42" '
                + 'stroke="rgba(159,196,212,0.45)" stroke-width="1.4"></line>'
                + '<rect x="' + ex0 + '" y="28" width="' + exW + '" height="28" '
                + 'rx="2" fill="rgba(74,222,128,0.30)" stroke="#4ade80" stroke-width="1.3" '
                + 'stroke-dasharray="4 3"></rect>'
                + '<text x="' + ((ex0 + ex1) / 2) + '" y="22" text-anchor="middle" font-size="10" '
                + 'font-weight="700" fill="#4ade80">' + p.exon.length + ' nt</text>'
                + (stacked
                    ? ('<text x="' + ((ex0 + ex1) / 2) + '" y="68" text-anchor="middle" '
                        + 'font-size="9.5" fill="#9fc4d4">acceptor \u00b7 donor '
                        + (+p.donorScore).toFixed(2) + ', ' + p.exon.length + ' nt apart</text>')
                    : ('<text x="' + aX + '" y="68" text-anchor="middle" font-size="9.5" '
                        + 'fill="#9fc4d4">acceptor</text>'
                        + '<text x="' + dX + '" y="68" text-anchor="middle" font-size="9.5" '
                        + 'fill="#9fc4d4">donor ' + (+p.donorScore).toFixed(2) + '</text>'))
                + '</svg>';

            // ---- 2. the message it would make -------------------------------------------
            // Spliced coordinates: the exons laid end to end, which is what the ribosome
            // reads. Drawing them at their genomic positions would show mostly intron.
            const parts = m.normal.exons.map((e) => ({ len: e.xf - e.xi + 1, kind: 'exon' }));
            const before = m.normal.exons.filter((e) => e.xf < p.exon.xi).length;
            parts.splice(before, 0, { len: p.exon.length, kind: 'new' });
            const total = parts.reduce((s, q) => s + q.len, 0) || 1;
            let cx = PAD, mrna = '';
            for (const q of parts) {
                const w = Math.max(3, (q.len / total) * inner);
                mrna += '<rect x="' + cx + '" y="10" width="' + w + '" height="26" rx="2" fill="'
                    + (q.kind === 'new' ? 'rgba(74,222,128,0.35)' : 'rgba(125,211,252,0.75)')
                    + '" stroke="' + (q.kind === 'new' ? '#4ade80' : '#7dd3fc') + '" '
                    + 'stroke-width="1.2"' + (q.kind === 'new' ? ' stroke-dasharray="4 3"' : '')
                    + '></rect>';
                cx += w + 2;
            }
            const mrnaSvg = '<svg width="' + W + '" height="44" viewBox="0 0 ' + W + ' 44" '
                + 'style="display:block;max-width:100%;height:auto;">' + mrna + '</svg>';

            // ---- 3. the protein ----------------------------------------------------------
            // Known protein up to the point the two part company, then what this exon makes
            // of it. The split is the whole picture: everything left of it is the protein
            // that already exists.
            const pepLen = Math.max(1, p.peptide.length, m.normal.length);
            const d = (p.divergeAt == null) ? p.peptide.length : p.divergeAt;
            // THE PART THAT RESUMES IS NOT NEW. An in-frame insertion shifts every residue
            // after it, so a position-by-position comparison calls the whole downstream
            // half different when only the inserted stretch is: drawn that way, a 30
            // residue insertion looked like half a new protein. After a frameshift the
            // tail is zero and everything after the divergence is new, which is then the
            // honest picture.
            const tail = Math.max(0, Math.min(+p.sameTail || 0, p.peptide.length - d));
            const newN = Math.max(0, p.peptide.length - d - tail);
            const keptW = (d / pepLen) * inner;
            const newW = (newN / pepLen) * inner;
            const tailW = (tail / pepLen) * inner;
            const normW = (m.normal.length / pepLen) * inner;
            const pepSvg = '<svg width="' + W + '" height="86" viewBox="0 0 ' + W + ' 86" '
                + 'style="display:block;max-width:100%;height:auto;">'
                + '<text x="' + PAD + '" y="12" font-size="9.5" fill="#9fc4d4">as it is · '
                + num(m.normal.length) + ' aa</text>'
                + '<rect x="' + PAD + '" y="16" width="' + Math.max(3, normW) + '" height="16" rx="2" '
                + 'fill="rgba(159,196,212,0.35)" stroke="rgba(159,196,212,0.6)"></rect>'
                + '<text x="' + PAD + '" y="52" font-size="9.5" fill="#9fc4d4">with this exon · '
                + num(p.peptide.length) + ' aa</text>'
                + '<rect x="' + PAD + '" y="56" width="' + Math.max(3, keptW) + '" height="16" rx="2" '
                + 'fill="rgba(125,211,252,0.7)" stroke="#7dd3fc"></rect>'
                + (newW > 0 ? ('<rect x="' + (PAD + keptW) + '" y="56" width="' + Math.max(2, newW)
                    + '" height="16" rx="2" fill="' + (/frameshift|NMD/.test(p.consequence)
                        ? 'rgba(248,113,113,0.6)' : 'rgba(74,222,128,0.55)')
                    + '" stroke="' + (/frameshift|NMD/.test(p.consequence) ? '#f87171' : '#4ade80')
                    + '"></rect>') : '')
                + (tailW > 0 ? ('<rect x="' + (PAD + keptW + Math.max(2, newW)) + '" y="56" width="'
                    + tailW + '" height="16" rx="2" fill="rgba(125,211,252,0.7)" '
                    + 'stroke="#7dd3fc"></rect>') : '')
                + (p.divergeAt != null ? ('<text x="' + (PAD + keptW) + '" y="82" font-size="9.5" '
                    + 'fill="#9fc4d4">' + (tail > 0
                        ? (num(newN) + ' residues inserted at ' + num(p.divergeAt)
                            + ', then the same protein again')
                        : ('residue ' + num(p.divergeAt) + ' onwards')) + '</text>') : '')
                + '</svg>';

            const others = m.pairings.map((q, i) => '<tr data-pair="' + i + '" style="cursor:pointer;'
                + (i === pick ? 'background:rgba(125,211,252,0.12);' : '') + '">'
                + '<td style="padding:4px 10px 4px 6px;color:#9fc4d4;">' + q.exon.length + ' nt</td>'
                + '<td style="padding:4px 10px 4px 0;color:#9fc4d4;">donor '
                + (+q.donorScore).toFixed(2) + '</td>'
                + '<td style="padding:4px 0;">' + esc(q.consequence) + '</td></tr>').join('');

            el.innerHTML =
                '<div style="display:flex;align-items:flex-start;gap:12px;padding:2px 4px 4px 4px;">'
                + '<div style="flex:1;min-width:0;">'
                + '<div style="font-weight:700;font-size:15px;">If the acceptor at '
                + num(m.acceptor.x) + ' were used · ' + esc(m.track) + '</div>'
                + '<div style="font-size:12px;color:#cfe9f3;margin-top:3px;">Intron '
                + m.acceptor.intron + ' · ' + p.exon.length + ' nt exon · '
                + esc(p.consequence) + '</div>'
                // THE ONE SENTENCE THAT KEEPS THIS HONEST, where the picture is read.
                + '<div style="font-size:11.5px;color:#9fc4d4;margin-top:4px;">This is what the '
                + 'sequence would make if the spliceosome used that site. Nothing here says it '
                + 'does: the acceptor is a ranked candidate, and the donor closing the exon is '
                + 'the best-scoring of ' + m.pairings.length + ' the model offers in this intron.'
                + '</div></div>'
                + BTN('close', 'Close') + '</div>'
                + band('the intron, and the exon it would make', intronSvg,
                    'Acceptor at ' + num(m.acceptor.x) + ', donor at ' + num(p.donorX)
                    + '; the exon between them is ' + p.exon.length + ' nt'
                    + (p.exon.frame === 0 ? ', a multiple of three' : ', not a multiple of three'))
                + band('the message, exon by exon', mrnaSvg,
                    'Spliced, so the exons are end to end as the ribosome reads them; the new one '
                    + 'is dashed')
                + band('the protein', pepSvg, p.consequence)
                + '<div style="margin-top:14px;border-top:1px solid rgba(159,196,212,0.22);'
                + 'padding-top:9px;"><div style="font-size:11px;color:#9fc4d4;">the other donors '
                + 'in this intron, which make different exons from the same acceptor</div>'
                + '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:4px;">'
                + others + '</table></div>';
        };
        paint();
        document.body.appendChild(el);

        const pop = { el: el, destroy: null };
        function close() {
            try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { window.removeEventListener('resize', onResize); } catch (e) { }
            try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) { }
            if (window.__bajaAltPeptideView === pop) window.__bajaAltPeptideView = null;
        }
        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); close(); }
            if (e.key === 'ArrowRight') { pick = Math.min(m.pairings.length - 1, pick + 1); paint(); }
            if (e.key === 'ArrowLeft') { pick = Math.max(0, pick - 1); paint(); }
        };
        document.addEventListener('keydown', onKey, true);
        let rt = null;
        const onResize = () => {
            if (rt) { try { clearTimeout(rt); } catch (e) { } }
            rt = setTimeout(() => { rt = null; try { paint(); } catch (e) { } }, 120);
        };
        window.addEventListener('resize', onResize);
        el.addEventListener('click', (e) => {
            const row = e.target && e.target.closest ? e.target.closest('tr[data-pair]') : null;
            if (row) { pick = +row.getAttribute('data-pair') || 0; paint(); return; }
            const b = e.target && e.target.closest ? e.target.closest('button[data-id]') : null;
            if (b && b.getAttribute('data-id') === 'close') close();
        });
        for (const ev of ['mousedown', 'mouseup', 'wheel', 'dblclick']) {
            el.addEventListener(ev, (e) => { e.stopPropagation(); });
        }
        pop.destroy = close;
        window.__bajaAltPeptideView = pop;
        return pop;
    })();
}
