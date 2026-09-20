function () {

    // A DOCUMENT ON THE CANVAS — prose, kept as prose.
    //
    //   const ModelDocument = await exec('baja/plate/model-document.js');
    //   const doc = new ModelDocument('Method', '<h2>Method</h2><p>…</p>');
    //   platetrack.addDocument(doc);            // or platetrack.addDocument(name, html)
    //
    // A model's notes, caveats and method used to be put in a table: a Notes column with a
    // sentence per row, each one clipped to a cell. A table is the wrong instrument for a
    // paragraph -- there is nothing to sort, nothing to compute, and the shape fights the
    // reading. This object holds the text as a document and draws it as one: headings,
    // paragraphs, lists, quotes and rules, wrapped to its own width.
    //
    // It lives in platetrack.root beside the tables, so it moves, resizes, maximizes, saves
    // and loads with everything else. It carries `wells = []`, so every routine that walks
    // the tables (formulas, cell types, row fitting, cell-size normalisation) passes it by.
    return (async () => {
        const MGrid = await exec('flexigraph/grid.js');
        const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });

        const C = {
            ink: '#0a2540', body: '#22384f', muted: '#6b7a90', rule: 'rgba(10,37,64,0.12)',
            cyan: '#1aa3bd', link: '#0f7f93', card: '#ffffff', quote: 'rgba(26,163,189,0.10)',
            code: 'rgba(10,37,64,0.05)',
        };
        const FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
        const MONO = 'ui-monospace, Menlo, Consolas, "Courier New", monospace';

        // ---- HTML -> blocks --------------------------------------------------------------
        // A small, deliberate subset: headings, paragraphs, lists, quotes, rules, code, and
        // the inline marks (bold, italic, code, links). Anything else contributes its text.
        // Parsed with the browser's own parser, so nothing here has to understand HTML.
        const parseHtml = (html) => {
            const blocks = [];
            let root;
            try { root = new DOMParser().parseFromString('<div>' + (html || '') + '</div>', 'text/html').body.firstChild; }
            catch (e) { root = null; }
            if (!root) return [{ type: 'p', runs: [{ text: ('' + (html || '')).replace(/<[^>]*>/g, ' ') }] }];

            const runsOf = (node, mark) => {
                const out = [];
                node.childNodes.forEach((n) => {
                    if (n.nodeType === 3) {
                        const t = n.nodeValue.replace(/\s+/g, ' ');
                        if (t.trim()) out.push(Object.assign({ text: t }, mark));
                        return;
                    }
                    if (n.nodeType !== 1) return;
                    const tag = n.tagName.toLowerCase();
                    const m = Object.assign({}, mark);
                    if (tag === 'b' || tag === 'strong') m.bold = true;
                    if (tag === 'i' || tag === 'em') m.italic = true;
                    if (tag === 'code' || tag === 'kbd' || tag === 'tt') m.mono = true;
                    if (tag === 'a') m.link = true;
                    if (tag === 'br') { out.push({ text: '\n' }); return; }
                    out.push(...runsOf(n, m));
                });
                return out;
            };
            const walk = (node, listKind, depth) => {
                node.childNodes.forEach((n) => {
                    if (n.nodeType === 3) {
                        const t = n.nodeValue.replace(/\s+/g, ' ');
                        if (t.trim()) blocks.push({ type: 'p', runs: [{ text: t }] });
                        return;
                    }
                    if (n.nodeType !== 1) return;
                    const tag = n.tagName.toLowerCase();
                    if (/^h[1-6]$/.test(tag)) { blocks.push({ type: 'h' + Math.min(3, +tag[1]), runs: runsOf(n, {}) }); return; }
                    if (tag === 'p') { blocks.push({ type: 'p', runs: runsOf(n, {}) }); return; }
                    if (tag === 'hr') { blocks.push({ type: 'hr' }); return; }
                    if (tag === 'blockquote') { blocks.push({ type: 'quote', runs: runsOf(n, {}) }); return; }
                    if (tag === 'pre') { blocks.push({ type: 'code', runs: [{ text: n.textContent, mono: true }] }); return; }
                    if (tag === 'ul' || tag === 'ol') { walk(n, tag, (depth || 0) + 1); return; }
                    if (tag === 'li') {
                        blocks.push({ type: 'li', ordered: listKind === 'ol', depth: depth || 1, runs: runsOf(n, {}) });
                        // a nested list inside the item
                        n.childNodes.forEach((c) => { if (c.nodeType === 1 && /^(ul|ol)$/i.test(c.tagName)) walk(c, c.tagName.toLowerCase(), (depth || 1) + 1); });
                        return;
                    }
                    if (tag === 'table') {
                        n.querySelectorAll('tr').forEach((tr, i) => {
                            const cells = [...tr.children].map((td) => td.textContent.replace(/\s+/g, ' ').trim());
                            if (cells.some(Boolean)) blocks.push({ type: 'row', head: i === 0, cells });
                        });
                        return;
                    }
                    walk(n, listKind, depth);
                });
            };
            walk(root, null, 0);
            return blocks.length ? blocks : [{ type: 'p', runs: [{ text: '' }] }];
        };

        // ---- layout ---------------------------------------------------------------------
        const STYLE = {
            h1: { size: 1.55, weight: '700', color: C.ink, above: 1.0, below: 0.45 },
            h2: { size: 1.3, weight: '700', color: C.ink, above: 0.9, below: 0.35 },
            h3: { size: 1.1, weight: '700', color: C.ink, above: 0.7, below: 0.3 },
            p: { size: 1, weight: '400', color: C.body, above: 0, below: 0.5 },
            li: { size: 1, weight: '400', color: C.body, above: 0, below: 0.25 },
            quote: { size: 1, weight: '400', color: C.ink, above: 0.4, below: 0.5 },
            code: { size: 0.92, weight: '400', color: C.ink, above: 0.4, below: 0.5 },
            row: { size: 0.95, weight: '400', color: C.body, above: 0, below: 0.15 },
        };
        // Break runs into lines that fit `width`, at a base font size.
        const layout = (ctx, blocks, width, base) => {
            const lines = [];
            const font = (s, r) => ((r && r.bold) || s.weight === '700' ? '700 ' : (r && r.italic ? 'italic ' : '')) +
                Math.max(8, Math.round(base * s.size)) + 'px ' + ((r && r.mono) ? MONO : FAMILY);
            let bi = -1;
            for (const b of blocks) {
                bi++;
                const s = STYLE[b.type] || STYLE.p;
                const lh = Math.round(base * s.size * 1.45);
                if (b.type === 'hr') { lines.push({ kind: 'hr', h: lh * 0.8 }); continue; }
                if (b.type === 'row') {
                    lines.push({ kind: 'row', cells: b.cells, head: b.head, h: lh, size: s, base, bi });
                    continue;
                }
                const indent = b.type === 'li' ? Math.round(base * 1.2) * (b.depth || 1) : (b.type === 'quote' ? Math.round(base * 0.9) : 0);
                const avail = Math.max(24, width - indent);
                if (s.above) lines.push({ kind: 'gap', h: Math.round(base * s.above) });
                let cur = [], curW = 0, first = true;
                const flush = () => {
                    lines.push({ kind: 'text', runs: cur, h: lh, style: s, indent, bullet: (b.type === 'li' && first) ? (b.ordered ? null : '•') : null, block: b.type, bi });
                    cur = []; curW = 0; first = false;
                };
                for (const r of (b.runs || [])) {
                    const words = ('' + r.text).split(/(\s+)/).filter((w) => w !== '');
                    for (const w of words) {
                        if (w === '\n') { flush(); continue; }
                        ctx.font = font(s, r);
                        const ww = ctx.measureText(w).width;
                        if (curW + ww > avail && cur.length) flush();
                        if (w.trim() === '' && !cur.length) continue;          // no leading space on a line
                        cur.push({ text: w, mark: r, w: ww });
                        curW += ww;
                    }
                }
                if (cur.length) flush();
                if (s.below) lines.push({ kind: 'gap', h: Math.round(base * s.below) });
            }
            return lines;
        };

        // Text is measured outside the draw too (a press has to find the character under it),
        // so the document keeps a small canvas of its own to measure with.
        let MEASURE = null;
        const widthOf = (font, text) => {
            try {
                if (!MEASURE) MEASURE = document.createElement('canvas').getContext('2d');
                MEASURE.font = font;
                return MEASURE.measureText(text).width;
            } catch (e) { return ('' + text).length * 7; }
        };

        class ModelDocument {
            constructor(name, html, opts) {
                const o = opts || {};
                this.uid = uuid();
                this.name = name || 'Document';
                this.plateType = 'document';
                this.html = html || '';
                // What the author actually typed, when they typed shorthand rather than HTML.
                // Kept so that editing hands back their own text instead of the markup this
                // made of it; saved with the document, so it survives a reload.
                this.source = o.source || '';
                this.wells = [];                       // not a table: the table routines skip it
                this.formula = {};
                this.selected = false;
                this._highlight = false;
                this.visible = true;
                this.scroll = 0;                       // lines scrolled off the top, in pixels
                this.grid = new MGrid(o.x || 0, o.y || 0, o.w || 420, o.h || 320);
                this.grid.xmax = 1; this.grid.ymax = 1;
                this.__layoutKey = '';
                this.last_touched = new Date();
                this.wellannotations = {};
            }

            // ---- the shape of a root object ---------------------------------------------
            // What the track asks of anything it holds. A document is not a table, but it is
            // moved, resized, picked up and drawn like one, and these are the calls that path
            // makes: without them a document broke the resize hit test and the package refresh.
            getLastTouched() { return this.last_touched instanceof Date ? this.last_touched.getTime() : (this.last_touched || 0); }
            setLastTouched(v) { this.last_touched = v || new Date(); }
            applyrowheaders() { }
            applycolumnheaders() { }
            getWellsByString() { return []; }
            getWellRange() { return ''; }
            formulaTextForWell() { return null; }
            findMissingFormulaReferences() { return []; }
            getHeight() { return this.grid.height; }
            getWidth() { return this.grid.width; }
            setHeight(h) { const top = this.grid.yi + this.grid.height; this.grid.height = h; this.grid.yi = top - h; }
            setWidth(w) { this.grid.width = w; }
            getFormula() { return {}; }
            toValueFormulaJSON() { return null; }
            reapplyHeaderWells() { }
            recondition() { }
            completeNullValues() { }
            clearErrors() { }                        // updateCalculations clears every root object's errors: without this a
                                                     // document on the canvas made every menu click throw and skip the recalculation
            getSelectedWellsInOrder() { return []; }
            deselectAll() { this.selected = false; }
            selectIt() { this.selected = true; }
            highlight() { this._highlight = true; }
            unhighlight() { this._highlight = false; }
            isHighlighted() { return !!this._highlight; }
            findBounds() {
                return { xmin: this.grid.xi, xmax: this.grid.xi + this.grid.width, ymin: this.grid.yi, ymax: this.grid.yi + this.grid.height };
            }
            inside(grid, x, y, convert) {
                const wx = convert ? x : (grid.Xwc ? grid.Xwc(x) : x);
                const wy = convert ? y : (grid.Ywc ? grid.Ywc(y) : y);
                return wx >= this.grid.xi && wx <= this.grid.xi + this.grid.width
                    && wy >= this.grid.yi && wy <= this.grid.yi + this.grid.height;
            }
            setText(html) { this.html = '' + (html || ''); this.__blocks = null; this.__layoutKey = ''; }

            // ---- too small to read, and the resize grip -------------------------------------
            // The size the text is set at follows the card; under 8 px (a card under about
            // 286 x 178 px on screen) it cannot be read, and the card shows its name alone.
            // From there it is ONE BLOCK to the pointer, as a table with sub-10 px rows is
            // (platetrack.__isSolidTable asks this): a press offers Move and Maximize.
            __screenBox(pt) {
                const g = pt.grid;
                return { x: g.X(this.grid.xi), y: g.Y(this.grid.yi + this.grid.height), w: g.screenWidth(this.grid.width), h: g.screenHeight(this.grid.height) };
            }
            isTooSmallToRead(pt) {
                try {
                    const b = this.__screenBox(pt);
                    if (!(b.w > 0 && b.h > 0)) return false;
                    return b.w < 90 || b.h < 60 || Math.min(16, b.h * 0.045, b.w * 0.028) < 8;
                } catch (e) { return false; }
            }
            // The bottom right corner, where a table's resize corner is: the application's
            // resize (cpd/*: resize_plate) starts on whatever answers true here. A document
            // had no such answer, so it could be moved and maximized but never resized.
            inResize(mouseX, mouseY, pt) {
                try {
                    if (this.hidden || this.visible === false || pt.__maximized || this.isTooSmallToRead(pt)) return false;
                    const b = this.__screenBox(pt), R = 22;
                    return mouseX >= b.x + b.w - R && mouseX <= b.x + b.w + 6 && mouseY >= b.y + b.h - R && mouseY <= b.y + b.h + 6;
                } catch (e) { return false; }
            }
            onRightEdge() { return false; }          // no width-only drag: the corner does both

            // ---- reading it with the mouse: select text, drag the scroll thumb -----------------
            // The card is a drawing, so selection is built here: the draw records where each
            // visible line sits (this.__rows) and the card's parts (this.__geom); a press finds
            // the character under it by measuring the line's words in their own fonts. A
            // position is { li, ci }: a line of this.__lines and a character offset in that
            // line's text. The BODY selects text and the scroll bar scrolls; the card is moved
            // by its title strip (and resized by its corner), so the two never compete.
            __fontOf(line, piece) {
                const base = this.__base || 14, st = line.style || {}, m = (piece && piece.mark) || {};
                return (m.bold || st.weight === '700' ? '700 ' : (m.italic ? 'italic ' : '')) +
                    Math.max(8, Math.round(base * (st.size || 1))) + 'px ' + (m.mono ? MONO : FAMILY);
            }
            __lineText(line) {
                if (!line) return '';
                if (line.kind === 'row') return (line.cells || []).join('\t');
                if (line.kind !== 'text') return '';
                return (line.runs || []).map((r) => r.text).join('');
            }
            // x of character offset ci on a text line whose text starts at x0
            __xAt(line, ci, x0) {
                if (!line || line.kind !== 'text') return x0;
                let x = x0, left = ci;
                for (const r of (line.runs || [])) {
                    const n = r.text.length;
                    if (left >= n) { x += r.w; left -= n; continue; }
                    return x + (left > 0 ? widthOf(this.__fontOf(line, r), r.text.slice(0, left)) : 0);
                }
                return x;
            }
            // Which part of the card a canvas point is on: 'resize' | 'scrollbar' | 'header' | 'body' | null
            hitPart(sx, sy, pt) {
                const g = this.__geom;
                if (!g || this.hidden || this.visible === false) return null;
                if (sx < g.x || sx > g.x + g.w || sy < g.yTop || sy > g.yTop + g.h) return null;
                try { if (pt && this.inResize(sx, sy, pt)) return 'resize'; } catch (e) { }
                if (g.sb && sx >= g.x + g.w - 16 && sy >= g.sb.top && sy <= g.sb.top + g.sb.h) return 'scrollbar';
                if (sy < g.top) return 'header';                       // the title strip: the card is moved by it
                return 'body';
            }
            posAt(sx, sy) {
                const rows = this.__rows || [];
                if (!rows.length) return null;
                let row = null;
                for (const r of rows) if (sy >= r.y && sy < r.y + r.h) { row = r; break; }
                if (!row) {
                    // between lines (a gap) or past either end: the nearest line, at the end nearer the point
                    let best = null, bd = Infinity;
                    for (const r of rows) { const d = sy < r.y ? r.y - sy : sy - (r.y + r.h); if (d < bd) { bd = d; best = r; } }
                    row = best;
                    if (sy < row.y) return { li: row.li, ci: 0 };
                    return { li: row.li, ci: this.__lineText(row.line).length };
                }
                const line = row.line, text = this.__lineText(line);
                if (line.kind !== 'text') return { li: row.li, ci: sx < row.x0 + 20 ? 0 : text.length };
                let x = row.x0, ci = 0;
                if (sx <= x) return { li: row.li, ci: 0 };
                for (const r of (line.runs || [])) {
                    if (sx >= x + r.w) { x += r.w; ci += r.text.length; continue; }
                    const font = this.__fontOf(line, r);
                    let k = 0, prev = 0;
                    for (k = 1; k <= r.text.length; k++) {
                        const wk = widthOf(font, r.text.slice(0, k));
                        if (x + (prev + wk) / 2 >= sx) { k--; break; }           // nearer the left edge of character k
                        prev = wk;
                    }
                    return { li: row.li, ci: ci + Math.min(k, r.text.length) };
                }
                return { li: row.li, ci: text.length };
            }
            __ordered() {
                const s = this.__sel;
                if (!s || !s.a || !s.f) return null;
                const before = (p, q) => p.li < q.li || (p.li === q.li && p.ci <= q.ci);
                return before(s.a, s.f) ? [s.a, s.f] : [s.f, s.a];
            }
            hasSelection() { const o = this.__ordered(); return !!o && !(o[0].li === o[1].li && o[0].ci === o[1].ci); }
            clearSelection() { this.__sel = null; }
            beginSelect(sx, sy) { const p = this.posAt(sx, sy); this.__sel = p ? { a: p, f: p } : null; }
            extendSelect(sx, sy) {
                if (!this.__sel) return;
                const g = this.__geom;
                // dragged past the top or bottom of the text: it scrolls under the pointer
                if (g && sy < g.top) this.scroll = Math.max(0, (this.scroll || 0) - Math.min(28, (g.top - sy) * 0.5 + 4));
                else if (g && sy > g.bottom) this.scroll = Math.min(this.__scrollMax || 0, (this.scroll || 0) + Math.min(28, (sy - g.bottom) * 0.5 + 4));
                const p = this.posAt(sx, Math.max(g ? g.top + 1 : sy, Math.min(g ? g.bottom - 1 : sy, sy)));
                if (p) this.__sel.f = p;
            }
            selectWordAt(sx, sy) {
                const p = this.posAt(sx, sy); if (!p) return;
                const text = this.__lineText((this.__lines || [])[p.li]);
                let a = p.ci, b = p.ci;
                while (a > 0 && /\S/.test(text[a - 1])) a--;
                while (b < text.length && /\S/.test(text[b])) b++;
                this.__sel = { a: { li: p.li, ci: a }, f: { li: p.li, ci: b } };
            }
            selectAll() {
                const L = this.__lines || [];
                let first = -1, last = -1;
                L.forEach((l, i) => { if (l.kind === 'text' || l.kind === 'row') { if (first < 0) first = i; last = i; } });
                if (first < 0) return;
                this.__sel = { a: { li: first, ci: 0 }, f: { li: last, ci: this.__lineText(L[last]).length } };
            }
            // The selected text, as text: a paragraph's wrapped lines rejoin with a space, and
            // blocks (paragraphs, list items, headings, table rows) are separated by a new line.
            selectedText() {
                const o = this.__ordered(); if (!o) return '';
                const L = this.__lines || [];
                let out = '', prevBi = null;
                for (let i = o[0].li; i <= o[1].li && i < L.length; i++) {
                    const l = L[i];
                    if (l.kind !== 'text' && l.kind !== 'row') continue;
                    const t = this.__lineText(l);
                    const from = i === o[0].li ? o[0].ci : 0, to = i === o[1].li ? o[1].ci : t.length;
                    const part = (l.kind === 'text' && l.bullet && from === 0 ? '• ' : '') + t.slice(from, to);
                    if (prevBi !== null) out += (l.bi === prevBi && l.kind === 'text') ? (/\s$/.test(out) ? '' : ' ') : '\n';
                    out += part;
                    prevBi = l.bi;
                }
                return out.replace(/[ \t]+\n/g, '\n').trim();
            }
            // Drag the scroll thumb: `grab` is where on the thumb the press landed (px from its top).
            scrollThumbGrab(sy) {
                const sb = this.__geom && this.__geom.sb; if (!sb) return 0;
                const thumbTop = sb.top + sb.pos;
                return (sy >= thumbTop && sy <= thumbTop + sb.thumb) ? (sy - thumbTop) : sb.thumb / 2;   // a press on the track jumps there
            }
            scrollThumbTo(sy, grab) {
                const sb = this.__geom && this.__geom.sb; if (!sb) return;
                const room = Math.max(1, sb.h - sb.thumb);
                const pos = Math.max(0, Math.min(room, sy - grab - sb.top));
                this.scroll = (pos / room) * sb.max;
            }
            isMouseInTopRightHandle() { return false; }

            // ---- drawing -----------------------------------------------------------------
            draw(pt, ctx) {
                if (!ctx || !pt || this.hidden || this.visible === false) return;
                const graph = pt.grid;
                graph.rescale();
                const x = graph.X(this.grid.xi);
                const yTop = graph.Y(this.grid.yi + this.grid.height);
                const w = graph.screenWidth(this.grid.width);
                const h = graph.screenHeight(this.grid.height);
                if (!(w > 4 && h > 4)) return;
                if (x > ctx.canvas.width || yTop > ctx.canvas.height || x + w < 0 || yTop + h < 0) return;

                const r = Math.min(10, w / 8, h / 8);
                const card = (fill, stroke, lw) => {
                    ctx.beginPath();
                    ctx.moveTo(x + r, yTop); ctx.lineTo(x + w - r, yTop); ctx.quadraticCurveTo(x + w, yTop, x + w, yTop + r);
                    ctx.lineTo(x + w, yTop + h - r); ctx.quadraticCurveTo(x + w, yTop + h, x + w - r, yTop + h);
                    ctx.lineTo(x + r, yTop + h); ctx.quadraticCurveTo(x, yTop + h, x, yTop + h - r);
                    ctx.lineTo(x, yTop + r); ctx.quadraticCurveTo(x, yTop, x + r, yTop);
                    ctx.closePath();
                    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
                    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
                };
                ctx.save();

                // Too small to read: the name alone, in the placeholder a tiny table gets
                // (platetrack.__drawTinyTable: the same tint, edge and states), because from
                // here the two behave alike -- a press offers Move and Maximize.
                let base = Math.max(7, Math.min(16, h * 0.045, w * 0.028));
                if (w < 90 || h < 60 || base < 8) {
                    const armed = pt.__solidArmed === this || !!(pt.__solidDrag && pt.__solidDrag.o === this);
                    const hover = pt.__solidHover === this;
                    ctx.setLineDash(armed ? [6, 4] : []);
                    card(armed ? 'rgba(26,163,189,0.30)' : (this.selected ? 'rgba(26,163,189,0.16)' : (hover ? 'rgba(26,163,189,0.13)' : 'rgba(26,163,189,0.07)')),
                        (this.selected || armed) ? C.cyan : 'rgba(10,37,64,0.45)', (this.selected || armed) ? 2 : 1);
                    ctx.setLineDash([]);
                    const size = Math.max(9, Math.min(14, Math.floor(h * 0.5)));
                    ctx.font = '600 ' + size + 'px ' + FAMILY;
                    ctx.fillStyle = C.ink;
                    let text = ('' + (this.name || 'Document')).replace(/_/g, ' ');
                    const room = Math.max(0, w - 8);
                    if (ctx.measureText(text).width > room) {
                        while (text.length > 1 && ctx.measureText(text + '…').width > room) text = text.slice(0, -1);
                        text += '…';
                    }
                    if (h >= size + 4 && room > 12) {
                        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                        ctx.fillText(text, x + w / 2, yTop + h / 2);
                    }
                    ctx.restore();
                    // the block's resize corner, as a tiny table has (platetrack.__solidCornerAt)
                    try { if (pt.__drawSolidGrip) pt.__drawSolidGrip(ctx, x, yTop, w, h, this); } catch (e) { }
                    return;
                }
                card(C.card, this.selected ? C.cyan : C.rule, this.selected ? 2 : 1);

                // MAXIMIZED the card is the whole window. Text set at the card's usual size in
                // lines as wide as the screen cannot be read, so the page gets a larger size
                // and a measure: a column of about seventy characters, centred.
                const maxed = !!this.__maximizedView;
                if (maxed) base = Math.max(15, Math.min(21, h * 0.03, w * 0.017));
                const pad = Math.max(10, Math.round(base * 1.4));
                const innerW = maxed ? Math.min(w - pad * 2, Math.round(base * 40)) : (w - pad * 2);
                const tx = maxed ? Math.round(x + (w - innerW) / 2) : (x + pad);      // where the text column starts
                this.__base = base;                               // the hit tests measure with the same size
                if (!this.__blocks) this.__blocks = parseHtml(this.html);
                const key = Math.round(innerW) + ':' + Math.round(base) + ':' + this.html.length;
                if (this.__layoutKey !== key) { this.__lines = layout(ctx, this.__blocks, innerW, base); this.__layoutKey = key; this.__sel = null; }   // a selection is positions in the old lines

                // The name, then a rule, then the document.
                ctx.textAlign = 'left'; ctx.textBaseline = 'top';
                let cy = yTop + pad;
                if (this.name) {
                    ctx.font = '700 ' + Math.round(base * 1.05) + 'px ' + FAMILY;
                    ctx.fillStyle = C.muted;
                    ctx.fillText(this.name, tx, cy);
                    cy += Math.round(base * 1.6);
                    ctx.beginPath(); ctx.moveTo(tx, cy - 4); ctx.lineTo(tx + innerW, cy - 4);
                    ctx.strokeStyle = C.rule; ctx.lineWidth = 1; ctx.stroke();
                    cy += 4;
                }
                const top = cy, bottom = yTop + h - pad;
                const total = (this.__lines || []).reduce((s, l) => s + l.h, 0);
                const maxScroll = Math.max(0, total - (bottom - top));
                this.__scrollMax = maxScroll;                 // for the wheel and the scroll zone (platetrack.__maxScroll)
                // Where the card's parts are on the canvas, for the mouse (hitPart, posAt).
                this.__geom = { x, yTop, w, h, top, bottom, sb: null };
                this.__rows = [];
                const selRange = this.hasSelection() ? this.__ordered() : null;
                const paintSel = (li, line, x0) => {
                    if (!selRange || li < selRange[0].li || li > selRange[1].li) return;
                    const t = this.__lineText(line);
                    let xa = x0, xb;
                    if (line.kind === 'text') {
                        xa = li === selRange[0].li ? this.__xAt(line, selRange[0].ci, x0) : x0;
                        xb = li === selRange[1].li ? this.__xAt(line, selRange[1].ci, x0) : this.__xAt(line, t.length, x0) + 4;
                    } else { xb = tx + innerW; }
                    if (xb - xa < 1) return;
                    ctx.fillStyle = 'rgba(26,163,189,0.28)';
                    ctx.fillRect(xa, ly, xb - xa, line.h);
                };
                this.scroll = Math.max(0, Math.min(this.scroll || 0, maxScroll));
                let ly = top - this.scroll;

                ctx.save();
                ctx.beginPath(); ctx.rect(x + 1, top, w - 2, bottom - top); ctx.clip();
                const LINES = this.__lines || [];
                for (let li = 0; li < LINES.length; li++) {
                    const line = LINES[li];
                    if (ly + line.h >= top - 40 && ly <= bottom + 40) {
                        if (line.kind === 'hr') {
                            ctx.beginPath(); ctx.moveTo(tx, ly + line.h / 2); ctx.lineTo(tx + innerW, ly + line.h / 2);
                            ctx.strokeStyle = C.rule; ctx.lineWidth = 1; ctx.stroke();
                        } else if (line.kind === 'row') {
                            this.__rows.push({ li, y: ly, h: line.h, x0: tx, line });
                            paintSel(li, line, tx);
                            const cols = Math.max(1, line.cells.length);
                            const cw = innerW / cols;
                            line.cells.forEach((c, i) => {
                                ctx.font = (line.head ? '700 ' : '') + Math.round(base * line.size.size) + 'px ' + FAMILY;
                                ctx.fillStyle = line.head ? C.ink : C.body;
                                let t = c;
                                while (t.length > 1 && ctx.measureText(t).width > cw - 8) t = t.slice(0, -1);
                                if (t !== c) t = t.slice(0, -1) + '…';
                                ctx.fillText(t, tx + i * cw, ly);
                            });
                        } else if (line.kind === 'text') {
                            let lx = tx + (line.indent || 0);
                            this.__rows.push({ li, y: ly, h: line.h, x0: lx, line });
                            if (line.bullet) {
                                ctx.font = Math.round(base) + 'px ' + FAMILY;
                                ctx.fillStyle = C.cyan;
                                ctx.fillText(line.bullet, lx - Math.round(base * 0.9), ly);
                            }
                            if (line.block === 'quote') {
                                ctx.fillStyle = C.quote;
                                ctx.fillRect(tx, ly - 2, innerW, line.h + 2);
                                ctx.fillStyle = C.cyan;
                                ctx.fillRect(tx, ly - 2, 2.5, line.h + 2);
                            } else if (line.block === 'code') {
                                ctx.fillStyle = C.code;
                                ctx.fillRect(tx, ly - 2, innerW, line.h + 2);
                            }
                            paintSel(li, line, lx);
                            for (const piece of line.runs) {
                                const m = piece.mark || {};
                                const st = line.style;
                                ctx.font = (m.bold || st.weight === '700' ? '700 ' : (m.italic ? 'italic ' : '')) +
                                    Math.max(8, Math.round(base * st.size)) + 'px ' + (m.mono ? MONO : FAMILY);
                                ctx.fillStyle = m.link ? C.link : st.color;
                                ctx.fillText(piece.text, lx, ly);
                                if (m.link) {
                                    ctx.beginPath(); ctx.moveTo(lx, ly + line.h * 0.82); ctx.lineTo(lx + piece.w, ly + line.h * 0.82);
                                    ctx.strokeStyle = 'rgba(15,127,147,0.5)'; ctx.lineWidth = 1; ctx.stroke();
                                }
                                lx += piece.w;
                            }
                        }
                    }
                    ly += line.h;
                }
                ctx.restore();

                // More below: a soft fade and a scroll bar, so it is clear there is more.
                if (maxScroll > 0) {
                    // The fade goes where the text is cut -- below when more follows, above
                    // when the card has been scrolled -- so a half-height line reads as more
                    // document rather than as a fault in the drawing.
                    const fade = (yFrom, yTo) => {
                        const g = ctx.createLinearGradient(0, yFrom, 0, yTo);
                        g.addColorStop(0, 'rgba(255,255,255,0.96)');
                        g.addColorStop(1, 'rgba(255,255,255,0)');
                        ctx.fillStyle = g;
                        ctx.fillRect(x + 1, Math.min(yFrom, yTo), w - 2, Math.abs(yTo - yFrom));
                    };
                    const fadeH = Math.min(26, (bottom - top) * 0.25);
                    if (this.scroll > 0.5) fade(top, top + fadeH);
                    if (this.scroll < maxScroll - 0.5) fade(bottom, bottom - fadeH);

                    const trackH = bottom - top;
                    const thumb = Math.max(24, trackH * (trackH / total));
                    const pos = (this.scroll / maxScroll) * (trackH - thumb);
                    // Wide enough to take hold of: it is dragged (platetrack: __docScroll), and
                    // it widens under the pointer or while held.
                    const hot = pt.__docBarHover === this || !!(pt.__docScroll && pt.__docScroll.o === this);
                    const bw = hot ? 7 : 5;
                    this.__geom.sb = { top, h: trackH, thumb, pos, max: maxScroll };
                    ctx.fillStyle = 'rgba(10,37,64,0.08)';
                    ctx.fillRect(x + w - 4 - bw, top, bw, trackH);
                    ctx.fillStyle = hot ? '#1aa3bd' : 'rgba(26,163,189,0.75)';
                    ctx.fillRect(x + w - 4 - bw, top + pos, bw, thumb);
                }
                // The resize grip, bottom right (see inResize): three short diagonals, plain
                // when the card is selected or the pointer is on the corner, faint otherwise.
                if (!pt.__maximized) {
                    const on = this.selected || pt.__docResizeHover === this;
                    ctx.strokeStyle = on ? C.cyan : 'rgba(10,37,64,0.22)';
                    ctx.lineWidth = on ? 2 : 1.5; ctx.lineCap = 'round';
                    const gx = x + w - 5, gy = yTop + h - 5;
                    ctx.beginPath();
                    for (const d of [4, 9, 14]) { ctx.moveTo(gx - d, gy); ctx.lineTo(gx, gy - d); }
                    ctx.stroke();
                }
                ctx.restore();
            }

            // ---- saving ------------------------------------------------------------------
            toJSON() {
                return {
                    uid: this.uid, name: this.name, plateType: 'document', html: this.html,
                    source: this.source || '',
                    hidden: !!this.hidden, visible: this.visible !== false,
                    grid: { xi: this.grid.xi, yi: this.grid.yi, width: this.grid.width, height: this.grid.height, xmax: 1, ymax: 1, xmin: 0, ymin: 0 },
                    wells: [],
                };
            }
            static buildFromJSON(j) {
                const d = new ModelDocument(j.name, j.html, { source: j.source || '' });
                d.uid = j.uid || d.uid;
                d.hidden = !!j.hidden;
                d.visible = j.visible !== false;
                const g = j.grid || {};
                d.grid = Object.assign(new MGrid(g.xi || 0, g.yi || 0, g.width || 420, g.height || 320), g);
                d.grid.xmax = 1; d.grid.ymax = 1;
                return d;
            }
        }

        return ModelDocument;
    })();
}
