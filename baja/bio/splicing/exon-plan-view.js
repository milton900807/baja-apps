function (model) {

    // THE PLAN, DRAWN ON THE TRANSCRIPT IT EDITS.
    //   exec('baja/bio/splicing/exon-plan-view.js', result)   // from exon-plan-search.js
    //
    // A list of edits is not an answer anyone can check. "Skip exon 11, induce a 93 nt
    // exon in intron 14" is three facts about a transcript nobody is looking at, and the
    // thing that makes it judgeable -- whether those exons are near each other, how much
    // of the message is being thrown away, whether the induced exon sits in a huge intron
    // or a tight one -- is the shape of the transcript itself.
    //
    // So the plan is drawn ON the target: its exons in order, each marked with what
    // becomes of it, and the induced exons drawn where they would sit, in the intronic
    // space they come from. The fit the plan reaches is beside the fit the transcript
    // starts at, because an edit that gains two points is a different proposition from one
    // that gains thirty, and the number alone does not say which this is.
    //
    // EVERY PLAN, NOT JUST THE BEST ONE. The best plan by fit is often not the one that
    // gets built: it may need three edits where the second-best needs one, or induce an
    // exon with a weak acceptor. They are all here, in order, and stepping through them
    // redraws the picture.

    return (async () => {
        const m = model || {};
        if (!m.ok || !m.plans || !m.plans.length) return null;
        try { if (window.__bajaExonPlanView && window.__bajaExonPlanView.destroy) window.__bajaExonPlanView.destroy(); } catch (e) { }

        let pick = 0;                                  // which plan is on screen
        const PAD = 30, LANE = 34, TOP = 96;
        let W = 0, H = 0, innerW = 0;
        const measure = () => {
            W = Math.max(640, Math.floor(window.innerWidth - 56));
            H = TOP + LANE + 104;
            innerW = W - PAD * 2;
        };
        measure();

        const esc = (t) => ('' + (t == null ? '' : t)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const num = (x) => (Math.round(+x) || 0).toLocaleString();
        const pc = (x) => (100 * (+x || 0)).toFixed(1) + '%';

        // The whole transcript's span, including the introns the induced exons come from.
        const spanOf = () => {
            let lo = Infinity, hi = -Infinity;
            const all = (m.baseline.roles || []).concat();
            for (const r of all) { lo = Math.min(lo, +r.xi); hi = Math.max(hi, +r.xf); }
            for (const p of m.plans) for (const c of (p.induced || [])) {
                lo = Math.min(lo, +c.xi); hi = Math.max(hi, +c.xf);
            }
            if (!isFinite(lo) || !isFinite(hi) || hi <= lo) return { lo: 0, hi: 1 };
            const padBp = Math.max(1, Math.round((hi - lo) * 0.01));
            return { lo: lo - padBp, hi: hi + padBp };
        };
        const SPAN = spanOf();
        const X = (x) => PAD + ((Math.max(SPAN.lo, Math.min(SPAN.hi, +x)) - SPAN.lo) / (SPAN.hi - SPAN.lo)) * innerW;

        // ROLE COLOURS, and they are not decoration: a reader has to tell at a glance
        // which exons survive. Kept is the quiet one, because most of them are.
        const ROLE = {
            keep: { fill: 'rgba(125,211,252,0.85)', line: '#7dd3fc', word: 'keep' },
            lose: { fill: 'rgba(248,113,113,0.30)', line: '#f87171', word: 'LOSE' },
            shift: { fill: 'rgba(251,191,36,0.75)', line: '#fbbf24', word: 'shift' },
            retain: { fill: 'rgba(167,139,250,0.75)', line: '#a78bfa', word: 'retain' },
            induce: { fill: 'rgba(74,222,128,0.28)', line: '#4ade80', word: 'INDUCE' }
        };

        const buildSvg = () => {
            measure();
            const p = m.plans[pick];
            const y = TOP;
            let out = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" '
                + 'viewBox="0 0 ' + W + ' ' + H + '" style="display:block;max-width:100%;height:auto;">'
                + '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#07202f"></rect>'
                // the transcript line, which is what the introns are
                + '<line x1="' + PAD + '" y1="' + (y + LANE / 2) + '" x2="' + (PAD + innerW) + '" y2="'
                + (y + LANE / 2) + '" stroke="rgba(159,196,212,0.45)" stroke-width="1.4"></line>'
                + '<text x="' + PAD + '" y="' + (y - 46) + '" font-size="12" fill="#eaf6f9" '
                + 'font-weight="700">' + esc(m.target.name) + '</text>'
                + '<text x="' + (PAD + innerW) + '" y="' + (y - 46) + '" text-anchor="end" '
                + 'font-size="10" fill="#9fc4d4">' + num(SPAN.lo) + ' – ' + num(SPAN.hi) + '</text>';

            for (const r of (p.roles || [])) {
                const c = ROLE[r.role] || ROLE.keep;
                const x0r = X(r.xi), x1r = X(r.xf);
                const w = Math.max(11, x1r - x0r);
                const x0 = (x0r + x1r) / 2 - w / 2;
                out += '<g><title>' + esc('exon ' + r.n + ' · ' + c.word
                    + (r.label ? (' · ' + r.label) : '') + '\n' + num(r.xi) + '-' + num(r.xf)) + '</title>'
                    + '<rect x="' + x0 + '" y="' + y + '" width="' + w + '" height="' + LANE + '" rx="2" '
                    + 'fill="' + c.fill + '" stroke="' + c.line + '" stroke-width="1.2"'
                    + (r.role === 'lose' ? ' stroke-dasharray="4 3"' : '') + '></rect>';
                // A LOST EXON IS STRUCK THROUGH, because colour alone is read differently by
                // different eyes and this is the one role that must not be misread.
                if (r.role === 'lose') {
                    out += '<line x1="' + x0 + '" y1="' + (y + LANE) + '" x2="' + (x0 + w) + '" y2="' + y
                        + '" stroke="' + c.line + '" stroke-width="1.4"></line>';
                }
                out += '<text x="' + (x0 + w / 2) + '" y="' + (y + LANE - 11) + '" text-anchor="middle" '
                    + 'font-size="9.5" font-weight="700" fill="#eaf6f9" stroke="rgba(4,16,30,0.9)" '
                    + 'stroke-width="2.6" paint-order="stroke" pointer-events="none">e' + r.n + '</text>';
                if (r.role !== 'keep') {
                    out += '<text x="' + (x0 + w / 2) + '" y="' + (y - 8) + '" text-anchor="middle" '
                        + 'font-size="9.5" font-weight="700" fill="' + c.line + '">' + c.word + '</text>';
                }
                out += '</g>';
            }
            // The induced exons, drawn where they would sit: in the intron, on the line,
            // below the annotated ones so they cannot be mistaken for existing exons.
            for (const c of (p.induced || [])) {
                // A 93 nt exon in a 37 kb transcript is three pixels wide, which drew as a
                // thinner version of its own connector line: the one thing the picture
                // exists to point at was the thing you could not see. A mark has a minimum
                // size, and the coordinates are in its tooltip for anyone who needs them.
                const x0r = X(c.xi), x1r = X(c.xf);
                const w = Math.max(11, x1r - x0r);
                const x0 = (x0r + x1r) / 2 - w / 2;
                const yy = y + LANE + 16;
                out += '<g><title>' + esc('induce: ' + c.len + ' nt in intron ' + c.intron
                    + ' · sites score ' + (+c.score).toFixed(2) + '\n' + num(c.xi) + '-' + num(c.xf)) + '</title>'
                    + '<line x1="' + (x0 + w / 2) + '" y1="' + (y + LANE) + '" x2="' + (x0 + w / 2) + '" y2="'
                    + yy + '" stroke="' + ROLE.induce.line + '" stroke-width="1" stroke-dasharray="2 2"></line>'
                    + '<rect x="' + x0 + '" y="' + yy + '" width="' + w + '" height="' + (LANE - 10) + '" rx="2" '
                    + 'fill="' + ROLE.induce.fill + '" stroke="' + ROLE.induce.line + '" stroke-width="1.2" '
                    + 'stroke-dasharray="4 3"></rect>'
                    + '<text x="' + (x0 + w / 2) + '" y="' + (yy + LANE + 4) + '" text-anchor="middle" '
                    + 'font-size="9.5" font-weight="700" fill="' + ROLE.induce.line + '">INDUCE '
                    + c.len + ' nt</text></g>';
            }
            return out + '</svg>';
        };

        // HOW CLOSE THIS GETS, as a bar rather than only a number: the distance left is
        // the part that decides whether a plan is worth building.
        const fitBar = (p) => {
            const w0 = Math.max(0, Math.min(1, m.baseline.fit)) * 100;
            const w1 = Math.max(0, Math.min(1, p.fit)) * 100;
            const row = (label, pcts, colour) => '<div style="display:flex;align-items:center;gap:10px;'
                + 'margin-top:5px;"><span style="width:58px;font-size:11px;color:#9fc4d4;">' + label + '</span>'
                + '<span style="flex:1;height:9px;border-radius:5px;background:rgba(159,196,212,0.15);'
                + 'position:relative;overflow:hidden;"><span style="position:absolute;left:0;top:0;bottom:0;'
                + 'width:' + pcts.toFixed(1) + '%;background:' + colour + ';"></span></span>'
                + '<span style="width:52px;text-align:right;font-size:11px;color:#eaf6f9;">'
                + pcts.toFixed(1) + '%</span></div>';
            return row('as it is', w0, 'rgba(159,196,212,0.55)') + row('after', w1, '#4ade80');
        };

        const el = document.createElement('div');
        el.id = 'baja-exon-plan-view';
        el.setAttribute('role', 'dialog');
        el.style.cssText = 'position:fixed;inset:0;z-index:2147482400;display:flex;flex-direction:column;'
            + 'background:#0a2540;padding:16px 20px 12px 20px;overflow:auto;color:#eaf6f9;'
            + 'font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:13px;';

        const BTN = (id, label, on) => '<button type="button" data-id="' + id + '" style="background:'
            + (on ? 'rgba(125,211,252,0.18)' : 'transparent') + ';border:1px solid rgba(159,196,212,0.5);'
            + 'color:#eaf6f9;border-radius:7px;padding:6px 13px;cursor:pointer;font:inherit;'
            + 'white-space:nowrap;">' + label + '</button>';

        const paint = () => {
            const p = m.plans[pick];
            const edits = (p.edits || []).map((e) => '<li style="margin:3px 0;">' + esc(e.label) + '</li>').join('');
            const others = m.plans.map((q, i) => '<tr data-plan="' + i + '" style="cursor:pointer;'
                + (i === pick ? 'background:rgba(125,211,252,0.12);' : '') + '">'
                + '<td style="padding:4px 10px 4px 6px;color:#9fc4d4;">' + (i + 1) + '</td>'
                + '<td style="padding:4px 10px 4px 0;">' + pc(q.fit) + '</td>'
                + '<td style="padding:4px 10px 4px 0;color:#9fc4d4;">+' + pc(q.gain) + '</td>'
                + '<td style="padding:4px 0;">' + esc((q.edits || []).map((e) => e.label).join('; ')) + '</td></tr>').join('');
            el.innerHTML =
                '<div style="display:flex;align-items:flex-start;gap:12px;padding:2px 4px 10px 4px;">'
                + '<div style="flex:1;min-width:0;">'
                + '<div style="font-weight:700;font-size:15px;">Making ' + esc(m.target.name)
                + ' translate like ' + esc(m.source.name) + '</div>'
                + '<div style="font-size:12px;color:#cfe9f3;margin-top:3px;">Plan ' + (pick + 1)
                + ' of ' + m.plans.length + ': ' + esc((p.edits || []).map((e) => e.label).join('; '))
                + '</div>'
                // WHAT THE NUMBER MEANS, said once, where it is read. A fit is not an
                // identity and would be taken for one.
                + '<div style="font-size:11.5px;color:#9fc4d4;margin-top:4px;">Fit is how much of '
                + 'the two peptides is the same: twice the identical residues over the sum of their '
                + 'lengths, so peptide that is missing and peptide that should not be there both '
                + 'count against it. ' + esc(m.source.name) + ' is ' + num(m.source.length)
                + ' residues; this plan makes ' + num(p.length) + ', of which ' + num(p.matched)
                + ' match.</div>'
                + '</div>'
                + BTN('prev', 'Prev') + BTN('next', 'Next') + BTN('plans', 'Plans')
                + BTN('svg', 'SVG') + BTN('close', 'Close')
                + '</div>'
                + '<div data-id="picture" style="background:#07202f;border-radius:9px;padding:8px 0 2px 0;">'
                + buildSvg() + '</div>'
                + '<div style="display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start;padding:10px 4px 0 4px;">'
                + '<div style="min-width:280px;flex:1;">' + fitBar(p) + '</div>'
                + '<div style="min-width:240px;"><div style="font-size:11px;color:#9fc4d4;">this plan</div>'
                + '<ol style="margin:4px 0 0 16px;padding:0;font-size:12px;">' + edits + '</ol></div>'
                + '<div style="font-size:11px;color:#9fc4d4;max-width:360px;">'
                + 'Every plan here keeps the start codon, stays in frame and leaves no premature stop '
                + 'for NMD to find: a transcript that could not make a protein is not a worse answer, '
                + 'it is an answer to another question. An induced exon is sequence the model says '
                + 'has usable splice sites, not an exon anything is known to use.'
                + '</div></div>'
                + '<div data-id="plans-panel" style="display:none;margin-top:10px;border-top:1px solid '
                + 'rgba(159,196,212,0.22);padding-top:9px;max-height:36vh;overflow:auto;">'
                + '<table style="width:100%;border-collapse:collapse;font-size:12px;">'
                + '<tr style="color:#9fc4d4;"><td style="padding:3px 6px;">#</td><td>fit</td>'
                + '<td>gain</td><td>edits</td></tr>' + others + '</table></div>';
        };
        paint();
        document.body.appendChild(el);

        const pop = { el: el, destroy: null };
        function close() {
            try { document.removeEventListener('keydown', onKey, true); } catch (e) { }
            try { window.removeEventListener('resize', onResize); } catch (e) { }
            try { if (el.parentNode) el.parentNode.removeChild(el); } catch (e) { }
            if (window.__bajaExonPlanView === pop) window.__bajaExonPlanView = null;
        }
        // Left and right step through the plans, which is how anyone compares them: the
        // picture is the same shape each time and only the marks move.
        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); close(); return; }
            if (e.key === 'ArrowRight') { pick = Math.min(m.plans.length - 1, pick + 1); paint(); }
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
            const row = e.target && e.target.closest ? e.target.closest('tr[data-plan]') : null;
            if (row) { pick = +row.getAttribute('data-plan') || 0; paint();
                const pn = el.querySelector('[data-id="plans-panel"]'); if (pn) pn.style.display = 'block'; return; }
            const b = e.target && e.target.closest ? e.target.closest('button[data-id]') : null;
            if (!b) return;
            const id = b.getAttribute('data-id');
            if (id === 'close') { close(); return; }
            if (id === 'prev') { pick = Math.max(0, pick - 1); paint(); return; }
            if (id === 'next') { pick = Math.min(m.plans.length - 1, pick + 1); paint(); return; }
            if (id === 'plans') {
                const pn = el.querySelector('[data-id="plans-panel"]');
                if (pn) pn.style.display = (pn.style.display === 'none') ? 'block' : 'none';
                return;
            }
            if (id === 'svg') {
                try {
                    const node = el.querySelector('[data-id="picture"] svg');
                    const text = '<?xml version="1.0" encoding="UTF-8"?>\n' + node.outerHTML;
                    const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = ('exon-plan-' + (m.target.name || 'target') + '.svg').replace(/[^\w.\-]+/g, '-');
                    document.body.appendChild(a); a.click();
                    setTimeout(() => { try { URL.revokeObjectURL(url); a.remove(); } catch (e2) { } }, 400);
                } catch (e2) { }
            }
        });
        for (const ev of ['mousedown', 'mouseup', 'wheel', 'dblclick']) {
            el.addEventListener(ev, (e) => { e.stopPropagation(); });
        }
        pop.destroy = close;
        pop.select = (i) => { pick = Math.max(0, Math.min(m.plans.length - 1, +i || 0)); paint(); };
        window.__bajaExonPlanView = pop;
        return pop;
    })();
}
