return (async () => {

    // A real PDF, written in the browser with no library.
    //
    //   const P = await exec('baja/io/pdf-writer.js');
    //   P.download({ title, subtitle, meta: [[k, v], …], columns: [...],
    //                rows: [[...], …], filename: 'report.pdf' });
    //
    // Same reasoning as baja/io/xlsx-writer.js: a report that leaves the building has to
    // open cleanly in whatever the recipient uses, and a file that opens with a warning
    // fails exactly where it matters. So this writes the format properly -- a catalog, a
    // page tree, a font resource, content streams and a real xref -- rather than something
    // PDF-shaped.
    //
    // Deliberately narrow: Helvetica, one column of key/values and one table, paginated.
    // No images, no embedded fonts, no compression. That covers a run report, and every one
    // of those omissions is a thing that could be wrong in a file someone else has to open.
    //
    // There is also a LOW-LEVEL page builder, for a report that has to draw rather than
    // tabulate -- a map of a track with the oligos on it, say:
    //
    //   const d = P.doc();            // d.W, d.H, d.M are the page box and margin
    //   d.text(x, y, 'label', { size: 9, bold: true, align: 'center', rgb: [0,0,0] });
    //   d.rect(x, y, w, h, { fill: [0.2,0.5,0.8], stroke: [0,0,0], lw: 0.5 });
    //   d.line(x1, y1, x2, y2, { lw: 0.6, rgb: [0.4,0.4,0.4] });
    //   d.page();                     // start another one
    //   d.download('map.pdf');
    //
    // PDF coordinates: x rightward, y UPWARD from the bottom-left corner of the page.
    // Colours are [r, g, b] in 0..1. Both APIs write the same kind of file.

    const PAGE_W = 612, PAGE_H = 792;          // US Letter at 72 dpi
    const M = 48;                              // margin
    const enc = new TextEncoder();

    // PDF strings are Latin-1 with three characters that must be escaped. Anything outside
    // Latin-1 is transliterated where there is an obvious equivalent and dropped otherwise:
    // a '?' in the middle of a sequence would read as data.
    const TRANSLIT = {
        '–': '-', '—': '-', '‘': "'", '’': "'",
        '“': '"', '”': '"', '…': '...', '·': '-',
        '≤': '<=', '≥': '>=', '→': '->', '°': ' deg',
        '′': "'", '″': '"', '×': 'x', '−': '-'
    };
    const pdfText = (v) => {
        let s = '' + (v == null ? '' : v);
        s = s.replace(/[–—‘’“”…·≤≥→°′″×−]/g,
            (c) => TRANSLIT[c] || '');
        s = s.replace(/[^\x20-\xFF]/g, '');
        return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    };

    // Helvetica advance widths, per 1000 units, for the printable Latin-1 range. Without
    // these every column would be laid out as if each glyph were the same width, and a
    // proportional font makes that visibly wrong within one line.
    const W = (() => {
        const w = new Array(256).fill(556);
        const set = (str, v) => { for (const ch of str) w[ch.charCodeAt(0)] = v; };
        set(' !', 278); set('"', 355); set('#$', 556); set('%', 889); set('&', 667);
        set("'", 191); set('()', 333); set('*', 389); set('+', 584); set(',.', 278);
        set('-', 333); set('/', 278); set('0123456789', 556); set(':;', 278);
        set('<=>', 584); set('?', 556); set('@', 1015);
        set('ABDEHKNOPQRSUVXY', 722); set('C', 722); set('FG', 667); set('IJ', 278);
        set('LT', 611); set('M', 833); set('W', 944); set('Z', 611);
        set('[]', 278); set('\\', 278); set('^', 469); set('_', 556); set('`', 333);
        set('abcdeghknopqsuvxyz', 556); set('f', 278); set('ij', 222); set('l', 222);
        set('m', 833); set('r', 333); set('t', 278); set('w', 722);
        w[32] = 278;
        return w;
    })();
    const widthOf = (s, size) => {
        let t = 0;
        for (let i = 0; i < s.length; i++) t += (W[s.charCodeAt(i) & 0xFF] || 556);
        return t * size / 1000;
    };
    // Cut to fit rather than let a long sequence run off the page edge, which is the one
    // failure a reader cannot recover from -- an overflowing cell simply is not there.
    const clip = (s, size, max) => {
        if (widthOf(s, size) <= max) return s;
        let out = s;
        while (out.length > 1 && widthOf(out + '...', size) > max) out = out.slice(0, -1);
        return out + '...';
    };

    const build = (spec) => {
        const o = spec || {};
        const columns = (o.columns || []).map((c) => '' + c);
        const rows = o.rows || [];
        const meta = o.meta || [];

        // Column widths from the content, proportional, then scaled to the text width.
        const avail = PAGE_W - 2 * M;
        const want = columns.map((c, i) => {
            let m = widthOf(pdfText(c), 8);
            for (const r of rows) m = Math.max(m, widthOf(pdfText(r[i] == null ? '' : r[i]), 8));
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

        if (columns.length) {
            y -= 10;
            const header = () => {
                let x = M;
                for (let i = 0; i < columns.length; i++) {
                    T(x, y, 8, true, clip(pdfText(columns[i]), 8, colW[i] - 4));
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
                    T(x, y, 8, false, clip(pdfText(cell), 8, colW[i] - 4));
                    x += colW[i];
                }
                y -= 11;
            }
        }
        if (ops.length) pages.push(ops);
        return pages;
    };

    // Pages (each an array of content-stream operators) -> the bytes of a PDF file.
    const serialize = (pages) => {
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

    const bytes = (spec) => serialize(build(spec));

    // Hand a byte array to the browser as a download.
    const saveBytes = (data, filename) => {
        const blob = new Blob([data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'report.pdf';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            try { URL.revokeObjectURL(url); } catch (e) { }
            try { if (a.parentNode) a.parentNode.removeChild(a); } catch (e) { }
        }, 250);
    };

    // ---- the low-level page builder ------------------------------------------------
    //
    // Text, lines and rectangles at page coordinates, and nothing else. A caller that
    // needs a drawing -- a track map with oligos along it -- gets the page box and the
    // text metrics and places things itself; a caller that wants a table keeps using
    // build()/download() above.
    const doc = () => {
        const pages = [];
        let ops = [];
        const col = (c) => (Array.isArray(c) ? c : [0, 0, 0]).map((v) => (+v || 0).toFixed(3)).join(' ');
        const api = {
            W: PAGE_W, H: PAGE_H, M: M,
            // Width of a string when set at this size, and the same string cut to fit.
            width: (str, size, bold) => widthOf(pdfText(str), size || 9),
            clip: (str, size, max) => clip(pdfText(str), size || 9, max),
            // Finish this page and start the next one. A page with nothing on it is dropped.
            page: () => { if (ops.length) pages.push(ops); ops = []; return api; },
            text: (x, y, str, o) => {
                const s = o || {};
                const size = s.size || 9;
                let t = pdfText(str);
                if (s.max != null) t = clip(t, size, s.max);
                let px = x;
                if (s.align === 'center') px = x - widthOf(t, size) / 2;
                else if (s.align === 'right') px = x - widthOf(t, size);
                ops.push(col(s.rgb) + ' rg BT /' + (s.bold ? 'F2' : 'F1') + ' ' + size + ' Tf '
                    + px.toFixed(2) + ' ' + y.toFixed(2) + ' Td (' + t + ') Tj ET 0 0 0 rg');
                return api;
            },
            line: (x1, y1, x2, y2, o) => {
                const s = o || {};
                ops.push(col(s.rgb) + ' RG ' + (s.lw || 0.5) + ' w '
                    + x1.toFixed(2) + ' ' + y1.toFixed(2) + ' m '
                    + x2.toFixed(2) + ' ' + y2.toFixed(2) + ' l S 0 0 0 RG');
                return api;
            },
            // A rectangle with its lower-left corner at (x, y). Filled, stroked or both.
            rect: (x, y, w, h, o) => {
                const s = o || {};
                const box = x.toFixed(2) + ' ' + y.toFixed(2) + ' ' + w.toFixed(2) + ' ' + h.toFixed(2) + ' re';
                if (s.fill && s.stroke) ops.push(col(s.fill) + ' rg ' + col(s.stroke) + ' RG ' + (s.lw || 0.5) + ' w ' + box + ' B 0 0 0 rg 0 0 0 RG');
                else if (s.fill) ops.push(col(s.fill) + ' rg ' + box + ' f 0 0 0 rg');
                else ops.push(col(s.stroke) + ' RG ' + (s.lw || 0.5) + ' w ' + box + ' S 0 0 0 RG');
                return api;
            },
            pageCount: () => pages.length + (ops.length ? 1 : 0),
            bytes: () => serialize(ops.length ? pages.concat([ops]) : pages),
            download: (filename) => { saveBytes(api.bytes(), filename); return api; }
        };
        return api;
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

    return { bytes, download, doc, saveBytes };
})();
