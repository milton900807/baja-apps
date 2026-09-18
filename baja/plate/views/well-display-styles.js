function (deps) {

    // HOW A CELL LOOKS — every display type, drawn to one house style.
    //
    //   const types = await exec('baja/plate/views/well-display-styles.js', { Icon });
    //
    // One palette (the application's navy, cyan and sunset orange), one type family, one
    // cell frame, one selection treatment. Before this each type had been drawn on its own
    // terms: magenta selections, crimson and pure-red negatives, a dozen unrelated accent
    // colours, bold Arial at point sizes in some and pixel sizes in others. A table mixing
    // four of them did not read as one surface.
    //
    // The rules the types share:
    //   - Numbers are right aligned and tabular, text is left aligned, headings centred.
    //     A column of figures can only be compared down its right edge.
    //   - A cell is white; one that takes input has a tinted ground and a cyan underline,
    //     so an input is recognisable without reading the header.
    //   - A negative is sunset orange, never red-on-white; green is kept for a rise.
    //   - Selection is a cyan wash and a cyan border, drawn OVER the value, never a fill
    //     that hides it.
    //   - The value is fitted to the cell, and when it cannot fit it is shortened with an
    //     ellipsis rather than drawn over its neighbour.
    return (async () => {
        const Icon = (deps && deps.Icon) || null;

        // ---- palette and type ----------------------------------------------------------
        const C = {
            ink: '#0a2540', inkSoft: '#3c5068', muted: '#6b7a90', faint: '#9fb3c8',
            cyan: '#1aa3bd', cyanWash: 'rgba(26,163,189,0.14)', cyanEdge: 'rgba(26,163,189,0.55)',
            orange: '#FD5E53', orangeWash: 'rgba(253,94,83,0.12)',
            // Sunset orange and cyan are the brand's, and both are made for fills rather than
            // for small type: on white they reach only 3.0:1. Text uses these darker
            // relatives -- the same hues, over 4.5:1 on white -- while fills, dots, bars and
            // lines keep the brand colours above.
            negative: '#D93A2B', link: '#0f7f93',
            green: '#15803d', greenWash: 'rgba(21,128,61,0.12)',
            amber: '#b45309', amberWash: 'rgba(180,83,9,0.12)',
            cell: '#ffffff', input: '#f4f8fb', rule: 'rgba(10,37,64,0.12)', ruleStrong: 'rgba(10,37,64,0.22)',
            head: '#0b2545', headInk: '#eaf6f9',
        };
        const FAMILY = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
        const MONO = 'ui-monospace, Menlo, Consolas, "Courier New", monospace';
        const num = (v, fb = 0) => { const n = (typeof v === 'number') ? v : parseFloat(('' + (v == null ? '' : v)).replace(/[$,%\s]/g, '')); return isFinite(n) ? n : fb; };
        const isNum = (v) => { const s = ('' + (v == null ? '' : v)).replace(/[$,%\s]/g, ''); return s !== '' && isFinite(+s); };
        const str = (v) => (v == null ? '' : ('' + v));

        // ---- contrast --------------------------------------------------------------------
        // Nothing is drawn in a colour the eye cannot separate from what is behind it. Every
        // fill is resolved to a solid colour (a wash is blended onto the ground beneath it),
        // and the text colour is checked against that. Below 4.0:1 the text falls back to
        // navy or white, whichever the ground supports -- a cell that someone has coloured
        // red keeps its colour, but its value stops being red-on-red.
        const CSS = { white: '#ffffff', black: '#000000', red: '#e11d48', green: '#15803d', blue: '#1d4ed8', magenta: '#d946ef', crimson: '#be123c', gray: '#6b7280', grey: '#6b7280', lightgray: '#e5e7eb', lightgrey: '#e5e7eb', lightblue: '#dbeafe', yellow: '#facc15', orange: '#f97316', transparent: 'rgba(0,0,0,0)' };
        const rgba = (c) => {
            if (!c) return null;
            if (typeof c === 'object') return ('r' in c) ? c : null;    // already resolved
            let s = ('' + c).trim().toLowerCase();
            if (CSS[s]) s = CSS[s];
            let m = /^#([0-9a-f]{3})$/.exec(s);
            if (m) return { r: parseInt(m[1][0] + m[1][0], 16), g: parseInt(m[1][1] + m[1][1], 16), b: parseInt(m[1][2] + m[1][2], 16), a: 1 };
            m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/.exec(s);
            if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: m[2] ? parseInt(m[2], 16) / 255 : 1 };
            m = /^rgba?\(([^)]+)\)$/.exec(s);
            if (m) { const p = m[1].split(',').map((v) => parseFloat(v)); return { r: p[0] || 0, g: p[1] || 0, b: p[2] || 0, a: p.length > 3 ? p[3] : 1 }; }
            return null;
        };
        const over = (fg, bg) => {                           // a colour laid on a ground
            const f = rgba(fg), b2 = rgba(bg) || { r: 255, g: 255, b: 255, a: 1 };
            if (!f) return b2;
            const a = f.a == null ? 1 : f.a;
            return { r: f.r * a + b2.r * (1 - a), g: f.g * a + b2.g * (1 - a), b: f.b * a + b2.b * (1 - a), a: 1 };
        };
        const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
        const ratio = (a, b2) => { const l1 = lum(a), l2 = lum(b2); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
        // The readable ink for a ground: navy where it is light, white where it is dark.
        const inkOn = (bg) => {
            const g = rgba(bg) || { r: 255, g: 255, b: 255, a: 1 };
            return ratio(rgba(C.ink), g) >= ratio(rgba('#ffffff'), g) ? C.ink : '#ffffff';
        };
        // Keep a colour when it reads on this ground; otherwise the readable ink.
        const ensure = (color, bg, minRatio) => {
            const g = rgba(bg);
            const c = rgba(color);
            if (!g || !c) return color || C.ink;
            return ratio(over(c, g), g) >= (minRatio || 4.0) ? color : inkOn(g);
        };

        // ---- geometry ------------------------------------------------------------------
        // Every type is handed (graph, grid, ctx, min, max, x, y, well): the cell's box on
        // screen comes from the well, as it always has.
        const box = (graph, grid, well) => {
            const fin = (v, fb) => (typeof v === 'number' && isFinite(v)) ? v : fb;
            const x = fin(graph.X(grid.X(well.x)), 0), y = fin(graph.Y(grid.Y(well.y)), 0);
            const w = fin(well.__screen_width, 30), h = fin(well.__screen_height, 20);
            return { x, y, w, h, r: Math.max(2, Math.min(6, h * 0.18)), pad: Math.max(4, Math.min(10, w * 0.06)) };
        };
        const path = (ctx, x, y, w, h, r) => {
            const rr = Math.max(0, Math.min(r, w / 2, h / 2));
            ctx.beginPath();
            ctx.moveTo(x + rr, y); ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
            ctx.lineTo(x + w, y + h - rr); ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
            ctx.lineTo(x + rr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
            ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y);
            ctx.closePath();
        };
        // The ground every cell stands on, and the selection over it.
        const frame = (ctx, b, well, opt) => {
            const o = opt || {};
            const fill = well.color || o.fill || (o.input ? C.input : C.cell);
            // What the cell now stands on, as a solid colour: a wash is blended onto the
            // page beneath it, so the text can be checked against what the eye will see.
            b.bg = over(fill === 'transparent' ? 'rgba(0,0,0,0)' : fill, C.cell);
            ctx.save();
            ctx.fillStyle = fill;
            path(ctx, b.x, b.y, b.w, b.h, b.r);
            ctx.fill();
            if (o.border !== false) {
                ctx.strokeStyle = o.borderColor || C.rule;
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            if (o.input && b.h > 12) {                       // a field, not a label: a cyan sill
                ctx.beginPath();
                ctx.moveTo(b.x + b.r, b.y + b.h - 0.75);
                ctx.lineTo(b.x + b.w - b.r, b.y + b.h - 0.75);
                ctx.strokeStyle = C.cyanEdge; ctx.lineWidth = 1.5; ctx.stroke();
            }
            ctx.restore();
        };
        const selection = (ctx, b, well) => {
            if (!well.select) return;
            ctx.save();
            path(ctx, b.x, b.y, b.w, b.h, b.r);
            ctx.fillStyle = C.cyanWash; ctx.fill();
            ctx.strokeStyle = C.cyan; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.restore();
        };
        // Fit a string to the box: the largest size up to `cap` that fits, else shortened.
        const fit = (ctx, text, maxW, maxH, weight, family, cap) => {
            const fam = family || FAMILY;
            let lo = 7, hi = Math.max(7, Math.floor(Math.min(cap || 18, maxH)));
            let best = lo;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                ctx.font = (weight ? weight + ' ' : '') + mid + 'px ' + fam;
                if (ctx.measureText(text).width <= maxW) { best = mid; lo = mid + 1; } else hi = mid - 1;
            }
            ctx.font = (weight ? weight + ' ' : '') + best + 'px ' + fam;
            let out = text;
            if (ctx.measureText(out).width > maxW) {
                while (out.length > 1 && ctx.measureText(out + '…').width > maxW) out = out.slice(0, -1);
                out += '…';
            }
            return out;
        };
        // One line of value text, placed by alignment.
        const value = (ctx, b, text, opt) => {
            const o = opt || {};
            const t = str(text);
            if (!t) return;
            const maxW = b.w - b.pad * 2, maxH = b.h * 0.62;
            if (maxW < 6 || maxH < 6) return;
            const shown = fit(ctx, t, maxW, maxH, o.weight || '600', o.family, o.cap || Math.min(16, b.h * 0.5));
            ctx.save();
            ctx.fillStyle = ensure(o.color || well_ink(o), b.bg || C.cell);
            ctx.textBaseline = 'middle';
            const cy = b.y + b.h / 2;
            if (o.align === 'left') { ctx.textAlign = 'left'; ctx.fillText(shown, b.x + b.pad, cy); }
            else if (o.align === 'center') { ctx.textAlign = 'center'; ctx.fillText(shown, b.x + b.w / 2, cy); }
            else { ctx.textAlign = 'right'; ctx.fillText(shown, b.x + b.w - b.pad, cy); }
            ctx.restore();
        };
        const well_ink = (o) => (o && o.muted) ? C.muted : C.ink;
        // Numbers share one routine: colour by sign, right aligned, the cell's own colours win.
        const numberCell = (format, opt) => (graph, grid, ctx, min, max, x, y, well) => {
            const o = opt || {};
            const b = box(graph, grid, well);
            frame(ctx, b, well, { input: !!o.input });
            const raw = well.value;
            const text = isNum(raw) ? format(num(raw), well) : str(raw);
            const n = isNum(raw) ? num(raw) : 0;
            const color = well.fgcolor || (n < 0 ? (well.negColor || C.negative) : (o.positiveGreen && n > 0 ? C.green : C.ink));
            value(ctx, b, text, { align: 'right', color: color, family: FAMILY, weight: o.weight || '600' });
            selection(ctx, b, well);
        };
        // Text shares one too.
        const textCell = (opt) => (graph, grid, ctx, min, max, x, y, well) => {
            const o = opt || {};
            const b = box(graph, grid, well);
            frame(ctx, b, well, { input: !!o.input, fill: o.fill, border: o.border, borderColor: o.borderColor });
            value(ctx, b, well.getValue ? well.getValue() : well.value, {
                align: o.align || 'left', color: well.fgcolor || o.color || C.ink,
                weight: o.weight || '400', family: o.family || FAMILY, cap: o.cap
            });
            selection(ctx, b, well);
        };

        const NF = (dp) => new Intl.NumberFormat('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
        const smart = (n) => {
            const a = Math.abs(n);
            if (a === 0) return '0';
            if (a >= 1000) return NF(0).format(n);
            if (a >= 100) return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(n);
            if (a >= 1) return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(n);
            return new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 }).format(n);
        };
        const money = (n) => {
            const a = Math.abs(n), sign = n < 0 ? '-' : '';
            if (a >= 1e9) return sign + '$' + (a / 1e9).toFixed(a >= 1e10 ? 0 : 1) + 'B';
            if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
            if (a >= 1e4) return sign + '$' + (a / 1e3).toFixed(0) + 'K';
            return sign + '$' + NF(a < 100 && a % 1 !== 0 ? 2 : 0).format(a);
        };
        const pct = (n) => (Math.abs(n * 100) >= 10 ? (n * 100).toFixed(0) : (n * 100).toFixed(1)) + '%';
        const SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
        const sci = (n) => {
            if (n === 0) return '0';
            const [m, e] = n.toExponential(2).split('e');
            return m + ' × 10' + String(parseInt(e, 10)).split('').map((c) => SUP[c] || c).join('');
        };

        const types = {};

        // ---- text ----------------------------------------------------------------------
        types.SIMPLE_TEXT = (graph, grid, ctx, min, max, x, y, well) => {
            try { well.attr__showBorder = false; } catch (e) { }
            return textCell({})(graph, grid, ctx, min, max, x, y, well);
        };
        types.TITLE = textCell({ weight: '700', align: 'left', cap: 20 });
        types.TITLE_SUBTLE = textCell({ weight: '600', align: 'left', color: C.muted });
        types.TITLE_MONO = textCell({ weight: '500', align: 'left', family: MONO });
        types.TITLE_OUTLINE = (graph, grid, ctx, min, max, x, y, well) => {
            const b = box(graph, grid, well);
            frame(ctx, b, well, {});
            const t = str(well.getValue ? well.getValue() : well.value);
            if (t) {
                const shown = fit(ctx, t, b.w - b.pad * 2, b.h * 0.62, '700', FAMILY, Math.min(20, b.h * 0.55));
                ctx.save();
                ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff';
                ctx.strokeText(shown, b.x + b.pad, b.y + b.h / 2);
                ctx.fillStyle = ensure(well.fgcolor || C.ink, '#ffffff');
                ctx.fillText(shown, b.x + b.pad, b.y + b.h / 2);
                ctx.restore();
            }
            selection(ctx, b, well);
        };
        types.BADGE = (graph, grid, ctx, min, max, x, y, well) => {
            const b = box(graph, grid, well);
            frame(ctx, b, well, {});
            const t = str(well.getValue ? well.getValue() : well.value).trim();
            if (t && b.w > 24 && b.h > 12) {
                const fs = Math.max(8, Math.min(13, b.h * 0.38));
                ctx.font = '600 ' + fs + 'px ' + FAMILY;
                let shown = t;
                const maxW = b.w - b.pad * 2 - 14;
                if (ctx.measureText(shown).width > maxW) { while (shown.length > 1 && ctx.measureText(shown + '…').width > maxW) shown = shown.slice(0, -1); shown += '…'; }
                const tw = ctx.measureText(shown).width, ph = Math.min(b.h - 6, fs + 8), pw = tw + 14;
                const px = b.x + b.pad, py = b.y + (b.h - ph) / 2;
                ctx.save();
                path(ctx, px, py, pw, ph, ph / 2);
                ctx.fillStyle = well.fgcolor ? 'rgba(26,163,189,0.12)' : C.cyanWash; ctx.fill();
                ctx.strokeStyle = C.cyanEdge; ctx.lineWidth = 1; ctx.stroke();
                ctx.fillStyle = ensure(well.fgcolor || C.ink, over(C.cyanWash, b.bg));
                ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.fillText(shown, px + 7, py + ph / 2);
                ctx.restore();
            }
            selection(ctx, b, well);
        };
        types.LINK = (graph, grid, ctx, min, max, x, y, well) => {
            const b = box(graph, grid, well);
            frame(ctx, b, well, {});
            const t = str(well.getValue ? well.getValue() : well.value).trim();
            if (t) {
                const shown = fit(ctx, t.replace(/^https?:\/\//, ''), b.w - b.pad * 2, b.h * 0.62, '500', FAMILY, Math.min(14, b.h * 0.45));
                ctx.save();
                ctx.fillStyle = ensure(C.link, b.bg); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.fillText(shown, b.x + b.pad, b.y + b.h / 2);
                const tw = ctx.measureText(shown).width, uy = b.y + b.h / 2 + Math.max(6, b.h * 0.18);
                ctx.beginPath(); ctx.moveTo(b.x + b.pad, uy); ctx.lineTo(b.x + b.pad + tw, uy);
                ctx.strokeStyle = 'rgba(26,163,189,0.5)'; ctx.lineWidth = 1; ctx.stroke();
                ctx.restore();
            }
            selection(ctx, b, well);
        };
        types.VideoLink = (graph, grid, ctx, min, max, x, y, well) => {
            const b = box(graph, grid, well);
            frame(ctx, b, well, {});
            const t = str(well.getValue ? well.getValue() : well.value).trim();
            const r = Math.max(5, Math.min(9, b.h * 0.26));
            if (b.w > 30 && b.h > 14) {
                const cx = b.x + b.pad + r, cy = b.y + b.h / 2;
                ctx.save();
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fillStyle = C.cyan; ctx.fill();
                ctx.beginPath();
                ctx.moveTo(cx - r * 0.3, cy - r * 0.42); ctx.lineTo(cx + r * 0.48, cy); ctx.lineTo(cx - r * 0.3, cy + r * 0.42);
                ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill();
                if (t) {
                    const left = b.x + b.pad + r * 2 + 6;
                    const shown = fit(ctx, t.replace(/^https?:\/\//, ''), b.x + b.w - b.pad - left, b.h * 0.6, '500', FAMILY, Math.min(13, b.h * 0.4));
                    ctx.fillStyle = ensure(C.ink, b.bg); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                    ctx.fillText(shown, left, cy);
                }
                ctx.restore();
            }
            selection(ctx, b, well);
        };
        types.ICON = (graph, grid, ctx, min, max, x, y, well) => {
            try { well.attr__showBorder = false; } catch (e) { }
            const b = box(graph, grid, well);
            frame(ctx, b, well, {});
            if (well.icon && Icon) {
                try {
                    if (typeof well.icon.draw !== 'function') well.icon = Icon.buildFromJSON(well.icon);
                    if (well.icon && well.icon.draw) {
                        const side = Math.min(b.w, b.h) * 0.7;
                        well.icon.x = grid.X(well.x); well.icon.y = grid.Y(well.y);
                        well.icon.w = graph.worldWidth(side); well.icon.h = graph.worldHeight(side);
                        well.icon.draw(graph, ctx);
                    }
                } catch (e) { }
            } else {
                value(ctx, b, well.value, { align: 'center', color: C.faint, weight: '500' });
            }
            selection(ctx, b, well);
        };

        // ---- numbers -------------------------------------------------------------------
        types.NUMBER = numberCell(smart);
        types.INTEGER = numberCell((n) => NF(0).format(Math.trunc(n)));
        types.YEAR = numberCell((n) => String(Math.trunc(n)));
        types.SCIENTIFIC = numberCell(sci);
        types.Input_Number = numberCell(smart, { input: true });
        types.MULTIPLE = numberCell((n) => (Math.abs(n) >= 10 ? n.toFixed(0) : n.toFixed(2)) + '×');
        types.DELTA = (graph, grid, ctx, min, max, x, y, well) => {
            const b = box(graph, grid, well);
            frame(ctx, b, well, {});
            if (isNum(well.value)) {
                const n = num(well.value);
                const up = n > 0, flat = n === 0;
                const color = flat ? C.muted : (up ? C.green : C.negative);
                const text = (up ? '+' : '') + smart(n);
                const a = Math.max(5, Math.min(8, b.h * 0.22));
                const shown = fit(ctx, text, b.w - b.pad * 2 - (flat ? 0 : a * 2), b.h * 0.6, '600', FAMILY, Math.min(15, b.h * 0.45));
                ctx.save();
                ctx.fillStyle = ensure(color, b.bg, 3.5); ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
                ctx.fillText(shown, b.x + b.w - b.pad, b.y + b.h / 2);
                if (!flat) {
                    const tw = ctx.measureText(shown).width;
                    const ax = b.x + b.w - b.pad - tw - a - 3, cy = b.y + b.h / 2;
                    ctx.beginPath();
                    if (up) { ctx.moveTo(ax, cy + a * 0.5); ctx.lineTo(ax + a, cy + a * 0.5); ctx.lineTo(ax + a / 2, cy - a * 0.6); }
                    else { ctx.moveTo(ax, cy - a * 0.5); ctx.lineTo(ax + a, cy - a * 0.5); ctx.lineTo(ax + a / 2, cy + a * 0.6); }
                    ctx.closePath(); ctx.fillStyle = ensure(color, b.bg, 3.0); ctx.fill();
                }
                ctx.restore();
            }
            selection(ctx, b, well);
        };
        types.RATING = (graph, grid, ctx, min, max, x, y, well) => {
            const b = box(graph, grid, well);
            frame(ctx, b, well, {});
            const score = Math.max(0, Math.min(5, num(well.value)));
            const n = 5, r = Math.max(2, Math.min(b.h * 0.18, (b.w - b.pad * 2) / (n * 2.6)));
            if (r >= 2) {
                const gap = r * 2.6, startX = b.x + b.w / 2 - (gap * (n - 1)) / 2, cy = b.y + b.h / 2;
                ctx.save();
                for (let i = 0; i < n; i++) {
                    const cx = startX + i * gap, fillFrac = Math.max(0, Math.min(1, score - i));
                    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(10,37,64,0.12)'; ctx.fill();
                    if (fillFrac > 0) {
                        ctx.save();
                        ctx.beginPath(); ctx.rect(cx - r, cy - r, 2 * r * fillFrac, 2 * r); ctx.clip();
                        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                        ctx.fillStyle = well.fgcolor || C.cyan; ctx.fill();
                        ctx.restore();
                    }
                }
                ctx.restore();
            }
            selection(ctx, b, well);
        };

        // ---- money and percent ---------------------------------------------------------
        types.DOLLAR = numberCell(money);
        types.Input_Dollar = numberCell(money, { input: true });
        types.PERCENT = numberCell(pct);
        types.Input_Percent = numberCell(pct, { input: true });
        // A percentage read at a glance: the cell carries a wash of its own sign, so a
        // column of margins shows where it turns without anyone reading the figures.
        types.PERCENT_WITH_COLOR = (graph, grid, ctx, min, max, x, y, well) => {
            const b = box(graph, grid, well);
            const n = num(well.value);
            const wash = !isNum(well.value) ? null : (n > 0 ? C.greenWash : (n < 0 ? C.orangeWash : null));
            frame(ctx, b, well, { fill: well.color || wash || C.cell });
            value(ctx, b, isNum(well.value) ? pct(n) : str(well.value), {
                align: 'right', weight: '600',
                color: well.fgcolor || (n > 0 ? C.green : (n < 0 ? C.negative : C.ink))
            });
            selection(ctx, b, well);
        };

        // ---- status, dates, switches ----------------------------------------------------
        const STATE = {
            done: C.green, complete: C.green, completed: C.green, passed: C.green, approved: C.green, ok: C.green, yes: C.green, active: C.green,
            pending: C.amber, waiting: C.amber, queued: C.amber, running: C.amber, ongoing: C.amber, review: C.amber, planned: C.amber,
            blocked: C.orange, failed: C.orange, error: C.orange, rejected: C.orange, overdue: C.orange, no: C.orange, inactive: C.muted, closed: C.muted,
        };
        types.STATUS = (graph, grid, ctx, min, max, x, y, well) => {
            const b = box(graph, grid, well);
            frame(ctx, b, well, {});
            const t = str(well.getValue ? well.getValue() : well.value).trim();
            if (t && b.w > 26) {
                const key = t.toLowerCase().replace(/[^a-z]/g, '');
                const dot = STATE[key] || C.muted;
                const r = Math.max(2.5, Math.min(4.5, b.h * 0.14));
                const cx = b.x + b.pad + r, cy = b.y + b.h / 2;
                ctx.save();
                ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
                ctx.fillStyle = dot; ctx.fill();
                const left = cx + r + 6;
                const shown = fit(ctx, t, b.x + b.w - b.pad - left, b.h * 0.6, '600', FAMILY, Math.min(13, b.h * 0.4));
                ctx.fillStyle = ensure(well.fgcolor || C.ink, b.bg); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.fillText(shown, left, cy);
                ctx.restore();
            }
            selection(ctx, b, well);
        };
        types.BOOL = (graph, grid, ctx, min, max, x, y, well) => {
            const b = box(graph, grid, well);
            frame(ctx, b, well, { input: true });
            const v = well.value;
            const on = v === true || /^(true|yes|1|y)$/i.test(str(v).trim());
            const side = Math.max(10, Math.min(16, b.h * 0.5));
            const bx = b.x + b.w / 2 - side / 2, by = b.y + b.h / 2 - side / 2;
            ctx.save();
            path(ctx, bx, by, side, side, 4);
            ctx.fillStyle = on ? C.cyan : '#ffffff'; ctx.fill();
            ctx.strokeStyle = on ? C.cyan : C.ruleStrong; ctx.lineWidth = 1.25; ctx.stroke();
            if (on) {
                ctx.beginPath();
                ctx.moveTo(bx + side * 0.24, by + side * 0.52);
                ctx.lineTo(bx + side * 0.43, by + side * 0.71);
                ctx.lineTo(bx + side * 0.78, by + side * 0.3);
                ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1.5, side * 0.14);
                ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
            }
            ctx.restore();
            selection(ctx, b, well);
        };
        const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        types.DATE = (graph, grid, ctx, min, max, x, y, well) => {
            const b = box(graph, grid, well);
            frame(ctx, b, well, { input: true });
            const raw = str(well.getValue ? well.getValue() : well.value).trim();
            let shown = raw;
            const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
            if (m) shown = MONTHS[Math.max(0, Math.min(11, +m[2] - 1))] + ' ' + (+m[3]) + ', ' + m[1];
            value(ctx, b, shown, { align: 'right', weight: '600', color: well.fgcolor || C.ink });
            selection(ctx, b, well);
        };
        types.BUTTON = (graph, grid, ctx, min, max, x, y, well) => {
            const b = box(graph, grid, well);
            frame(ctx, b, well, { border: false, fill: 'transparent' });
            const t = str(well.getValue ? well.getValue() : well.value).trim() || 'Run';
            const inset = Math.max(3, Math.min(8, b.h * 0.14));
            const bx = b.x + inset, by = b.y + inset, bw = b.w - inset * 2, bh = b.h - inset * 2;
            if (bw > 12 && bh > 10) {
                ctx.save();
                path(ctx, bx, by, bw, bh, Math.min(8, bh / 2));
                ctx.fillStyle = well.color || C.cyan; ctx.fill();
                const shown = fit(ctx, t, bw - 12, bh * 0.6, '700', FAMILY, Math.min(14, bh * 0.5));
                ctx.fillStyle = ensure(well.fgcolor || '#ffffff', over(well.color || C.cyan, b.bg));
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(shown, bx + bw / 2, by + bh / 2);
                ctx.restore();
            }
            selection(ctx, b, well);
        };

        // ---- meters ---------------------------------------------------------------------
        types.PROGRESS = (graph, grid, ctx, min, max, x, y, well) => {
            const b = box(graph, grid, well);
            frame(ctx, b, well, {});
            const v = Math.max(0, Math.min(100, num(well.value)));
            const h = Math.max(5, Math.min(10, b.h * 0.26));
            const bw = b.w - b.pad * 2;
            if (bw > 16) {
                const bx = b.x + b.pad, by = b.y + b.h / 2 - h / 2;
                ctx.save();
                path(ctx, bx, by, bw, h, h / 2);
                ctx.fillStyle = 'rgba(10,37,64,0.08)'; ctx.fill();
                if (v > 0) { path(ctx, bx, by, Math.max(h, bw * v / 100), h, h / 2); ctx.fillStyle = well.fgcolor || C.cyan; ctx.fill(); }
                if (b.h > 26) {
                    ctx.font = '600 ' + Math.max(8, Math.min(11, b.h * 0.22)) + 'px ' + FAMILY;
                    ctx.fillStyle = ensure(C.muted, b.bg); ctx.textAlign = 'right'; ctx.textBaseline = 'top';
                    ctx.fillText(Math.round(v) + '%', b.x + b.w - b.pad, by + h + 2);
                }
                ctx.restore();
            }
            selection(ctx, b, well);
        };
        // A value against its column: pale where it is low, cyan where it is high, with the
        // figure kept legible on top rather than the colour swallowing it.
        types.HEATMAP = (graph, grid, ctx, min, max, x, y, well) => {
            const b = box(graph, grid, well);
            const n = num(well.value, NaN);
            const lo = num(min, 0), hi = num(max, 1);
            let f = 0;
            if (isFinite(n) && hi > lo) f = Math.max(0, Math.min(1, (n - lo) / (hi - lo)));
            const wash = isNum(well.value) ? 'rgba(26,163,189,' + (0.06 + f * 0.45).toFixed(3) + ')' : C.cell;
            frame(ctx, b, well, { fill: well.color || wash });
            value(ctx, b, isNum(well.value) ? smart(n) : str(well.value), {
                align: 'right', weight: '600', color: well.fgcolor || (f > 0.7 ? '#062b33' : C.ink)
            });
            selection(ctx, b, well);
        };
        types.SPARKLINE = (graph, grid, ctx, min, max, x, y, well) => {
            const b = box(graph, grid, well);
            frame(ctx, b, well, {});
            const pts = str(well.value).split(/[,;\s]+/).map((v) => parseFloat(v)).filter((v) => isFinite(v));
            if (pts.length > 1 && b.w > 24 && b.h > 10) {
                const lo = Math.min(...pts), hi = Math.max(...pts), span = (hi - lo) || 1;
                const x0 = b.x + b.pad, w = b.w - b.pad * 2;
                const y0 = b.y + b.h * 0.22, h = b.h * 0.56;
                ctx.save();
                ctx.beginPath();
                pts.forEach((v, i) => {
                    const px = x0 + (w * i) / (pts.length - 1), py = y0 + h - ((v - lo) / span) * h;
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                });
                ctx.strokeStyle = ensure(well.fgcolor || C.cyan, b.bg, 3.0); ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
                const last = pts[pts.length - 1];
                ctx.beginPath();
                ctx.arc(x0 + w, y0 + h - ((last - lo) / span) * h, 2.2, 0, Math.PI * 2);
                ctx.fillStyle = well.fgcolor || C.cyan; ctx.fill();
                ctx.restore();
            }
            selection(ctx, b, well);
        };

        // ---- structure ------------------------------------------------------------------
        // Headers are the table's furniture: navy ground, light type, centred over the column
        // and along the row. A row header turns its text upright when the cell is tall and
        // narrow, which is how it stayed readable before.
        types.ColumnHeader = (graph, grid, ctx, min, max, x, y, well) => {
            const b = box(graph, grid, well);
            ctx.save();
            path(ctx, b.x, b.y, b.w, b.h, b.r);
            ctx.fillStyle = well.color || C.head; ctx.fill();
            ctx.restore();
            b.bg = over(well.color || C.head, C.cell);
            value(ctx, b, str(well.getValue ? well.getValue() : well.value).replace(/_/g, ' '), {
                align: 'center', weight: '700', color: well.fgcolor || C.headInk, cap: Math.min(14, b.h * 0.45)
            });
            selection(ctx, b, well);
        };
        types.RowHeader = (graph, grid, ctx, min, max, x, y, well) => {
            const b = box(graph, grid, well);
            ctx.save();
            path(ctx, b.x, b.y, b.w, b.h, b.r);
            ctx.fillStyle = well.color || 'rgba(11,37,69,0.06)'; ctx.fill();
            b.bg = over(well.color || 'rgba(11,37,69,0.06)', C.cell);
            ctx.strokeStyle = C.rule; ctx.lineWidth = 1; ctx.stroke();
            ctx.restore();
            const t = str(well.getValue ? well.getValue() : well.value).replace(/_/g, ' ');
            if (t) {
                const upright = b.h > b.w * 1.6 && b.h > 40;       // tall and narrow: read it sideways
                ctx.save();
                if (upright) {
                    ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
                    ctx.rotate(-Math.PI / 2);
                    const shown = fit(ctx, t, b.h - 10, b.w * 0.7, '700', FAMILY, Math.min(14, b.w * 0.5));
                    ctx.fillStyle = ensure(well.fgcolor || C.ink, b.bg); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(shown, 0, 0);
                } else {
                    const shown = fit(ctx, t, b.w - b.pad * 2, b.h * 0.62, '700', FAMILY, Math.min(15, b.h * 0.5));
                    ctx.fillStyle = ensure(well.fgcolor || C.ink, b.bg); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                    ctx.fillText(shown, b.x + b.pad, b.y + b.h / 2);
                }
                ctx.restore();
            }
            selection(ctx, b, well);
        };

        // ---- masses ---------------------------------------------------------------------
        // The figure with its unit set in smaller, muted type beside it, so a column of
        // masses lines up on the number and the unit does not compete with it.
        const withUnit = (unit, opt) => (graph, grid, ctx, min, max, x, y, well) => {
            const o = opt || {};
            const b = box(graph, grid, well);
            frame(ctx, b, well, { input: !!o.input });
            const raw = well.value;
            if (str(raw) !== '') {
                const n = num(raw);
                const text = isNum(raw) ? (o.abbreviate ? smart(n) : (Math.abs(n) >= 100 ? NF(0).format(n) : String(+n.toFixed(2)))) : str(raw);
                const fs = Math.max(8, Math.min(15, b.h * 0.42));
                const us = Math.max(7, fs * 0.72);
                ctx.save();
                ctx.font = '500 ' + us + 'px ' + FAMILY;
                const uw = ctx.measureText(unit).width + 4;
                const shown = fit(ctx, text, b.w - b.pad * 2 - uw, b.h * 0.62, '600', FAMILY, fs);
                ctx.fillStyle = ensure(well.fgcolor || (isNum(raw) && n < 0 ? C.negative : C.ink), b.bg, 3.5);
                ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
                ctx.fillText(shown, b.x + b.w - b.pad - uw, b.y + b.h / 2);
                ctx.font = '500 ' + us + 'px ' + FAMILY;
                ctx.fillStyle = ensure(C.muted, b.bg);        // the unit is small: hold it to 4:1
                ctx.fillText(unit, b.x + b.w - b.pad, b.y + b.h / 2);
                ctx.restore();
            }
            selection(ctx, b, well);
        };
        types.Display_Weight_ng = withUnit('ng');
        types.Display_Weight_ug = withUnit('\u00B5g');
        types.Display_Weight_mg = withUnit('mg');
        types.Display_Weight_kg = withUnit('kg');
        types.Display_Weight_abbrev_g = withUnit('g', { abbreviate: true });
        types.Input_Weight_ng = withUnit('ng', { input: true });
        types.Input_Weight_ug = withUnit('\u00B5g', { input: true });
        types.Input_Weight_mg = withUnit('mg', { input: true });
        types.Input_Weight_kg = withUnit('kg', { input: true });
        types.Input_Weight_abbrev_g = withUnit('g', { abbreviate: true, input: true });

        return types;
    })();
}
