function () {

    // THE PROGRAM PLAN AS A PDF, made in the browser with nothing to install.
    //
    //   const PDF = await exec('fundraise/plan-pdf.js');
    //   await PDF.download(plan, { title, goal, raised, currency, link })   saves <slug>-program-plan.pdf
    //   const bytes = await PDF.make(plan, opts)                            the file itself (Uint8Array)
    //
    // A plan is a few dozen boxes and lines of text, so this writes the PDF directly -- the
    // standard Helvetica fonts, filled rectangles, a handful of paths -- rather than loading a
    // library or screenshotting the page. The result is vector, small, selectable and prints
    // cleanly: US Letter, landscape, white paper, the same colours as the plan on screen.
    //
    //   page 1+  the campaign, the program, its span and cost
    //            the timeline: one row per stage (name, dates, cost, a bar on the calendar),
    //            year marks, milestones, a legend
    //            where the money goes: the budget bar by part, the goal and amount raised
    //            on it, each part's share, and how far the goal carries the plan
    //   footer   the campaign link, when given, the date it was made, and page n of m
    //
    // The plan is cleaned by plan-view.js first, so a public document cannot put anything
    // into the file but the fields the plan view itself draws.
    //
    // Everything lives inside an inner function: the module loader pastes lib/core.js in front
    // of this body, and a name declared at its top level would collide with the library's.
    return (() => {
        const W = 792, H = 612, M = 40;                 // US Letter, landscape, in points
        const PALETTE = { 'Discovery': '#1aa3bd', 'IND-enabling': '#22c55e', 'Clinical': '#a78bfa',
            'Other': '#f59e0b', 'Contingency & fees': '#f472b6' };
        const EXTRA = ['#60a5fa', '#34d399', '#fb7185', '#facc15'];
        // TWO LOOKS, ONE LAYOUT. 'campaign' is the console's own dark navy, so a PDF handed
        // round reads like the campaign people have already seen; 'white' is paper, for
        // printing and for anywhere a dark page would come out as a slab of ink.
        //
        // Only the ink, rules and background change -- the stage colours are the campaign's
        // and stay put in both, so a bar means the same thing whichever file you are holding.
        // The two marks on the budget bar are text as well as a line, so they move too: the
        // dark greens and ambers that read on paper disappear against navy.
        const THEMES = {
            white: { paper: null, ink: '#12242c', dim: '#5b7380', faint: '#9fb3bf',
                line: '#d6e1e7', teal: '#0f6e7a', track: '#eef3f6', raised: '#15803d', goal: '#b45309' },
            campaign: { paper: '#071a30', ink: '#eaf6f9', dim: '#bcd9e4', faint: '#7fb0c4',
                line: '#1e4365', teal: '#4fd0e6', track: '#0f2b4a', raised: '#4ade80', goal: '#fbbf24' },
        };
        let INK, DIM, FAINT, LINE, TEAL, TRACK, RAISED, GOALC, PAPER;
        const useTheme = (name) => {
            const t = THEMES[name] || THEMES.white;
            INK = t.ink; DIM = t.dim; FAINT = t.faint; LINE = t.line; TEAL = t.teal;
            TRACK = t.track; RAISED = t.raised; GOALC = t.goal; PAPER = t.paper;
        };
        useTheme('white');

        // Helvetica and Helvetica-Bold advance widths (1/1000 em) for ASCII 32..126, from the
        // standard AFM metrics, so text can be measured, right-aligned and shortened to fit.
        const WR = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556,
            556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667,
            556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556,
            500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500,
            500, 334, 260, 334, 584];
        const WB = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556,
            556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722,
            611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611,
            556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556,
            500, 389, 280, 389, 584];
        // The few characters outside ASCII that plan text actually uses, in WinAnsiEncoding.
        const WIN = { '–': [0x96, 556], '—': [0x97, 1000], '‘': [0x91, 222], '’': [0x92, 222],
            '“': [0x93, 333], '”': [0x94, 333], '•': [0x95, 350], '…': [0x85, 1000], '·': [0xb7, 278],
            'é': [0xe9, 556], 'è': [0xe8, 556], 'ü': [0xfc, 556], 'ö': [0xf6, 556], 'ä': [0xe4, 556],
            '£': [0xa3, 556], '€': [0x80, 556], ' ': [0x20, 278] };
        const enc = (s) => {
            let out = '';
            for (const ch of ('' + (s == null ? '' : s))) {
                const c = ch.charCodeAt(0);
                if (c >= 32 && c <= 126) out += ch;
                else if (WIN[ch]) out += String.fromCharCode(WIN[ch][0]);
                else out += '?';
            }
            return out;
        };
        const width = (s, size, bold) => {
            const tbl = bold ? WB : WR;
            let w = 0;
            for (const ch of ('' + (s == null ? '' : s))) {
                const c = ch.charCodeAt(0);
                w += (c >= 32 && c <= 126) ? tbl[c - 32] : (WIN[ch] ? WIN[ch][1] : 556);
            }
            return w * size / 1000;
        };
        const fit = (s, size, bold, max) => {
            let t = '' + (s || '');
            if (width(t, size, bold) <= max) return t;
            while (t.length > 1 && width(t + '…', size, bold) > max) t = t.slice(0, -1);
            return t.replace(/\s+$/, '') + '…';
        };
        const rgb = (hex) => {
            const h = ('' + hex).replace('#', '');
            const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
            return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => v.toFixed(3)).join(' ');
        };
        const pdfStr = (s) => '(' + enc(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)') + ')';
        const n2 = (v) => (Math.round(v * 100) / 100).toString();

        // ---- a page: drawing in top-left coordinates, written in PDF's bottom-left ones ----
        const Page = () => {
            const ops = [];
            const Y = (y) => n2(H - y);
            return {
                ops,
                text(x, y, s, o) {
                    const q = o || {};
                    const size = q.size || 10, bold = !!q.bold;
                    let tx = x;
                    const str = q.max ? fit(s, size, bold, q.max) : ('' + s);
                    if (q.align === 'right') tx = x - width(str, size, bold);
                    else if (q.align === 'center') tx = x - width(str, size, bold) / 2;
                    ops.push('BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' + rgb(q.color || INK) + ' rg '
                        + n2(tx) + ' ' + Y(y) + ' Td ' + pdfStr(str) + ' Tj ET');
                    return width(str, size, bold);
                },
                rect(x, y, w, h, color) {
                    if (!(w > 0 && h > 0)) return;
                    ops.push(rgb(color) + ' rg ' + n2(x) + ' ' + Y(y + h) + ' ' + n2(w) + ' ' + n2(h) + ' re f');
                },
                line(x1, y1, x2, y2, color, lw, dash) {
                    ops.push('q ' + rgb(color) + ' RG ' + n2(lw || 0.75) + ' w ' + (dash ? '[2 2] 0 d ' : '')
                        + n2(x1) + ' ' + Y(y1) + ' m ' + n2(x2) + ' ' + Y(y2) + ' l S Q');
                },
                diamond(cx, cy, r, color) {
                    ops.push(rgb(color) + ' rg ' + n2(cx) + ' ' + Y(cy - r) + ' m ' + n2(cx + r) + ' ' + Y(cy) + ' l '
                        + n2(cx) + ' ' + Y(cy + r) + ' l ' + n2(cx - r) + ' ' + Y(cy) + ' l h f');
                },
            };
        };

        // ---- the file -------------------------------------------------------------------
        const build = (pages) => {
            const objs = [];
            const add = (body) => { objs.push(body); return objs.length; };
            const catalog = add(null), pagesId = add(null);
            const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
            const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
            const kids = [];
            for (const pg of pages) {
                const stream = pg.ops.join('\n');
                const content = add('<< /Length ' + stream.length + ' >>\nstream\n' + stream + '\nendstream');
                kids.push(add('<< /Type /Page /Parent ' + pagesId + ' 0 R /MediaBox [0 0 ' + W + ' ' + H + '] '
                    + '/Resources << /Font << /F1 ' + f1 + ' 0 R /F2 ' + f2 + ' 0 R >> >> /Contents ' + content + ' 0 R >>'));
            }
            objs[catalog - 1] = '<< /Type /Catalog /Pages ' + pagesId + ' 0 R >>';
            objs[pagesId - 1] = '<< /Type /Pages /Kids [' + kids.map((k) => k + ' 0 R').join(' ') + '] /Count ' + kids.length + ' >>';
            let out = '%PDF-1.4\n%âãÏÓ\n';
            const offs = [];
            objs.forEach((body, i) => { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + body + '\nendobj\n'; });
            const xref = out.length;
            out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n'
                + offs.map((o) => ('0000000000' + o).slice(-10) + ' 00000 n \n').join('')
                + 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root ' + catalog + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
            // Every character above is a single byte (enc() made sure of the text), so the
            // string's length is the byte count the xref offsets assume.
            const bytes = new Uint8Array(out.length);
            for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
            return bytes;
        };

        const make = async (plan, opts) => {
            const o = opts || {};
            let PV = null;
            try { PV = await exec('fundraise/plan-view.js'); } catch (e) { PV = null; }
            if (!PV) throw new Error('the plan view could not be loaded');
            const p = PV.clean(plan);
            if (!p) throw new Error('there is no plan to put in a PDF');
            // Chosen here, after the last await: everything below reads these synchronously,
            // so two downloads in flight cannot end up swapping each other's colours.
            useTheme(o.theme === 'campaign' ? 'campaign' : 'white');
            const cur = p.currency || 'USD';
            const money = (v, short) => PV.money(v, cur, short);
            const month = (t) => { try { return new Date(t).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }); } catch (e) { return ''; } };
            const colour = (() => { const seen = {}; let i = 0; return (g) => PALETTE[g] || seen[g] || (seen[g] = EXTRA[(i++) % EXTRA.length]); })();
            const title = ('' + (o.title || p.name || 'Program plan')).trim();
            const made = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

            const pages = [];
            let pg = null, y = 0;
            // The paper is painted first on every page, so the colour reaches the edges
            // rather than sitting in a box with white margins around it.
            const newPage = () => { pg = Page(); pages.push(pg); y = M; if (PAPER) pg.rect(0, 0, W, H, PAPER); };
            const room = (h) => { if (y + h > H - M - 26) { newPage(); return false; } return true; };
            const section = (label) => {
                room(40);
                y += 10;
                pg.text(M, y, label.toUpperCase(), { size: 9, bold: true, color: TEAL });
                y += 8;
                pg.line(M, y, W - M, y, LINE, 0.75);
                y += 14;
            };

            // ---- the head ----------------------------------------------------------------
            newPage();
            y += 16;
            pg.text(M, y, title, { size: 20, bold: true, max: W - 2 * M });
            y += 18;
            const hasCal = p.phases.length > 0;
            const t0 = hasCal ? Math.min.apply(null, p.phases.map((x) => x.start)) : 0;
            const t1 = hasCal ? Math.max.apply(null, p.phases.map((x) => x.end).concat(p.milestones.map((m) => m.at))) : 0;
            const spanTxt = (() => {
                if (!hasCal) return '';
                const months = Math.max(1, Math.round((t1 - t0) / (30.44 * 86400000)));
                return months < 24 ? months + ' months' : (Math.round(months / 1.2) / 10) + ' years';
            })();
            const line2 = [p.name && p.name !== title ? p.name : '',
                hasCal ? (p.phases.length + (p.phases.length === 1 ? ' stage' : ' stages') + ' over ' + spanTxt
                    + ', ' + month(t0) + ' – ' + month(t1)) : 'Budget',
                p.total > 0 ? money(p.total) + ' in total' : ''].filter(Boolean).join('  ·  ');
            pg.text(M, y, line2, { size: 10.5, color: DIM, max: W - 2 * M });
            const goal = Math.max(0, +o.goal || 0), raised = Math.max(0, +o.raised || 0);
            if (goal > 0 || raised > 0) {
                y += 15;
                pg.text(M, y, 'Campaign goal ' + money(goal) + '  ·  raised so far ' + money(raised)
                    + (goal > 0 ? ' (' + Math.round(raised / goal * 100) + '%)' : ''), { size: 10.5, color: DIM });
            }
            y += 12;

            // ---- the timeline ------------------------------------------------------------
            if (hasCal) {
                const LX = M, LW = 236, TX = M + LW + 14, TW = W - M - TX;
                const range = Math.max(1, t1 - t0);
                const xAt = (t) => TX + Math.max(0, Math.min(1, (t - t0) / range)) * TW;
                const ticks = [];
                for (let yr = new Date(t0).getFullYear() + 1; yr <= new Date(t1).getFullYear(); yr++) {
                    const t = new Date(yr, 0, 1).getTime();
                    if (t > t0 && t < t1) ticks.push({ x: xAt(t), label: '' + yr });
                }
                const axis = () => {
                    pg.text(TX, y, month(t0), { size: 8, bold: true, color: TEAL });
                    pg.text(TX + TW, y, month(t1), { size: 8, bold: true, color: TEAL, align: 'right' });
                    for (const k of ticks) {
                        if (k.x - TX > 60 && TX + TW - k.x > 60) pg.text(k.x, y, k.label, { size: 8, bold: true, color: TEAL, align: 'center' });
                    }
                    y += 8;
                };
                section('Timeline');
                axis();
                const ROW = 27;
                p.phases.forEach((x) => {
                    if (!room(ROW)) { section('Timeline, continued'); axis(); }
                    const top = y;
                    pg.text(LX, top + 10, x.name, { size: 9.5, bold: true, max: LW });
                    pg.text(LX, top + 21, month(x.start) + ' – ' + month(x.end) + (x.cost ? '  ·  ' + money(x.cost, true) : ''),
                        { size: 8, color: DIM, max: LW });
                    for (const k of ticks) pg.line(k.x, top, k.x, top + ROW, LINE, 0.6, true);
                    pg.rect(TX, top + 11, TW, 6, TRACK);
                    const bx = xAt(x.start), bw = Math.max(2.5, xAt(x.end) - bx);
                    pg.rect(bx, top + 9, bw, 10, colour(x.group));
                    y += ROW;
                });
                if (p.milestones.length) {
                    room(24 + 14 * p.milestones.length);
                    const top = y + 2;
                    pg.text(LX, top + 9, 'Milestones', { size: 9.5, bold: true, color: DIM });
                    for (const m of p.milestones) pg.diamond(xAt(m.at), top + 6, 5, '#f59e0b');
                    y += 20;
                    for (const m of p.milestones) {
                        pg.diamond(TX + 4, y - 3, 3.5, '#f59e0b');
                        const w0 = pg.text(TX + 13, y, m.name, { size: 9, max: TW - 90 });
                        pg.text(TX + 13 + w0 + 6, y, month(m.at), { size: 9, color: DIM });
                        y += 14;
                    }
                }
                const groups = [];
                for (const x of p.phases) if (groups.indexOf(x.group) < 0) groups.push(x.group);
                if (groups.length > 1) {
                    room(18);
                    y += 6;
                    let lx = TX;
                    for (const g of groups) {
                        pg.rect(lx, y - 7, 8, 8, colour(g));
                        lx += 12 + pg.text(lx + 12, y, g, { size: 9, color: DIM }) + 18;
                    }
                    y += 8;
                }
            }

            // ---- where the money goes --------------------------------------------------
            if (p.total > 0) {
                const gs = p.groups.length ? p.groups : [{ name: 'Program', cost: p.total }];
                room(60 + 16 * gs.length);
                section('Where the money goes');
                pg.text(W - M, y - 22, money(p.total) + ' total', { size: 11, bold: true, align: 'right' });
                const BX = M, BW = W - 2 * M, gsum = gs.reduce((s, g) => s + g.cost, 0) || p.total;
                let bx = BX;
                for (const g of gs) { const w = g.cost / gsum * BW; pg.rect(bx, y, w, 14, colour(g.name)); bx += w; }
                const mark = (v, label, color) => {
                    if (!(v > 0)) return;
                    const x = BX + Math.min(1, v / p.total) * BW;
                    pg.line(x, y - 4, x, y + 18, color, 1.6);
                    pg.text(x, y + 28, label, { size: 8, bold: true, color, align: x > W - M - 70 ? 'right' : (x < M + 70 ? 'left' : 'center') });
                };
                mark(raised, 'raised ' + money(raised, true), RAISED);
                if (goal > 0 && (!(raised > 0) || Math.abs(goal - raised) / p.total > 0.1)) mark(goal, 'goal ' + money(goal, true), GOALC);
                y += (goal > 0 || raised > 0) ? 44 : 28;
                for (const g of gs) {
                    room(16);
                    pg.rect(M, y - 8, 9, 9, colour(g.name));
                    pg.text(M + 15, y, g.name, { size: 10 });
                    pg.text(M + 290, y, money(g.cost), { size: 10, bold: true, align: 'right' });
                    pg.text(M + 300, y, Math.round(g.cost / gsum * 100) + '%', { size: 10, color: DIM });
                    y += 16;
                }
                if (goal > 0) {
                    let last = null, left = goal;
                    for (const x of p.phases) { if (!(x.cost > 0)) continue; if (left >= x.cost) { left -= x.cost; last = x; } else break; }
                    room(20);
                    y += 6;
                    pg.text(M, y, goal >= p.total ? 'The goal covers the whole plan.'
                        : 'The goal covers ' + Math.round(goal / p.total * 100) + '% of the plan'
                            + (last ? ', through ' + last.name + ' (' + month(last.end) + ').' : '.'), { size: 10, color: INK });
                }
            }

            // ---- footers -----------------------------------------------------------------
            pages.forEach((page, i) => {
                page.line(M, H - M + 2, W - M, H - M + 2, LINE, 0.6);
                page.text(M, H - M + 16, (o.link ? o.link + '  ·  ' : '') + 'Made ' + made, { size: 8, color: FAINT, max: W - 2 * M - 80 });
                page.text(W - M, H - M + 16, 'Page ' + (i + 1) + ' of ' + pages.length, { size: 8, color: FAINT, align: 'right' });
            });
            return build(pages);
        };

        const slug = (s) => ('' + (s || 'program')).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'program';
        const download = async (plan, opts) => {
            const o = opts || {};
            const bytes = await make(plan, o);
            const name = slug(o.title || (plan && plan.name)) + '-program-plan'
                + (o.theme === 'campaign' ? '' : '-white') + '.pdf';
            const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url; a.download = name; a.rel = 'noopener';
            document.body.appendChild(a); a.click();
            setTimeout(() => { try { a.remove(); URL.revokeObjectURL(url); } catch (e) { } }, 4000);
            return name;
        };

        return { make: make, download: download };
    })();
}
