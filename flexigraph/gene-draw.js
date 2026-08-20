function () {
    return {
        'UserAnnotation': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            color = annotation.color;

            graph.drawVerticalLine(xs, y, 0.13, '#9fe0e8', 0.5)
            graph.drawVerticalLine(xf, y, 0.13, '#9fe0e8', 0.7)

            graph.drawLine(xs, y, xf, y, color, 13, 'butt')

        }),

        'Acceptor-Splice-Site': createIon((graph, tgraph, xss, xff, __y, color, annotation) => {
            var radius = 10;

            let xs = xss - 1;
            let xf = xff - 1;

            graph.drawVerticalLine(xs, __y, 0.63, '#9fe0e8', 0.5)
            graph.drawVerticalLine(xf, __y, 0.63, '#9fe0e8', 0.7)
            let x = (graph.X(xs) + graph.X(xf)) / 2;
            var ctx = graph.canvas.getCTX();

            if (ctx) {
                let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
                if (screencell > 4) {

                    let x = (graph.X(xs) + graph.X(xf)) / 2;

                    ctx.shadowBlur = 2;
                    ctx.shadowColor = '#0a2540';

                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(x, graph.Y(__y) + 10, radius, 0, 2 * Math.PI);
                    ctx.fillStyle = 'white';
                    ctx.fill();
                    ctx.stroke();
                    ctx.closePath();
                    ctx.shadowBlur = 0;
                    ctx.font = '13px system-ui, -apple-system, Roboto, Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#0a2540'

                    ctx.fillText("A", x, graph.Y(__y) + 10);
                    ctx.textAlign = 'left'
                }
            }
        }),
        'Acceptor-Splice-Site.highlight': createIon((graph, tgraph, xss, xff, __y, color, annotation) => {
            var radius = 10;
            let xs = xss - 1;
            let xf = xff - 1;

            graph.drawVerticalLine(xs, __y, 0.63, '#9fe0e8', 0.5)
            graph.drawVerticalLine(xf, __y, 0.63, '#9fe0e8', 0.7)
            let x = (graph.X(xs) + graph.X(xf)) / 2;
            var ctx = graph.canvas.getCTX();

            if (ctx) {
                ctx.shadowBlur = 7;
                ctx.shadowColor = '#0a2540';
                ctx.lineWidth = 3;

                ctx.color = '#1b4a7a'
                let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
                if (screencell > 4) {
                    let x = (graph.X(xs) + graph.X(xf)) / 2;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(x, graph.Y(__y) + 10, radius, 0, 2 * Math.PI);
                    ctx.fillStyle = 'white';
                    ctx.fill();
                    ctx.stroke();
                    ctx.closePath();
                    ctx.shadowBlur = 0;
                    ctx.lineWidth = 1;

                    ctx.font = '13px system-ui, -apple-system, Roboto, Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#0a2540'
                    ctx.fillText("A", x, graph.Y(__y) + 10);
                    ctx.textAlign = 'left'

                }
            }
        }),
        'Donor-Splice-Site': createIon((graph, tgraph, xss, xff, y, color, annotation) => {
            var radius = 10;
            let xs = xss;
            let xf = xff;
            graph.drawLine(xs + ((xf - xs) / 2), y + 0.05, xs + ((xf - xs) / 2), y, 'rgb(200,200,200,0.3)', 3, 'butt')
            graph.drawLine(xs, y, xf, y, 'rgba(78,157,105,0.5)', 10, 'butt')
            graph.drawVerticalLine(xs, y, 0.13, '#7a4f66', 0.7)
            graph.drawVerticalLine(xf, y, 0.13, '#7a4f66', 0.4)
            let x = (graph.X(xs) + graph.X(xf)) / 2;
            var ctx = graph.canvas.getCTX();
            if (ctx) {
                let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
                if (screencell > 4) {
                    let x = (graph.X(xs) + graph.X(xf)) / 2;
                    ctx.lineWidth = 1;
                    ctx.shadowBlur = 3;
                    ctx.shadowColor = '#0a2540';

                    ctx.beginPath();
                    ctx.arc(x, graph.Y(y) + 10, radius, 0, 2 * Math.PI);
                    ctx.fillStyle = 'white';
                    ctx.fill();
                    ctx.stroke();
                    ctx.closePath();

                    ctx.shadowBlur = 0;

                    ctx.font = '13px system-ui, -apple-system, Roboto, Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#0a2540'

                    ctx.fillText('D', x, graph.Y(y) + 10);
                }
            }
        }),
        'Donor-Splice-Site.highlight': createIon((graph, tgraph, xss, xff, y, color, annotation) => {
            var radius = 10;
            let xs = xss;
            let xf = xff;
            graph.drawLine(xs + ((xf - xs) / 2), y + 0.05, xs + ((xf - xs) / 2), y, 'rgb(200,200,200,0.3)', 3, 'butt')
            graph.drawLine(xs, y, xf, y, 'rgba(78,157,105,0.5)', 10, 'butt')
            graph.drawVerticalLine(xs, y, 0.13, '#7a4f66', 0.7)
            graph.drawVerticalLine(xf, y, 0.13, '#7a4f66', 0.4)
            let x = (graph.X(xs) + graph.X(xf)) / 2;
            var ctx = graph.canvas.getCTX();
            if (ctx) {
                ctx.shadowBlur = 7;
                ctx.shadowColor = '#0a2540';
                let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
                if (screencell > 4) {
                    let x = (graph.X(xs) + graph.X(xf)) / 2;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(x, graph.Y(y) + 10, radius, 0, 2 * Math.PI);
                    ctx.fillStyle = 'white';
                    ctx.fill();
                    ctx.stroke();
                    ctx.closePath();

                    ctx.shadowBlur = 0;

                    ctx.font = '13px system-ui, -apple-system, Roboto, Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#0a2540'

                    ctx.fillText('D', x, graph.Y(y) + 10);
                }
                ctx.shadowBlur = 0;

            }
        }),

        'Canonical-Donor-Splice-Site': createIon((graph, tgraph, xss, xff, y, color, annotation) => {
            var radius = 10;
            let xs = xss;
            let xf = xff;

            graph.drawLine(xs + ((xf - xs) / 2), y + 0.05, xs + ((xf - xs) / 2), y, 'rgb(200,200,200,0.6)', 3, 'butt')
            graph.drawLine(xs, y, xf, y, 'rgba(78,157,105,0.45)', 10, 'butt')

            graph.drawVerticalLine(xs, y, 0.63, '#8c2f42', 0.5)
            graph.drawVerticalLine(xf, y, 0.63, '#8c2f42', 0.5)
            let x = (graph.X(xs) + graph.X(xf)) / 2;
            var ctx = graph.canvas.getCTX();
            if (ctx) {
                let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
                if (screencell > 4) {
                    let x = (graph.X(xs) + graph.X(xf)) / 2;
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(x, graph.Y(y) + 10, radius, 0, 2 * Math.PI);
                    ctx.fillStyle = 'white';
                    ctx.fill();
                    ctx.stroke();
                    ctx.closePath();

                    ctx.shadowBlur = 0;

                    ctx.font = '10px system-ui, -apple-system, Roboto, Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#0a2540'
                    ctx.fillText("Donor", x, graph.Y(y)) + 10;
                }
            }
        }),

        'Exon': createIon((graph, tgraph, xs, xf, yv, color, annotation, strand) => {

            const exonColor = 'rgba(44,90,160,0.82)';
            const exonWidth = 12;

            graph.drawLine(xs, yv, xf + 1, yv, exonColor, exonWidth, 'butt');

            {
                const ctx = graph.canvas.getCTX();
                if (ctx) {
                    const x1 = graph.X(xs);
                    const x2 = graph.X(xf + 1);
                    const y = graph.Y(yv);

                    const capH = exonWidth * 2.0;

                    ctx.save();
                    ctx.setLineDash([]);
                    ctx.strokeStyle = exonColor;
                    ctx.lineWidth = exonWidth;
                    ctx.lineCap = 'butt';

                    const cap = (x) => {
                        ctx.beginPath();
                        ctx.moveTo(x, y - capH / 2);
                        ctx.lineTo(x, y + capH / 2);
                        ctx.stroke();
                    };

                    cap(x1);
                    cap(x2);
                    ctx.restore();
                }
            }

            let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)));

            if (annotation.showIndex) {
                const ctx = graph.canvas.getCTX();
                if (ctx) {

                    const small = (annotation.index >= 0 && screencell < 0.52);
                    const radius = small ? 10 : 20;
                    const fontSize = small ? 8 : 15;
                    const x = (graph.X(xs) + graph.X(xf)) / 2;
                    const y = small ? (graph.Y(yv - 1) + 10) : graph.Y(yv);
                    ctx.save();
                    ctx.setLineDash([]);
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, 2 * Math.PI);
                    ctx.fillStyle = 'white';
                    ctx.fill();
                    ctx.stroke();
                    ctx.closePath();
                    ctx.font = `${fontSize}px system-ui, -apple-system, Roboto, Arial, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = '#0a2540';
                    ctx.fillText(annotation.index, x, y);
                    ctx.restore();
                }
            }

        }),

        'Phylon': createIon((graph, tgraph, xs, xf, yv, color, annotation, strand) => {

            const ctx = graph.canvas.getCTX?.();

            const span = (xf - xs);

            const inFrame = (Math.abs(span) % 3) === 0;

            const lineStyle = inFrame
                ? {
                    stroke: 'rgba(78,157,105,0.6)',
                    width: 32,
                    dash: [],
                    cap: 'butt',

                    glow: { color: 'rgba(78,157,105,0.22)', blur: 14 }
                }
                : {
                    stroke: 'rgba(199,125,52,0.6)',
                    width: 26,
                    dash: [10, 8],
                    cap: 'butt',
                    glow: { color: 'rgba(199,125,52,0.2)', blur: 10 }
                };

            const badgeStyle = inFrame
                ? { bg: 'rgba(44, 16, 74, 0.80)' }
                : { bg: 'rgba(70, 35, 10, 0.80)' };

            const screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)));

            function drawRoundedRect(ctx, left, top, w, h, r) {
                const rr = Math.min(r, w / 2, h / 2);
                ctx.beginPath();
                ctx.moveTo(left + rr, top);
                ctx.arcTo(left + w, top, left + w, top + h, rr);
                ctx.arcTo(left + w, top + h, left, top + h, rr);
                ctx.arcTo(left, top + h, left, top, rr);
                ctx.arcTo(left, top, left + w, top, rr);
                ctx.closePath();
            }

            function measureBadge(ctx, text, fontPx, padX, padY) {
                ctx.save();
                ctx.font = `${fontPx}px system-ui, -apple-system, Roboto, Arial, sans-serif`;
                const m = ctx.measureText(text);
                const textW = m.width;
                const textH = Math.max(
                    fontPx,
                    (m.actualBoundingBoxAscent || fontPx) + (m.actualBoundingBoxDescent || 0)
                );
                ctx.restore();
                return { w: textW + padX * 2, h: textH + padY * 2 };
            }

            function drawBadge(ctx, x, y, text, fontPx, opts = {}) {
                const {
                    padX = 8,
                    padY = 5,
                    radius = 8,
                    bg = 'rgba(0,0,0,0.78)',
                    fg = '#FFFFFF',
                    border = 'rgba(255,255,255,0.25)',
                    shadowColor = 'rgba(0,0,0,0.55)',
                    shadowBlur = 8,
                    shadowOffsetX = 2,
                    shadowOffsetY = 2,
                    strokeWidth = 1
                } = opts;

                const { w, h } = measureBadge(ctx, text, fontPx, padX, padY);
                const left = x - w / 2;
                const top = y - h / 2;

                ctx.save();

                ctx.shadowColor = shadowColor;
                ctx.shadowBlur = shadowBlur;
                ctx.shadowOffsetX = shadowOffsetX;
                ctx.shadowOffsetY = shadowOffsetY;

                drawRoundedRect(ctx, left, top, w, h, radius);
                ctx.fillStyle = bg;
                ctx.fill();

                ctx.shadowColor = 'transparent';
                ctx.lineWidth = strokeWidth;
                ctx.strokeStyle = border;
                ctx.stroke();

                ctx.font = `${fontPx}px system-ui, -apple-system, Roboto, Arial, sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = fg;
                ctx.fillText(text, x, y);

                ctx.restore();

                return { left, top, right: left + w, bottom: top + h, cx: x, cy: y, w, h };
            }

            function drawConnector(ctx, badgeBox, tx, ty, opts = {}) {
                const {
                    color = 'rgba(0,0,0,0.55)',
                    width = 2,
                    shadowColor = 'rgba(0,0,0,0.35)',
                    shadowBlur = 6,
                    shadowOffsetX = 1,
                    shadowOffsetY = 1,
                    dash = []
                } = opts;

                const dx = tx - badgeBox.cx;
                const dy = ty - badgeBox.cy;

                const halfW = badgeBox.w / 2;
                const halfH = badgeBox.h / 2;

                const txEdge = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
                const tyEdge = dy !== 0 ? halfH / Math.abs(dy) : Infinity;

                const t = Math.min(txEdge, tyEdge);
                const sx = badgeBox.cx + dx * t;
                const sy = badgeBox.cy + dy * t;

                ctx.save();
                ctx.setLineDash(dash);
                ctx.lineCap = 'round';
                ctx.lineWidth = width;

                ctx.shadowColor = shadowColor;
                ctx.shadowBlur = shadowBlur;
                ctx.shadowOffsetX = shadowOffsetX;
                ctx.shadowOffsetY = shadowOffsetY;

                ctx.strokeStyle = color;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(tx, ty);
                ctx.stroke();

                ctx.restore();
            }

            if (ctx) {
                const x1 = graph.X(xs);
                const x2 = graph.X(xf + 1);
                const y = graph.Y(yv);

                ctx.save();
                ctx.setLineDash(lineStyle.dash);
                ctx.lineCap = lineStyle.cap;
                ctx.lineWidth = lineStyle.width;

                if (lineStyle.glow) {
                    ctx.shadowColor = lineStyle.glow.color;
                    ctx.shadowBlur = lineStyle.glow.blur;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                }

                ctx.strokeStyle = lineStyle.stroke;
                ctx.beginPath();
                ctx.moveTo(x1, y);
                ctx.lineTo(x2, y);
                ctx.stroke();
                ctx.restore();
            } else {

                graph.drawLine(xs, yv, xf + 1, yv, lineStyle.stroke, lineStyle.width, 'butt');
            }

            if (ctx) {
                const lineCx = (graph.X(xs) + graph.X(xf)) / 2;
                const lineCy = graph.Y(yv);

                const scoreRaw =
                    (annotation?.annotations !== undefined && annotation?.annotations !== null)
                        ? `${annotation.annotations}`
                        : '—';

                const score = `${scoreRaw}${inFrame ? '' : 'shft'}`;

                if (annotation?.index >= 0 && screencell < 0.52) {
                    const bx = lineCx;
                    const by = graph.Y(yv - 0.5) + 10;

                    const badgeBox = drawBadge(ctx, bx, by, score, 9, {
                        padX: 7,
                        padY: 4,
                        radius: 7,
                        bg: badgeStyle.bg,
                        fg: '#FFFFFF',
                        shadowBlur: 10
                    });

                    drawConnector(ctx, badgeBox, lineCx, lineCy, {
                        color: 'rgba(0,0,0,0.60)',
                        width: 2,
                        dash: inFrame ? [] : [4, 6]
                    });
                } else {
                    const bx = lineCx;
                    const by = lineCy - 28;

                    const badgeBox = drawBadge(ctx, bx, by, score, 14, {
                        padX: 10,
                        padY: 7,
                        radius: 10,
                        bg: badgeStyle.bg,
                        fg: '#FFFFFF',
                        shadowBlur: 12
                    });

                    drawConnector(ctx, badgeBox, lineCx, lineCy, {
                        color: 'rgba(0,0,0,0.60)',
                        width: 2.5,
                        dash: inFrame ? [] : [6, 7]
                    });
                }
            }
        }),
        'LJ-TSS': createIon((graph, tgraph, xs, xf, yv, color, annotation, strand) => {
            const ctx = graph.canvas.getCTX?.();

            let s = (annotation?.strand ?? strand);
            if (s === '+') s = 1;
            if (s === '-') s = -1;

            if (typeof s === 'string') s = Number(s);

            if (s === 0) s = 1;
            if (s !== 1 && s !== -1) s = 1;

            const visualDir = s;

            const y = yv;
            const featureColor = color || 'rgba(78,157,105,0.55)';

            const startX = (s === 1) ? xs : xf;

            const arrowStartX = (visualDir === 1) ? xs : xf;
            const arrowEndX = (visualDir === 1) ? xf : xs;

            const labelText =
                annotation?.label ??
                annotation?.name ??
                annotation?.id ??
                'LJ-TSS';

            if (ctx) {
                const yPix = graph.Y(y);

                const xStartPix = graph.X(arrowStartX);
                const xEndPix = graph.X(arrowEndX);

                const lineWidth = 34;
                const headL = 18;
                const headW = 12;

                const xShaftEnd = xEndPix - visualDir * (headL * 0.85);

                ctx.save();
                ctx.lineCap = 'butt';
                ctx.lineWidth = lineWidth;
                ctx.strokeStyle = featureColor;
                ctx.beginPath();
                ctx.moveTo(xStartPix, yPix);
                ctx.lineTo(xShaftEnd, yPix);
                ctx.stroke();
                ctx.restore();

                ctx.save();
                ctx.fillStyle = featureColor;
                ctx.beginPath();
                ctx.moveTo(xEndPix, yPix);
                ctx.lineTo(xEndPix - visualDir * headL, yPix - headW);
                ctx.lineTo(xEndPix - visualDir * headL, yPix + headW);
                ctx.closePath();
                ctx.fill();
                ctx.restore();

                const sx = graph.X(startX);
                const tickH = 18;

                ctx.save();
                ctx.lineWidth = 3;
                ctx.strokeStyle = 'rgba(46,110,164,0.95)';
                ctx.beginPath();
                ctx.moveTo(sx, yPix - tickH);
                ctx.lineTo(sx, yPix + tickH);
                ctx.stroke();
                ctx.restore();

                const midPix = (xStartPix + xShaftEnd) * 0.5;
                const labelOffsetY = 38;
                const labelY = yPix - (lineWidth * 0.5) - labelOffsetY;
                const labelX = midPix;

                ctx.save();
                ctx.strokeStyle = 'rgba(255,255,255,0.85)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(labelX, labelY + 6);
                ctx.lineTo(midPix, yPix - (lineWidth * 0.5) - 2);
                ctx.stroke();
                ctx.restore();

                ctx.save();
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';

                const padX = 6, padY = 3;
                const metrics = ctx.measureText(labelText);
                const textW = metrics.width;
                const boxW = textW + padX * 2;
                const boxH = 14 + padY * 2;

                ctx.fillStyle = 'rgba(0,0,0,0.55)';
                ctx.fillRect(labelX - boxW / 2, labelY - boxH, boxW, boxH);

                ctx.fillStyle = 'rgba(255,255,255,0.95)';
                ctx.fillText(labelText, labelX, labelY - padY);

                ctx.restore();

            } else {

                graph.drawLine(arrowStartX, y, arrowEndX, y, featureColor, 40, 'butt');

                graph.drawScreenLine(
                    graph.X(startX),
                    graph.Y(y) - 12,
                    graph.X(startX),
                    graph.Y(y) + 12,
                    '#1aa3bd',
                    4,
                    'butt'
                );

                const xStartPix = graph.X(arrowStartX);
                const xEndPix = graph.X(arrowEndX);
                const midPix = (xStartPix + xEndPix) * 0.5;
                const yPix = graph.Y(y);

                const labelOffsetY = 44;
                const labelX = midPix;
                const labelY = yPix - labelOffsetY;

                graph.drawScreenLine(
                    labelX, labelY + 4,
                    midPix, yPix - 18,
                    'rgba(255,255,255,0.85)',
                    2,
                    'butt'
                );

                if (graph.drawScreenText) {
                    graph.drawScreenText(labelText, labelX, labelY, 'white', 12, 'center');
                }
            }
        }),

        'TSS': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, 'rgba(78,157,105,0.55)', 40, 'butt')
            graph.drawScreenLine(graph.X(xs) - 1, graph.Y(y), graph.X(xs) + 1, graph.Y(y), '#1aa3bd', 4, 'butt')
            graph.drawScreenLine(graph.X(xf) - 1, graph.Y(y), graph.X(xf) + 1, graph.Y(y), '#1aa3bd', 4, 'butt')
        }),
        'STOP': createIon((graph, tgraph, xs, xf, y) => {

            let screencell = graph.screenWidth(tgraph.screenWidth(1))
            if (screencell < 0.05) {
                return;
            }

            graph.drawScreenLine(graph.X(xs) - 1, graph.Y(y), graph.X(xs) + 1, graph.Y(y), '#1aa3bd', 10, 'butt')
            graph.drawScreenLine(graph.X(xf) - 1, graph.Y(y), graph.X(xf) + 1, graph.Y(y), '#1aa3bd', 10, 'butt')

            graph.drawString45('TC', xf - 0.5, y + 1, '#8399ac', '10px system-ui, -apple-system, Roboto, Arial, sans-serif')

        }),
        'oligo': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, '#17a39a', 1, 'butt')

        }),
        'ProteinDomain': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            graph.drawLine(xs, y + 1, xf, y + 1, '#9fe0e8', 20, 'butt')
            graph.drawLine(xs, y + 1, xf, y + 1, '#a86b3e', 5, 'butt')
            graph.drawLine((xs + xf) / 2, y, (xs + xf) / 2, y + 1, '#1aa3bd', 4, 'butt')

            graph.drawLine((xs + xf) / 2, y, (xs + xf) / 2, y + annotation.labelY - 2, '#a86b3e', 1, 'butt')
            graph.drawString(annotation.name, (xs + xf) / 2, y + annotation.labelY - 2, '#0a2540', '10px system-ui, -apple-system, Roboto, Arial, sans-serif')
            let screencell = graph.screenWidth(tgraph.screenWidth(1))
            if (screencell < 1.5 && screencell > 0.1) {
                if (annotation.description != null && annotation.description.length > 0) {
                    graph.drawLine((xs + xf) / 2, y, (xs + xf) / 2, y, '#0a2540', 1, 'butt')
                    graph.drawString(annotation.description, (xs + xf) / 2, y + annotation.labelY - 2, '#0a2540', '10px system-ui, -apple-system, Roboto, Arial, sans-serif')
                }

            }
        }),
        'amplicon': createIon((graph, tgraph, xs, xf, y, color, annotation) => {

        }),
        'aso': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, '#17a39a', 1, 'butt')

        }), 'AA': createIon((graph, tgraph, xs, xf, y, color, annotation) => {

            let screencell = graph.screenWidth(tgraph.screenWidth(1))

            graph.drawLine(xs, y, xf, y, 'rgba(176,69,62,0.55)', 65, 'butt')
            graph.drawLine(xs, y, xs, y + annotation.labelY - 1, 'rgba(120,130,145,0.45)', 1, 'butt')
            if (screencell > 0.5) {
                graph.drawString(annotation.name, xs, y + annotation.labelY - 1, '#0a2540', '10px system-ui, -apple-system, Roboto, Arial, sans-serif')

            }
        }),
        'Intron': createIon((graph, tgraph, xs, xf, y) => {

            graph.drawZigZag(xs, y, xf, y, '#b0533f', 2)

        }),
        'Translation': createIon((graph, tgraph, xs, xf, y) => {
            let screencell = graph.screenWidth(tgraph.screenWidth(1))
            if (screencell < 0.05) {
                return;
            }
            let r = 0.1;
            graph.drawString('START', xs, y + r, '#0a2540', '9px system-ui, -apple-system, Roboto, Arial, sans-serif')

            graph.drawVerticalLine(xs, y, 0.2, '#17a39a', 4)
            graph.drawString('STOP', xf - 1, y + r, '#0a2540', '9px system-ui, -apple-system, Roboto, Arial, sans-serif')

            graph.drawVerticalLine(xf, y, 0.2, '#9c3350', 4)

        }),
        'CODON': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, 'rgba(120,130,145,0.45)', 3, 'butt')
            graph.drawVerticalLine(xs, y, 0.2, '#8399ac')

        }),
        'CDS': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf + 1, y, 'rgba(44,90,160,0.55)', 20)
            graph.drawVerticalLine(xs, y, 0.08, '#1aa3bd', 1)
            graph.drawVerticalLine(xf + 1, y, 0.08, '#1aa3bd', 1)

        }),
        'UTR': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, '#9fe0e8', 7)
            graph.drawVerticalLine(xs, y, 0.2, '#9fe0e8')
            graph.drawVerticalLine(xf, y, 0.2, '#9fe0e8')

        }),
        'polypeptide': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, 'rgba(120,130,145,0.45)', 1)
            graph.drawVerticalLine(xs, y, 0.2, 'rgba(120,130,145,0.45)')
            graph.drawVerticalLine(xf, y, 0.2, 'rgba(120,130,145,0.45)')

        }),
        'rna-binding': createIon((graph, tgraph, xs, xf, y) => {
            let d = xf - xs;
            graph.drawZigZag(xs, y, xf, y, '#b0533f', 4, 'round')
            graph.drawVerticalLine(xs, y, 0.2, '#0a2540')
            graph.drawVerticalLine(xf, y, 0.2, '#0a2540')

        }),
        'snp': createIon((graph, tgraph, xs, xf, y) => {
            let d = xf - xs;
            graph.drawZigZag(xs, y, xf, y, '#6e4560', 20, 'round')
            graph.drawVerticalLine(xs, y, 0.2, '#0a2540')
            graph.drawVerticalLine(xf, y, 0.2, '#0a2540')

        }), 'Query': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, '#6e4560', 12, 'round')
            graph.drawVerticalLine(xs, y, 0.2, '#0a2540')
            graph.drawVerticalLine(xf, y, 0.2, '#0a2540')

        }), 'Query-Target': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, '#b0533f', 12, 'round')
            graph.drawVerticalLine(xs, y, 0.2, '#0a2540')
            graph.drawVerticalLine(xf, y, 0.2, '#0a2540')

        }),
        'biological_region': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, '#7a4f66', 5)
            graph.drawVerticalLine(xs, y, 0.2, '#7a4f66')
            graph.drawVerticalLine(xf, y, 0.2, '#7a4f66')

        }),
        'region': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, '#7f96a8', 2, 'butt')
            graph.drawVerticalLine(xs, y, 0.1, '#7f96a8')
            graph.drawVerticalLine(xf, y, 0.1, '#7f96a8')

        }),
        'polyA': createIon((graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, '#1aa3bd', 25, 'round')
            graph.drawVerticalLine(xs, y, 1.1, 'rgba(120,130,145,0.45)')
            graph.drawVerticalLine(xf, y, 1.1, 'rgba(120,130,145,0.45)')

        }),
        'lncRNA': createIon((graph, tgraph, xs, xf, y, color, annotation) => {

            let screencell = graph.screenWidth((1))

            graph.drawLine(xs, y + 0.3, xf, y + 0.3, '#1aa3bd', 25, 'round')
            graph.drawVerticalLine(xs, y + 0.3, 1.1, '#7a4f66')
            graph.drawVerticalLine(xf, y + 0.3, 1.1, '#7a4f66')
            let name = 'lncRNA'
            if (screencell > 0.01 && annotation.name) {
                name = annotation.name;
            }
            let r = 0.35;
            graph.drawString(name, xs, y + 1 + r, '#0a2540', '10px system-ui, -apple-system, Roboto, Arial, sans-serif')

        }),
        'miRNA': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            graph.drawLine(xs, 0.3, xf, 0.3, '#2bb0bf', 20, 'round')
            graph.drawVerticalLine(xs, 0.3, 1.1, '#9fe0e8')
            graph.drawVerticalLine(xf, 0.3, 1.1, '#8c2f42')
            let name = 'miRNA'
            let screencell = graph.screenWidth((1))
            if (screencell > 0.01 && annotation.name) {
                name = annotation.name;
                graph.drawLine(xs, 0.3, xs, tgraph.Y(annotation.labelY), '#0a2540', 1, 'round')

            }
            graph.drawString(name, xs, tgraph.Y(annotation.labelY), '#0a2540', '12px system-ui, -apple-system, Roboto, Arial, sans-serif')
        }),
        'miRNA_primary_transcript': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            graph.drawLine(xs, 0.3, xf, 0.3, '#a86b3e', 10, 'round')
            graph.drawVerticalLine(xs, 0.3, 1.1, '#7a4f66')
            graph.drawVerticalLine(xf, 0.3, 1.1, '#7a4f66')
            let name = 'miRNA'
            let screencell = graph.screenWidth((1))
            if (screencell > 0.01 && annotation.name) {
                name = annotation.name;
                graph.drawLine(xs, 0.3, xs, y, '#0a2540', 1, 'round')

            }

            graph.drawString(name, xs, y, '#0a2540', '10px system-ui, -apple-system, Roboto, Arial, sans-serif')

        }),
        'processed_pseudogene': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            graph.drawLine(xs, y + 0.3, xf, y + 0.3, 'rgba(78,157,105,0.55)', 155, 'round')
            graph.drawVerticalLine(xs, y + 0.3, 1.1, '#7a4f66')
            graph.drawVerticalLine(xf, y + 0.3, 1.1, '#7a4f66')
            let name = 'Pseudogene'

            let screencell = graph.screenWidth((1))

            if (screencell > 0.01 && annotation.name) {
                name = annotation.name;
            }

            let r = 0.3;
            graph.drawString(name, xs, y + 1 + r, '#0a2540', '10px system-ui, -apple-system, Roboto, Arial, sans-serif')

        }),
        'snRNA': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            graph.drawLine(xs, y + 0.3, xf, y + 0.3, '#a86b3e', 155, 'round')
            graph.drawVerticalLine(xs, y + 0.3, 1.1, '#7a4f66')
            graph.drawVerticalLine(xf, y + 0.3, 1.1, '#7a4f66')
            let name = 'snRNA'

            let screencell = graph.screenWidth(tgraph.screenWidth(1))

            if (screencell > 0.01 && annotation.name) {
                name = annotation.name;
            }

            let r = 0.3;
            graph.drawString(name, xs, y + 1 + r, '#0a2540', '10px system-ui, -apple-system, Roboto, Arial, sans-serif')

        }),

    }

}
