function () {
    return new Promise(async (resolve, reject) => {

        function clampDeg(deg) {
            let d = Number(deg);
            if (!Number.isFinite(d)) return 0;

            d = ((d + 180) % 360 + 360) % 360 - 180;

            if (d < -45) d = -45;
            if (d > 45) d = 45;
            return d;
        }
        function _applyShadow(ctx, style) {
            const s = (style && style.shadow) || {};
            ctx.shadowColor = s.color || 'rgba(0, 0, 0, 0.35)';
            ctx.shadowBlur = s.blur != null ? s.blur : 8;
            ctx.shadowOffsetX = s.offsetX != null ? s.offsetX : 3;
            ctx.shadowOffsetY = s.offsetY != null ? s.offsetY : 3;
        }

        function _clearShadow(ctx) {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }
        function _parseHexColor(color) {
            if (!color || typeof color !== 'string') return null;
            let c = color.trim();
            if (c[0] === '#') c = c.slice(1);
            if (c.length === 3) {

                c = c.split('').map(ch => ch + ch).join('');
            }
            if (c.length !== 6) return null;
            const r = parseInt(c.slice(0, 2), 16);
            const g = parseInt(c.slice(2, 4), 16);
            const b = parseInt(c.slice(4, 6), 16);
            if ([r, g, b].some(v => Number.isNaN(v))) return null;
            return { r, g, b };
        }
        function _isFiniteNum(v) {
            return typeof v === 'number' && Number.isFinite(v);
        }

        function _getShadedFill(ctx, baseColor, x, y, w, h) {
            if (!baseColor || baseColor === 'none') return null;

            const parsed = _parseHexColor(baseColor);
            if (!parsed) return baseColor;

            if (![x, y, w, h].every(_isFiniteNum)) return baseColor;
            if (w === 0 && h === 0) return baseColor;

            if (w < 0) { x = x + w; w = -w; }
            if (h < 0) { y = y + h; h = -h; }

            if (![x, y, w, h].every(_isFiniteNum)) return baseColor;

            const light = _shadeColor(baseColor, 0.3);
            const dark = _shadeColor(baseColor, -0.25);

            const x2 = x + w;
            const y2 = y + h;

            if (![x2, y2].every(_isFiniteNum)) return baseColor;

            const grad = ctx.createLinearGradient(x, y, x2, y2);
            grad.addColorStop(0, light);
            grad.addColorStop(0.5, baseColor);
            grad.addColorStop(1, dark);
            return grad;
        }

        function _shadeColor(color, ratio) {

            const rgb = _parseHexColor(color);
            if (!rgb) return color;

            const r = ratio >= 0
                ? Math.round(rgb.r + (255 - rgb.r) * ratio)
                : Math.round(rgb.r * (1 + ratio));
            const g = ratio >= 0
                ? Math.round(rgb.g + (255 - rgb.g) * ratio)
                : Math.round(rgb.g * (1 + ratio));
            const b = ratio >= 0
                ? Math.round(rgb.b + (255 - rgb.b) * ratio)
                : Math.round(rgb.b * (1 + ratio));

            const toHex = v => v.toString(16).padStart(2, '0');
            return '#' + toHex(r) + toHex(g) + toHex(b);
        }

        function _getShadedFill(ctx, baseColor, x, y, w, h) {
            if (!baseColor || baseColor === 'none') return null;

            const parsed = _parseHexColor(baseColor);
            if (!parsed) return baseColor;

            if (![x, y, w, h].every(_isFiniteNum)) return baseColor;
            if (w === 0 && h === 0) return baseColor;

            if (w < 0) { x = x + w; w = -w; }
            if (h < 0) { y = y + h; h = -h; }

            if (![x, y, w, h].every(_isFiniteNum)) return baseColor;

            const light = _shadeColor(baseColor, 0.3);
            const dark = _shadeColor(baseColor, -0.25);

            const x2 = x + w;
            const y2 = y + h;

            if (![x2, y2].every(_isFiniteNum)) return baseColor;

            const grad = ctx.createLinearGradient(x, y, x2, y2);
            grad.addColorStop(0, light);
            grad.addColorStop(0.5, baseColor);
            grad.addColorStop(1, dark);
            return grad;
        }

        const isNone = v => !v || String(v).toLowerCase() === 'none' || String(v).toLowerCase() === 'transparent';
        const safeNum = (v, d) => (typeof v === 'number' && Number.isFinite(v)) ? v : d;

        const themeStyle = (shape, theme) => {
            const s0 = shape.style || {};
            const strokeWidth = safeNum(s0.strokeWidth, 1) * theme.strokeWidthMul;

            const fill = isNone(s0.fill) ? theme.fillDefault : s0.fill;
            const stroke = isNone(s0.stroke) ? theme.strokeDefault : s0.stroke;

            return {
                ...s0,
                fill,
                stroke,
                strokeWidth,

                shadow: theme.shadow
            };
        };

        const makeLinear = (ctx, x, y, w, h, a, b) => {
            const g = ctx.createLinearGradient(x, y, x + w, y + h);
            g.addColorStop(0, a);
            g.addColorStop(1, b);
            return g;
        };

        const makeTheme = (theme) => ({
            name: theme.name,

            drawRect(shape, grid, ctx) {

                const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);
                const toNum = (v) => (isFiniteNum(v) ? v : Number(v));
                const safeFinite = (v) => {
                    const n = toNum(v);
                    return Number.isFinite(n) ? n : null;
                };

                if (!shape || !grid || !ctx) return;

                const x = safeFinite(shape.x);
                const y = safeFinite(shape.y);
                const w = safeFinite(shape.w);
                const h = safeFinite(shape.h);

                if (x === null || y === null || w === null || h === null) return;
                if (w === 0 || h === 0) return;

                const MAX_ABS = 1e9;
                if (Math.abs(x) > MAX_ABS || Math.abs(y) > MAX_ABS || Math.abs(w) > MAX_ABS || Math.abs(h) > MAX_ABS) return;

                const styled = { ...shape, style: themeStyle(shape, theme) };

                const sx = grid.X(x);
                const syTop = grid.Y(y + h);
                const sw = grid.screenWidth(w);
                const sh = grid.screenHeight(h);

                if (![sx, syTop, sw, sh].every(Number.isFinite)) return;
                if (sw === 0 || sh === 0) return;

                const strokeWidth = safeFinite(styled?.style?.strokeWidth);
                if (strokeWidth === null) return;

                ctx.save();
                try {
                    ctx.lineWidth = strokeWidth;
                    ctx.strokeStyle = styled?.style?.stroke ?? 'transparent';

                    _applyShadow(ctx, styled.style);

                    let fillStyle = 'transparent';
                    if (!isNone(styled.style.fill)) {
                        const baseFill = theme.useGradients
                            ? makeLinear(ctx, sx, syTop, sw, sh, theme.fillA, theme.fillB)
                            : styled.style.fill;

                        const shaded = _getShadedFill(ctx, baseFill, sx, syTop, sw, sh);
                        fillStyle = shaded || baseFill;
                    }
                    ctx.fillStyle = fillStyle;

                    const rr = Number.isFinite(theme?.cornerRadiusPx) ? theme.cornerRadiusPx : 0;

                    if (rr > 0 && ctx.roundRect) {
                        ctx.beginPath();
                        ctx.roundRect(sx, syTop, sw, sh, rr);
                    } else if (rr > 0) {

                        const r = Math.max(0, Math.min(rr, Math.abs(sw) / 2, Math.abs(sh) / 2));
                        const x0 = sx, y0 = syTop, w0 = sw, h0 = sh;
                        ctx.beginPath();
                        ctx.moveTo(x0 + r, y0);
                        ctx.arcTo(x0 + w0, y0, x0 + w0, y0 + h0, r);
                        ctx.arcTo(x0 + w0, y0 + h0, x0, y0 + h0, r);
                        ctx.arcTo(x0, y0 + h0, x0, y0, r);
                        ctx.arcTo(x0, y0, x0 + w0, y0, r);
                        ctx.closePath();
                    } else {
                        ctx.beginPath();
                        ctx.rect(sx, syTop, sw, sh);
                    }

                    if (!isNone(styled.style.fill)) ctx.fill();
                    ctx.stroke();
                } catch (e) {

                } finally {
                    _clearShadow(ctx);
                    ctx.restore();
                }
            }
            ,

            drawLine(shape, grid, ctx) {
                const styled = { ...shape, style: themeStyle(shape, theme) };
                ctx.strokeStyle = styled.style.stroke;
                ctx.lineWidth = styled.style.strokeWidth;

                _applyShadow(ctx, styled.style);

                if (theme.dashedLines) ctx.setLineDash(theme.dashedLines);
                ctx.beginPath();
                ctx.moveTo(grid.X(styled.x1), grid.Y(styled.y1));
                ctx.lineTo(grid.X(styled.x2), grid.Y(styled.y2));
                ctx.stroke();
                ctx.setLineDash([]);

                _clearShadow(ctx);
            },

            drawCircle(shape, grid, ctx) {
                const styled = { ...shape, style: themeStyle(shape, theme) };

                const sx = grid.X(styled.cx);
                const sy = grid.Y(styled.cy);
                const sr = grid.screenWidth(styled.r);

                ctx.strokeStyle = styled.style.stroke;
                ctx.lineWidth = styled.style.strokeWidth;

                _applyShadow(ctx, styled.style);

                let fillStyle = null;
                if (!isNone(styled.style.fill)) {
                    const baseFill = theme.useGradients
                        ? makeLinear(ctx, sx - sr, sy - sr, sr * 2, sr * 2, theme.fillA, theme.fillB)
                        : styled.style.fill;

                    const shaded = _getShadedFill(ctx, baseFill, sx - sr, sy - sr, sr * 2, sr * 2);
                    fillStyle = shaded || baseFill;
                }
                if (fillStyle) ctx.fillStyle = fillStyle;

                ctx.beginPath();
                ctx.arc(sx, sy, sr, 0, Math.PI * 2);
                if (fillStyle) ctx.fill();
                ctx.stroke();

                _clearShadow(ctx);
            },

            drawEllipse(shape, grid, ctx) {
                const styled = { ...shape, style: themeStyle(shape, theme) };

                const sx = grid.X(styled.cx);
                const sy = grid.Y(styled.cy);
                const srx = grid.screenWidth(styled.rx);
                const sry = grid.screenHeight(styled.ry);

                ctx.strokeStyle = styled.style.stroke;
                ctx.lineWidth = styled.style.strokeWidth;

                _applyShadow(ctx, styled.style);

                let fillStyle = null;
                if (!isNone(styled.style.fill)) {
                    const baseFill = theme.useGradients
                        ? makeLinear(ctx, sx - srx, sy - sry, srx * 2, sry * 2, theme.fillA, theme.fillB)
                        : styled.style.fill;

                    const shaded = _getShadedFill(ctx, baseFill, sx - srx, sy - sry, srx * 2, sry * 2);
                    fillStyle = shaded || baseFill;
                }

                ctx.beginPath();
                ctx.save();
                ctx.translate(sx, sy);
                ctx.scale(srx, sry);
                ctx.arc(0, 0, 1, 0, Math.PI * 2);
                ctx.restore();

                if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
                ctx.stroke();

                _clearShadow(ctx);
            },

            drawPoly(shape, grid, ctx) {
                const styled = { ...shape, style: themeStyle(shape, theme) };

                ctx.strokeStyle = styled.style.stroke;
                ctx.lineWidth = styled.style.strokeWidth;

                _applyShadow(ctx, styled.style);

                const spts = (styled.pts || []).map(p => ({ sx: grid.X(p.x), sy: grid.Y(p.y) }));
                if (spts.length < 2) { _clearShadow(ctx); return; }

                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const p of spts) {
                    minX = Math.min(minX, p.sx); minY = Math.min(minY, p.sy);
                    maxX = Math.max(maxX, p.sx); maxY = Math.max(maxY, p.sy);
                }

                let fillStyle = null;
                if (!isNone(styled.style.fill)) {
                    const baseFill = theme.useGradients
                        ? makeLinear(ctx, minX, minY, maxX - minX, maxY - minY, theme.fillA, theme.fillB)
                        : styled.style.fill;

                    const shaded = _getShadedFill(ctx, baseFill, minX, minY, maxX - minX, maxY - minY);
                    fillStyle = shaded || baseFill;
                }

                ctx.beginPath();
                for (let i = 0; i < spts.length; i++) {
                    const p = spts[i];
                    if (i === 0) ctx.moveTo(p.sx, p.sy);
                    else ctx.lineTo(p.sx, p.sy);
                }
                if (styled.isClosed) ctx.closePath();

                if (styled.isClosed && fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
                ctx.stroke();

                _clearShadow(ctx);
            },

            drawText(shape, grid, ctx) {
                const themed = {
                    ...shape,
                    boxFill: shape.boxFill ?? theme.textBoxFill,
                    boxStroke: shape.boxStroke ?? theme.textBoxStroke,
                    boxLineWidth: shape.boxLineWidth ?? theme.textBoxLineWidth,
                    textFill: shape.textFill ?? theme.textFill
                };

                themed.__defaultTextDraw?.(grid, ctx);
            }
        });

        function attachThemePaths(category, themes) {
            for (const [key, theme] of Object.entries(themes)) {
                if (theme && typeof theme === 'object') {
                    theme.path = `${category}.${key}`;
                }
            }
            return themes;
        }

        const ShapeGfxThemes = {
            beach: (() => {

                const themes = {
                    tropicalLagoon: makeTheme({
                        name: 'Tropical Lagoon',
                        fillDefault: 'rgba(173, 232, 244, 0.75)',
                        strokeDefault: 'rgba(0, 88, 122, 0.75)',
                        strokeWidthMul: 1.15,
                        shadow: { color: 'rgba(0,0,0,0.25)', blur: 6, offsetX: 2, offsetY: 3 },
                        useGradients: true,
                        fillA: 'rgba(86, 207, 225, 0.80)',
                        fillB: 'rgba(255, 236, 179, 0.65)',
                        dashedLines: null,
                        cornerRadiusPx: 10,
                        textFill: 'rgba(0, 58, 84, 0.95)',
                        textBoxFill: 'rgba(255, 255, 255, 0.88)',
                        textBoxStroke: 'rgba(0, 88, 122, 0.28)',
                        textBoxLineWidth: 1.0
                    }),

                    sunset: makeTheme({
                        name: 'Sunset',
                        fillDefault: 'rgba(255, 183, 178, 0.75)',
                        strokeDefault: 'rgba(92, 45, 145, 0.55)',
                        strokeWidthMul: 1.25,
                        shadow: { color: 'rgba(0,0,0,0.28)', blur: 7, offsetX: 2, offsetY: 3 },
                        useGradients: true,
                        fillA: 'rgba(255, 140, 105, 0.78)',
                        fillB: 'rgba(255, 214, 165, 0.70)',
                        dashedLines: [6, 4],
                        cornerRadiusPx: 12,
                        textFill: 'rgba(52, 24, 71, 0.95)',
                        textBoxFill: 'rgba(255, 255, 255, 0.86)',
                        textBoxStroke: 'rgba(92, 45, 145, 0.25)',
                        textBoxLineWidth: 1.0
                    }),

                    surfAndSand: makeTheme({
                        name: 'Surf & Sand',
                        fillDefault: 'rgba(219, 242, 233, 0.70)',
                        strokeDefault: 'rgba(92, 101, 83, 0.55)',
                        strokeWidthMul: 1.10,
                        shadow: { color: 'rgba(0,0,0,0.18)', blur: 5, offsetX: 2, offsetY: 2 },
                        useGradients: true,
                        fillA: 'rgba(180, 232, 217, 0.72)',
                        fillB: 'rgba(245, 237, 220, 0.72)',
                        dashedLines: [3, 4],
                        cornerRadiusPx: 10,
                        textFill: 'rgba(54, 63, 51, 0.95)',
                        textBoxFill: 'rgba(255, 255, 255, 0.90)',
                        textBoxStroke: 'rgba(92, 101, 83, 0.22)',
                        textBoxLineWidth: 1.0
                    }),

                    deepOcean: makeTheme({
                        name: 'Deep Ocean',
                        fillDefault: 'rgba(2, 62, 138, 0.45)',
                        strokeDefault: 'rgba(0, 119, 182, 0.75)',
                        strokeWidthMul: 1.35,
                        shadow: { color: 'rgba(0,0,0,0.32)', blur: 8, offsetX: 3, offsetY: 4 },
                        useGradients: true,
                        fillA: 'rgba(0, 180, 216, 0.55)',
                        fillB: 'rgba(2, 62, 138, 0.55)',
                        dashedLines: null,
                        cornerRadiusPx: 8,
                        textFill: 'rgba(255, 255, 255, 0.97)',
                        textBoxFill: 'rgba(0, 0, 0, 0.38)',
                        textBoxStroke: 'rgba(255, 255, 255, 0.18)',
                        textBoxLineWidth: 1.0
                    }),

                    miamiPastel: makeTheme({
                        name: 'Miami Pastel',
                        fillDefault: 'rgba(255, 209, 220, 0.70)',
                        strokeDefault: 'rgba(0, 180, 216, 0.70)',
                        strokeWidthMul: 1.30,
                        shadow: { color: 'rgba(0,0,0,0.22)', blur: 6, offsetX: 2, offsetY: 3 },
                        useGradients: true,
                        fillA: 'rgba(181, 255, 255, 0.70)',
                        fillB: 'rgba(255, 209, 220, 0.70)',
                        dashedLines: [8, 6],
                        cornerRadiusPx: 14,
                        textFill: 'rgba(0, 88, 122, 0.95)',
                        textBoxFill: 'rgba(255, 255, 255, 0.88)',
                        textBoxStroke: 'rgba(0, 180, 216, 0.25)',
                        textBoxLineWidth: 1.0
                    }),

                    tangerine: makeTheme({
                        name: 'Tangerine',
                        fillDefault: 'rgba(255, 203, 156, 0.78)',
                        strokeDefault: 'rgba(164, 64, 0, 0.55)',
                        strokeWidthMul: 1.25,
                        shadow: { color: 'rgba(0,0,0,0.20)', blur: 7, offsetX: 2, offsetY: 3 },
                        useGradients: true,
                        fillA: 'rgba(255, 140, 0, 0.65)',
                        fillB: 'rgba(255, 230, 200, 0.65)',
                        dashedLines: null,
                        cornerRadiusPx: 12,
                        textFill: 'rgba(92, 40, 0, 0.95)',
                        textBoxFill: 'rgba(255, 255, 255, 0.88)',
                        textBoxStroke: 'rgba(164, 64, 0, 0.20)',
                        textBoxLineWidth: 1.0
                    })
                };
                return attachThemePaths('beach', themes);
            })(),

            mountain: (() => {

                const themes = {
                    alpineMist: makeTheme({
                        name: 'Alpine Mist',
                        fillDefault: 'rgba(225, 240, 233, 0.72)',
                        strokeDefault: 'rgba(44, 77, 62, 0.55)',
                        strokeWidthMul: 1.15,
                        shadow: { color: 'rgba(0,0,0,0.20)', blur: 7, offsetX: 2, offsetY: 3 },
                        useGradients: true,
                        fillA: 'rgba(152, 216, 170, 0.65)',
                        fillB: 'rgba(240, 248, 255, 0.65)',
                        dashedLines: [6, 5],
                        cornerRadiusPx: 10,
                        textFill: 'rgba(28, 54, 40, 0.95)',
                        textBoxFill: 'rgba(255, 255, 255, 0.90)',
                        textBoxStroke: 'rgba(44, 77, 62, 0.18)',
                        textBoxLineWidth: 1.0
                    }),

                    graniteRidge: makeTheme({
                        name: 'Granite Ridge',
                        fillDefault: 'rgba(230, 232, 235, 0.75)',
                        strokeDefault: 'rgba(55, 60, 66, 0.55)',
                        strokeWidthMul: 1.25,
                        shadow: { color: 'rgba(0,0,0,0.22)', blur: 8, offsetX: 2, offsetY: 4 },
                        useGradients: true,
                        fillA: 'rgba(200, 205, 212, 0.70)',
                        fillB: 'rgba(120, 132, 145, 0.55)',
                        dashedLines: [3, 5],
                        cornerRadiusPx: 8,
                        textFill: 'rgba(32, 36, 40, 0.95)',
                        textBoxFill: 'rgba(255, 255, 255, 0.88)',
                        textBoxStroke: 'rgba(55, 60, 66, 0.18)',
                        textBoxLineWidth: 1.0
                    })
                };
                return attachThemePaths('mountain', themes);
            })(),

            city: (() => {

                const themes = {
                    cityscape: makeTheme({
                        name: 'Cityscape',
                        fillDefault: 'rgba(230, 235, 245, 0.75)',
                        strokeDefault: 'rgba(25, 32, 44, 0.55)',
                        strokeWidthMul: 1.30,
                        shadow: { color: 'rgba(0,0,0,0.25)', blur: 6, offsetX: 2, offsetY: 3 },
                        useGradients: true,
                        fillA: 'rgba(168, 192, 255, 0.55)',
                        fillB: 'rgba(40, 44, 52, 0.55)',
                        dashedLines: null,
                        cornerRadiusPx: 6,
                        textFill: 'rgba(20, 24, 32, 0.96)',
                        textBoxFill: 'rgba(255, 255, 255, 0.88)',
                        textBoxStroke: 'rgba(25, 32, 44, 0.20)',
                        textBoxLineWidth: 1.0
                    }),

                    nightRider: makeTheme({
                        name: 'Night Rider',
                        fillDefault: 'rgba(18, 18, 22, 0.72)',
                        strokeDefault: 'rgba(0, 240, 255, 0.55)',
                        strokeWidthMul: 1.45,
                        shadow: { color: 'rgba(0,0,0,0.40)', blur: 10, offsetX: 3, offsetY: 5 },
                        useGradients: true,
                        fillA: 'rgba(0, 240, 255, 0.22)',
                        fillB: 'rgba(255, 0, 128, 0.18)',
                        dashedLines: [10, 6],
                        cornerRadiusPx: 10,
                        textFill: 'rgba(220, 250, 255, 0.98)',
                        textBoxFill: 'rgba(0, 0, 0, 0.55)',
                        textBoxStroke: 'rgba(0, 240, 255, 0.22)',
                        textBoxLineWidth: 1.0
                    })
                };
                return attachThemePaths('city', themes);

            })(),

            art: (() => {

                const themes = {
                    impressionistic_paintings: makeTheme({
                        name: 'Impressionistic Paintings',
                        fillDefault: 'rgba(255, 244, 214, 0.70)',
                        strokeDefault: 'rgba(46, 62, 75, 0.40)',
                        strokeWidthMul: 1.10,
                        shadow: { color: 'rgba(0,0,0,0.18)', blur: 9, offsetX: 2, offsetY: 4 },
                        useGradients: true,
                        fillA: 'rgba(255, 224, 178, 0.72)',
                        fillB: 'rgba(176, 229, 255, 0.62)',
                        dashedLines: [2, 6],
                        cornerRadiusPx: 16,
                        textFill: 'rgba(44, 55, 66, 0.95)',
                        textBoxFill: 'rgba(255, 255, 255, 0.80)',
                        textBoxStroke: 'rgba(46, 62, 75, 0.18)',
                        textBoxLineWidth: 1.0
                    })
                };
                return attachThemePaths('art', themes);
            })(),

            pets: (() => {

                const themes = {
                    dogs: makeTheme({
                        name: 'Dogs',
                        fillDefault: 'rgba(245, 232, 216, 0.78)',
                        strokeDefault: 'rgba(92, 64, 51, 0.55)',
                        strokeWidthMul: 1.20,
                        shadow: { color: 'rgba(0,0,0,0.18)', blur: 6, offsetX: 2, offsetY: 3 },
                        useGradients: true,
                        fillA: 'rgba(255, 214, 165, 0.70)',
                        fillB: 'rgba(219, 242, 233, 0.60)',
                        dashedLines: [4, 6],
                        cornerRadiusPx: 18,
                        textFill: 'rgba(74, 44, 33, 0.95)',
                        textBoxFill: 'rgba(255, 255, 255, 0.90)',
                        textBoxStroke: 'rgba(92, 64, 51, 0.18)',
                        textBoxLineWidth: 1.0
                    })
                };
                return attachThemePaths('pets', themes);

            })(),
            floral: (() => {

                const themes = {
                    sun_flower: makeTheme({
                        name: 'Sunflower',
                        fillDefault: 'rgba(255, 236, 153, 0.78)',
                        strokeDefault: 'rgba(90, 70, 10, 0.55)',
                        strokeWidthMul: 1.25,
                        shadow: { color: 'rgba(0,0,0,0.18)', blur: 6, offsetX: 2, offsetY: 3 },
                        useGradients: true,
                        fillA: 'rgba(255, 208, 0, 0.70)',
                        fillB: 'rgba(120, 200, 90, 0.62)',
                        dashedLines: null,
                        cornerRadiusPx: 14,
                        textFill: 'rgba(64, 48, 8, 0.95)',
                        textBoxFill: 'rgba(255, 255, 255, 0.90)',
                        textBoxStroke: 'rgba(90, 70, 10, 0.18)',
                        textBoxLineWidth: 1.0
                    }),

                    rose_garden: makeTheme({
                        name: 'Rose Garden',
                        fillDefault: 'rgba(255, 210, 220, 0.75)',
                        strokeDefault: 'rgba(128, 40, 60, 0.55)',
                        strokeWidthMul: 1.20,
                        shadow: { color: 'rgba(0,0,0,0.22)', blur: 7, offsetX: 2, offsetY: 3 },
                        useGradients: true,
                        fillA: 'rgba(255, 170, 185, 0.70)',
                        fillB: 'rgba(210, 80, 120, 0.55)',
                        dashedLines: [6, 4],
                        cornerRadiusPx: 16,
                        textFill: 'rgba(92, 24, 44, 0.95)',
                        textBoxFill: 'rgba(255, 255, 255, 0.88)',
                        textBoxStroke: 'rgba(128, 40, 60, 0.20)',
                        textBoxLineWidth: 1.0
                    }),

                    lavender_field: makeTheme({
                        name: 'Lavender Field',
                        fillDefault: 'rgba(230, 220, 245, 0.75)',
                        strokeDefault: 'rgba(92, 70, 130, 0.45)',
                        strokeWidthMul: 1.15,
                        shadow: { color: 'rgba(0,0,0,0.18)', blur: 6, offsetX: 2, offsetY: 3 },
                        useGradients: true,
                        fillA: 'rgba(200, 180, 235, 0.65)',
                        fillB: 'rgba(245, 240, 255, 0.65)',
                        dashedLines: [4, 6],
                        cornerRadiusPx: 14,
                        textFill: 'rgba(60, 44, 92, 0.95)',
                        textBoxFill: 'rgba(255, 255, 255, 0.90)',
                        textBoxStroke: 'rgba(92, 70, 130, 0.18)',
                        textBoxLineWidth: 1.0
                    }),

                    cherry_blossom: makeTheme({
                        name: 'Cherry Blossom',
                        fillDefault: 'rgba(255, 225, 235, 0.80)',
                        strokeDefault: 'rgba(160, 90, 120, 0.40)',
                        strokeWidthMul: 1.10,
                        shadow: { color: 'rgba(0,0,0,0.16)', blur: 6, offsetX: 2, offsetY: 3 },
                        useGradients: true,
                        fillA: 'rgba(255, 200, 220, 0.65)',
                        fillB: 'rgba(255, 245, 250, 0.70)',
                        dashedLines: null,
                        cornerRadiusPx: 18,
                        textFill: 'rgba(92, 40, 60, 0.95)',
                        textBoxFill: 'rgba(255, 255, 255, 0.92)',
                        textBoxStroke: 'rgba(160, 90, 120, 0.16)',
                        textBoxLineWidth: 1.0
                    }),

                    wildflower_meadow: makeTheme({
                        name: 'Wildflower Meadow',
                        fillDefault: 'rgba(220, 245, 220, 0.75)',
                        strokeDefault: 'rgba(80, 120, 80, 0.45)',
                        strokeWidthMul: 1.15,
                        shadow: { color: 'rgba(0,0,0,0.18)', blur: 6, offsetX: 2, offsetY: 3 },
                        useGradients: true,
                        fillA: 'rgba(180, 225, 180, 0.65)',
                        fillB: 'rgba(245, 255, 235, 0.70)',
                        dashedLines: [5, 5],
                        cornerRadiusPx: 12,
                        textFill: 'rgba(40, 80, 40, 0.95)',
                        textBoxFill: 'rgba(255, 255, 255, 0.88)',
                        textBoxStroke: 'rgba(80, 120, 80, 0.18)',
                        textBoxLineWidth: 1.0
                    }),

                    peony_pink: makeTheme({
                        name: 'Peony Pink',
                        fillDefault: 'rgba(255, 215, 230, 0.78)',
                        strokeDefault: 'rgba(170, 60, 100, 0.45)',
                        strokeWidthMul: 1.20,
                        shadow: { color: 'rgba(0,0,0,0.20)', blur: 7, offsetX: 2, offsetY: 3 },
                        useGradients: true,
                        fillA: 'rgba(255, 180, 205, 0.68)',
                        fillB: 'rgba(255, 240, 245, 0.68)',
                        dashedLines: null,
                        cornerRadiusPx: 16,
                        textFill: 'rgba(110, 36, 64, 0.95)',
                        textBoxFill: 'rgba(255, 255, 255, 0.90)',
                        textBoxStroke: 'rgba(170, 60, 100, 0.18)',
                        textBoxLineWidth: 1.0
                    }),

                    iris_twilight: makeTheme({
                        name: 'Iris Twilight',
                        fillDefault: 'rgba(210, 205, 240, 0.75)',
                        strokeDefault: 'rgba(60, 60, 120, 0.50)',
                        strokeWidthMul: 1.25,
                        shadow: { color: 'rgba(0,0,0,0.22)', blur: 7, offsetX: 2, offsetY: 3 },
                        useGradients: true,
                        fillA: 'rgba(170, 160, 220, 0.65)',
                        fillB: 'rgba(90, 80, 160, 0.55)',
                        dashedLines: [6, 4],
                        cornerRadiusPx: 12,
                        textFill: 'rgba(36, 36, 84, 0.95)',
                        textBoxFill: 'rgba(255, 255, 255, 0.88)',
                        textBoxStroke: 'rgba(60, 60, 120, 0.20)',
                        textBoxLineWidth: 1.0
                    }),

                    magnolia_cream: makeTheme({
                        name: 'Magnolia Cream',
                        fillDefault: 'rgba(250, 245, 235, 0.85)',
                        strokeDefault: 'rgba(120, 100, 70, 0.45)',
                        strokeWidthMul: 1.10,
                        shadow: { color: 'rgba(0,0,0,0.16)', blur: 6, offsetX: 2, offsetY: 3 },
                        useGradients: true,
                        fillA: 'rgba(255, 255, 245, 0.75)',
                        fillB: 'rgba(235, 225, 200, 0.65)',
                        dashedLines: null,
                        cornerRadiusPx: 14,
                        textFill: 'rgba(72, 60, 40, 0.95)',
                        textBoxFill: 'rgba(255, 255, 255, 0.92)',
                        textBoxStroke: 'rgba(120, 100, 70, 0.18)',
                        textBoxLineWidth: 1.0
                    }),

                    poppy_red: makeTheme({
                        name: 'Poppy Red',
                        fillDefault: 'rgba(255, 200, 190, 0.78)',
                        strokeDefault: 'rgba(150, 30, 30, 0.55)',
                        strokeWidthMul: 1.30,
                        shadow: { color: 'rgba(0,0,0,0.24)', blur: 7, offsetX: 2, offsetY: 3 },
                        useGradients: true,
                        fillA: 'rgba(255, 90, 90, 0.65)',
                        fillB: 'rgba(255, 220, 210, 0.65)',
                        dashedLines: [4, 4],
                        cornerRadiusPx: 12,
                        textFill: 'rgba(92, 20, 20, 0.96)',
                        textBoxFill: 'rgba(255, 255, 255, 0.88)',
                        textBoxStroke: 'rgba(150, 30, 30, 0.20)',
                        textBoxLineWidth: 1.0
                    }),

                    eucalyptus_bloom: makeTheme({
                        name: 'Eucalyptus Bloom',
                        fillDefault: 'rgba(215, 235, 230, 0.75)',
                        strokeDefault: 'rgba(70, 110, 105, 0.45)',
                        strokeWidthMul: 1.15,
                        shadow: { color: 'rgba(0,0,0,0.18)', blur: 6, offsetX: 2, offsetY: 3 },
                        useGradients: true,
                        fillA: 'rgba(170, 215, 210, 0.65)',
                        fillB: 'rgba(240, 250, 248, 0.70)',
                        dashedLines: [5, 6],
                        cornerRadiusPx: 14,
                        textFill: 'rgba(36, 72, 68, 0.95)',
                        textBoxFill: 'rgba(255, 255, 255, 0.90)',
                        textBoxStroke: 'rgba(70, 110, 105, 0.18)',
                        textBoxLineWidth: 1.0
                    })
                };

                return attachThemePaths('floral', themes);
            })(),

            tactical: (() => {

                const themes = {
                    black_ops: makeTheme({
                        name: 'Black Ops',
                        fillDefault: 'rgba(22, 24, 26, 0.80)',
                        strokeDefault: 'rgba(135, 145, 155, 0.55)',
                        strokeWidthMul: 1.60,
                        shadow: { color: 'rgba(0,0,0,0.45)', blur: 8, offsetX: 3, offsetY: 4 },
                        useGradients: true,
                        fillA: 'rgba(60, 64, 68, 0.55)',
                        fillB: 'rgba(10, 12, 14, 0.55)',
                        dashedLines: [2, 4],
                        cornerRadiusPx: 6,
                        textFill: 'rgba(240, 244, 248, 0.95)',
                        textBoxFill: 'rgba(0, 0, 0, 0.45)',
                        textBoxStroke: 'rgba(240, 244, 248, 0.14)',
                        textBoxLineWidth: 1.0
                    }),

                    night_vision: makeTheme({
                        name: 'Night Vision',
                        fillDefault: 'rgba(10, 18, 12, 0.82)',
                        strokeDefault: 'rgba(120, 255, 160, 0.35)',
                        strokeWidthMul: 1.45,
                        shadow: { color: 'rgba(0,0,0,0.55)', blur: 10, offsetX: 3, offsetY: 5 },
                        useGradients: true,
                        fillA: 'rgba(120, 255, 160, 0.18)',
                        fillB: 'rgba(10, 18, 12, 0.72)',
                        dashedLines: [7, 6],
                        cornerRadiusPx: 8,
                        textFill: 'rgba(210, 255, 225, 0.96)',
                        textBoxFill: 'rgba(0, 0, 0, 0.52)',
                        textBoxStroke: 'rgba(120, 255, 160, 0.18)',
                        textBoxLineWidth: 1.0
                    }),

                    desert_camo: makeTheme({
                        name: 'Desert Camo',
                        fillDefault: 'rgba(214, 198, 162, 0.78)',
                        strokeDefault: 'rgba(92, 79, 55, 0.55)',
                        strokeWidthMul: 1.35,
                        shadow: { color: 'rgba(0,0,0,0.25)', blur: 7, offsetX: 2, offsetY: 3 },
                        useGradients: true,
                        fillA: 'rgba(235, 221, 185, 0.68)',
                        fillB: 'rgba(132, 112, 80, 0.48)',
                        dashedLines: [4, 5],
                        cornerRadiusPx: 6,
                        textFill: 'rgba(46, 38, 26, 0.96)',
                        textBoxFill: 'rgba(255, 255, 255, 0.72)',
                        textBoxStroke: 'rgba(92, 79, 55, 0.22)',
                        textBoxLineWidth: 1.0
                    }),

                    woodland_camo: makeTheme({
                        name: 'Woodland Camo',
                        fillDefault: 'rgba(36, 56, 38, 0.78)',
                        strokeDefault: 'rgba(162, 186, 144, 0.35)',
                        strokeWidthMul: 1.40,
                        shadow: { color: 'rgba(0,0,0,0.40)', blur: 9, offsetX: 3, offsetY: 4 },
                        useGradients: true,
                        fillA: 'rgba(152, 216, 170, 0.22)',
                        fillB: 'rgba(36, 56, 38, 0.70)',
                        dashedLines: [5, 6],
                        cornerRadiusPx: 7,
                        textFill: 'rgba(236, 244, 230, 0.96)',
                        textBoxFill: 'rgba(0, 0, 0, 0.48)',
                        textBoxStroke: 'rgba(162, 186, 144, 0.18)',
                        textBoxLineWidth: 1.0
                    }),

                    arctic_ops: makeTheme({
                        name: 'Arctic Ops',
                        fillDefault: 'rgba(230, 238, 245, 0.72)',
                        strokeDefault: 'rgba(52, 76, 96, 0.45)',
                        strokeWidthMul: 1.45,
                        shadow: { color: 'rgba(0,0,0,0.18)', blur: 8, offsetX: 2, offsetY: 4 },
                        useGradients: true,
                        fillA: 'rgba(255, 255, 255, 0.65)',
                        fillB: 'rgba(120, 168, 210, 0.45)',
                        dashedLines: [2, 6],
                        cornerRadiusPx: 8,
                        textFill: 'rgba(18, 28, 38, 0.96)',
                        textBoxFill: 'rgba(255, 255, 255, 0.82)',
                        textBoxStroke: 'rgba(52, 76, 96, 0.18)',
                        textBoxLineWidth: 1.0
                    }),

                    urban_stealth: makeTheme({
                        name: 'Urban Stealth',
                        fillDefault: 'rgba(34, 38, 44, 0.82)',
                        strokeDefault: 'rgba(185, 195, 205, 0.40)',
                        strokeWidthMul: 1.55,
                        shadow: { color: 'rgba(0,0,0,0.50)', blur: 9, offsetX: 3, offsetY: 4 },
                        useGradients: true,
                        fillA: 'rgba(90, 98, 110, 0.40)',
                        fillB: 'rgba(20, 22, 26, 0.58)',
                        dashedLines: [3, 5],
                        cornerRadiusPx: 6,
                        textFill: 'rgba(240, 244, 248, 0.96)',
                        textBoxFill: 'rgba(0, 0, 0, 0.52)',
                        textBoxStroke: 'rgba(185, 195, 205, 0.16)',
                        textBoxLineWidth: 1.0
                    }),

                    comms_hud: makeTheme({
                        name: 'Comms HUD',
                        fillDefault: 'rgba(8, 12, 16, 0.80)',
                        strokeDefault: 'rgba(255, 193, 7, 0.55)',
                        strokeWidthMul: 1.50,
                        shadow: { color: 'rgba(0,0,0,0.55)', blur: 10, offsetX: 3, offsetY: 5 },
                        useGradients: true,
                        fillA: 'rgba(255, 193, 7, 0.18)',
                        fillB: 'rgba(8, 12, 16, 0.70)',
                        dashedLines: [12, 6],
                        cornerRadiusPx: 6,
                        textFill: 'rgba(255, 245, 220, 0.98)',
                        textBoxFill: 'rgba(0, 0, 0, 0.60)',
                        textBoxStroke: 'rgba(255, 193, 7, 0.20)',
                        textBoxLineWidth: 1.0
                    }),

                    red_team: makeTheme({
                        name: 'Red Team',
                        fillDefault: 'rgba(28, 10, 12, 0.84)',
                        strokeDefault: 'rgba(255, 64, 96, 0.45)',
                        strokeWidthMul: 1.55,
                        shadow: { color: 'rgba(0,0,0,0.55)', blur: 10, offsetX: 3, offsetY: 5 },
                        useGradients: true,
                        fillA: 'rgba(255, 64, 96, 0.18)',
                        fillB: 'rgba(28, 10, 12, 0.76)',
                        dashedLines: [6, 6],
                        cornerRadiusPx: 7,
                        textFill: 'rgba(255, 230, 236, 0.96)',
                        textBoxFill: 'rgba(0, 0, 0, 0.56)',
                        textBoxStroke: 'rgba(255, 64, 96, 0.18)',
                        textBoxLineWidth: 1.0
                    }),

                    blue_team: makeTheme({
                        name: 'Blue Team',
                        fillDefault: 'rgba(10, 16, 28, 0.84)',
                        strokeDefault: 'rgba(64, 160, 255, 0.45)',
                        strokeWidthMul: 1.55,
                        shadow: { color: 'rgba(0,0,0,0.55)', blur: 10, offsetX: 3, offsetY: 5 },
                        useGradients: true,
                        fillA: 'rgba(64, 160, 255, 0.18)',
                        fillB: 'rgba(10, 16, 28, 0.76)',
                        dashedLines: [6, 6],
                        cornerRadiusPx: 7,
                        textFill: 'rgba(232, 242, 255, 0.96)',
                        textBoxFill: 'rgba(0, 0, 0, 0.56)',
                        textBoxStroke: 'rgba(64, 160, 255, 0.18)',
                        textBoxLineWidth: 1.0
                    }),

                    breach_charge: makeTheme({
                        name: 'Breach Charge',
                        fillDefault: 'rgba(18, 18, 18, 0.86)',
                        strokeDefault: 'rgba(255, 120, 0, 0.60)',
                        strokeWidthMul: 1.70,
                        shadow: { color: 'rgba(0,0,0,0.60)', blur: 10, offsetX: 3, offsetY: 5 },
                        useGradients: true,
                        fillA: 'rgba(255, 120, 0, 0.20)',
                        fillB: 'rgba(18, 18, 18, 0.78)',
                        dashedLines: [3, 4],
                        cornerRadiusPx: 6,
                        textFill: 'rgba(255, 245, 235, 0.97)',
                        textBoxFill: 'rgba(0, 0, 0, 0.60)',
                        textBoxStroke: 'rgba(255, 120, 0, 0.20)',
                        textBoxLineWidth: 1.0
                    })
                };

                return attachThemePaths('beach', themes);
            })()

        };
        return resolve(ShapeGfxThemes)

    })
}
