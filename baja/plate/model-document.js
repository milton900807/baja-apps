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
                card(C.card, this.selected ? C.cyan : C.rule, this.selected ? 2 : 1);

                // Too small to read: the name alone, as the tiny-table placeholder does.
                const base = Math.max(7, Math.min(16, h * 0.045, w * 0.028));
                if (w < 90 || h < 60 || base < 8) {
                    ctx.fillStyle = C.muted;
                    ctx.font = '600 ' + Math.max(8, Math.min(13, h * 0.3)) + 'px ' + FAMILY;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(this.name, x + w / 2, yTop + h / 2);
                    ctx.restore();
                    return;
                }

                const pad = Math.max(10, Math.round(base * 1.4));
                const innerW = w - pad * 2;
                if (!this.__blocks) this.__blocks = parseHtml(this.html);
                const key = Math.round(innerW) + ':' + Math.round(base) + ':' + this.html.length;
                if (this.__layoutKey !== key) { this.__lines = layout(ctx, this.__blocks, innerW, base); this.__layoutKey = key; }

                // The name, then a rule, then the document.
                ctx.textAlign = 'left'; ctx.textBaseline = 'top';
                let cy = yTop + pad;
                if (this.name) {
                    ctx.font = '700 ' + Math.round(base * 1.05) + 'px ' + FAMILY;
                    ctx.fillStyle = C.muted;
                    ctx.fillText(this.name, x + pad, cy);
                    cy += Math.round(base * 1.6);
                    ctx.beginPath(); ctx.moveTo(x + pad, cy - 4); ctx.lineTo(x + w - pad, cy - 4);
                    ctx.strokeStyle = C.rule; ctx.lineWidth = 1; ctx.stroke();
                    cy += 4;
                }
                const top = cy, bottom = yTop + h - pad;
                const total = (this.__lines || []).reduce((s, l) => s + l.h, 0);
                const maxScroll = Math.max(0, total - (bottom - top));
                this.scroll = Math.max(0, Math.min(this.scroll || 0, maxScroll));
                let ly = top - this.scroll;

                ctx.save();
                ctx.beginPath(); ctx.rect(x + 1, top, w - 2, bottom - top); ctx.clip();
                for (const line of (this.__lines || [])) {
                    if (ly + line.h >= top - 40 && ly <= bottom + 40) {
                        if (line.kind === 'hr') {
                            ctx.beginPath(); ctx.moveTo(x + pad, ly + line.h / 2); ctx.lineTo(x + w - pad, ly + line.h / 2);
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
                                ctx.fillText(t, x + pad + i * cw, ly);
                            });
                        } else if (line.kind === 'text') {
                            let lx = x + pad + (line.indent || 0);
                            if (line.bullet) {
                                ctx.font = Math.round(base) + 'px ' + FAMILY;
                                ctx.fillStyle = C.cyan;
                                ctx.fillText(line.bullet, lx - Math.round(base * 0.9), ly);
                            }
                            if (line.block === 'quote') {
                                ctx.fillStyle = C.quote;
                                ctx.fillRect(x + pad, ly - 2, innerW, line.h + 2);
                                ctx.fillStyle = C.cyan;
                                ctx.fillRect(x + pad, ly - 2, 2.5, line.h + 2);
                            } else if (line.block === 'code') {
                                ctx.fillStyle = C.code;
                                ctx.fillRect(x + pad, ly - 2, innerW, line.h + 2);
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
