function () {

    return new Promise(async (resolve, reject) => {
        let WellColorPallette = await exec('baja/plate/well-color-palette.js')
        let Icon = await exec('flexigraph/shapes/icon.js')
        function drawSquareBadge(ctx, cx, cy, size, fillStyle, strokeStyle, scaleFactor) {
            const half = size / 2;
            const x = cx - half;
            const y = cy - half;

            ctx.save();

            ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
            ctx.shadowBlur = 6 * scaleFactor;
            ctx.shadowOffsetX = 2 * scaleFactor;
            ctx.shadowOffsetY = 2 * scaleFactor;

            ctx.fillStyle = fillStyle;
            ctx.fillRect(x, y, size, size);

            ctx.shadowColor = "rgba(0,0,0,0)";
            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;

            if (strokeStyle) {
                ctx.strokeStyle = strokeStyle;
                ctx.lineWidth = Math.max(1, 1 * scaleFactor);
                ctx.strokeRect(x, y, size, size);
            }

            ctx.restore();
        }

        const _isValidCharForSanitizedName = (ch) => /^[A-Za-z0-9_]$/.test(ch);

        const _textWidth = (ctx, s) => ctx.measureText(s).width;

        function _runsFromChars(chars, validColor, invalidColor) {
            const runs = [];
            if (!chars.length) return runs;
            let currentColor = chars[0].valid ? validColor : invalidColor;
            let buf = '';

            for (let i = 0; i < chars.length; i++) {
                const ch = chars[i].ch;
                const color = chars[i].valid ? validColor : invalidColor;
                if (color !== currentColor) {
                    runs.push({ text: buf, color: currentColor });
                    buf = ch;
                    currentColor = color;
                } else {
                    buf += ch;
                }
            }
            if (buf) runs.push({ text: buf, color: currentColor });
            return runs;
        }

        function _layoutColoredLines(ctx, text, maxWidth, maxHeight, fontPt, lineHeightMult) {
            ctx.font = `bold ${fontPt}pt Arial`;
            const lineHeight = fontPt * lineHeightMult;
            const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));

            const all = Array.from(text || '').map(ch => ({ ch, valid: _isValidCharForSanitizedName(ch) }));

            const lines = [];
            let lineChars = [];
            let lineStr = '';
            let lastBreakIdx = -1;

            const isBreakable = (ch) => /\s/.test(ch);

            let i = 0;
            while (i < all.length) {
                const next = all[i];
                const tryStr = lineStr + next.ch;

                if (_textWidth(ctx, tryStr) > maxWidth && lineStr.length > 0) {

                    let breakPos = lastBreakIdx >= 0 ? lastBreakIdx : (lineStr.length - 1);

                    const pushCount = lastBreakIdx >= 0 ? breakPos : (breakPos + 1);
                    const toPush = lineChars.slice(0, pushCount);
                    if (toPush.length) lines.push(toPush);

                    const remainder = lineChars.slice(pushCount + (lastBreakIdx >= 0 ? 1 : 0));
                    lineChars = remainder;
                    lineStr = remainder.map(c => c.ch).join('');
                    lastBreakIdx = -1;
                    for (let k = 0; k < lineChars.length; k++) {
                        if (isBreakable(lineChars[k].ch)) lastBreakIdx = k;
                    }

                    if (lines.length >= maxLines) break;
                } else {

                    lineChars.push(next);
                    lineStr = tryStr;
                    if (isBreakable(next.ch)) lastBreakIdx = lineChars.length - 1;
                    i++;
                }
            }

            if (lineChars.length && lines.length < maxLines) lines.push(lineChars);

            let truncated = (i < all.length) || (lines.length > maxLines);
            if (lines.length > maxLines) lines.length = maxLines;

            if (truncated && lines.length) {

                let last = lines[lines.length - 1].slice();
                const ellipsis = '…';

                while (last.length && /\s/.test(last[last.length - 1].ch)) last.pop();

                while (last.length && (_textWidth(ctx, last.map(c => c.ch).join('') + ellipsis) > maxWidth)) {
                    last.pop();
                    while (last.length && /\s/.test(last[last.length - 1].ch)) last.pop();
                }

                if (!last.length && _textWidth(ctx, ellipsis) > maxWidth) {

                } else {
                    last.push({ ch: ellipsis, valid: true });
                    lines[lines.length - 1] = last;
                }
            }

            const fitsHeight = !truncated && (lines.length * lineHeight <= maxHeight + 0.0001);

            return { lines, lineHeight, maxLines, fitsHeight, truncated };
        }

        function drawPunchyArrow(ctx, x, y, w, h, opts = {}) {
            const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
            const arrowDepthPct = clamp(opts.arrowDepthPct ?? 0.10, 0.05, 0.35);

            const shaftLen = clamp(h * 0.85, 14, 54);
            const headSize = clamp(h * 0.55, 10, 30);
            const thickness = clamp(h * 0.28, 3, 14);
            const innerPad = clamp(h * 0.12, 3, 12);

            const tipX = clamp(
                x + w * arrowDepthPct,
                x + innerPad + headSize,
                x + w - innerPad - headSize
            );
            const tipY = y + h / 2;

            const shaftEndX = tipX - headSize;
            const startX = Math.max(x + innerPad, shaftEndX - shaftLen);
            const startY = tipY;
            const halfT = thickness / 2;

            const pathShaft = () => {
                ctx.beginPath();
                ctx.moveTo(startX, startY - halfT);
                ctx.lineTo(shaftEndX, startY - halfT);
                ctx.arc(shaftEndX, startY, halfT, -Math.PI / 2, Math.PI / 2);
                ctx.lineTo(startX, startY + halfT);
                ctx.arc(startX, startY, halfT, Math.PI / 2, -Math.PI / 2, true);
                ctx.closePath();
            };
            const pathHead = () => {
                ctx.beginPath();
                ctx.moveTo(tipX, tipY);
                ctx.lineTo(shaftEndX, tipY - headSize * 0.7);
                ctx.lineTo(shaftEndX, tipY + headSize * 0.7);
                ctx.closePath();
            };

            ctx.save();
            ctx.shadowColor = 'rgba(0,0,0,0.55)';
            ctx.shadowBlur = clamp(h * 0.22, 4, 16);
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = clamp(h * 0.08, 1, 8);
            ctx.fillStyle = '#FFE769';
            pathShaft(); ctx.fill();
            pathHead(); ctx.fill();
            ctx.restore();

            ctx.save();
            ctx.fillStyle = '#8cff00ff';
            ctx.strokeStyle = '#0b0904ff';
            ctx.lineWidth = clamp(thickness * 0.33, 1.5, 3);
            pathShaft(); ctx.fill(); ctx.stroke();
            pathHead(); ctx.fill(); ctx.stroke();

            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = clamp(thickness * 0.18, 1, 2);
            ctx.beginPath();
            ctx.moveTo(tipX - headSize * 0.15, tipY - headSize * 0.58);
            ctx.lineTo(tipX, tipY);
            ctx.lineTo(tipX - headSize * 0.15, tipY + headSize * 0.58);
            ctx.stroke();
            ctx.restore();
        }

        Input_Percent: (graph, grid, ctx, min, max, x, y, well) => {
            const safeNumber = (v, f = 0) => typeof v === 'number' && !isNaN(v) ? v : f;
            const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
            const cellPadding = 6;
            const inset = 2;

            let screen_x = safeNumber(graph.X(grid.X(well.x)));
            let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
            let screen_width = safeNumber(well.__screen_width, 30);
            let screen_height = safeNumber(well.__screen_height, 30);

            const maxCellSize = 60;
            const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;
            const cornerRadius = clamp(screen_height * 0.12, 3, 12);

            drawInputFieldWithRedBorder(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius, well);

            drawPunchyArrow(ctx, screen_x, screen_y, screen_width, screen_height, {
                arrowDepthPct: 0.10
            });

            let raw = 100 * parseFloat((well.value || "").toString().replace(/[^\d.-]/g, ''));
            if (isNaN(raw)) raw = 0;

            let text = new Intl.NumberFormat('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }).format(raw) + '%';

            const textBias = Math.min(0.18 * screen_width, 22);
            const fontSize = Math.max(11 * scaleFactor, 9);

            ctx.font = `${fontSize}pt Arial`;
            ctx.fillStyle = well.fgcolor || 'black';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const maxTextWidth = screen_width - 2 * (cellPadding + inset) - textBias;
            while (ctx.measureText(text + '...').width > maxTextWidth && text.length > 0) text = text.slice(0, -1);
            if (ctx.measureText(text).width > maxTextWidth) text += "...";

            ctx.fillText(text, screen_x + screen_width / 2 + textBias / 2, screen_y + screen_height / 2);
        }

        const drawInputFieldWithRedBorder = (ctx, x, y, width, height, radius, well) => {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();

            ctx.fillStyle = well.select ? "#FF7F7F" : 'white';

            ctx.fill();

            ctx.strokeStyle = 'red';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        };

        function generateRandomRGBAColor() {
            const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
            const randomFloat = (min, max) => (Math.random() * (max - min) + min).toFixed(2);

            const red = randomInt(0, 255);
            const green = randomInt(0, 255);
            const blue = randomInt(0, 255);
            const alpha = randomFloat(0.2, 0.8);

            return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
        }

        const drawInputField = (ctx, x, y, width, height, radius, well) => {
            const isSelected = well.select;

            ctx.fillStyle = isSelected ? '#d7fbe5' : (well.color || '#f9f9f9');
            ctx.strokeStyle = isSelected ? '#00cc99' : 'blue';

            ctx.lineWidth = isSelected ? 2 : 1;
            ctx.shadowBlur = 0;

            drawRoundedRect(ctx, x, y, width, height, radius);
            ctx.fill();
            ctx.stroke();
        };

        const createDisplayWithUnit = (unitLabel = '', options = {}) => {
            return (graph, grid, ctx, min, max, x, y, well) => {
                const safeNumber = (v, fallback = 0) => typeof v === 'number' && !isNaN(v) ? v : fallback;

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;
                let fontSize = 11 * scaleFactor;
                if (fontSize < 9) fontSize = 11;

                ctx.fillStyle = well.select ? 'magenta' : 'white';
                ctx.strokeStyle = 'transparent';
                ctx.lineWidth = 0;
                ctx.shadowBlur = 0;

                const cornerRadius = 4 * scaleFactor;
                drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius);
                ctx.fill();

                let raw = parseFloat((well.value || "").toString().replace(/[^\d.-]/g, ''));
                if (isNaN(raw)) raw = 0;

                let formatted = raw % 1 === 0 ? raw.toFixed(0) : raw.toFixed(2);

                if (options.abbreviate) {
                    const abs = Math.abs(raw);
                    if (abs >= 1e12) formatted = (raw / 1e12).toFixed(2) + 'T';
                    else if (abs >= 1e9) formatted = (raw / 1e9).toFixed(2) + 'B';
                    else if (abs >= 1e6) formatted = (raw / 1e6).toFixed(2) + 'M';
                    else if (abs >= 1e3) formatted = (raw / 1e3).toFixed(2) + 'K';
                }

                let text = formatted + (unitLabel ? ` ${unitLabel}` : '');

                ctx.font = `${fontSize}pt Arial`;
                ctx.fillStyle = '#003300';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                ctx.fillText(text, screen_x + screen_width / 2, screen_y + screen_height / 2);
            };
        };

        const createInputWithUnit = (unitLabel = '', options = {}) => {
            return (graph, grid, ctx, min, max, x, y, well) => {
                let cellPadding = 6;
                const safeNumber = (v, fallback = 0) => typeof v === 'number' && !isNaN(v) ? v : fallback;

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;
                let fontSize = 11 * scaleFactor;
                if (fontSize < 9) fontSize = 11;

                const cornerRadius = 4 * scaleFactor;
                drawInputField(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius, well);
                drawPunchyArrow(ctx, screen_x, screen_y, screen_width, screen_height, {
                    arrowDepthPct: 0.10
                });

                let raw = parseFloat((well.value || "").toString().replace(/[^\d.-]/g, ''));
                if (isNaN(raw)) raw = 0;

                let formatted = raw.toFixed(2);
                if (options.abbreviate) {
                    const abs = Math.abs(raw);
                    if (abs >= 1e12) formatted = (raw / 1e12).toFixed(2) + 'T';
                    else if (abs >= 1e9) formatted = (raw / 1e9).toFixed(2) + 'B';
                    else if (abs >= 1e6) formatted = (raw / 1e6).toFixed(2) + 'M';
                    else if (abs >= 1e3) formatted = (raw / 1e3).toFixed(2) + 'K';
                }

                let text = formatted + (unitLabel ? ` ${unitLabel}` : '');

                ctx.font = `${fontSize}pt Arial`;
                ctx.fillStyle = well.fgcolor || 'black';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                const maxTextWidth = screen_width - 2 * cellPadding;
                while (ctx.measureText(text + '...').width > maxTextWidth && text.length > 0) {
                    text = text.slice(0, -1);
                }
                if (ctx.measureText(text).width > maxTextWidth) text += "...";

                ctx.fillText(text, screen_x + cellPadding, screen_y + screen_height / 2);
            };
        };

        const truncateTextCached = (() => {
            const cache = new Map();

            return function (text, maxWidth, ctx) {
                const cacheKey = `${ctx.font}_${text}_${maxWidth}`;
                if (cache.has(cacheKey)) {
                    return cache.get(cacheKey);
                }

                let truncated = text;

                if (ctx.measureText(text).width <= maxWidth) {
                    cache.set(cacheKey, truncated);
                    return truncated;
                }

                while (truncated.length > 0 && ctx.measureText(truncated + '…').width > maxWidth) {
                    truncated = truncated.slice(0, -1);
                }

                truncated += '…';
                cache.set(cacheKey, truncated);
                return truncated;
            };
        })();

        function drawRoundedRect(ctx, x, y, width, height, radius) {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.arcTo(x + width, y, x + width, y + radius, radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
            ctx.lineTo(x + radius, y + height);
            ctx.arcTo(x, y + height, x, y + height - radius, radius);
            ctx.lineTo(x, y + radius);
            ctx.arcTo(x, y, x + radius, y, radius);
            ctx.closePath();
        }

        function calculateFontSize(screenWidth, screenHeight, text, ctx) {
            if (typeof text === 'number') {
                text = text.toFixed(2);
            } else if (typeof text === 'string') {
                text = text.trim();
            }
            let fontSize = 20;
            ctx.font = `${fontSize}px Arial`;
            let textWidth = ctx.measureText(text).width;
            while (textWidth > screenWidth * 0.9 || fontSize > screenHeight * 0.9) {
                fontSize--;
                ctx.font = `${fontSize}px Arial`;
                textWidth = ctx.measureText(text).width;
            }
            return fontSize;
        }

        function truncateTextToFit(text, screenWidth, ctx) {
            let textWidth = ctx.measureText(text).width;
            let ellipsis = '...';

            if (textWidth > screenWidth) {
                while (ctx.measureText(text + ellipsis).width > screenWidth) {
                    text = text.slice(0, -1);
                }
                return text + ellipsis;
            }
            return text;
        }

        const truncateText = (text, maxWidth, ctx) => {
            let safeText = text || '';
            let truncated = safeText;
            while (ctx.measureText(truncated).width > maxWidth && truncated.length > 0) {
                truncated = truncated.slice(0, -1);
            }
            return truncated + (truncated.length < safeText.length ? '...' : '');
        };

        function addAliases(targetMap, aliasSpec, { overwrite = false } = {}) {

            const norm = (s) => String(s).toLowerCase().replace(/[\s\-_]+/g, '');
            const byNorm = new Map();

            Object.keys(targetMap).forEach(k => byNorm.set(norm(k), k));

            for (const [canonical, aliases] of Object.entries(aliasSpec)) {
                const canonNorm = norm(canonical);
                const canonKey = byNorm.get(canonNorm) || canonical;

                if (!targetMap[canonKey]) {
                    console.warn(`[alias] canonical "${canonical}" not found; skipping its aliases.`);
                    continue;
                }
                for (const alias of [].concat(aliases)) {
                    const aliasNorm = norm(alias);
                    const existing = byNorm.get(aliasNorm);

                    if (existing && !overwrite) continue;
                    targetMap[alias] = targetMap[canonKey];
                    byNorm.set(aliasNorm, alias);
                }
            }
        }

        const safeNumber = (value, fallback = 0) =>
            (typeof value === 'number' && !isNaN(value)) ? value :
                (typeof value === 'string' && value.trim() !== '' && !isNaN(+value)) ? +value :
                    fallback;

        let t = {

            'VideoLink': (graph, grid, ctx, min, max, x, y, well) => {
                if (!ctx || well.name == null) return;

                let offset = 0;
                const wellWidth = graph.screenWidth(grid.screenWidth(1));
                const wellHeight = graph.screenHeight(grid.screenHeight(1));

                if (wellHeight < 5 || wellWidth < 10) return;

                const posX = graph.X(grid.X(x)) + offset;
                const posY = graph.Y(grid.Y(y)) + offset;
                const centerX = posX + wellWidth / 2;
                const centerY = posY + wellHeight / 2;

                const scaleFactor = Math.min(wellWidth, wellHeight) / 20;
                let fontSize = Math.max(7, 8 * scaleFactor);
                ctx.font = `${fontSize}pt Arial`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";

                ctx.fillStyle = well.group && WellColorPallette[well.group]
                    ? WellColorPallette[well.group]
                    : "rgba(220,220,220,0.3)";
                ctx.fillRect(posX, posY, wellWidth - offset * 2, wellHeight - offset);
                ctx.stroke();

                if (well.select) {
                    ctx.fillStyle = "hsla(254, 100.00%, 51.40%, 0.70)";
                    ctx.fillRect(posX, posY, wellWidth - offset, wellHeight - offset);
                    ctx.stroke();
                }

                if (well.value != null) {
                    ctx.fillStyle = "black";
                    let displayValue = typeof well.value === "string"
                        ? well.value
                        : parseFloat(well.value).toFixed(2);

                    let truncated = displayValue;
                    const maxWidth = wellWidth - 16;

                    if (ctx.measureText(truncated).width > maxWidth) {
                        while (ctx.measureText(truncated + '...').width > maxWidth && truncated.length > 0) {
                            truncated = truncated.slice(0, -1);
                        }
                        truncated += '...';
                    }

                    ctx.fillText(truncated, centerX, centerY);
                }

                if (wellWidth < 55) {
                    offset = 1;
                } else {
                    ctx.fillStyle = "black";
                    ctx.stroke();
                }

                if (well.obj) {
                    const iconSize = Math.min(wellWidth, wellHeight) * 0.5;
                    const iconX = posX + wellWidth - iconSize - 2;
                    const iconY = posY + (wellHeight - iconSize) / 2;

                    ctx.fillStyle = "red";
                    ctx.beginPath();
                    ctx.roundRect(iconX, iconY, iconSize, iconSize, 3);
                    ctx.fill();

                    ctx.fillStyle = "white";
                    const triangleSize = iconSize * 0.5;
                    const triX = iconX + iconSize / 2.2;
                    const triY = iconY + iconSize / 2;
                    ctx.beginPath();
                    ctx.moveTo(triX - triangleSize / 2, triY - triangleSize / 1.5);
                    ctx.lineTo(triX + triangleSize / 2, triY);
                    ctx.lineTo(triX - triangleSize / 2, triY + triangleSize / 1.5);
                    ctx.closePath();
                    ctx.fill();
                }
            },

            PERCENT: (graph, grid, ctx, min, max, x, y, well) => {
                if (!graph || !grid || !ctx || !well) return;
                const safeNumber = (v, fb = 0) =>
                    (typeof v === 'number' && !isNaN(v)) ? v
                        : (typeof v === 'string' && v.trim() !== '' && !isNaN(+v)) ? +v
                            : fb;

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const scaleFactor = Math.min(screen_width, screen_height) / 60;

                ctx.fillStyle = well.select ? 'magenta' : (well.color || 'white');
                ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                ctx.lineWidth = 1 * scaleFactor;
                ctx.shadowBlur = 0;
                drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, 10);
                ctx.fill();
                ctx.stroke();

                if (well.icon) {
                    if (typeof well.icon.draw !== 'function') {
                        try {
                            well.icon = Icon.buildFromJSON(well.icon);
                        } catch {
                            well.icon = null;
                        }
                    }
                    if (well.icon?.draw) {
                        well.icon.x = grid.X(x);
                        well.icon.y = grid.Y(y);
                        well.icon.w = graph.worldWidth(screen_width);
                        well.icon.h = graph.worldHeight(screen_height);
                        try { well.icon.draw(graph, ctx); } catch {  }
                    }
                }

                const raw = safeNumber(well.value * 100, 0);
                const v = raw;
                const r = Math.round(255 * (1 - v / 100));
                const g = Math.round(255 * (v / 100));
                const fill = `rgb(${r},${g},80)`;

                const label = `${raw.toFixed(2)}%`;
                const cx = screen_x + screen_width / 2;
                const cy = screen_y + screen_height / 2;

                let baseFontSize = Math.max(9, 12 * scaleFactor);

                const applyFontSize = (size) => {
                    if (well.font) {
                        ctx.font = `${size}px ${well.font}`;
                    } else {
                        ctx.font = `${size}pt Arial`;
                    }
                };

                let displayValue = label;
                let testFontSize = baseFontSize;
                const maxWidth = screen_width * 0.85;
                const maxHeight = screen_height * 0.85;

                while (true) {
                    applyFontSize(testFontSize);
                    const m = ctx.measureText(displayValue);

                    const textWidth = m.width;
                    const ascent = m.actualBoundingBoxAscent ?? testFontSize;
                    const descent = m.actualBoundingBoxDescent ?? (testFontSize * 0.25);
                    const textHeight = ascent + descent;

                    if (textWidth > maxWidth || textHeight > maxHeight) {
                        testFontSize = Math.max(6, testFontSize - 1);
                        applyFontSize(testFontSize);
                        break;
                    }

                    testFontSize += 1;

                    if (testFontSize >= screen_height) {
                        testFontSize = screen_height;
                        applyFontSize(testFontSize);
                        break;
                    }
                }

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = well.fgcolor || fill;

                const finalText = truncateTextCached(displayValue, screen_width - 10, ctx);

                ctx.fillText(finalText, cx, cy);
            }

            ,

            'INTEGER': (graph, grid, ctx, min, max, x, y, well) => {
                if (!graph || !grid || !ctx || !well) return;
                const safeNumber = (v, fb = 0) => (typeof v === 'number' && !isNaN(v)) ? v
                    : (typeof v === 'string' && v.trim() !== '' && !isNaN(+v)) ? +v : fb;

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const scaleFactor = Math.min(screen_width, screen_height) / 60;
                ctx.fillStyle = well.select ? 'magenta' : (well.color || 'white');
                ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                ctx.lineWidth = 1 * scaleFactor;
                drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, 10);
                ctx.fill(); ctx.stroke();

                if (well.icon) {
                    if (typeof well.icon.draw !== 'function') {
                        try { well.icon = Icon.buildFromJSON(well.icon); } catch { well.icon = null; }
                    }
                    if (well.icon?.draw) {
                        well.icon.x = grid.X(x); well.icon.y = grid.Y(y);
                        well.icon.w = graph.worldWidth(screen_width); well.icon.h = graph.worldHeight(screen_height);
                        try { well.icon.draw(graph, ctx); } catch { }
                    }
                }

                const n = Math.trunc(safeNumber(well.value, 0));
                const text = new Intl.NumberFormat('en-US').format(n);
                const fontSize = Math.max(10, 14 * scaleFactor);
                ctx.font = `bold ${fontSize}pt Arial`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillStyle = (n < 0) ? (well.negColor || 'crimson') : (well.fgcolor || 'black');
                const cx = screen_x + screen_width / 2, cy = screen_y + screen_height / 2;
                ctx.fillText(truncateTextCached(text, screen_width - 10, ctx), cx, cy);
            },

            'HEATMAP': (graph, grid, ctx, min, max, x, y, well) => {
                if (!graph || !grid || !ctx || !well) return;
                const safeNumber = (v, fb = 0) => (typeof v === 'number' && !isNaN(v)) ? v
                    : (typeof v === 'string' && v.trim() !== '' && !isNaN(+v)) ? +v : fb;

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const scaleFactor = Math.min(screen_width, screen_height) / 60;
                const v = safeNumber(well.value, 0);
                const lo = (typeof min === 'number') ? min : 0;
                const hi = (typeof max === 'number') ? max : 1;
                const t = hi > lo ? Math.max(0, Math.min(1, (v - lo) / (hi - lo))) : 0;
                const r = Math.round(255 * t);
                const b = Math.round(255 * (1 - t));
                ctx.fillStyle = well.select ? 'magenta' : `rgba(${r},80,${b},0.85)`;
                ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                ctx.lineWidth = 1 * scaleFactor;
                drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, 10);
                ctx.fill(); ctx.stroke();

                if (well.icon) {
                    if (typeof well.icon.draw !== 'function') {
                        try { well.icon = Icon.buildFromJSON(well.icon); } catch { well.icon = null; }
                    }
                    if (well.icon?.draw) {
                        well.icon.x = grid.X(x); well.icon.y = grid.Y(y);
                        well.icon.w = graph.worldWidth(screen_width); well.icon.h = graph.worldHeight(screen_height);
                        try { well.icon.draw(graph, ctx); } catch { }
                    }
                }

                const text = (well.label ?? well.text ?? (v + '')).toString();
                if (text) {
                    const fontSize = Math.max(9, 11 * scaleFactor);
                    ctx.font = `bold ${fontSize}pt Arial`;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillStyle = well.fgcolor || 'white';
                    ctx.fillText(truncateTextCached(text, screen_width - 10, ctx), screen_x + screen_width / 2, screen_y + screen_height / 2);
                }
            },

            "CONTROL": (graph, grid, ctx, min, max, x, y, well) => {
                if (!graph || !grid || !ctx || !well) return;
                const safeNumber = (v, fb = 0) =>
                    (typeof v === 'number' && !isNaN(v)) ? v
                        : (typeof v === 'string' && v.trim() !== '' && !isNaN(+v)) ? +v : fb;

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const scaleFactor = Math.min(screen_width, screen_height) / 60;

                ctx.fillStyle = well.select ? 'magenta' : 'rgba(255, 255, 180, 0.95)';
                ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                ctx.lineWidth = 1 * scaleFactor;
                drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, 10);
                ctx.fill();
                ctx.stroke();

                if (well.icon) {
                    if (typeof well.icon.draw !== 'function') {
                        try { well.icon = Icon.buildFromJSON(well.icon); } catch { well.icon = null; }
                    }
                    if (well.icon?.draw) {
                        well.icon.x = grid.X(x);
                        well.icon.y = grid.Y(y);
                        well.icon.w = graph.worldWidth(screen_width);
                        well.icon.h = graph.worldHeight(screen_height);
                        try { well.icon.draw(graph, ctx); } catch { }
                    }
                }

                const text = (well.label ?? well.text ?? (well.value ?? '')).toString();
                if (text) {
                    const fontSize = Math.max(9, 11 * scaleFactor);
                    ctx.font = `bold ${fontSize}pt Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = well.fgcolor || 'black';
                    ctx.fillText(
                        truncateTextCached(text, screen_width - 10, ctx),
                        screen_x + screen_width / 2,
                        screen_y + screen_height / 2
                    );
                }
            },

            'PROGRESS': (graph, grid, ctx, min, max, x, y, well) => {
                if (!graph || !grid || !ctx || !well) return;
                const safeNumber = (v, fb = 0) => (typeof v === 'number' && !isNaN(v)) ? v
                    : (typeof v === 'string' && v.trim() !== '' && !isNaN(+v)) ? +v : fb;

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const scaleFactor = Math.min(screen_width, screen_height) / 60;
                ctx.fillStyle = well.select ? 'magenta' : (well.color || 'white');
                ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                ctx.lineWidth = 1 * scaleFactor;
                drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, 10);
                ctx.fill(); ctx.stroke();

                const pct = Math.max(0, Math.min(100, safeNumber(well.value, 0)));
                const barPad = Math.max(3, 4 * scaleFactor);
                const barH = Math.max(6, screen_height * 0.35);
                const barW = (screen_width - barPad * 2) * (pct / 100);
                const barX = screen_x + barPad;
                const barY = screen_y + (screen_height - barH) / 2;

                ctx.fillStyle = 'rgba(0,0,0,0.08)';
                drawRoundedRect(ctx, barX, barY, screen_width - barPad * 2, barH, barH / 2);
                ctx.fill();

                ctx.fillStyle = well.barColor || '#3a87f3';
                drawRoundedRect(ctx, barX, barY, barW, barH, barH / 2);
                ctx.fill();

                const label = `${pct.toFixed(0)}%`;
                const fontSize = Math.max(9, 10 * scaleFactor);
                ctx.font = `bold ${fontSize}pt Arial`;
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillStyle = well.fgcolor || 'black';
                ctx.fillText(label, screen_x + screen_width / 2, screen_y + screen_height / 2);
            },

            'BOOL': (graph, grid, ctx, min, max, x, y, well) => {
                if (!graph || !grid || !ctx || !well) return;
                const safeBool = v => !!(v === true || v === 'true' || v === 1 || v === '1');

                let sx = graph.X(grid.X(well.x)), sy = graph.Y(grid.Y(well.y));
                let sw = well.__screen_width ?? 30, sh = well.__screen_height ?? 30;
                const scaleFactor = Math.min(sw, sh) / 60;

                ctx.fillStyle = well.select ? 'magenta' : (well.color || 'white');
                ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                ctx.lineWidth = 1 * scaleFactor;
                drawRoundedRect(ctx, sx, sy, sw, sh, 10); ctx.fill(); ctx.stroke();

                const boxSize = Math.min(sw, sh) * 0.55;
                const bx = sx + (sw - boxSize) / 2, by = sy + (sh - boxSize) / 2;
                ctx.strokeStyle = 'black'; ctx.lineWidth = 2 * scaleFactor;
                drawRoundedRect(ctx, bx, by, boxSize, boxSize, 6 * scaleFactor); ctx.stroke();

                if (safeBool(well.value)) {
                    ctx.beginPath();
                    ctx.lineWidth = 3 * scaleFactor;
                    ctx.strokeStyle = well.fgcolor || '#2ecc71';

                    ctx.moveTo(bx + boxSize * 0.2, by + boxSize * 0.55);
                    ctx.lineTo(bx + boxSize * 0.45, by + boxSize * 0.75);
                    ctx.lineTo(bx + boxSize * 0.8, by + boxSize * 0.3);
                    ctx.stroke();
                }
            },

            'DATE': (graph, grid, ctx, min, max, x, y, well) => {
                if (!graph || !grid || !ctx || !well) return;

                const toDateStr = (v) => {
                    try {
                        const d = (v instanceof Date) ? v : new Date(v);
                        if (isNaN(d.getTime())) return null;
                        const yyyy = d.getFullYear();
                        const dd = String(d.getDate()).padStart(2, '0');
                        const MMM = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()];

                        return `${yyyy}-${MMM}-${dd}`;
                    } catch { return null; }
                };

                let sx = graph.X(grid.X(well.x)), sy = graph.Y(grid.Y(well.y));
                let sw = well.__screen_width ?? 30, sh = well.__screen_height ?? 30;

                const scaleFactor = Math.min(sw, sh) / 60;
                ctx.fillStyle = well.select ? 'magenta' : (well.color || 'white');
                ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                ctx.lineWidth = 1 * scaleFactor;
                drawRoundedRect(ctx, sx, sy, sw, sh, 10); ctx.fill(); ctx.stroke();

                const text = toDateStr(well.value) ?? String(well.value ?? '');
                if (!text) return;

                const fs = Math.max(9, 10 * scaleFactor);
                ctx.font = `${fs}pt Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = well.fgcolor || 'black';
                ctx.fillText(truncateTextCached(text, sw - 10, ctx), sx + sw / 2, sy + sh / 2);
            },

            'BADGE': (graph, grid, ctx, min, max, x, y, well) => {
                if (!graph || !grid || !ctx || !well) return;
                let sx = graph.X(grid.X(well.x)), sy = graph.Y(grid.Y(well.y));
                let sw = well.__screen_width ?? 30, sh = well.__screen_height ?? 30;

                const scaleFactor = Math.min(sw, sh) / 60;
                ctx.fillStyle = well.select ? 'magenta' : (well.color || 'white');
                ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                ctx.lineWidth = 1 * scaleFactor;
                drawRoundedRect(ctx, sx, sy, sw, sh, 10); ctx.fill(); ctx.stroke();

                const label = (well.value ?? '').toString();
                if (!label) return;

                const pad = 6 * scaleFactor;
                const fs = Math.max(8, 10 * scaleFactor);
                ctx.font = `bold ${fs}pt Arial`;

                const textW = ctx.measureText(label).width;
                const bw = Math.min(sw - pad * 2, textW + pad * 2);
                const bh = Math.min(sh - pad * 2, fs + pad * 1.5);
                const bx = sx + (sw - bw) / 2, by = sy + (sh - bh) / 2;

                ctx.fillStyle = well.badgeColor || '#6c5ce7';
                drawRoundedRect(ctx, bx, by, bw, bh, bh / 2);
                ctx.fill();

                ctx.fillStyle = well.fgcolor || 'white';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(truncateTextCached(label, bw - pad * 2, ctx), bx + bw / 2, by + bh / 2);
            },
            'BUTTON': (graph, grid, ctx, min, max, x, y, well) => {
                if (!graph || !grid || !ctx || !well) return;

                const sx = graph.X(grid.X(well.x)), sy = graph.Y(grid.Y(well.y));
                const sw = well.__screen_width ?? 74, sh = well.__screen_height ?? 32;

                const scale = Math.min(sw, sh) / 60;
                const radius = Math.min(sw, sh) * 0.28;
                const padX = Math.max(8, 10 * scale);
                const padY = Math.max(4, 6 * scale);

                const label = (well.value ?? '').toString();
                if (!label) return;

                const base = well.color || '#4c6fff';
                const textColor = well.fgcolor || '#ffffff';
                const disabled = !!well.disabled;

                const shade = (hex, pct) => {

                    let c = hex.replace('#', '');
                    if (c.length === 3) c = c.split('').map(ch => ch + ch).join('');
                    const n = (i) => {
                        const v = parseInt(c.slice(i, i + 2), 16);
                        const t = pct < 0 ? v * (1 + pct) : v + (255 - v) * pct;
                        return Math.max(0, Math.min(255, Math.round(t)));
                    };
                    return `rgb(${n(0)}, ${n(2)}, ${n(4)})`;
                };

                const baseDark = shade(base, -0.28);
                const baseLight = shade(base, 0.22);
                const borderCol = shade(base, -0.40);
                const innerGlow = 'rgba(255,255,255,0.35)';
                const shadowCol = 'rgba(0,0,0,0.28)';
                const focusRing = 'rgba(76, 102, 255, 0.55)';

                const rounded = (x, y, w, h, r) => drawRoundedRect(ctx, x, y, w, h, Math.min(r, h / 2, w / 2));

                const bx = sx, by = sy, bw = sw, bh = sh;

                ctx.save();
                if (!disabled) {
                    ctx.shadowColor = shadowCol;
                    ctx.shadowBlur = 6 * scale;
                    ctx.shadowOffsetY = 2 * scale;
                }

                const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
                grad.addColorStop(0, baseLight);
                grad.addColorStop(0.5, base);
                grad.addColorStop(1, baseDark);

                ctx.fillStyle = grad;
                ctx.strokeStyle = borderCol;
                ctx.lineWidth = 1.25 * scale;
                rounded(bx, by, bw, bh, radius);
                ctx.fill();
                ctx.shadowColor = 'transparent';
                ctx.stroke();

                const inset = Math.max(1.25, 2 * scale);
                ctx.beginPath();
                rounded(bx + inset, by + inset, bw - inset * 2, Math.max(2, bh * 0.45), radius - inset);
                ctx.strokeStyle = innerGlow;
                ctx.lineWidth = 1 * scale;
                ctx.stroke();

                if (well.select && !disabled) {
                    const fr = Math.max(2, 3 * scale);
                    ctx.beginPath();
                    ctx.strokeStyle = focusRing;
                    ctx.lineWidth = fr;

                    rounded(bx - fr, by - fr, bw + fr * 2, bh + fr * 2, radius + fr);
                    ctx.stroke();
                }

                if (disabled) {
                    ctx.fillStyle = 'rgba(255,255,255,0.45)';
                    rounded(bx, by, bw, bh, radius);
                    ctx.fill();
                }

                const fsPt = Math.max(9, 11 * scale);
                ctx.font = `600 ${fsPt}pt Arial`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = disabled ? 'rgba(255,255,255,0.75)' : textColor;

                const maxTextW = bw - padX * 2;
                const display = truncateTextCached(label, maxTextW, ctx);

                ctx.fillText(display, bx + bw / 2, by + bh / 2 + (0.5 * scale));

                ctx.restore();
            },

            'STATUS': (graph, grid, ctx, min, max, x, y, well) => {
                if (!graph || !grid || !ctx || !well) return;
                let sx = graph.X(grid.X(well.x)), sy = graph.Y(grid.Y(well.y));
                let sw = well.__screen_width ?? 30, sh = well.__screen_height ?? 30;

                const scaleFactor = Math.min(sw, sh) / 60;
                ctx.fillStyle = well.select ? 'magenta' : (well.color || 'white');
                ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                ctx.lineWidth = 1 * scaleFactor;
                drawRoundedRect(ctx, sx, sy, sw, sh, 10); ctx.fill(); ctx.stroke();

                const label = (well.value ?? '').toString();
                const color = well.statusColor || (label.toLowerCase() === 'error' ? '#e74c3c'
                    : label.toLowerCase() === 'warn' ? '#f39c12'
                        : label.toLowerCase() === 'ok' ? '#2ecc71'
                            : '#3498db');

                const fs = Math.max(8, 10 * scaleFactor);
                ctx.font = `bold ${fs}pt Arial`;
                ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
                ctx.fillStyle = well.fgcolor || 'black';

                const cx = sx + sw / 2, cy = sy + sh / 2;
                const dotR = Math.max(3, 5 * scaleFactor);

                ctx.beginPath(); ctx.arc(sx + 10 * scaleFactor, cy, dotR, 0, Math.PI * 2); ctx.closePath();
                ctx.fillStyle = color; ctx.fill();

                const text = truncateTextCached(label, sw - (20 * scaleFactor), ctx);
                ctx.fillStyle = well.fgcolor || 'black';
                ctx.fillText(text, sx + 20 * scaleFactor, cy);
            },

            'SPARKLINE': (graph, grid, ctx, min, max, x, y, well) => {
                if (!graph || !grid || !ctx || !well || !Array.isArray(well.series) || well.series.length < 2) return;
                const series = well.series.map(v => (typeof v === 'number' && !isNaN(v)) ? v : 0);
                let sx = graph.X(grid.X(well.x)), sy = graph.Y(grid.Y(well.y));
                let sw = well.__screen_width ?? 60, sh = well.__screen_height ?? 30;

                const scaleFactor = Math.min(sw, sh) / 60;
                ctx.fillStyle = well.select ? 'magenta' : (well.color || 'white');
                ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                ctx.lineWidth = 1 * scaleFactor;
                drawRoundedRect(ctx, sx, sy, sw, sh, 10); ctx.fill(); ctx.stroke();

                const minV = Math.min(...series), maxV = Math.max(...series);
                const range = (maxV - minV) || 1;
                const left = sx + 6 * scaleFactor, right = sx + sw - 6 * scaleFactor;
                const top = sy + 6 * scaleFactor, bottom = sy + sh - 6 * scaleFactor;

                ctx.beginPath();
                for (let i = 0; i < series.length; i++) {
                    const t = i / (series.length - 1);
                    const px = left + t * (right - left);
                    const py = bottom - ((series[i] - minV) / range) * (bottom - top);
                    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.lineWidth = 2 * scaleFactor;
                ctx.strokeStyle = well.lineColor || '#34495e';
                ctx.stroke();

                const last = series[series.length - 1];
                const fs = Math.max(8, 9 * scaleFactor);
                ctx.font = `${fs}pt Arial`;
                ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
                ctx.fillStyle = well.fgcolor || 'black';
                ctx.fillText(String(last), right, bottom);
            },

            SIMPLE_TEXT: (graph, grid, ctx, min, max, x, y, well) => {

                ctx.save();
                try {

                    const safeNumber = (v, fb = 0) =>
                        typeof v === "number" && isFinite(v) ? v : fb;

                    const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

                    const font = well.font || "Arial";
                    well.attr__showBorder = false;

                    const mobile = typeof isMobile === "function" && isMobile();

                    const RADIUS = mobile ? 10 : 5;
                    const BORDER_W = mobile ? 2 : 1;
                    const SELECT_FILL = mobile ? "rgba(255,0,255,0.25)" : "magenta";

                    const screen_x = safeNumber(graph.X(grid.X(well.x)));
                    const screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                    const screen_width = safeNumber(well.__screen_width, 30);
                    const screen_height = safeNumber(well.__screen_height, 30);

                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.globalAlpha = 1;
                    ctx.globalCompositeOperation = "source-over";
                    ctx.shadowBlur = 0;

                    ctx.fillStyle = well.select
                        ? (mobile ? SELECT_FILL : "magenta")
                        : (well.color || "white");

                    ctx.strokeStyle = mobile ? "rgba(70,70,70,0.9)" : "rgba(120,120,100,1)";
                    ctx.lineWidth = BORDER_W;

                    drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, RADIUS);
                    ctx.fill();
                    ctx.stroke();

                    const PADDING = mobile
                        ? clamp(Math.round(Math.min(screen_width, screen_height) * 0.08), 3, 8)
                        : 10;

                    const TOP_PAD_EXTRA = mobile ? 0 : 0;

                    const contentX = screen_x + PADDING;
                    const contentY = screen_y + PADDING + TOP_PAD_EXTRA;
                    const contentW = Math.max(0, screen_width - 2 * PADDING);
                    const contentH = Math.max(0, screen_height - 2 * PADDING - TOP_PAD_EXTRA);

                    if (contentW < 2 || contentH < 2) return;

                    const showIcon = !!well.icon;
                    const showText = mobile ? !showIcon : true;

                    if (showIcon) {
                        ctx.save();
                        try {
                            if (!well.icon.draw) {
                                well.icon = Icon.buildFromJSON(well.icon);
                            }

                            const iconInset = mobile ? 0.90 : 1.0;

                            well.icon.x = grid.X(x);
                            well.icon.y = grid.Y(y);
                            well.icon.w = graph.worldWidth(contentW * iconInset);
                            well.icon.h = graph.worldHeight(contentH * iconInset);

                            well.icon.draw(graph, ctx);
                        } finally {
                            ctx.restore();
                        }
                    }

                    if (!showText) return;

                    let text = well.value != null ? String(well.value) : "";

                    if (well.group && (well.group.dollar || well.group.$)) {
                        const n = parseFloat(text);
                        if (isFinite(n)) {
                            text =
                                "$" +
                                new Intl.NumberFormat("en-US", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                }).format(n);
                        }
                    }

                    const MIN_FONT = mobile ? 6 : 9;
                    const MAX_FONT = mobile ? 14 : 40;
                    const LINE_HEIGHT_MULT = mobile ? 1.10 : 1.4;

                    let fontSize = Math.floor(Math.min(contentW, contentH) * (mobile ? 0.55 : 0.70));
                    fontSize = clamp(fontSize, MIN_FONT, MAX_FONT);

                    const wrapForSize = (fs) => {
                        ctx.font = `${fs}px ${font || "Arial"}`;
                        const lineHeight = fs * LINE_HEIGHT_MULT;

                        const maxLines = mobile
                            ? 3
                            : Math.max(1, Math.floor(contentH / lineHeight));

                        if (lineHeight > contentH + 0.001) {
                            return { fits: false, lines: [], lineHeight };
                        }

                        const words = text.split(/\s+/).filter(Boolean);
                        const lines = [];
                        let line = "";
                        let usedAllWords = true;

                        if (words.length === 0) words.push("");

                        for (let i = 0; i < words.length; i++) {
                            const w = words[i];
                            const tryLine = line ? line + " " + w : w;

                            if (ctx.measureText(tryLine).width > contentW && line) {
                                lines.push(line);
                                line = w;

                                if (lines.length === maxLines) {
                                    usedAllWords = false;
                                    break;
                                }
                            } else {
                                line = tryLine;
                            }
                        }

                        if (lines.length < maxLines && line) lines.push(line);
                        if (lines.length > maxLines) lines.length = maxLines;

                        let widthOK = true;
                        for (let i = 0; i < lines.length; i++) {
                            if (ctx.measureText(lines[i]).width > contentW + 0.001) {
                                widthOK = false;
                                break;
                            }
                        }

                        const totalH = lines.length * lineHeight;
                        const heightOK = totalH <= contentH + 0.001;

                        if (!usedAllWords) {
                            const ell = "…";
                            let last = lines[lines.length - 1] || "";
                            while (last && ctx.measureText(last + ell).width > contentW) {
                                last = last.slice(0, -1);
                            }
                            lines[lines.length - 1] = (last || "").trimEnd() + ell;
                        }

                        for (let i = 0; i < lines.length; i++) {
                            if (ctx.measureText(lines[i]).width > contentW + 0.001) {
                                widthOK = false;
                                break;
                            }
                        }

                        return { fits: widthOK && heightOK, lines, lineHeight };
                    };

                    let wrapped = wrapForSize(fontSize);
                    while (!wrapped.fits && fontSize > MIN_FONT) {
                        fontSize--;
                        wrapped = wrapForSize(fontSize);
                    }

                    const { lines, lineHeight } = wrapped;

                    if (!lines.length || !wrapped.fits) {
                        ctx.setTransform(1, 0, 0, 1, 0, 0);
                        ctx.font = `${MIN_FONT}px ${font}`;
                        ctx.textAlign = "center";
                        ctx.textBaseline = "middle";
                        ctx.fillStyle = well.fgcolor || (mobile ? "rgba(0,0,0,0.9)" : "black");
                        ctx.fillText("…", contentX + contentW / 2, contentY + contentH / 2);
                        return;
                    }

                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                    ctx.globalAlpha = 1;
                    ctx.globalCompositeOperation = "source-over";
                    ctx.shadowBlur = 0;

                    ctx.font = `${fontSize}px ${font}`;
                    ctx.textBaseline = "middle";

                    ctx.textAlign = mobile ? "center" : "left";
                    ctx.fillStyle = well.fgcolor || (mobile ? "rgba(0,0,0,0.9)" : "black");

                    const totalH = lines.length * lineHeight;
                    const startY = contentY + (contentH - totalH) / 2 + lineHeight / 2;
                    const drawX = mobile ? (contentX + contentW / 2) : contentX;

                    for (let i = 0; i < lines.length; i++) {
                        ctx.fillText(lines[i], drawX, startY + i * lineHeight);
                    }

                } finally {
                    ctx.restore();
                }
            }

            ,
            ICON: (graph, grid, ctx, min, max, x, y, well) => {

                const safeNumber = (value, fallback = 0) =>
                    typeof value === 'number' && !isNaN(value) ? value : fallback;

                well.attr__showBorder = false;
                const screen_x = safeNumber(graph.X(grid.X(well.x)));
                const screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                const screen_width = safeNumber(well.__screen_width, 30);
                const screen_height = safeNumber(well.__screen_height, 30);

                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;

                let fontSize = 10 * scaleFactor;
                if (fontSize < 9) fontSize = 11;
                const MIN_FONT = 8;

                const PADDING = Math.max(4, Math.round(6 * scaleFactor));

                const contentX = screen_x + PADDING;
                const contentY = screen_y + PADDING;
                const contentW = Math.max(0, screen_width - 2 * PADDING);
                const contentH = Math.max(0, screen_height - 2 * PADDING);

                ctx.font = `${fontSize}pt Arial`;
                ctx.fillStyle = well.select ? 'magenta' : (well.color || 'white');
                ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                ctx.lineWidth = 1 * scaleFactor;
                ctx.shadowBlur = 0;
                ctx.shadowColor = "rgba(40, 0, 0, 0.7)";

                const cornerRadius = 5 * scaleFactor;
                drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius);
                ctx.fill();
                ctx.stroke();

                if (well.icon) {
                    if (!well.icon.draw) {
                        well.icon = Icon.buildFromJSON(well.icon);
                    }
                    if (well.icon && contentW > 0 && contentH > 0) {

                        const ICON_SCALE = 0.8;
                        const iconWpx = contentW * ICON_SCALE;
                        const iconHpx = contentH * ICON_SCALE;

                        const iconCenterScreenX = contentX + contentW / 2;
                        const iconCenterScreenY = contentY + contentH / 2;

                        const iconLeftScreenX = iconCenterScreenX - iconWpx / 2;
                        const iconTopScreenY = iconCenterScreenY - iconHpx / 2;

                        const iconLeftWorldX = graph.Xwc(iconLeftScreenX);
                        const iconTopWorldY = graph.Ywc(iconTopScreenY);

                        well.icon.x = iconLeftWorldX;
                        well.icon.y = iconTopWorldY;
                        well.icon.w = graph.worldWidth(iconWpx);
                        well.icon.h = graph.worldHeight(iconHpx);

                        well.icon.draw(graph, ctx);
                    }
                }

                const LINE_HEIGHT_MULT = 1.2;
                function wrapForFontSize(fSize, text, maxWidth, maxHeight) {
                    ctx.font = `${fSize}pt Arial`;
                    const lineHeight = fSize * LINE_HEIGHT_MULT;
                    const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));

                    const words = (text || '').split(' ');
                    const lines = [];
                    let line = "";

                    for (let i = 0; i < words.length; i++) {
                        const tryLine = line ? (line + " " + words[i]) : words[i];
                        if (ctx.measureText(tryLine).width > maxWidth && line) {
                            lines.push(line);
                            line = words[i];
                            if (lines.length >= maxLines) break;
                        } else {
                            line = tryLine;
                        }
                    }
                    if (line && lines.length < maxLines) lines.push(line);

                    const totalH = lines.length * lineHeight;
                    let fitsHeight = totalH <= maxHeight + 0.0001;

                    let fitsWidth = true;
                    for (let i = 0; i < lines.length; i++) {
                        if (ctx.measureText(lines[i]).width > maxWidth) {
                            fitsWidth = false; break;
                        }
                    }

                    return { lines, lineHeight, fits: (fitsHeight && fitsWidth), maxLines };
                }

                if (contentH > 0 && contentW > 0) {
                    let text = typeof well.value === 'string'
                        ? well.value
                        : (well.value != null ? String(well.value) : '');

                    if (well.group && (well.group['dollar'] || well.group['$'])) {
                        text = '$' + new Intl.NumberFormat('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        }).format(parseFloat(text));
                    }

                    let wrapped = wrapForFontSize(fontSize, text, contentW, contentH);
                    let guard = 0;
                    while (!wrapped.fits && fontSize > MIN_FONT && guard < 64) {
                        fontSize -= 1;
                        wrapped = wrapForFontSize(fontSize, text, contentW, contentH);
                        guard++;
                    }

                    let { lines, lineHeight, maxLines } = wrapped;
                    if (!wrapped.fits) {
                        if (lines.length > maxLines) lines = lines.slice(0, maxLines);
                        if (lines.length) {
                            let last = lines[lines.length - 1] || '';
                            while (last.length > 0 && ctx.measureText(last + '…').width > contentW) {
                                last = last.slice(0, -1);
                            }
                            lines[lines.length - 1] = last + (last ? '…' : '');
                        }
                    }

                    ctx.font = `${fontSize}pt Arial`;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = well.fgcolor || 'black';
                    ctx.shadowBlur = 0;

                    const totalTextHeight = lines.length * lineHeight;
                    const startY = contentY + (contentH - totalTextHeight) / 2 + lineHeight / 2;
                    const leftX = contentX;

                    for (let i = 0; i < lines.length; i++) {
                        ctx.fillText(lines[i], leftX, startY + i * lineHeight);
                    }
                }
            }
            ,

            ColumnHeader: (graph, grid, ctx, min, max, x, y, well) => {

                const safeNumber = (value, fallback = 0) =>
                    typeof value === 'number' && !isNaN(value) ? value : fallback;

                const screen_x = safeNumber(graph.X(grid.X(well.x)));
                const screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                const screen_width = safeNumber(well.__screen_width, 30);
                const screen_height = safeNumber(well.__screen_height, 30);

                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;

                let fontSize = 11 * scaleFactor;
                if (fontSize < 10) fontSize = 12;
                const MIN_FONT = 9;

                const PADDING = Math.max(4, Math.round(6 * scaleFactor));
                const contentX = screen_x + PADDING;
                const contentY = screen_y + PADDING;
                const contentW = Math.max(0, screen_width - 2 * PADDING);
                const contentH = Math.max(0, screen_height - 2 * PADDING);

                ctx.font = `${fontSize}pt Arial`;

                const bg = (well.color ?? 'rgba(245,245,250,1)');
                ctx.fillStyle = well.select ? 'magenta' : bg;
                ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                ctx.lineWidth = 1 * scaleFactor;
                ctx.shadowBlur = 0;
                ctx.shadowColor = "rgba(40, 0, 0, 0.7)";

                const cornerRadius = 5 * scaleFactor;
                drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius);
                ctx.fill();
                ctx.stroke();

                if (well.icon) {
                    if (!well.icon.draw) well.icon = Icon.buildFromJSON(well.icon);
                    if (well.icon) {
                        well.icon.x = grid.X(x);
                        well.icon.y = grid.Y(y);
                        well.icon.w = graph.worldWidth(contentW);
                        well.icon.h = graph.worldHeight(contentH);
                        well.icon.draw(graph, ctx);
                    }
                }

                const LINE_HEIGHT_MULT = 1.15;

                if (contentW > 0 && contentH > 0) {
                    let text = typeof well.value === 'string'
                        ? well.value
                        : (well.value != null ? String(well.value) : '');

                    if (well.group && (well.group['dollar'] || well.group['$'])) {
                        const n = Number.parseFloat(text);
                        if (!Number.isNaN(n)) {
                            text = '$' + new Intl.NumberFormat('en-US', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2
                            }).format(n);
                        }
                    }

                    let guard = 0;
                    let layout = _layoutColoredLines(ctx, text, contentW, contentH, fontSize, LINE_HEIGHT_MULT);
                    while ((!layout.fitsHeight) && fontSize > MIN_FONT && guard < 64) {
                        fontSize -= 1;
                        layout = _layoutColoredLines(ctx, text, contentW, contentH, fontSize, LINE_HEIGHT_MULT);
                        guard++;
                    }

                    const validColor = well.fgcolor || 'rgba(35,35,45,1)';
                    const invalidColor = 'rgba(200, 30, 30, 1)';

                    ctx.font = `bold ${fontSize}pt Arial`;
                    ctx.textBaseline = 'middle';

                    const { lines, lineHeight } = layout;
                    const totalTextHeight = lines.length * lineHeight;
                    const startY = contentY + (contentH - totalTextHeight) / 2 + lineHeight / 2;

                    for (let li = 0; li < lines.length; li++) {
                        const lineChars = lines[li];
                        const runs = _runsFromChars(lineChars, validColor, invalidColor);

                        let totalW = 0;
                        for (const r of runs) totalW += ctx.measureText(r.text).width;

                        const centerX = contentX + contentW / 2;
                        let cursorX = centerX - totalW / 2;

                        for (const r of runs) {
                            if (!r.text) continue;
                            ctx.fillStyle = r.color;

                            const prevAlign = ctx.textAlign;
                            ctx.textAlign = 'left';
                            ctx.fillText(r.text, cursorX, startY + li * lineHeight);
                            ctx.textAlign = prevAlign || 'center';
                            cursorX += ctx.measureText(r.text).width;
                        }
                    }
                }
            },

            RowHeader: (graph, grid, ctx, min, max, x, y, well) => {

                const safeNumber = (value, fallback = 0) =>
                    typeof value === 'number' && !isNaN(value) ? value : fallback;

                const screen_x = safeNumber(graph.X(grid.X(well.x)));
                const screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                const screen_width = safeNumber(well.__screen_width, 30);
                const screen_height = safeNumber(well.__screen_height, 30);

                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;

                let fontSize = 10.5 * scaleFactor;
                if (fontSize < 9.5) fontSize = 11;
                const MIN_FONT = 8.5;

                const PADDING = Math.max(4, Math.round(6 * scaleFactor));
                const contentX = screen_x + PADDING;
                const contentY = screen_y + PADDING;
                const contentW = Math.max(0, screen_width - 2 * PADDING);
                const contentH = Math.max(0, screen_height - 2 * PADDING);

                ctx.font = `${fontSize}pt Arial`;
                const bg = (well.color ?? 'rgba(240,244,248,1)');
                ctx.fillStyle = well.select ? 'magenta' : bg;
                ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                ctx.lineWidth = 1 * scaleFactor;
                ctx.shadowBlur = 0;

                const cornerRadius = 5 * scaleFactor;
                drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius);
                ctx.fill();
                ctx.stroke();

                if (well.icon) {
                    if (!well.icon.draw) well.icon = Icon.buildFromJSON(well.icon);
                    if (well.icon) {
                        well.icon.x = grid.X(x);
                        well.icon.y = grid.Y(y);
                        well.icon.w = graph.worldWidth(contentW);
                        well.icon.h = graph.worldHeight(contentH);
                        well.icon.draw(graph, ctx);
                    }
                }

                const LINE_HEIGHT_MULT = 1.15;

                function wrapForFontSize(fSize, text, maxWidth, maxHeight) {
                    ctx.font = `bold ${fSize}pt Arial`;
                    const lineHeight = fSize * LINE_HEIGHT_MULT;
                    const maxLines = Math.max(1, Math.floor(maxHeight / lineHeight));

                    const words = (text || '').split(' ');
                    const lines = [];
                    let line = "";

                    for (let i = 0; i < words.length; i++) {
                        const tryLine = line ? (line + " " + words[i]) : words[i];
                        if (ctx.measureText(tryLine).width > maxWidth && line) {
                            lines.push(line);
                            line = words[i];
                            if (lines.length >= maxLines) break;
                        } else {
                            line = tryLine;
                        }
                    }
                    if (line && lines.length < maxLines) lines.push(line);

                    const totalH = lines.length * lineHeight;
                    const fitsHeight = totalH <= maxHeight + 0.0001;

                    let fitsWidth = true;
                    for (let i = 0; i < lines.length; i++) {
                        if (ctx.measureText(lines[i]).width > maxWidth) { fitsWidth = false; break; }
                    }

                    return { lines, lineHeight, fits: (fitsHeight && fitsWidth), maxLines };
                }

                if (contentW > 0 && contentH > 0) {
                    let text = typeof well.value === 'string'
                        ? well.value
                        : (well.value != null ? String(well.value) : '');

                    if (well.group && (well.group['dollar'] || well.group['$'])) {
                        text = '$' + new Intl.NumberFormat('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                        }).format(parseFloat(text));
                    }

                    const vertical = !!well.vertical;

                    if (!vertical) {

                        let wrapped = wrapForFontSize(fontSize, text, contentW, contentH);
                        let guard = 0;
                        while (!wrapped.fits && fontSize > MIN_FONT && guard < 64) {
                            fontSize -= 1;
                            wrapped = wrapForFontSize(fontSize, text, contentW, contentH);
                            guard++;
                        }

                        let { lines, lineHeight, maxLines } = wrapped;
                        if (!wrapped.fits) {
                            if (lines.length > maxLines) lines = lines.slice(0, maxLines);
                            if (lines.length) {
                                let last = lines[lines.length - 1] || '';
                                while (last.length > 0 && ctx.measureText(last + '…').width > contentW) {
                                    last = last.slice(0, -1);
                                }
                                lines[lines.length - 1] = last + (last ? '…' : '');
                            }
                        }

                        ctx.font = `bold ${fontSize}pt Arial`;
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = well.fgcolor || 'rgba(35,35,45,1)';

                        const totalTextHeight = lines.length * lineHeight;
                        const startY = contentY + (contentH - totalTextHeight) / 2 + lineHeight / 2;
                        const leftX = contentX;

                        for (let i = 0; i < lines.length; i++) {
                            ctx.fillText(lines[i], leftX, startY + i * lineHeight);
                        }
                    } else {

                        let vFont = fontSize;
                        function wrapForFontSizeVertical(fSize, txt) {
                            ctx.save();
                            ctx.font = `bold ${fSize}pt Arial`;

                            const res = wrapForFontSize(fSize, txt, contentH, contentW);
                            ctx.restore();
                            return res;
                        }

                        let wrapped = wrapForFontSizeVertical(vFont, text);
                        let guard = 0;
                        while (!wrapped.fits && vFont > MIN_FONT && guard < 64) {
                            vFont -= 1;
                            wrapped = wrapForFontSizeVertical(vFont, text);
                            guard++;
                        }

                        let { lines, lineHeight, maxLines } = wrapped;
                        if (!wrapped.fits) {
                            if (lines.length > maxLines) lines = lines.slice(0, maxLines);
                            if (lines.length) {
                                ctx.font = `bold ${vFont}pt Arial`;
                                let last = lines[lines.length - 1] || '';
                                while (last.length > 0 && ctx.measureText(last + '…').width > contentH) {
                                    last = last.slice(0, -1);
                                }
                                lines[lines.length - 1] = last + (last ? '…' : '');
                            }
                        }

                        const cx = contentX + contentW / 2;
                        const cy = contentY + contentH / 2;

                        ctx.save();
                        ctx.translate(cx, cy);
                        ctx.rotate(-Math.PI / 2);
                        ctx.font = `bold ${vFont}pt Arial`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = well.fgcolor || 'rgba(35,35,45,1)';

                        const totalTextHeight = lines.length * lineHeight;
                        const startY = -(contentH / 2) + (contentH - totalTextHeight) / 2 + lineHeight / 2;

                        for (let i = 0; i < lines.length; i++) {
                            ctx.fillText(lines[i], 0, startY + i * lineHeight);
                        }
                        ctx.restore();
                    }
                }
            },
            Input_Number: (graph, grid, ctx, min, max, x, y, well) => {

                const safeNumber = (value, fallback = 0) =>
                    typeof value === 'number' && !isNaN(value) ? value : fallback;

                const screen_x = safeNumber(graph.X(grid.X(well.x)));
                const screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                const screen_width = safeNumber(well.__screen_width, 30);
                const screen_height = safeNumber(well.__screen_height, 30);

                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;

                let fontSize = 11 * scaleFactor;
                if (fontSize < 9) fontSize = 11;
                const MIN_FONT = 8;

                const PADDING = Math.max(4, Math.round(6 * scaleFactor));

                const contentX = screen_x + PADDING;
                const contentY = screen_y + PADDING;
                const contentW = Math.max(0, screen_width - 2 * PADDING);
                const contentH = Math.max(0, screen_height - 2 * PADDING);

                ctx.fillStyle = well.select ? 'magenta' : (well.color || 'white');
                ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                ctx.lineWidth = 1 * scaleFactor;
                ctx.shadowBlur = 0;

                const cornerRadius = 5 * scaleFactor;
                drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius);
                ctx.fill();
                ctx.stroke();
                drawPunchyArrow(ctx, screen_x, screen_y, screen_width, screen_height, {
                    arrowDepthPct: 0.0
                });

                let text = "";
                if (well.value !== undefined && well.value !== null) {
                    if (typeof well.value === 'number') {

                        text = well.value.toFixed(2).replace(/\.00$/, "");
                    } else {
                        text = String(well.value);
                    }
                }

                if (text) {

                    ctx.font = `${fontSize}pt Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = well.fgcolor || 'black';
                    ctx.shadowBlur = 0;

                    const centerX = contentX + contentW / 2;
                    const centerY = contentY + contentH / 2;

                    while (ctx.measureText(text).width > contentW && fontSize > MIN_FONT) {
                        fontSize -= 1;
                        ctx.font = `${fontSize}pt Arial`;
                    }

                    ctx.fillText(text, centerX, centerY);
                }
            }
            ,

            TITLE: (graph, grid, ctx, min, max, x, y, well) => {
                const cellPadding = 4;
                const minFontSize = 6;

                const safeNumber = (value, fallback = 0) =>
                    (typeof value === 'number' && !isNaN(value) ? value : fallback);

                const sx = safeNumber(graph.X(grid.X(well.x)));
                const sy = safeNumber(graph.Y(grid.Y(well.y)));
                const sw = safeNumber(well.__screen_width, 30);
                const sh = safeNumber(well.__screen_height, 30);

                const maxCellSize = 60;
                const scaleFactor = Math.min(sw, sh, maxCellSize) / maxCellSize;

                const cx = sx + sw / 2;
                const cy = sy + sh / 2;
                const squareSize = Math.max(6, Math.min(sw, sh) - 2 * cellPadding);

                const bg = well.select ? 'magenta' : (well.color || 'white');
                drawSquareBadge(ctx, cx, cy, squareSize, bg, "rgba(120, 120, 100, 1)", scaleFactor);

                if (well.icon) {
                    if (!well.icon.draw) well.icon = Icon.buildFromJSON(well.icon);
                    if (well.icon) {
                        well.icon.x = grid.X(x);
                        well.icon.y = grid.Y(y);
                        well.icon.w = graph.worldWidth(sw);
                        well.icon.h = graph.worldHeight(sh);
                        well.icon.draw(graph, ctx);
                    }
                }

                const text = (typeof well.value === 'string') ? well.value : (well.value != null ? String(well.value) : '');
                if (!text) return;

                const availableWidth = squareSize - 2 * cellPadding;
                const availableHeight = squareSize - 2 * cellPadding;

                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = well.fgcolor || 'black';
                ctx.shadowBlur = 0;

                const testFontSize = 10;
                ctx.font = `bold ${testFontSize}px Arial`;
                const measuredWidth = ctx.measureText(text).width;
                if (!measuredWidth) { ctx.restore(); return; }

                let fontSizeByWidth = testFontSize * (availableWidth / measuredWidth);
                let finalFontSize = Math.min(fontSizeByWidth, availableHeight);
                finalFontSize = Math.max(finalFontSize, minFontSize);

                ctx.font = `bold ${finalFontSize}px Arial`;
                ctx.fillText(text, cx, cy);
                ctx.restore();
            },

            TITLE_MONO: (graph, grid, ctx, min, max, x, y, well) => {
                const cellPadding = 4;
                const minFontSize = 6;

                const sx = graph.X(grid.X(well.x));
                const sy = graph.Y(grid.Y(well.y));
                const sw = safeNumber(well.__screen_width, 30);
                const sh = safeNumber(well.__screen_height, 30);

                const maxCellSize = 600;
                const scaleFactor = Math.min(sw, sh, maxCellSize) / maxCellSize;

                const cx = sx + sw / 2;
                const cy = sy + sh / 2;
                const squareSize = Math.max(6, Math.min(sw, sh) - 2 * cellPadding);

                const bg = well.select ? 'magenta' : (well.color || 'white');
                drawSquareBadge(ctx, cx, cy, squareSize, bg, "rgba(120, 120, 100, 1)", scaleFactor);

                const text = well.value != null ? String(well.value) : '';
                if (!text) return;

                const availableWidth = squareSize - 2 * cellPadding;
                const availableHeight = squareSize - 2 * cellPadding;

                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = well.fgcolor || '#111';
                ctx.shadowBlur = 0;

                const testSize = 10;
                ctx.font = `${testSize}px monospace`;
                const w = ctx.measureText(text).width;
                if (!w) { ctx.restore(); return; }

                let size = Math.min(testSize * (availableWidth / w), availableHeight);
                size = Math.max(size, minFontSize);

                ctx.font = `${size}px monospace`;
                ctx.fillText(text, cx, cy);
                ctx.restore();
            },

            TITLE_OUTLINE: (graph, grid, ctx, min, max, x, y, well) => {
                const cellPadding = 4;
                const minFontSize = 6;

                const sx = graph.X(grid.X(well.x));
                const sy = graph.Y(grid.Y(well.y));
                const sw = well.__screen_width || 300;
                const sh = well.__screen_height || 30;

                const maxCellSize = 60;
                const scaleFactor = Math.min(sw, sh, maxCellSize) / maxCellSize;

                const cx = sx + sw / 2;
                const cy = sy + sh / 2;
                const squareSize = Math.max(6, Math.min(sw, sh) - 2 * cellPadding);

                const bg = well.select ? 'magenta' : (well.color || 'white');
                drawSquareBadge(ctx, cx, cy, squareSize, bg, "rgba(120, 120, 100, 1)", scaleFactor);

                const text = well.value != null ? String(well.value) : '';
                if (!text) return;

                const availableWidth = squareSize - 2 * cellPadding;
                const availableHeight = squareSize - 2 * cellPadding;

                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.shadowBlur = 0;

                const testSize = 10;
                ctx.font = `bold ${testSize}px Arial`;
                const w = ctx.measureText(text).width;
                if (!w) { ctx.restore(); return; }

                let size = Math.min(testSize * (availableWidth / w), availableHeight);
                size = Math.max(size, minFontSize);

                ctx.font = `bold ${size}px Arial`;

                ctx.lineWidth = Math.max(1, size * 0.12);
                ctx.strokeStyle = 'rgba(0,0,0,0.85)';
                ctx.fillStyle = well.fgcolor || 'white';

                ctx.strokeText(text, cx, cy);
                ctx.fillText(text, cx, cy);
                ctx.restore();
            },

            TITLE_SUBTLE: (graph, grid, ctx, min, max, x, y, well) => {
                const cellPadding = 6;
                const minFontSize = 6;

                const sx = graph.X(grid.X(well.x));
                const sy = graph.Y(grid.Y(well.y));
                const sw = well.__screen_width;
                const sh = well.__screen_height;

                const maxCellSize = 600;
                const scaleFactor = Math.min(sw, sh, maxCellSize) / maxCellSize;

                const cx = sx + sw / 2;
                const cy = sy + sh / 2;
                const squareSize = Math.max(6, Math.min(sw, sh) - 2 * cellPadding);

                const bg = well.select ? 'magenta' : (well.color || 'white');
                drawSquareBadge(ctx, cx, cy, squareSize, bg, "rgba(120, 120, 100, 1)", scaleFactor);

                const text = well.value != null ? String(well.value) : '';
                if (!text) return;

                const availableWidth = squareSize - 2 * cellPadding;
                const availableHeight = squareSize - 2 * cellPadding;

                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = well.fgcolor || 'rgba(0,0,0,0.55)';
                ctx.shadowBlur = 0;

                const testSize = 10;
                ctx.font = `${testSize}px Arial`;
                const w = ctx.measureText(text).width;
                if (!w) { ctx.restore(); return; }

                let size = Math.min(testSize * (availableWidth / w), availableHeight * 0.9);
                size = Math.max(size, minFontSize);

                ctx.font = `${size}px Arial`;
                ctx.fillText(text, cx, cy);
                ctx.restore();
            },

            DOLLAR: (graph, grid, ctx, min, max, x, y, well) => {
                if (!graph || !grid || !ctx || !well) return;

                try {

                    const currency = (typeof well.currency === 'string' && well.currency.length) ? well.currency : '$';
                    const zeroAsDash = ('accountingZeroAsDash' in well) ? !!well.accountingZeroAsDash : true;
                    const absFormat = (n, precision = 2) => new Intl.NumberFormat('en-US', {
                        minimumFractionDigits: precision,
                        maximumFractionDigits: precision
                    }).format(Math.abs(n));

                    const formatAccounting = (n) => {
                        if (n === 0 && zeroAsDash) return '—';
                        const s = absFormat(n);
                        return n < 0 ? `(${currency}${s})` : `${currency}${s}`;
                    };

                    let screen_x = safeNumber(graph.X(grid.X(well.x)));
                    let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                    let screen_width = safeNumber(well.__screen_width, 30);
                    let screen_height = safeNumber(well.__screen_height, 30);

                    screen_y += screen_height;
                    screen_y -= screen_height;

                    const scaleFactor = Math.min(screen_width, screen_height) / 60;
                    let fontSize = Math.max(8, 9 * scaleFactor);
                    ctx.font = `${fontSize}pt Arial`;

                    ctx.fillStyle = well.select ? 'magenta' : (well.color || 'white');
                    ctx.strokeStyle = "rgba(120, 120, 100, 1)";
                    ctx.lineWidth = 1 * scaleFactor;
                    ctx.shadowBlur = 0;
                    ctx.shadowColor = "rgba(40, 0, 0, 0.7)";

                    drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, 10);
                    ctx.fill();
                    ctx.stroke();

                    const centerX = screen_x + screen_width / 2;
                    const centerY = screen_y + screen_height / 2;

                    if (well.icon) {
                        if (typeof well.icon.draw !== 'function') {
                            try {
                                well.icon = Icon.buildFromJSON(well.icon);
                            } catch (e) {
                                console.warn("Failed to build icon from JSON", e);
                                well.icon = null;
                            }
                        }
                        if (well.icon && typeof well.icon.draw === 'function') {
                            well.icon.x = grid.X(x);
                            well.icon.y = grid.Y(y);
                            well.icon.w = graph.worldWidth(screen_width);
                            well.icon.h = graph.worldHeight(screen_height);
                            try { well.icon.draw(graph, ctx); } catch (e) { console.warn("Error drawing icon", e); }
                        }
                    }

                    if (well.value !== undefined && (well.value + '').length > 0) {
                        const numericValue = safeNumber(well.value, 0);

                        if (screen_height >= fontSize) {
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.shadowBlur = 0;

                            const negColor = well.negColor || 'crimson';
                            const posColor = well.fgcolor || 'black';
                            ctx.fillStyle = (numericValue < 0) ? negColor : posColor;

                            let displayValue = formatAccounting(numericValue);

                            let testFontSize = fontSize;
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';

                            const maxWidth = screen_width * 0.85;
                            const maxHeight = screen_height * 0.85;

                            while (true) {
                                ctx.font = `${testFontSize}pt Arial`;
                                const m = ctx.measureText(displayValue);

                                const textWidth = m.width;
                                const textHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;

                                if (textWidth > maxWidth || textHeight > maxHeight) {
                                    testFontSize--;
                                    ctx.font = `${testFontSize}pt Arial`;
                                    break;
                                }

                                testFontSize++;

                                if (testFontSize > screen_height) {
                                    testFontSize = screen_height;
                                    ctx.font = `${testFontSize}pt Arial`;
                                    break;
                                }
                            }

                            displayValue = truncateTextCached(displayValue, screen_width - 10, ctx);

                            ctx.fillText(displayValue, centerX, centerY);

                        }
                    }

                } catch (error) {
                    console.error("Error rendering DOLLAR well (accounting):", error);
                }
            }
            ,

            Input_Dollar: (graph, grid, ctx, min, max, x, y, well) => {
                const safeNumber = (v, fallback = 0) => typeof v === 'number' && !isNaN(v) ? v : fallback;
                const cellPadding = 6;
                const inset = 2;

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;
                let fontSize = Math.max(11 * scaleFactor, 9);
                const cornerRadius = 4 * scaleFactor;

                ctx.save();
                ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                ctx.shadowBlur = 6;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
                drawInputFieldWithRedBorder(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius, well);
                ctx.restore();

                drawPunchyArrow(ctx, screen_x, screen_y, screen_width, screen_height, {
                    arrowDepthPct: 0.10
                });
                let raw = parseFloat((well.value || "").toString().replace(/[^\d.-]/g, ''));
                if (isNaN(raw)) raw = 0;
                let text = '$' + new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(raw);

                ctx.font = `${fontSize}pt Arial`;
                ctx.fillStyle = well.fgcolor || 'black';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const maxTextWidth = screen_width - 2 * (cellPadding + inset);
                while (ctx.measureText(text + '...').width > maxTextWidth && text.length > 0) text = text.slice(0, -1);
                if (ctx.measureText(text).width > maxTextWidth) text += "...";

                ctx.fillText(text, screen_x + screen_width / 2, screen_y + screen_height / 2);
            },
            PERCENT_WITH_COLOR: (graph, grid, ctx, min, max, x, y, well) => {
                if (!graph || !grid || !ctx || !well) return;

                try {
                    const safeNumber = (value, fallback = 0) =>
                        (typeof value === 'number' && !isNaN(value)) ? value :
                            (typeof value === 'string' && value.trim() !== '' && !isNaN(+value)) ? +value :
                                fallback;

                    const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

                    let screen_x = safeNumber(graph.X(grid.X(well.x)));
                    let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                    let screen_width = safeNumber(well.__screen_width, 30);
                    let screen_height = safeNumber(well.__screen_height, 30);

                    screen_y += screen_height;
                    screen_y -= screen_height;

                    const maxCellSize = 60;
                    const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;
                    const cornerRadius = 8 * scaleFactor;
                    let fontSize = Math.max(10 * scaleFactor, 9);

                    const rawValue = safeNumber(well.value, 0);
                    const minVal = (typeof min === 'number' && !isNaN(min)) ? min : 0;
                    const maxVal = (typeof max === 'number' && !isNaN(max)) ? max : 100;
                    const span = (maxVal !== minVal) ? (maxVal - minVal) : 100;

                    let pct = (rawValue - minVal) / span * 100;
                    pct = clamp(pct, 0, 100);
                    const pct01 = pct / 100;

                    const centerX = screen_x + screen_width / 2;
                    const centerY = screen_y + screen_height / 2;

                    const baseBorderColor = well.borderColor || "rgba(120, 120, 100, 1)";
                    const baseBgColor = well.bgColor || "#f5f5f5";
                    const unfilledColor = well.unfilledColor || "#e0e0e0";
                    const lowColor = well.lowColor || "#ff4d4d";
                    const midColor = well.midColor || "#ffcc00";
                    const highColor = well.highColor || "#4caf50";

                    const borderWidth = (well.select ? 2.5 : 1.0) * scaleFactor;

                    ctx.save();
                    ctx.lineWidth = borderWidth;
                    ctx.strokeStyle = baseBorderColor;
                    ctx.shadowBlur = 0;
                    ctx.shadowColor = "transparent";
                    ctx.fillStyle = baseBgColor;

                    drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius);
                    ctx.fill();
                    ctx.stroke();

                    ctx.save();
                    drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius);
                    ctx.clip();

                    ctx.fillStyle = unfilledColor;
                    ctx.fillRect(screen_x, screen_y, screen_width, screen_height);

                    const grad = ctx.createLinearGradient(
                        screen_x,
                        screen_y,
                        screen_x + screen_width,
                        screen_y
                    );
                    grad.addColorStop(0, lowColor);
                    grad.addColorStop(0.5, midColor);
                    grad.addColorStop(1, highColor);

                    ctx.fillStyle = grad;
                    ctx.fillRect(
                        screen_x,
                        screen_y,
                        screen_width * pct01,
                        screen_height
                    );

                    ctx.restore();

                    if (well.select) {
                        ctx.lineWidth = borderWidth;
                        ctx.strokeStyle = well.selectBorderColor || "#000000";
                        drawRoundedRect(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius);
                        ctx.stroke();
                    }

                    const pctText = `${Math.round(pct)}%`;

                    ctx.font = `${fontSize}pt Arial`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    const textColor = (pct01 > 0.5)
                        ? (well.textColorOnFill || '#ffffff')
                        : (well.textColor || '#000000');

                    ctx.fillStyle = textColor;

                    let displayText = pctText;
                    if (typeof truncateTextCached === 'function') {
                        displayText = truncateTextCached(displayText, screen_width - 10, ctx);
                    }

                    ctx.fillText(displayText, centerX, centerY);

                    ctx.restore();
                } catch (err) {
                    console.error("Error rendering PERCENT_WITH_COLOR:", err);
                }
            },

            Input_Percent: (graph, grid, ctx, min, max, x, y, well) => {
                const safeNumber = (v, fallback = 0) => typeof v === 'number' && !isNaN(v) ? v : fallback;
                const cellPadding = 6;
                const inset = 2;

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;
                let fontSize = Math.max(11 * scaleFactor, 9);
                const cornerRadius = 4 * scaleFactor;

                drawInputFieldWithRedBorder(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius, well);

                drawPunchyArrow(ctx, screen_x, screen_y, screen_width, screen_height, {
                    arrowDepthPct: 0.10
                });

                let raw = 100 * parseFloat((well.value || "").toString().replace(/[^\d.-]/g, ''));
                if (isNaN(raw)) raw = 0;

                let text = new Intl.NumberFormat('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }).format(raw) + '%';

                ctx.font = `${fontSize}pt Arial`;
                ctx.fillStyle = well.fgcolor || 'black';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const maxTextWidth = screen_width - 2 * (cellPadding + inset);
                while (ctx.measureText(text + '...').width > maxTextWidth && text.length > 0) text = text.slice(0, -1);
                if (ctx.measureText(text).width > maxTextWidth) text += "...";

                ctx.fillText(text, screen_x + screen_width / 2, screen_y + screen_height / 2);
            },

            Input_Number: (graph, grid, ctx, min, max, x, y, well) => {
                const safeNumber = (v, fallback = 0) => typeof v === 'number' && !isNaN(v) ? v : fallback;
                const inset = 2;

                let screen_x = safeNumber(graph.X(grid.X(well.x)));
                let screen_y = safeNumber(graph.Y(grid.Y(well.y)));
                let screen_width = safeNumber(well.__screen_width, 30);
                let screen_height = safeNumber(well.__screen_height, 30);

                const maxCellSize = 60;
                const scaleFactor = Math.min(screen_width, screen_height, maxCellSize) / maxCellSize;
                let fontSize = Math.max(11 * scaleFactor, 9);
                const cornerRadius = 4 * scaleFactor;

                drawInputFieldWithRedBorder(ctx, screen_x, screen_y, screen_width, screen_height, cornerRadius, well);

                drawPunchyArrow(ctx, screen_x, screen_y, screen_width, screen_height, {
                    arrowDepthPct: 0.10
                });

                const abbreviate = (value) => {
                    const abs = Math.abs(value);
                    if (abs >= 1e12) return (value / 1e12).toFixed(2) + 'T';
                    if (abs >= 1e9) return (value / 1e9).toFixed(2) + 'B';
                    if (abs >= 1e6) return (value / 1e6).toFixed(2) + 'M';
                    if (abs >= 1e3) return (value / 1e3).toFixed(2) + 'K';
                    return value.toFixed(2);
                };

                let raw = parseFloat((well.value || "").toString().replace(/[^\d.-]/g, ''));
                if (isNaN(raw)) raw = 0;
                let text = abbreviate(raw);

                ctx.font = `${fontSize}pt Arial`;
                ctx.fillStyle = well.fgcolor || 'black';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                const center_x = screen_x + screen_width / 2;
                const center_y = screen_y + screen_height / 2;

                const maxTextWidth = screen_width - 2 * inset;
                while (ctx.measureText(text + '…').width > maxTextWidth && text.length > 0) text = text.slice(0, -1);
                if (ctx.measureText(text).width > maxTextWidth) text += '…';

                ctx.fillText(text, center_x, center_y);
            },

            Input_Weight_mg: createInputWithUnit('mg'),
            Input_Weight_ug: createInputWithUnit('µg'),
            Input_Weight_kg: createInputWithUnit('kg'),
            Input_Weight_abbrev_g: createInputWithUnit('g', { abbreviate: true }),
            Input_Weight_ng: createInputWithUnit('ng'),
            Display_Weight_mg: createDisplayWithUnit('mg'),
            Display_Weight_ug: createDisplayWithUnit('µg'),
            Display_Weight_kg: createDisplayWithUnit('kg'),
            Display_Weight_abbrev_g: createDisplayWithUnit('g', { abbreviate: true }),
            Display_Weight_ng: createDisplayWithUnit('ng'),

        }

        addAliases(t, {
            DOLLAR: ['USD', 'US$', 'USD$', 'Dollar', '$'],
            PERCENT: ['PCT', '%', 'Percent', 'Percentage', 'fraction'],
            INTEGER: ['INT'],
            BOOL: ['BOOLEAN', 'CHECKBOX'],
            STATUS: ['STATE'],
            BADGE: ['TAG', 'LABEL'],
            PROGRESS: ['BAR', 'PCT_BAR'],
            HEATMAP: ['HEAT', 'INTENSITY'],
            SPARKLINE: ['TREND'],
            DATE: ['DT'],
            TITLE: ['HEADER_TITLE'],
            'Input_Number': ['INUM', 'INPUT_NUM'],
            'Input_Percent': ['IPCT', 'INPUT_PCT'],
            'Input_Dollar': ['IMONEY', 'INPUT_USD'],
            'Display_Weight_mg': ['DW_mg'],
            'Display_Weight_ug': ['DW_ug'],
            'Display_Weight_kg': ['DW_kg'],
            'Display_Weight_abbrev_g': ['DW_g'],
            'Display_Weight_ng': ['DW_ng'],
            'Input_Weight_mg': ['IW_mg'],
            'Input_Weight_ug': ['IW_ug'],
            'Input_Weight_kg': ['IW_kg'],
            'Input_Weight_abbrev_g': ['IW_g'],
            'Input_Weight_ng': ['IW_ng'],
        }, { overwrite: false });

        resolve(t)
    })

}
