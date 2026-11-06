function (presetGene, presetExon) {

    // SSAM -- splice-site acceptor model, run on one exon.
    //
    //   /app/baja/ssam          (Home > Tools > Splice Acceptor Model)
    //
    // Type a gene and an exon number; every candidate 3' acceptor (every AG) in a window
    // around that exon is scored by bajasplice's SpliceNet checkpoint and ranked against
    // the exon's own annotated acceptor. The scoring is py/bio/splice/ssam-exon.py, which
    // is where the model lives; this file is the screen.
    //
    // This is the sibling of baja/bio/splicing/splicing-profile.js, which profiles a track
    // already on screen. The difference is the entry point: that one needs a loaded track,
    // this one needs a gene symbol and an exon number and nothing else, which is the form
    // the question usually arrives in ("what else looks like an acceptor near exon 16?").
    //
    // TWO THINGS THE SCREEN IS BUILT TO KEEP IN VIEW, because a ranked table of
    // probabilities invites being read as more than it is:
    //
    //   Rank is meaningful; the absolute value of a weak score is not. Validation only
    //   exercised sites above 0.96. Everything below the dotted line on the chart is in a
    //   range nothing has calibrated, so the chart draws the line and the table bands the
    //   scores rather than printing six decimal places and letting them look equal.
    //
    //   The labels come from ONE transcript. A position marked "exon 16" here can be an
    //   annotated acceptor in another isoform, and most genes have many. The count is in
    //   the header, not a footnote.
    //
    // The scores say nothing about reading frame or coding consequence, and the screen
    // does not compute either.

    return (async () => {
        const esc = (t) => ('' + (t == null ? '' : t)).replace(/[&<>"]/g, (c) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
        }[c]));
        const ID = 'baja-ssam';
        const phone = (typeof isMobile === 'function') ? !!isMobile() : (window.innerWidth < 760);

        // The page owns a fixed, scrolling element on document.body rather than going
        // through showWidget. Same reason as baja/research.js: the shell's card is the
        // height of the window and does not scroll, and a result here is taller than that.
        // Owning the element means clear() cannot remove it, so leaving takes it down by
        // hand in go() below.
        const sheet = () => {
            let el = document.getElementById(ID);
            if (el) return el;
            el = document.createElement('div');
            el.id = ID;
            el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;overflow:auto;'
                + '-webkit-overflow-scrolling:touch;overscroll-behavior:contain;'
                + 'background:#f2f6f8;color:#12242c;font-family:Arial,Helvetica,sans-serif;';
            document.body.appendChild(el);
            // The shell listens for keys on the document and would otherwise act on what is
            // typed into the gene box.
            for (const ev of ['paste', 'cut', 'copy', 'keydown', 'keyup', 'input']) {
                el.addEventListener(ev, (e) => { try { e.stopPropagation(); } catch (x) { } });
            }
            return el;
        };
        const gone = () => {
            try {
                const el = document.getElementById(ID);
                if (el && el.parentNode) el.parentNode.removeChild(el);
            } catch (e) { }
        };
        const draw = (inner) => {
            const el = sheet();
            el.innerHTML = '<div style="max-width:1180px;margin:0 auto;padding:'
                + (phone ? '16px 14px 48px' : '26px 18px 56px') + ';">' + inner + '</div>';
            try { el.scrollTop = 0; } catch (e) { }
            return true;
        };
        const afterDraw = (fn) => {
            try { const el = document.getElementById(ID); if (el) fn(el); } catch (e) { }
        };

        // ---- the look, which is Home's ---------------------------------------------------
        const C = {
            ink: '#12242c', dim: '#6b8793', faint: '#8aa3ad', line: '#e1e8ed',
            soft: '#f7fafc', edge: '#dbe4ea', accent: '#0f6e7a',
            // score bands. Deliberately four coarse steps: a finer scale would imply a
            // resolution the model has not been shown to have.
            annotated: '#C2185B', strong: '#C2185B', moderate: '#E07B00',
            weak: '#1F6FB2', trace: '#90A4AE'
        };
        const btn = (attr, label, kind) => '<button ' + attr + ' style="cursor:pointer;border-radius:9px;'
            + 'padding:9px 15px;font:700 13px Arial;'
            + (kind === 'go' ? 'border:1px solid ' + C.accent + ';background:' + C.accent + ';color:#fff;'
                : 'border:1px solid ' + C.edge + ';background:#fff;color:' + C.ink + ';') + '">' + label + '</button>';
        const card = (inner, pad) => '<div style="border:1px solid ' + C.line + ';border-radius:12px;'
            + 'background:#fff;padding:' + (pad || '14px 16px') + ';">' + inner + '</div>';
        const tag = (text, tone) => '<span style="display:inline-block;border-radius:999px;padding:2px 9px;'
            + 'font:700 10.5px Arial;letter-spacing:.04em;text-transform:uppercase;'
            + (tone === 'warm' ? 'background:#fff4d6;border:1px solid #f5d27a;color:#8a6100;'
                : tone === 'hot' ? 'background:#fde6ee;border:1px solid #f3b6cc;color:#9c1c3d;'
                    : 'background:#eaf3f5;border:1px solid #cfe0e4;color:#2c5a63;') + '">' + esc(text) + '</span>';
        const num = (n) => { try { return (+n).toLocaleString(); } catch (e) { return '' + n; } };

        // A score is shown to three significant figures and banded by colour. Printing
        // more digits on a number nothing has calibrated reads as precision.
        const fmt = (s) => {
            const v = +s;
            if (!isFinite(v)) return '-';
            if (v >= 0.001) return v.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
            return v.toExponential(2);
        };
        const tierOf = (c) => c.is_annotated_acceptor ? 'annotated'
            : (c.score >= 0.96 ? 'strong' : c.score >= 0.05 ? 'moderate'
                : c.score >= 1e-3 ? 'weak' : 'trace');

        // ---- the server ------------------------------------------------------------------
        // One call, one place for what can go wrong with it. The tool always answers with
        // an `error` string rather than raising, so a model failure and a bridge failure
        // are different sentences.
        const run = async (gene, exon, flank, transcript, minScore, onMsg) => {
            const host = (window['env'] && window['env']['apiUrl']) ? window['env']['apiUrl'] : '';
            let em = null;
            try {
                em = new EngineMonitor((m) => { try { onMsg && onMsg('' + m); } catch (e) { } });
            } catch (e) { em = null; }
            let r = null;
            try {
                r = await exec(host + '/py/bio/splice/ssam-exon.py', em,
                    '' + gene, '' + exon, '' + flank, '' + transcript, '' + minScore);
            } catch (e) {
                throw new Error((e && e.message) ? e.message : ('' + e));
            }
            if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { } }
            if (!r || typeof r !== 'object') throw new Error('the model did not answer');
            if (r.error) throw new Error(r.error);
            const J = (k, d) => { try { return JSON.parse(r[k]); } catch (e) { return d; } };
            return {
                gene: r.gene, chrom: r.chrom, strand: r.strand,
                transcript_id: r.transcript_id,
                exon: J('exon', {}), window: J('window', {}),
                annotated: J('annotated', {}), candidates: J('candidates', []),
                track: J('track', {}), meta: J('meta', {})
            };
        };

        // ---- the chart -------------------------------------------------------------------
        // Scores span five orders of magnitude, so the y axis is log. A linear axis puts
        // every candidate except the annotated one flat on the floor, which is the picture
        // that makes an exon look empty when it is not.
        const FLOOR = 1e-7;
        const chart = (res) => {
            const w = res.window, ex = res.exon, acc = res.annotated.acceptor || {};
            const W = phone ? 340 : 1100, H = phone ? 200 : 260;
            const padL = 54, padR = 14, padT = 16, padB = 34;
            const iw = W - padL - padR, ih = H - padT - padB;
            const span = Math.max(1, w.end - w.start);
            const X = (p) => padL + iw * ((p - w.start) / span);
            const lg = (s) => Math.log10(Math.max(+s || FLOOR, FLOOR));
            const lo = Math.log10(FLOOR), hi = Math.log10(1.0);
            const Y = (s) => padT + ih * (1 - (lg(s) - lo) / (hi - lo));

            let g = '';
            // exon body band, so "inside the exon" is readable without the table
            if (ex.end >= w.start && ex.start <= w.end) {
                const x0 = X(Math.max(ex.start, w.start)), x1 = X(Math.min(ex.end, w.end));
                g += '<rect x="' + x0.toFixed(1) + '" y="' + padT + '" width="' + Math.max(1, x1 - x0).toFixed(1)
                    + '" height="' + ih + '" fill="' + C.annotated + '" opacity="0.055"/>';
            }
            // y gridlines, one per decade
            for (let e = -7; e <= 0; e++) {
                const y = Y(Math.pow(10, e));
                g += '<line x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR)
                    + '" y2="' + y.toFixed(1) + '" stroke="' + C.line + '" stroke-width="1"/>'
                    + '<text x="' + (padL - 7) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end" '
                    + 'font="10px Arial" font-size="10" fill="' + C.faint + '">1e' + e + '</text>';
            }
            // the calibration line. Everything below it is in a range nothing established.
            const yc = Y(0.96);
            g += '<line x1="' + padL + '" y1="' + yc.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + yc.toFixed(1)
                + '" stroke="#8a6100" stroke-width="1" stroke-dasharray="2,3"/>'
                + '<text x="' + (padL + 5) + '" y="' + (yc - 4).toFixed(1) + '" font-size="9.5" fill="#8a6100">'
                + 'calibrated above 0.96 &mdash; below this, rank only</text>';
            // the annotated acceptor
            if (acc.pos) {
                g += '<line x1="' + X(acc.pos).toFixed(1) + '" y1="' + padT + '" x2="' + X(acc.pos).toFixed(1)
                    + '" y2="' + (padT + ih) + '" stroke="' + C.annotated
                    + '" stroke-width="1" stroke-dasharray="3,3" opacity="0.7"/>';
            }
            // candidate stems
            const base = padT + ih;
            for (const c of res.candidates) {
                const t = tierOf(c), x = X(c.pos), y = Y(c.score);
                const sw = (t === 'annotated' || t === 'strong') ? 2.4 : 1.2;
                g += '<line x1="' + x.toFixed(1) + '" y1="' + base + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1)
                    + '" stroke="' + C[t] + '" stroke-width="' + sw + '">'
                    + '<title>' + esc(res.chrom + ':' + num(c.pos)) + '  score ' + fmt(c.score)
                    + '  rank ' + c.rank + '\n' + esc(c.region) + '  ' + (c.offset >= 0 ? '+' : '') + c.offset
                    + ' nt from the annotated acceptor'
                    + (c.is_annotated_acceptor ? '\nthis is the annotated acceptor' : '')
                    + '</title></line>';
            }
            // label the few that can be labelled without collision
            const placed = [];
            for (const c of res.candidates.slice(0, 7)) {
                const x = X(c.pos);
                if (placed.some((p) => Math.abs(p - x) < 54)) continue;
                placed.push(x);
                g += '<text x="' + x.toFixed(1) + '" y="' + (Y(c.score) - 5).toFixed(1) + '" text-anchor="middle" '
                    + 'font-size="9.5" fill="' + C[tierOf(c)] + '">#' + c.rank + ' '
                    + esc(fmt(c.score)) + '</text>';
            }
            // x axis: the window's ends and the exon's own edges
            g += '<line x1="' + padL + '" y1="' + base + '" x2="' + (W - padR) + '" y2="' + base
                + '" stroke="' + C.edge + '" stroke-width="1"/>';
            const xt = (p, label, anchor) => '<text x="' + X(p).toFixed(1) + '" y="' + (base + 14)
                + '" text-anchor="' + (anchor || 'middle') + '" font-size="9.5" fill="' + C.dim + '">'
                + esc(label) + '</text>';
            g += xt(w.start, num(w.start), 'start') + xt(w.end, num(w.end), 'end');
            if (acc.pos) g += xt(acc.pos, 'acceptor', 'middle');
            g += '<text x="' + padL + '" y="' + (base + 27) + '" font-size="9.5" fill="' + C.faint + '">'
                + esc(res.chrom + ' (' + res.strand + ' strand), ' + num(w.length) + ' nt window; '
                    + 'shaded = exon ' + ex.number + ' body') + '</text>';

            return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H
                + '" style="display:block;">' + g + '</svg>';
        };

        // ---- the table -------------------------------------------------------------------
        const table = (res, limit) => {
            const rows = res.candidates.slice(0, limit || res.candidates.length);
            const th = (t, al) => '<th style="text-align:' + (al || 'left') + ';padding:6px 9px;'
                + 'border-bottom:1px solid ' + C.edge + ';font:700 11px Arial;color:' + C.dim
                + ';text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;">' + t + '</th>';
            const td = (t, al, extra) => '<td style="text-align:' + (al || 'left') + ';padding:6px 9px;'
                + 'border-bottom:1px solid ' + C.line + ';font:13px Arial;white-space:nowrap;'
                + (extra || '') + '">' + t + '</td>';
            let h = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;">'
                + '<thead><tr>' + th('#') + th('position') + th('score', 'right')
                + th('vs annotated', 'right') + th('offset', 'right') + th('region') + '</tr></thead><tbody>';
            for (const c of rows) {
                const t = tierOf(c);
                const hl = c.is_annotated_acceptor ? 'background:#fdf0f5;'
                    : c.in_target_exon ? 'background:#fafcfd;' : '';
                const rel = (c.rel_to_annotated == null) ? '-'
                    : (c.rel_to_annotated >= 0.01 ? (100 * c.rel_to_annotated).toFixed(1) + '%'
                        : '1 : ' + num(Math.round(1 / Math.max(c.rel_to_annotated, 1e-12))));
                h += '<tr style="' + hl + '">'
                    + td('<span style="color:' + C[t] + ';font-weight:700;">' + c.rank + '</span>', 'left')
                    + td('<span style="font-family:monospace;">' + esc(res.chrom + ':' + num(c.pos)) + '</span>'
                        + (c.is_annotated_acceptor ? ' ' + tag('annotated') : '')
                        + (c.in_target_exon && !c.is_annotated_acceptor ? ' ' + tag('in exon', 'warm') : ''))
                    + td('<span style="color:' + C[t] + ';font-weight:600;">' + esc(fmt(c.score)) + '</span>', 'right')
                    + td(esc(rel), 'right', 'color:' + C.dim + ';')
                    + td((c.offset >= 0 ? '+' : '') + num(c.offset), 'right')
                    + td(esc(c.region), 'left', 'color:' + C.dim + ';')
                    + '</tr>';
            }
            h += '</tbody></table></div>';
            if (res.candidates.length > rows.length) {
                h += '<div style="padding:9px 2px 0;font:12px Arial;color:' + C.dim + ';">'
                    + 'showing the top ' + rows.length + ' of ' + res.candidates.length
                    + ' candidate AG sites. ' + btn('id="ssam-all"', 'Show all', '') + '</div>';
            }
            return h;
        };

        // ---- screens ---------------------------------------------------------------------
        let state = {
            gene: (presetGene || '').toString().toUpperCase(),
            exon: presetExon ? ('' + presetExon) : '',
            flank: '300', transcript: 'canonical', limit: 20, res: null, busy: false, err: ''
        };

        const header = () => '<div style="display:flex;align-items:center;justify-content:space-between;'
            + 'gap:12px;margin-bottom:' + (phone ? '14px' : '20px') + ';">'
            + '<div><div style="font:800 ' + (phone ? '20px' : '26px') + ' Arial;letter-spacing:-.01em;">'
            + 'Splice Acceptor Model</div>'
            + '<div style="font:13px Arial;color:' + C.dim + ';margin-top:3px;">'
            + 'Candidate 3&prime; acceptor sites around one exon, ranked against the annotated one.</div></div>'
            + btn('id="ssam-close"', 'Close', '') + '</div>';

        const form = () => card(
            '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;">'
            + fld('ssam-gene', 'Gene symbol', state.gene, 'e.g. MAPK8IP3', phone ? '100%' : '200px')
            + fld('ssam-exon', 'Exon number', state.exon, 'e.g. 16', phone ? '46%' : '120px')
            + fld('ssam-flank', 'Flank (nt)', state.flank, '300', phone ? '46%' : '110px')
            + fld('ssam-tx', 'Transcript', state.transcript, 'canonical', phone ? '100%' : '180px')
            + '<div>' + btn('id="ssam-run"', state.busy ? 'Scoring...' : 'Score acceptors', 'go') + '</div>'
            + '</div>'
            + '<div style="font:11.5px Arial;color:' + C.faint + ';margin-top:9px;">'
            + 'Exon numbers are in transcript order &mdash; on the minus strand exon 1 is the '
            + 'rightmost. Flank is capped at 1000 nt, the model&rsquo;s receptive field.</div>');

        const fld = (id, label, val, ph, w) => '<div style="width:' + w + ';">'
            + '<div style="font:700 11px Arial;color:' + C.dim + ';text-transform:uppercase;'
            + 'letter-spacing:.04em;margin-bottom:4px;">' + esc(label) + '</div>'
            + '<input id="' + id + '" value="' + esc(val) + '" placeholder="' + esc(ph) + '" '
            + 'style="width:100%;box-sizing:border-box;border:1px solid ' + C.edge + ';border-radius:9px;'
            + 'padding:9px 11px;font:14px Arial;color:' + C.ink + ';background:#fff;"/></div>';

        const caveats = (res) => {
            const m = res.meta || {}, cv = m.caveats || {};
            const li = (t) => '<li style="margin:0 0 6px;">' + esc(t) + '</li>';
            let extra = '';
            if (m.chrom_split === 'train') {
                extra += li('This gene is on a chromosome the model trained on, so its annotated '
                    + 'sites were seen during training. Held-out performance is the honest '
                    + 'guide to what these scores mean.');
            }
            const src = m.sequence || {};
            extra += li('Reference sequence: ' + (src.source || 'unknown')
                + (src.assembly ? ' (' + src.assembly + ')' : '') + '.');
            return card(
                '<div style="font:700 12px Arial;color:' + C.dim + ';text-transform:uppercase;'
                + 'letter-spacing:.05em;margin-bottom:8px;">Reading these numbers</div>'
                + '<ul style="margin:0;padding-left:18px;font:13px Arial;line-height:1.5;color:' + C.ink + ';">'
                // iterated, not listed: the backend includes the U12 caveat only when it
                // applies, so naming them one by one here would drop it silently
                + Object.keys(cv).map((k) => li(cv[k])).join('') + extra
                + '</ul>'
                + '<div style="font:11.5px Arial;color:' + C.faint + ';margin-top:10px;">'
                + 'model: ' + esc((m.model || '').split('/').pop()) + ' &middot; context '
                + esc('' + (m.context || '')) + ' nt</div>');
        };

        const resultScreen = () => {
            const res = state.res, ex = res.exon, acc = res.annotated.acceptor || {};
            const inex = res.candidates.filter((c) => c.in_target_exon && !c.is_annotated_acceptor);
            const annRank = (res.candidates.find((c) => c.is_annotated_acceptor) || {}).rank;
            const runner = res.candidates.find((c) => !c.is_annotated_acceptor);

            // The headline is the comparison, not the raw number: the useful fact is where
            // the annotated acceptor sits among its competition.
            let lede = '';
            if (annRank === 1 && runner) {
                lede = 'The annotated acceptor ranks 1 of ' + res.candidates.length
                    + ' candidate AG sites. The next is ' + fmt(runner.score)
                    + ' at ' + (runner.offset >= 0 ? '+' : '') + runner.offset + ' nt (' + runner.region + ').';
            } else if (annRank) {
                lede = 'The annotated acceptor ranks ' + annRank + ' of ' + res.candidates.length
                    + ' candidate AG sites &mdash; something here scores above it.';
            }

            // A U12-type intron is called out above the numbers, not below them. Its
            // acceptor can score 0.2 while being perfectly real, and a ranked table that
            // does not say so is actively misleading.
            const minor = (res.meta && res.meta.minor_spliceosome)
                ? '<div style="height:14px;"></div>'
                + '<div style="border:1px solid #f5d27a;background:#fff8e6;border-radius:12px;'
                + 'padding:13px 16px;">'
                + '<div style="font:700 13px Arial;color:#8a6100;margin-bottom:5px;">'
                + esc(res.annotated.intron_class || 'non-GT-AG') + ' intron</div>'
                + '<div style="font:13px Arial;line-height:1.5;color:' + C.ink + ';">'
                + esc((res.meta.caveats || {}).minor_spliceosome || '') + '</div></div>'
                : '';

            return header()
                + card('<div style="display:flex;flex-wrap:wrap;gap:18px;align-items:baseline;">'
                    + '<div style="font:800 19px Arial;">' + esc(res.gene)
                    + ' <span style="color:' + C.dim + ';font-weight:600;">exon ' + ex.number
                    + ' of ' + ex.n_of + '</span></div>'
                    + '<div style="font:13px Arial;color:' + C.dim + ';font-family:monospace;">'
                    + esc(res.chrom + ':' + num(ex.start) + '-' + num(ex.end)) + ' (' + esc(res.strand)
                    + ') &middot; ' + num(ex.length) + ' nt</div>'
                    + '<div style="font:12.5px Arial;color:' + C.dim + ';">transcript '
                    + esc(res.transcript_id || 'canonical')
                    + ((res.meta && res.meta.n_transcripts) ? ' of ' + res.meta.n_transcripts + ' annotated' : '')
                    + '</div></div>'
                    + '<div style="margin-top:10px;font:14px Arial;line-height:1.5;">' + lede + '</div>'
                    + '<div style="margin-top:8px;font:13px Arial;color:' + C.dim + ';">'
                    + 'Annotated acceptor <span style="font-family:monospace;">'
                    + esc(res.chrom + ':' + num(acc.pos)) + '</span> [' + esc(acc.dinuc || '') + '] '
                    + 'score <b style="color:' + C.annotated + ';">' + esc(fmt(acc.score)) + '</b>'
                    + (inex.length ? ' &middot; ' + inex.length + ' candidate AG site'
                        + (inex.length === 1 ? '' : 's') + ' inside the exon body' : '')
                    + '</div>')
                + minor
                + '<div style="height:14px;"></div>'
                + card(chart(state.res), '12px 10px 6px')
                + '<div style="height:14px;"></div>'
                + card(table(state.res, state.limit))
                + '<div style="height:14px;"></div>'
                + caveats(state.res)
                + '<div style="height:16px;"></div>'
                + '<div style="display:flex;gap:10px;flex-wrap:wrap;">'
                + btn('id="ssam-back"', 'Score another exon', '')
                + btn('id="ssam-json"', 'Copy result as JSON', '')
                + '</div>';
        };

        const inputScreen = () => header() + form()
            + (state.err ? '<div style="height:14px;"></div>' + card(
                '<div style="font:700 13px Arial;color:#9c1c3d;margin-bottom:5px;">That did not run</div>'
                + '<div style="font:13px Arial;line-height:1.5;">' + esc(state.err) + '</div>') : '')
            + '<div style="height:14px;"></div>'
            + card('<div style="font:700 12px Arial;color:' + C.dim + ';text-transform:uppercase;'
                + 'letter-spacing:.05em;margin-bottom:8px;">What this does</div>'
                + '<div style="font:13.5px Arial;line-height:1.6;">'
                + 'Every AG dinucleotide in a window around the exon is scored as a 3&prime; splice '
                + 'acceptor by the bajasplice SpliceNet checkpoint, then ranked against the exon&rsquo;s '
                + 'own annotated acceptor. It answers <i>what else in here does the model think looks '
                + 'like an acceptor, and how does it compare to the real one</i>.'
                + '<br><br>It is scored on reference sequence, so no patient variant is reflected, and '
                + 'the scores describe splice-acceptor likelihood only &mdash; not reading frame and not '
                + 'coding consequence.</div>');

        // ---- wiring ----------------------------------------------------------------------
        const go = (where) => {
            gone();
            try { clear(); } catch (e) { }
            if (where) { try { exec(where); } catch (e) { } }
        };

        const read = (root, id, d) => {
            const el = root.querySelector('#' + id);
            return el ? ('' + el.value).trim() : d;
        };

        const bind = () => afterDraw((root) => {
            const close = root.querySelector('#ssam-close');
            if (close) close.onclick = () => {
                try { window.history.pushState({}, '', '/app/baja/home'); } catch (e) { }
                go('baja/home.js');
            };
            const back = root.querySelector('#ssam-back');
            if (back) back.onclick = () => { state.res = null; state.err = ''; render(); };
            const all = root.querySelector('#ssam-all');
            if (all) all.onclick = () => { state.limit = 0; render(); };
            const js = root.querySelector('#ssam-json');
            if (js) js.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(JSON.stringify(state.res, null, 2));
                    js.textContent = 'Copied';
                    setTimeout(() => { try { js.textContent = 'Copy result as JSON'; } catch (e) { } }, 1600);
                } catch (e) { js.textContent = 'Could not copy'; }
            };
            const go_ = root.querySelector('#ssam-run');
            if (go_) go_.onclick = () => start(root);
            // Enter anywhere in the form runs it, which is how everyone will use it.
            for (const id of ['ssam-gene', 'ssam-exon', 'ssam-flank', 'ssam-tx']) {
                const el = root.querySelector('#' + id);
                if (el) el.onkeydown = (e) => { if (e.key === 'Enter') start(root); };
            }
            const g = root.querySelector('#ssam-gene');
            if (g && !state.res) { try { g.focus(); g.setSelectionRange(g.value.length, g.value.length); } catch (e) { } }
        });

        const start = async (root) => {
            if (state.busy) return;
            state.gene = read(root, 'ssam-gene', '').toUpperCase();
            state.exon = read(root, 'ssam-exon', '');
            state.flank = read(root, 'ssam-flank', '300');
            state.transcript = read(root, 'ssam-tx', 'canonical') || 'canonical';
            if (!state.gene) { state.err = 'Give a gene symbol.'; render(); return; }
            if (!state.exon || !isFinite(+state.exon) || +state.exon < 1) {
                state.err = 'Give an exon number (1 or higher, in transcript order).'; render(); return;
            }
            state.busy = true; state.err = ''; state.res = null;
            render();
            const say = (m) => afterDraw((r) => {
                const el = r.querySelector('#ssam-status');
                if (el) el.textContent = m;
            });
            try {
                const res = await run(state.gene, state.exon, state.flank, state.transcript, 0, say);
                if (!res.candidates || !res.candidates.length) {
                    // A run that found nothing has to say what it looked at, or it reads
                    // as a broken tool rather than an empty window.
                    throw new Error('No AG dinucleotide was found in '
                        + res.chrom + ':' + num(res.window.start) + '-' + num(res.window.end)
                        + '. That window is ' + num(res.window.length) + ' nt around exon '
                        + res.exon.number + '.');
                }
                state.res = res; state.limit = 20;
                try {
                    window.history.replaceState({}, 'ssam',
                        '/app/baja/ssam?gene=' + encodeURIComponent(state.gene) + '&exon=' + state.exon);
                } catch (e) { }
            } catch (e) {
                state.err = (e && e.message) ? e.message : ('' + e);
            } finally {
                state.busy = false;
                render();
            }
        };

        const busyScreen = () => header()
            + card('<div style="display:flex;align-items:center;gap:12px;">'
                + '<div style="width:16px;height:16px;border:2px solid ' + C.edge + ';border-top-color:'
                + C.accent + ';border-radius:50%;animation:ssamspin .8s linear infinite;"></div>'
                + '<div><div style="font:700 14px Arial;">Scoring ' + esc(state.gene)
                + ' exon ' + esc(state.exon) + '</div>'
                + '<div id="ssam-status" style="font:12.5px Arial;color:' + C.dim + ';margin-top:3px;">'
                + 'starting the model...</div></div></div>'
                + '<style>@keyframes ssamspin{to{transform:rotate(360deg)}}</style>');

        const render = () => {
            draw(state.busy ? busyScreen() : state.res ? resultScreen() : inputScreen());
            bind();
        };

        try { window.history.pushState({ ssam: 1 }, 'ssam', '/app/baja/ssam'); } catch (e) { }
        // Leaving by the browser's back button has to take the sheet down too, or the next
        // screen is drawn underneath it.
        try {
            window.addEventListener('popstate', function once() {
                window.removeEventListener('popstate', once);
                gone();
            });
        } catch (e) { }

        render();
        // A preset gene and exon (from the URL or a caller) runs straight away.
        if (state.gene && state.exon) afterDraw((root) => start(root));
        return true;
    })();
}
