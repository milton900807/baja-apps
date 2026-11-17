return (async () => {

    // A real PDF, written in the browser with no library.
    //
    //   const P = await exec('baja/io/pdf-writer.js');
    //   P.download({ title, subtitle, meta: [[k, v], …], columns: [...],
    //                rows: [[...], …], filename: 'report.pdf' });
    //
    //   PROSE, for a written report rather than a table:
    //   P.download({ title, subtitle, markdown: '## Heading\n\nText…', filename: 'report.pdf' });
    //   `markdown` takes the same small subset baja/lib/report-view.js renders on screen --
    //   #/##/### headings, - and 1. lists, **bold**, *italic*, `code` -- so the file and the
    //   panel show the same document. `blocks: [{k:'h2'|'h3'|'p'|'li'|'rule', t, n}]` is the
    //   same thing pre-parsed. Both may be combined with meta and a table, in that order.
    //
    // Same reasoning as baja/io/xlsx-writer.js: a report that leaves the building has to
    // open cleanly in whatever the recipient uses, and a file that opens with a warning
    // fails exactly where it matters. So this writes the format properly -- a catalog, a
    // page tree, a font resource, content streams and a real xref -- rather than something
    // PDF-shaped.
    //
    // Deliberately narrow: Helvetica, black text, key/values, flowing prose and one table,
    // paginated. No images, no embedded fonts, no compression. That covers a run report,
    // and every one of those omissions is a thing that could be wrong in a file someone
    // else has to open.

    const PAGE_W = 612, PAGE_H = 792;          // US Letter at 72 dpi
    const M = 48;                              // margin
    const enc = new TextEncoder();

    // TEXT GOES OUT AS ASCII, and that is not a simplification -- it is the only range that
    // survives the trip. The file is serialised with TextEncoder, which is UTF-8, while the
    // fonts declare WinAnsiEncoding, which is one byte per glyph. So a character above 0x7F
    // leaves here as two bytes and arrives as two wrong glyphs: a bullet came out as 'A·'.
    // Everything outside ASCII is therefore transliterated where there is an honest
    // equivalent, and dropped otherwise -- a '?' in the middle of a sequence would read as
    // data. Accented letters fold to their base letter, which keeps a name readable instead
    // of punching a hole in it.
    const TRANSLIT = {
        '–': '-', '—': '-', '‘': "'", '’': "'",
        '“': '"', '”': '"', '…': '...', '·': '-',
        '≤': '<=', '≥': '>=', '→': '->', '°': ' deg',
        '′': "'", '″': '"', '×': 'x', '−': '-',
        '•': '-', '‑': '-', '\u00a0': ' ', 'µ': 'u', 'μ': 'u',
        '±': '+/-', '≈': '~', '≠': '!=', '™': '(TM)', '®': '(R)', '©': '(C)',
        'Δ': 'delta', 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', '′': "'"
    };
    const FOLD = {
        a: 'àáâãäå', c: 'ç', e: 'èéêë', i: 'ìíîï', n: 'ñ', o: 'òóôõö', u: 'ùúûü', y: 'ýÿ',
        A: 'ÀÁÂÃÄÅ', C: 'Ç', E: 'ÈÉÊË', I: 'ÌÍÎÏ', N: 'Ñ', O: 'ÒÓÔÕÖ', U: 'ÙÚÛÜ', Y: 'Ý'
    };
    for (const base of Object.keys(FOLD)) { for (const ch of FOLD[base]) TRANSLIT[ch] = base; }
    TRANSLIT['ß'] = 'ss'; TRANSLIT['æ'] = 'ae'; TRANSLIT['Æ'] = 'AE'; TRANSLIT['ø'] = 'o'; TRANSLIT['Ø'] = 'O';
    // The text as it will LOOK: transliterated, not yet escaped. Widths are measured on this
    // and never on the escaped form -- an escape adds a backslash that is not a glyph, so
    // measuring '\\(MOE\\)' put a visible gap after every parenthesis.
    const asciiOf = (v) => ('' + (v == null ? '' : v))
        .replace(/[^\x20-\x7E]/g, (c) => (TRANSLIT[c] != null ? TRANSLIT[c] : ''));
    // The text as it will be WRITTEN. Applied once, by T(), so callers pass plain strings:
    // escaping an already-escaped string turns \\( into a literal backslash on the page.
    const pdfText = (v) => asciiOf(v)
        .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

    // ADVANCE WIDTHS PER 1000 UNITS, for Helvetica and Helvetica-Bold, as the AFM files give
    // them. Two tables, because bold is not regular scaled by a constant -- 'o' is 556 regular
    // and 611 bold while '1' is 556 in both -- and a single fudged table drifts: measuring
    // bold with regular widths ran words together ("discriminatethe variant"), and inflating
    // every bold glyph by a flat percentage opened gaps in the other direction. Without the
    // right numbers a proportional font is laid out as if it were monospace, and it shows
    // inside one line.
    const mkWidths = (spec, dflt) => {
        const w = new Array(256).fill(dflt);
        for (const [chars, v] of spec) { for (const ch of chars) w[ch.charCodeAt(0)] = v; }
        return w;
    };
    const W = mkWidths([
        [' ', 278], ['!', 278], ['"', 355], ['#$', 556], ['%', 889], ['&', 667], ["'", 191],
        ['()', 333], ['*', 389], ['+', 584], [',', 278], ['-', 333], ['.', 278], ['/', 278],
        ['0123456789', 556], [':;', 278], ['<=>', 584], ['?', 556], ['@', 1015],
        ['AB', 667], ['CDGHNOQRUVX', 722], ['E', 667], ['F', 611], ['G', 778], ['I', 278],
        ['J', 500], ['K', 667], ['L', 556], ['M', 833], ['O', 778], ['P', 667], ['Q', 778],
        ['S', 667], ['T', 611], ['V', 667], ['W', 944], ['XY', 667], ['Z', 611],
        ['[]', 278], ['\\', 278], ['^', 469], ['_', 556], ['`', 333],
        ['abdeghnopqu', 556], ['c', 500], ['f', 278], ['ij', 222], ['k', 500], ['l', 222],
        ['m', 833], ['r', 333], ['s', 500], ['t', 278], ['vxyz', 500], ['w', 722],
        ['{', 334], ['|', 260], ['}', 334], ['~', 584]
    ], 556);
    const WB = mkWidths([
        [' ', 278], ['!', 333], ['"', 474], ['#$', 556], ['%', 889], ['&', 722], ["'", 238],
        ['()', 333], ['*', 389], ['+', 584], [',', 278], ['-', 333], ['.', 278], ['/', 278],
        ['0123456789', 556], [':;', 333], ['<=>', 584], ['?', 611], ['@', 975],
        ['ABCDHKUX', 722], ['E', 667], ['F', 611], ['G', 778], ['I', 278], ['J', 556],
        ['L', 611], ['M', 833], ['NQR', 722], ['O', 778], ['P', 667], ['S', 667], ['T', 611],
        ['VY', 667], ['W', 944], ['Z', 611],
        ['[]', 333], ['\\', 278], ['^', 584], ['_', 556], ['`', 333],
        ['abcekrsv', 556], ['bdghnopqu', 611], ['f', 333], ['ij', 278], ['l', 278],
        ['m', 889], ['r', 389], ['t', 333], ['wxy', 556], ['w', 778], ['z', 500],
        ['{', 389], ['|', 280], ['}', 389], ['~', 584]
    ], 556);

    const widthOf = (v, size, bold) => {
        const s = asciiOf(v);
        const tbl = bold ? WB : W;
        let t = 0;
        for (let i = 0; i < s.length; i++) t += (tbl[s.charCodeAt(i) & 0xFF] || 556);
        return t * size / 1000;
    };
    // Cut to fit rather than let a long sequence run off the page edge, which is the one
    // failure a reader cannot recover from -- an overflowing cell simply is not there.
    const clip = (v, size, max) => {
        const s = asciiOf(v);
        if (widthOf(s, size) <= max) return s;
        let out = s;
        while (out.length > 1 && widthOf(out + '...', size) > max) out = out.slice(0, -1);
        return out + '...';
    };

    // ASCII, for the reason given above pdfText: a real bullet glyph cannot survive a UTF-8
    // serialisation into a WinAnsi font, and a dash that renders beats a bullet that does not.
    const BULLET = '-';

    // One line of markdown into runs of text, with the emphasis resolved. Bold becomes the
    // bold font; italic and code have no font here, so they keep their text and lose their
    // markers rather than printing the asterisks and backticks literally.
    const inlineRuns = (src) => {
        const out = [];
        let rest = '' + (src == null ? '' : src);
        const re = /\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*/;
        let m;
        while ((m = rest.match(re))) {
            if (m.index > 0) out.push({ t: rest.slice(0, m.index), b: false });
            if (m[1] != null) out.push({ t: m[1], b: true });
            else out.push({ t: (m[2] != null ? m[2] : m[3]), b: false });
            rest = rest.slice(m.index + m[0].length);
        }
        if (rest) out.push({ t: rest, b: false });
        return out.length ? out : [{ t: '', b: false }];
    };

    // Word-wrap those runs to a width, keeping each word's weight so that each is measured
    // against the table for the font it will actually be drawn in.
    const runWidth = (t, size, bold) => widthOf(t, size, bold);
    const wrapRuns = (runs, size, maxW) => {
        const words = [];
        for (const r of runs) {
            for (const part of ('' + r.t).split(/(\s+)/)) {
                if (part !== '') words.push({ t: part, b: r.b, sp: /^\s+$/.test(part) });
            }
        }
        const lines = [];
        let cur = [], w = 0;
        const flush = () => {
            while (cur.length && cur[cur.length - 1].sp) cur.pop();
            if (cur.length) lines.push(cur);
            cur = []; w = 0;
        };
        for (const wd of words) {
            const ww = runWidth(wd.t, size, wd.b);
            if (!wd.sp && cur.length && w + ww > maxW) flush();
            if (wd.sp && !cur.length) continue;              // never start a line on a space
            cur.push(wd); w += ww;
        }
        flush();
        return lines.length ? lines : [[]];
    };

    // The same markdown subset baja/lib/report-view.js renders, one block per line.
    const mdBlocks = (src) => {
        const out = [];
        for (const raw of ('' + (src == null ? '' : src)).split(/\r?\n/)) {
            const line = raw.trimEnd();
            if (!line.trim()) continue;
            let m;
            if ((m = line.match(/^\s*###\s+(.*)$/))) out.push({ k: 'h3', t: m[1] });
            else if ((m = line.match(/^\s*##\s+(.*)$/))) out.push({ k: 'h2', t: m[1] });
            else if ((m = line.match(/^\s*#\s+(.*)$/))) out.push({ k: 'h1', t: m[1] });
            else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) out.push({ k: 'li', t: m[1] });
            else if ((m = line.match(/^\s*(\d+)\.\s+(.*)$/))) out.push({ k: 'li', t: m[2], n: m[1] });
            else out.push({ k: 'p', t: line });
        }
        return out;
    };

    const BLOCK = {
        h1: { size: 15, bold: true, above: 15, below: 6 },
        h2: { size: 13, bold: true, above: 14, below: 5, rule: true },
        h3: { size: 11, bold: true, above: 11, below: 3 },
        p: { size: 9.5, bold: false, above: 3, below: 3 },
        li: { size: 9.5, bold: false, above: 1, below: 1, indent: 16 },
        rule: { size: 0, bold: false, above: 6, below: 6, rule: true }
    };

    const build = (spec) => {
        const o = spec || {};
        const columns = (o.columns || []).map((c) => '' + c);
        const rows = o.rows || [];
        const meta = o.meta || [];

        // Column widths from the content, proportional, then scaled to the text width.
        const avail = PAGE_W - 2 * M;
        const want = columns.map((c, i) => {
            let m = widthOf(c, 8, true);
            for (const r of rows) m = Math.max(m, widthOf(r[i] == null ? '' : r[i], 8));
            return Math.min(m + 10, avail * 0.42);
        });
        const total = want.reduce((a, b) => a + b, 0) || 1;
        const colW = want.map((v) => v * avail / total);

        const pages = [];
        let ops = [], y = 0;
        const T = (x, yy, size, bold, text) => {
            ops.push('BT /' + (bold ? 'F2' : 'F1') + ' ' + size + ' Tf ' +
                x.toFixed(2) + ' ' + yy.toFixed(2) + ' Td (' + pdfText(text) + ') Tj ET');
        };
        const line = (x1, yy, x2, wgt, g) => {
            ops.push((g == null ? 0.75 : g) + ' G ' + (wgt || 0.5) + ' w ' +
                x1.toFixed(2) + ' ' + yy.toFixed(2) + ' m ' + x2.toFixed(2) + ' ' + yy.toFixed(2) + ' l S');
        };
        const newPage = () => { if (ops.length) pages.push(ops); ops = []; y = PAGE_H - M; };
        const need = (h) => { if (y - h < M + 24) { newPage(); return true; } return false; };

        newPage();
        T(M, y, 17, true, o.title || 'Report'); y -= 20;
        if (o.subtitle) { T(M, y, 10, false, o.subtitle); y -= 14; }
        line(M, y, PAGE_W - M, 1.2, 0.2); y -= 18;

        for (const [k, v] of meta) {
            need(14);
            T(M, y, 9, false, k);
            T(M + 165, y, 9, true, '' + (v == null ? '' : v));
            y -= 13;
        }

        // ---- prose ----------------------------------------------------------------
        let blocks = (o.blocks && o.blocks.length) ? o.blocks
            : (o.markdown ? mdBlocks(o.markdown) : []);
        // A generated report usually opens with its own title, and it was handed to us as
        // `title` as well. Printing both puts the same line on the page twice, so a leading
        // heading that says what the title says is dropped.
        if (blocks.length && (blocks[0].k === 'h1' || blocks[0].k === 'h2') && o.title) {
            const flat = (x) => pdfText(x).toLowerCase().replace(/[^a-z0-9]+/g, '');
            if (flat(blocks[0].t) === flat(o.title)) blocks = blocks.slice(1);
        }
        if (blocks.length) {
            if (meta.length) y -= 6;
            const runLine = (x, yy, size, lineRuns, forceBold) => {
                let cx = x;
                for (const wd of lineRuns) {
                    const bold = forceBold || wd.b;
                    if (!wd.sp) T(cx, yy, size, bold, wd.t);
                    cx += runWidth(wd.t, size, bold);
                }
            };
            for (const blk of blocks) {
                const st = BLOCK[blk.k] || BLOCK.p;
                y -= st.above;
                if (blk.k === 'rule') {
                    need(10); line(M, y, PAGE_W - M, 0.6, 0.55); y -= st.below; continue;
                }
                const indent = st.indent || 0;
                const lines = wrapRuns(inlineRuns(blk.t), st.size, avail - indent);
                for (let i = 0; i < lines.length; i++) {
                    need(st.size + 5);
                    // The marker sits on the first line only, so a wrapped item stays indented
                    // under its own text rather than under the bullet.
                    if (blk.k === 'li' && i === 0) T(M + 3, y, st.size, false, blk.n ? (blk.n + '.') : BULLET);
                    runLine(M + indent, y, st.size, lines[i], st.bold);
                    y -= st.size + 3.5;
                }
                if (st.rule) { y -= 2; need(6); line(M, y, PAGE_W - M, 0.6, 0.55); y -= 3; }
                y -= st.below;
            }
        }

        if (columns.length) {
            y -= 10;
            const header = () => {
                let x = M;
                for (let i = 0; i < columns.length; i++) {
                    T(x, y, 8, true, clip(columns[i], 8, colW[i] - 4));
                    x += colW[i];
                }
                y -= 4; line(M, y, PAGE_W - M, 0.7, 0.45); y -= 11;
            };
            header();
            for (const r of rows) {
                if (need(12)) { T(M, y, 9, true, (o.title || 'Report') + ' (continued)'); y -= 16; header(); }
                let x = M;
                for (let i = 0; i < columns.length; i++) {
                    const cell = (r[i] == null) ? '' : ('' + r[i]);
                    T(x, y, 8, false, clip(cell, 8, colW[i] - 4));
                    x += colW[i];
                }
                y -= 11;
            }
        }
        if (ops.length) pages.push(ops);
        return pages;
    };

    const bytes = (spec) => {
        const pages = build(spec);
        const objs = [];                                  // 1-based; objs[i] is object i+1
        const push = (s) => { objs.push(s); return objs.length; };

        // 1 catalog, 2 pages, 3 F1, 4 F2, then per page: page object + content stream.
        push('');                                         // 1 catalog, filled below
        push('');                                         // 2 page tree
        push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
        push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');

        const kids = [];
        for (const ops of pages) {
            const content = ops.join('\n');
            const cid = push('<< /Length ' + enc.encode(content).length + ' >>\nstream\n' + content + '\nendstream');
            const pid = push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PAGE_W + ' ' + PAGE_H + ']'
                + ' /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + cid + ' 0 R >>');
            kids.push(pid + ' 0 R');
        }
        objs[0] = '<< /Type /Catalog /Pages 2 0 R >>';
        objs[1] = '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + kids.length + ' >>';

        let out = '%PDF-1.4\n';
        const offsets = [];
        for (let i = 0; i < objs.length; i++) {
            offsets.push(enc.encode(out).length);
            out += (i + 1) + ' 0 obj\n' + objs[i] + '\nendobj\n';
        }
        const xref = enc.encode(out).length;
        out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
        for (const off of offsets) out += ('0000000000' + off).slice(-10) + ' 00000 n \n';
        out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
        return enc.encode(out);
    };

    const download = (spec) => {
        const blob = new Blob([bytes(spec)], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (spec && spec.filename) || 'report.pdf';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            try { URL.revokeObjectURL(url); } catch (e) { }
            try { if (a.parentNode) a.parentNode.removeChild(a); } catch (e) { }
        }, 250);
    };

    return { bytes, download };
})();
