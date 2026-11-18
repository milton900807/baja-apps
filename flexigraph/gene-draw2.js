function () {

    const drawString45 = (ctx, str, x, y, color, font) => {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        if (!font) {
            font = "12px system-ui, -apple-system, Roboto, Arial, sans-serif";
        }
        ctx.shadowBlur = 0;
        ctx.shadowColor = '#0a2540';
        if (!color) {
            color = '#0a2540'
        }
        ctx.font = font;
        ctx.fillStyle = color;

        let sx = (x);
        let sy = (y) - 5;

        ctx.save();

        ctx.translate(sx, sy);

        ctx.rotate(45 * Math.PI / 180);

        ctx.fillText(str, 0, 0);

        ctx.restore();

        ctx.stroke();
    }

    const drawString = (ctx, str, x, y, color, font) => {
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        if (!font) {
            font = "15px system-ui, -apple-system, Roboto, Arial, sans-serif";
        }
        ctx.shadowBlur = 0;
        ctx.shadowColor = '#0a2540';
        if (!color) {
            color = '#0a2540'
        }
        if (font) {
            ctx.font = font;
        } else {
            ctx.font = '15px system-ui, -apple-system, Roboto, Arial, sans-serif'
        }
        ctx.fillStyle = color;
        let sx = (x);
        let sy = (y) - 5;

        ctx.fillText(str, sx, sy);
        ctx.stroke();

    }

    const drawLine = (ctx, xi, yi, xf, yf, color, lineSize, lineCap) => {
        ctx.shadowBlur = 0;
        ctx.shadowColor = '#0a2540';
        ctx.lineWidth = 2;

        if (color != null) {
            ctx.strokeStyle = color;
        }
        if (lineSize == null) {
            lineSize = 2;
        }
        if (lineCap == null) {
            ctx.lineCap = lineCap;
        }
        else {
            ctx.lineCap = 'butt';
        }
        ctx.shadowColor = '#0a2540';
        ctx.lineWidth = lineSize;

        ctx.beginPath();
        ctx.moveTo((xi), (yi));
        ctx.lineTo((xf), (yf));
        ctx.stroke();
    }

    const drawVerticalLine = (ctx, x, y, vlength, color, lineWidth) => {
        ctx.shadowBlur = 0;
        ctx.shadowColor = '#0a2540';
        if (color != null) {
            ctx.strokeStyle = color;
        } else {
            ctx.strokeStyle = '#b0533f'
        }
        if (!lineWidth) {
            ctx.lineWidth = 1;
        } else
            ctx.lineWidth = lineWidth;
        ctx.shadowBlur = 0;
        ctx.shadowColor = '#0a2540';

        ctx.beginPath();
        ctx.moveTo((x), (y - vlength / 2));
        ctx.lineTo((x), (y + (vlength / 2)));
        ctx.stroke();
    }

    return {
        // A DOWN ARROW OVER THE TRACK, marking where something sits. BIG, OUTLINED, AND ONE
        // PER PLACE -- the same mark flexigraph/gene-draw.js draws, and it has to be here too.
        //
        // mark-compound-locations.js adds CompoundMark annotations, and a plain track draws
        // them through annotation.js -> gene-draw.js. A FLEXI track does not: it draws every
        // annotation through annotation2.js's drawPlot(), which resolves its shapes from THIS
        // file. With no entry here, shapeFunction was null and drawPlot fell through to its
        // fallback -- the first five characters of the name in 9px black -- so "show me where
        // the compounds are" marked the track with something effectively invisible, on exactly
        // the tracks the question gets asked about. Same geometry and same colours as the
        // gene-draw.js version, so a track looks the same whichever class drew it.
        //
        // The signature differs from that file's: here the context comes first and xs/xf/y are
        // RAW track coordinates, mapped through grid.X(tgraph.X(..)) as every shape here does.
        'CompoundMark': createIon((ctx, grid, tgraph, xs, xf, y, color, annotation) => {
            if (!ctx) return;
            const c = (annotation && annotation.color) || color || '#f59e0b';
            const __ax = grid.X(tgraph.X(xs)), __bx = grid.X(tgraph.X(xf));
            const sx = (__ax + __bx) / 2;
            const sy = grid.Y(tgraph.Y(y));
            if (!isFinite(sx) || !isFinite(sy)) return;
            // AT A ZOOM WHERE THE COMPOUND ITSELF IS VISIBLE, THE ARROW IS NOISE. These marks
            // exist for a view too wide to show the compounds -- at 571 kb a 20-mer is a
            // fraction of a pixel and a track with 47 of them looks empty. Once the compound
            // is drawn wide enough to see, the arrow points at something already on screen,
            // and a row of them over a tiled design stands in front of the very thing it is
            // announcing. Measured in SCREEN pixels off the mark's own span, which is the
            // compound's span, so it follows the zoom rather than a zoom level guessed at.
            // flexigraph/oligo.js uses the same threshold to decide when the per-compound
            // sequence label may come back, so the two swap over at the same moment.
            const COMPOUND_VISIBLE_PX = 40;
            if (isFinite(__ax) && isFinite(__bx) && Math.abs(__bx - __ax) >= COMPOUND_VISIBLE_PX) return;

            // ONE ARROW PER PLACE, counted per repaint. Seeing an annotation twice means a new
            // frame started, because each mark is drawn exactly once per pass; without the
            // reset the counts would climb on every repaint.
            let reg = null;
            try {
                if (!tgraph.__cmReg) tgraph.__cmReg = { bins: {}, seen: new Set() };
                reg = tgraph.__cmReg;
                if (reg.seen.has(annotation)) { reg.bins = {}; reg.seen = new Set(); }
                reg.seen.add(annotation);
            } catch (e) { reg = null; }
            const BIN = 20;
            const bin = Math.round(sx / BIN);
            let n = 1;
            if (reg) { n = reg.bins[bin] = (reg.bins[bin] || 0) + 1; }

            const TIP = 10, STEM = 30, HW = 15, HH = 17;
            if (n === 1) {
                ctx.save();
                try {
                    ctx.setLineDash([]);
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;
                    ctx.globalAlpha = 1;
                    ctx.lineCap = 'round';
                    // The dark pass first and wider, so the arrow keeps its edge over a pale
                    // exon and over a dark splice arc alike.
                    ctx.strokeStyle = 'rgba(15,23,42,0.85)';
                    ctx.lineWidth = 6;
                    ctx.beginPath();
                    ctx.moveTo(sx, sy - TIP - STEM);
                    ctx.lineTo(sx, sy - TIP);
                    ctx.stroke();
                    ctx.strokeStyle = c;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(sx, sy - TIP - STEM);
                    ctx.lineTo(sx, sy - TIP);
                    ctx.stroke();
                    // The head, drawn here rather than through a helper: this file has no
                    // arrowhead of its own, and a triangle is less to go wrong than a dependency.
                    const head = (fill, grow) => {
                        ctx.beginPath();
                        ctx.moveTo(sx, sy - TIP + grow);
                        ctx.lineTo(sx - HW / 2 - grow, sy - TIP - HH);
                        ctx.lineTo(sx + HW / 2 + grow, sy - TIP - HH);
                        ctx.closePath();
                        ctx.fillStyle = fill;
                        ctx.fill();
                    };
                    head('rgba(15,23,42,0.85)', 2);
                    head(c, 0);
                } catch (e) { }
                ctx.restore();
            }

            // The count, redrawn as the cluster grows so the last value standing is the total.
            if (n > 1) {
                const label = '' + n;
                const w = 14 + label.length * 7, h = 16;
                const bx = sx - w / 2, by = sy - TIP - STEM - h - 4;
                ctx.save();
                try {
                    ctx.setLineDash([]);
                    ctx.shadowColor = 'transparent';
                    ctx.shadowBlur = 0;
                    ctx.globalAlpha = 1;
                    ctx.fillStyle = 'rgba(15,23,42,0.92)';
                    ctx.strokeStyle = c;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    const r = 5;
                    ctx.moveTo(bx + r, by);
                    ctx.lineTo(bx + w - r, by);
                    ctx.arcTo(bx + w, by, bx + w, by + r, r);
                    ctx.lineTo(bx + w, by + h - r);
                    ctx.arcTo(bx + w, by + h, bx + w - r, by + h, r);
                    ctx.lineTo(bx + r, by + h);
                    ctx.arcTo(bx, by + h, bx, by + h - r, r);
                    ctx.lineTo(bx, by + r);
                    ctx.arcTo(bx, by, bx + r, by, r);
                    ctx.closePath();
                    ctx.fill();
                    ctx.stroke();
                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 11px system-ui, -apple-system, Roboto, Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(label, sx, by + h / 2 + 0.5);
                } catch (e) { }
                ctx.restore();
            }
        }),
        'UserAnnotation': createIon((ctx, grid, tgraph, xs, xf, y, color, annotation) => {
            color = annotation.color;
            rawVerticalLine(ctx, grid.X(tgraph.X(xs)), grid.Y(tgraph.Y(y)), 0.13, '#9fe0e8', 0.5);
            drawVerticalLine(ctx, grid.X(tgraph.X(xf)), grid.Y(tgraph.Y(y)), 0.13, '#9fe0e8', 0.7);
            drawLine(ctx, grid.X(tgraph.X(xs)), grid.Y(tgraph.Y(y)), grid.X(tgraph.X(xf)), grid.Y(tgraph.Y(y)), color, 13, 'butt');

        }),

        'Acceptor-Splice-Site': createIon((ctx, graph, tgraph, xss, xff, __y, color, annotation) => {
            var radius = 10;
            let xs = xss - 1;
            let xf = xff - 1;
            drawVerticalLine(graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(__y)), 0.63, '#9fe0e8', 0.5)

            drawVerticalLine(graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(__y)), 0.63, '#9fe0e8', 0.7)
            let x = (grid.X(xs) + graph.X(xf)) / 2;
            let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
            if (screencell > 4) {

                let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;

                ctx.shadowBlur = 2;
                ctx.shadowColor = '#0a2540';

                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(x, graph.Y(tgraph.Y(__y)) + 10, radius, 0, 2 * Math.PI);
                ctx.fillStyle = 'white';
                ctx.fill();
                ctx.stroke();
                ctx.closePath();
                ctx.shadowBlur = 0;
                ctx.font = '13px system-ui, -apple-system, Roboto, Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#0a2540'

                ctx.fillText("A", x, graph.Y(tgraph.Y(__y)) + 10);
                ctx.textAlign = 'left'
            }
        }),
        'Acceptor-Splice-Site.highlight': createIon((ctx, graph, tgraph, xss, xff, __y, color, annotation) => {
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
        'Donor-Splice-Site': createIon((ctx, graph, tgraph, xss, xff, y, color, annotation) => {
            var radius = 10;
            let xs = xss - 1;
            let xf = xff - 1;
            graph.drawVerticalLine(graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(__y)), 0.63, '#9fe0e8', 0.5);
            graph.drawVerticalLine(graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(__y)), 0.63, '#9fe0e8', 0.7);
            let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;
            ctx.shadowBlur = 7;
            ctx.shadowColor = '#0a2540';
            ctx.lineWidth = 3;

            ctx.color = '#1b4a7a'
            let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
            if (screencell > 4) {
                let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, graph.Y(tgraph.Y(__y)) + 10, radius, 0, 2 * Math.PI);
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
                ctx.fillText("A", x, graph.Y(tgraph.Y(__y)) + 10);
                ctx.textAlign = 'left'
            }

        }),
        'Donor-Splice-Site.highlight': createIon((ctx, graph, tgraph, xss, xff, y, color, annotation) => {
            var radius = 10;
            let xs = xss;
            let xf = xff;

            graph.drawLine(
                graph.X(tgraph.X(xs)) + ((graph.X(tgraph.X(xf)) - graph.X(tgraph.X(xs))) / 2),
                graph.Y(tgraph.Y(y)) + 0.05,
                graph.X(tgraph.X(xs)) + ((graph.X(tgraph.X(xf)) - graph.X(tgraph.X(xs))) / 2),
                graph.Y(tgraph.Y(y)),
                'rgb(200,200,200,0.3)', 3, 'butt'
            );

            graph.drawLine(
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'rgb(10,250,10,0.4)', 10, 'butt'
            );

            graph.drawVerticalLine(graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)), 0.13, '#7a4f66', 0.7);
            graph.drawVerticalLine(graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)), 0.13, '#7a4f66', 0.4);

            let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;
            ctx.shadowBlur = 7;
            ctx.shadowColor = '#0a2540';
            let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
            if (screencell > 4) {
                let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(x, graph.Y(tgraph.Y(y)) + 10, radius, 0, 2 * Math.PI);
                ctx.fillStyle = 'white';
                ctx.fill();
                ctx.stroke();
                ctx.closePath();

                ctx.shadowBlur = 0;

                ctx.font = '13px system-ui, -apple-system, Roboto, Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#0a2540'

                ctx.fillText('D', x, graph.Y(tgraph.Y(y)) + 10);
                ctx.shadowBlur = 0;
            }

        }),

        'Canonical-Donor-Splice-Site': createIon((ctx, graph, tgraph, xss, xff, y, color, annotation) => {
            var radius = 10;
            let xs = xss;
            let xf = xff;

            graph.drawLine(
                graph.X(tgraph.X(xs)) + ((graph.X(tgraph.X(xf)) - graph.X(tgraph.X(xs))) / 2),
                graph.Y(tgraph.Y(y)) + 0.05,
                graph.X(tgraph.X(xs)) + ((graph.X(tgraph.X(xf)) - graph.X(tgraph.X(xs))) / 2),
                graph.Y(tgraph.Y(y)),
                'rgb(200,200,200,0.6)', 3, 'butt'
            );

            graph.drawLine(
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'rgb(100,150,100,0.4)', 10, 'butt'
            );

            graph.drawVerticalLine(graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)), 0.63, '#8c2f42', 0.5);
            graph.drawVerticalLine(graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)), 0.63, '#8c2f42', 0.5);

            let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;

            let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))
            if (screencell > 4) {
                let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(x, graph.Y(tgraph.Y(y)) + 10, radius, 0, 2 * Math.PI);
                ctx.fillStyle = 'white';
                ctx.fill();
                ctx.stroke();
                ctx.closePath();

                ctx.shadowBlur = 0;

                ctx.font = '10px system-ui, -apple-system, Roboto, Arial, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#0a2540'
                ctx.fillText("Donor", x, graph.Y(tgraph.Y(y)) + 10);
            }

        }),
        'Exon': createIon((ctx, graph, tgraph, xs, xf, yv, color, annotation, strand) => {
            ctx.setLineDash([]);
            ctx.lineCap = 'butt';

            // Rounded, cylinder-like exon: a capsule with a vertical tropical-teal
            // gradient (light aqua top -> deep teal bottom) and a specular highlight.
            const drawExonCylinder = (c, x1, x2, yc, h) => {
                if (x2 < x1) { const t = x1; x1 = x2; x2 = t; }
                const left = x1, right = Math.max(x2, x1 + 2);
                const r = h / 2;
                const top = yc - r;
                const rr = Math.min(r, (right - left) / 2);
                const path = () => {
                    c.beginPath();
                    c.moveTo(left + rr, top);
                    c.lineTo(right - rr, top);
                    c.arc(right - rr, yc, rr, -Math.PI / 2, Math.PI / 2);
                    c.lineTo(left + rr, yc + r);
                    c.arc(left + rr, yc, rr, Math.PI / 2, -Math.PI / 2);
                    c.closePath();
                };
                c.save();
                c.setLineDash([]);
                c.shadowColor = 'transparent';
                c.shadowBlur = 0;
                path();
                c.clip();
                const g = c.createLinearGradient(0, top, 0, yc + r);
                g.addColorStop(0.0, 'rgba(125,226,233,0.95)');   // light aqua top
                g.addColorStop(0.35, 'rgba(38,180,200,0.95)');   // tropical teal
                g.addColorStop(1.0, 'rgba(15,108,130,0.96)');    // deep teal bottom
                c.fillStyle = g;
                c.fillRect(left, top, right - left, h);
                c.fillStyle = 'rgba(255,255,255,0.32)';          // specular highlight band
                c.fillRect(left, top + h * 0.13, right - left, h * 0.18);
                c.restore();
                c.save();
                c.shadowColor = 'transparent';
                c.shadowBlur = 0;
                path();
                c.lineWidth = 1;
                c.strokeStyle = 'rgba(12,92,112,0.55)';
                c.stroke();
                c.restore();
            };

            drawExonCylinder(ctx,
                graph.X(tgraph.X(xs)), graph.X(tgraph.X(xf + 1)),
                graph.Y(tgraph.Y(yv)), 14);

            let screencell = Math.abs(graph.screenWidth(tgraph.screenWidth(1)))

            if (annotation.showIndex) {
                if (annotation.index >= 0 && screencell < 0.52) {

                    var radius = 10;
                    var ctx = graph.canvas.getCTX();
                    if (ctx) {
                        // Center x on the exon; when zoomed out (small) lift the badge
                        // above the exon so the exon block doesn't obscure the number.
                        let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;
                        let y = graph.Y(tgraph.Y(yv)) + (radius + 10);
                        ctx.save();              // matches the ctx.restore() below
                        ctx.setLineDash([]);
                        ctx.shadowBlur = 0;          // don't inherit a leaked drop shadow
                        ctx.shadowColor = 'transparent';
                        ctx.lineWidth = 1;
                        ctx.shadowBlur = 0;          // don't inherit a leaked drop shadow

                        ctx.beginPath();
                        ctx.arc(x, y, radius, 0, 2 * Math.PI);
                        ctx.fillStyle = 'white';     // white background
                        ctx.strokeStyle = '#0a2540'; // oval border
                        ctx.lineWidth = 1;
                        ctx.fill();
                        ctx.stroke();
                        ctx.closePath();

                        var number = annotation.index;
                        ctx.font = '8px system-ui, -apple-system, Roboto, Arial, sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = 'black';     // black number
                        ctx.fillText(number, x, y);
                        ctx.restore();

                    }

                } else {
                    var radius = 20;
                    let x = (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2;
                    let yr = graph.Y(tgraph.Y(yv));

                    ctx.save();                  // isolate line width / stroke state
                    ctx.setLineDash([]);
                    ctx.shadowBlur = 0;          // don't inherit a leaked drop shadow
                    ctx.shadowColor = 'transparent';
                    ctx.lineWidth = 1;           // thin oval border (avoids a leaked-width donut)
                    ctx.beginPath();
                    ctx.arc(x, yr, radius, 0, 2 * Math.PI);
                    ctx.fillStyle = 'white';     // white background
                    ctx.strokeStyle = '#0a2540'; // oval border
                    ctx.fill();
                    ctx.stroke();
                    ctx.closePath();

                    var number = annotation.index;
                    ctx.font = '15px system-ui, -apple-system, Roboto, Arial, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = 'black';     // black number
                    ctx.fillText(number, x, yr);
                    ctx.restore();

                }
            }
        }),
        'TSS': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'rgba(78,157,105,0.55)', 40, 'butt'
            );

            drawLine(ctx,
                graph.X(tgraph.X(xs)) - 1, graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xs)) + 1, graph.Y(tgraph.Y(y)),
                '#1aa3bd', 4, 'butt'
            );

            drawLine(ctx,
                graph.X(tgraph.X(xf)) - 1, graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)) + 1, graph.Y(tgraph.Y(y)),
                '#1aa3bd', 4, 'butt'
            );
        }),
        'STOP': createIon((ctx, graph, tgraph, xs, xf, y) => {

            let screencell = graph.screenWidth(tgraph.screenWidth(1))
            if (screencell < 0.05) {
                return;
            }
            drawLine(ctx, graph.X(xs) - 1, graph.Y(y), graph.X(xs) + 1, graph.Y(y), '#1aa3bd', 10, 'butt')
            drawLine(ctx, graph.X(xf) - 1, graph.Y(y), graph.X(xf) + 1, graph.Y(y), '#1aa3bd', 10, 'butt')
            drawString45(ctx, 'TC', xf - 0.5, y + 1, '#8399ac', '10px system-ui, -apple-system, Roboto, Arial, sans-serif')

        }),
        'oligo': createIon((ctx, graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf, y, '#17a39a', 1, 'butt')

        }),
        'ProteinDomain': createIon((graph, tgraph, xs, xf, y, color, annotation) => {
            drawLine(
                ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y + 1)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y + 1)),
                '#9fe0e82a', 20, 'butt'
            );

            drawLine(
                ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y + 1)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y + 1)),
                '#ed63ff', 2, 'butt'
            );

            drawLine(
                ctx,
                (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2, graph.Y(tgraph.Y(y)),
                (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2, graph.Y(tgraph.Y(y + 1)),
                '#1aa3bd', 4, 'butt'
            );

            drawLine(
                ctx,
                (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2, graph.Y(tgraph.Y(y)),
                (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2, graph.Y(tgraph.Y(y + annotation.labelY - 2)),
                '#42a83e9f', 1, 'butt'
            );

            drawString(ctx,
                annotation.name,
                (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2,
                graph.Y(tgraph.Y(y + annotation.labelY - 2)),
                '#0a2540',
                '10px system-ui, -apple-system, Roboto, Arial, sans-serif'
            );

            let screencell = graph.screenWidth(tgraph.screenWidth(1))
            if (screencell < 1.5 && screencell > 0.1) {
                if (annotation.description != null && annotation.description.length > 0) {
                    drawLine(ctx,
                        (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2, graph.Y(tgraph.Y(y)),
                        (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2, graph.Y(tgraph.Y(y)),
                        '#0a2540', 1, 'butt'
                    );
                    // drawString(ctx,
                    //     annotation.description,
                    //     (graph.X(tgraph.X(xs)) + graph.X(tgraph.X(xf))) / 2,
                    //     graph.Y(tgraph.Y(y + annotation.labelY - 2)),
                    //     '#0a2540',
                    //     '10px system-ui, -apple-system, Roboto, Arial, sans-serif'
                    // );
                }

            }

        }),
        'amplicon': createIon((graph, tgraph, xs, xf, y, color, annotation) => {

        }),
        'aso': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(
                ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                '#17a39a', 1, 'butt'
            );

        }), 'AA': createIon((ctx, graph, tgraph, xs, xf, y, color, annotation) => {

            let screencell = graph.screenWidth(tgraph.screenWidth(1))

            drawLine(
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'rgba(200,0,0,0.5)', 65, 'butt'
            );

            drawLine(
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y + annotation.labelY - 1)),
                'rgba(120,130,145,0.45)', 1, 'butt'
            );

            if (screencell > 0.5) {
                drawString(
                    annotation.name,
                    graph.X(tgraph.X(xs)),
                    graph.Y(tgraph.Y(y + annotation.labelY - 1)),
                    '#0a2540',
                    '10px system-ui, -apple-system, Roboto, Arial, sans-serif'
                );
            }

        }),

        'Translation': createIon((ctx, graph, tgraph, xs, xf, y) => {
            let screencell = graph.screenWidth(tgraph.screenWidth(1))
            if (screencell < 0.05) {
                return;
            }
            let r = 0.1;

            drawString(ctx,
                'START',
                graph.X(tgraph.X(xs)),
                graph.Y(tgraph.Y(y + r)),
                '#0a2540',
                '9px system-ui, -apple-system, Roboto, Arial, sans-serif'
            );

            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)),
                graph.Y(tgraph.Y(y)),
                0.2,
                '#17a39a',
                4
            );

            drawString(ctx,
                'STOP',
                graph.X(tgraph.X(xf - 1)),
                graph.Y(tgraph.Y(y + r)),
                '#0a2540',
                '9px system-ui, -apple-system, Roboto, Arial, sans-serif'
            );

            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)),
                graph.Y(tgraph.Y(y)),
                0.2,
                '#9c3350',
                4
            );

        }),
        'CODON': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'rgba(120,130,145,0.45)', 3, 'butt'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, '#8399ac'
            );
        }),
        'CDS': createIon((ctx, graph, tgraph, xs, xf, y) => {
            graph.drawLine(xs, y, xf + 1, y, 'rgb(255, 187, 0)', 3)
            graph.drawVerticalLine(xs, y, 0.08, '#1aa3bd', 1)
            graph.drawVerticalLine(xf + 1, y, 0.08, '#1aa3bd', 1)
        }),
        'UTR': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                '#9fe0e8', 7
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, '#9fe0e8'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, '#9fe0e8'
            );
        }),
        'polypeptide': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                'rgba(120,130,145,0.45)', 1
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, 'rgba(120,130,145,0.45)'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, 'rgba(120,130,145,0.45)'
            );
        }),
        'rna-binding': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawZigZag(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                '#b0533f', 4, 'round'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, '#0a2540'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, '#0a2540'
            );
        }),
        'snp': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawZigZag(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                '#6e4560', 20, 'round'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, '#0a2540'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, '#0a2540'
            );
        }),
        'Query': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                '#6e4560', 12, 'round'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, '#0a2540'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, '#0a2540'
            );
        }),
        'Query-Target': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                '#b0533f', 12, 'round'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, '#0a2540'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, '#0a2540'
            );
        }),
        'biological_region': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                '#7a4f66', 5
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.2, '#7a4f66'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.2, '#7a4f66'
            );
        }),
        'region': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                '#7f96a8', 2, 'butt'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                0.1, '#7f96a8'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                0.1, '#7f96a8'
            );
        }),
        'polyA': createIon((ctx, graph, tgraph, xs, xf, y) => {
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                '#1aa3bd', 25, 'round'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y)),
                1.1, 'rgba(120,130,145,0.45)'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y)),
                1.1, 'rgba(120,130,145,0.45)'
            );
        }),
        'lncRNA': createIon((ctx, graph, tgraph, xs, xf, y, color, annotation) => {
            let screencell = graph.screenWidth(tgraph.screenWidth(1));
            drawLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y + 0.3)),
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y + 0.3)),
                '#1aa3bd', 25, 'round'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xs)), graph.Y(tgraph.Y(y + 0.3)),
                1.1, '#7a4f66'
            );
            drawVerticalLine(ctx,
                graph.X(tgraph.X(xf)), graph.Y(tgraph.Y(y + 0.3)),
                1.1, '#7a4f66'
            );
            let name = 'lncRNA'
            if (screencell > 0.01 && annotation.name) {
                name = annotation.name;
            }
            let r = 0.35;
            drawString(ctx,
                name,
                graph.X(tgraph.X(xs)),
                graph.Y(tgraph.Y(y + 1 + r)),
                '#0a2540',
                '10px system-ui, -apple-system, Roboto, Arial, sans-serif'
            );
        }),

    }

}
