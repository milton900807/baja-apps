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
            for (const b of blocks) {
                const s = STYLE[b.type] || STYLE.p;
                const lh = Math.round(base * s.size * 1.45);
                if (b.type === 'hr') { lines.push({ kind: 'hr', h: lh * 0.8 }); continue; }
                if (b.type === 'row') {
                    lines.push({ kind: 'row', cells: b.cells, head: b.head, h: lh, size: s, base });
                    continue;
                }
                const indent = b.type === 'li' ? Math.round(base * 1.2) * (b.depth || 1) : (b.type === 'quote' ? Math.round(base * 0.9) : 0);
                const avail = Math.max(24, width - indent);
                if (s.above) lines.push({ kind: 'gap', h: Math.round(base * s.above) });
                let cur = [], curW = 0, first = true;
                const flush = () => {
                    lines.push({ kind: 'text', runs: cur, h: lh, style: s, indent, bullet: (b.type === 'li' && first) ? (b.ordered ? null : '•') : null, block: b.type });
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
                if (!this.__blocks) this.__blocks = parseHtml(this.html);
                const key = Math.round(innerW) + ':' + Math.round(base) + ':' + this.html.length;
                if (this.__layoutKey !== key) { this.__lines = layout(ctx, this.__blocks, innerW, base); this.__layoutKey = key; }

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
                this.scroll = Math.max(0, Math.min(this.scroll || 0, maxScroll));
                let ly = top - this.scroll;

                ctx.save();
                ctx.beginPath(); ctx.rect(x + 1, top, w - 2, bottom - top); ctx.clip();
                for (const line of (this.__lines || [])) {
                    if (ly + line.h >= top - 40 && ly <= bottom + 40) {
                        if (line.kind === 'hr') {
                            ctx.beginPath(); ctx.moveTo(tx, ly + line.h / 2); ctx.lineTo(tx + innerW, ly + line.h / 2);
                            ctx.strokeStyle = C.rule; ctx.lineWidth = 1; ctx.stroke();
                        } else if (line.kind === 'row') {
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
                    const thumb = Math.max(18, trackH * (trackH / total));
                    const pos = (this.scroll / maxScroll) * (trackH - thumb);
                    ctx.fillStyle = 'rgba(10,37,64,0.08)';
                    ctx.fillRect(x + w - 6, top, 3, trackH);
                    ctx.fillStyle = 'rgba(26,163,189,0.75)';
                    ctx.fillRect(x + w - 6, top + pos, 3, thumb);
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
