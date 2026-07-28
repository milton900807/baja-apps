function () {

    return new Promise(async (resolve, reject) => {

        const ShapeModule = await exec('flexigraph/shapes/shape.js');

        class SvgGlyph {

            static fromSvgString(svgString) {

                if (typeof svgString !== 'string') {
                    console.warn('fromSvgString expected a string, got:', typeof svgString, svgString);
                    throw new Error('SVG source must be a string');
                }

                const trimmed = svgString.trim();
                if (!trimmed) {
                    throw new Error('SVG string is empty');
                }

                function parseNum(el, attr, fallback = 0) {
                    const v = el.getAttribute(attr);
                    const n = v != null ? Number(v) : NaN;
                    return Number.isFinite(n) ? n : fallback;
                }

                function getShapeBounds(el) {
                    const tag = el.tagName.toLowerCase();
                    if (tag === 'rect') {
                        const x = parseNum(el, 'x');
                        const y = parseNum(el, 'y');
                        const w = parseNum(el, 'width');
                        const h = parseNum(el, 'height');
                        return { x, y, w, h };
                    } else if (tag === 'ellipse') {
                        const cx = parseNum(el, 'cx');
                        const cy = parseNum(el, 'cy');
                        const rx = parseNum(el, 'rx');
                        const ry = parseNum(el, 'ry');
                        return { x: cx - rx, y: cy - ry, w: 2 * rx, h: 2 * ry };
                    } else if (tag === 'circle') {
                        const cx = parseNum(el, 'cx');
                        const cy = parseNum(el, 'cy');
                        const r = parseNum(el, 'r');
                        return { x: cx - r, y: cy - r, w: 2 * r, h: 2 * r };
                    } else if (tag === 'line') {
                        const x1 = parseNum(el, 'x1');
                        const y1 = parseNum(el, 'y1');
                        const x2 = parseNum(el, 'x2');
                        const y2 = parseNum(el, 'y2');
                        const xMin = Math.min(x1, x2);
                        const yMin = Math.min(y1, y2);
                        const xMax = Math.max(x1, x2);
                        const yMax = Math.max(y1, y2);
                        return { x: xMin, y: yMin, w: xMax - xMin, h: yMax - yMin };
                    }
                    return null;
                }

                function buildGlyphFromSvgRoot(svgRoot) {
                    const ns = svgRoot.namespaceURI || 'http://www.w3.org/2000/svg';
                    const doc = svgRoot.ownerDocument || (typeof document !== 'undefined' ? document : null);

                    const baseNodeList = svgRoot.querySelectorAll(
                        'rect,line,polyline,polygon,circle,ellipse,text'
                    );
                    const baseElements = Array.from(baseNodeList);

                    if (!baseElements.length) {
                        console.warn('fromSvgString: no base geometric elements (rect/line/poly*/circle/ellipse) found');

                    }

                    const shapes = [];
                    let bbox = null;

                    function expandBBox(b) {
                        if (!b) return;
                        if (!bbox) {
                            bbox = {
                                xMin: b.x,
                                yMin: b.y,
                                xMax: b.x + b.w,
                                yMax: b.y + b.h
                            };
                        } else {
                            bbox.xMin = Math.min(bbox.xMin, b.x);
                            bbox.yMin = Math.min(bbox.yMin, b.y);
                            bbox.xMax = Math.max(bbox.xMax, b.x + b.w);
                            bbox.yMax = Math.max(bbox.yMax, b.y + b.h);
                        }
                    }

                    for (const el of baseElements) {
                        try {
                            const shape = SvgGlyph.createShapeFromSvgElement(el, ShapeModule);
                            if (shape) {
                                shapes.push(shape);
                                const b = getShapeBounds(el);
                                expandBBox(b);
                            }
                        } catch (err) {
                            console.warn('Skipping unsupported SVG element:', el.tagName, err);
                        }
                    }

                    if (doc) {
                        const arrowLines = Array.from(svgRoot.querySelectorAll('line[marker-end]'));
                        for (const lineEl of arrowLines) {
                            try {
                                const x1 = parseNum(lineEl, 'x1');
                                const y1 = parseNum(lineEl, 'y1');
                                const x2 = parseNum(lineEl, 'x2');
                                const y2 = parseNum(lineEl, 'y2');

                                const dx = x2 - x1;
                                const dy = y2 - y1;
                                const len = Math.sqrt(dx * dx + dy * dy) || 1;

                                const ux = dx / len;
                                const uy = dy / len;

                                const strokeWidth = parseNum(lineEl, 'stroke-width', 1.5);
                                const arrowLen = strokeWidth * 5;
                                const arrowWidth = strokeWidth * 4;

                                const tipX = x2;
                                const tipY = y2;

                                const baseX = x2 - ux * arrowLen;
                                const baseY = y2 - uy * arrowLen;

                                const px = -uy;
                                const py = ux;

                                const leftX = baseX + px * (arrowWidth / 2);
                                const leftY = baseY + py * (arrowWidth / 2);
                                const rightX = baseX - px * (arrowWidth / 2);
                                const rightY = baseY - py * (arrowWidth / 2);

                                const poly = doc.createElementNS(ns, 'polygon');
                                poly.setAttribute(
                                    'points',
                                    `${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`
                                );

                                const stroke = lineEl.getAttribute('stroke') || '#333';
                                const fill = lineEl.getAttribute('stroke') ||
                                    lineEl.getAttribute('fill') || '#333';
                                poly.setAttribute('stroke', stroke);
                                poly.setAttribute('fill', fill);

                                svgRoot.appendChild(poly);
                                try {
                                    const arrowShape = SvgGlyph.createShapeFromSvgElement(poly, ShapeModule);
                                    if (arrowShape) {
                                        shapes.push(arrowShape);
                                        const b = getShapeBounds(lineEl);
                                        expandBBox(b);
                                    }
                                } finally {
                                    svgRoot.removeChild(poly);
                                }
                            } catch (err) {
                                console.warn('Failed to synthesize arrowhead for line:', err);
                            }
                        }
                    }

                    if (!shapes.length) {
                        console.warn('fromSvgString: no shapes created from geometry; continuing with text-only glyph if text exists');
                    }

                    let shape;
                    if (shapes.length === 1) {
                        shape = shapes[0];
                    } else if (shapes.length > 1) {
                        shape = SvgGlyph._makeCompositeShape(shapes);
                    } else {

                        shape = SvgGlyph._makeCompositeShape([]);
                    }
                    shape.svg = svgString;
                    return shape;
                }

                if (typeof DOMParser === 'undefined') {
                    if (typeof document !== 'undefined') {
                        const container = document.createElement('div');
                        container.innerHTML = trimmed;
                        const svgRoot = container.querySelector('svg');
                        if (!svgRoot) {
                            throw new Error('Provided string is not a valid SVG document (no <svg> found)');
                        }
                        return buildGlyphFromSvgRoot(svgRoot);
                    }
                    throw new Error('DOMParser is not available in this environment');
                }

                const parser = new DOMParser();

                let doc = parser.parseFromString(trimmed, 'image/svg+xml');
                let svgRoot = doc.documentElement;
                let nodeName = svgRoot && svgRoot.nodeName ? svgRoot.nodeName.toLowerCase() : null;

                if (nodeName === 'parsererror') {
                    console.warn('SVG parsererror (image/svg+xml):', svgRoot.textContent || '');
                    svgRoot = null;
                }

                if (!svgRoot || nodeName !== 'svg') {
                    try {
                        const htmlDoc = parser.parseFromString(trimmed, 'text/html');
                        const altSvg = htmlDoc.querySelector('svg');
                        if (altSvg) {
                            svgRoot = altSvg;
                            nodeName = 'svg';
                        }
                    } catch (e) {
                        console.warn('Fallback parse as text/html failed:', e);
                    }
                }

                if ((!svgRoot || nodeName !== 'svg') && typeof document !== 'undefined') {
                    try {
                        const container = document.createElement('div');
                        container.innerHTML = trimmed;
                        const altSvg2 = container.querySelector('svg');
                        if (altSvg2) {
                            svgRoot = altSvg2;
                            nodeName = 'svg';
                        }
                    } catch (e) {
                        console.warn('Manual DOM injection fallback failed:', e);
                    }
                }

                if (!svgRoot || nodeName !== 'svg') {
                    console.warn('fromSvgString: could not find <svg> root. nodeName was:', nodeName);
                    throw new Error('Provided string is not a valid SVG document');
                }

                return buildGlyphFromSvgRoot(svgRoot);
            }

            static _readStyle(el) {
                const fillAttr = el.getAttribute('fill');
                const strokeAttr = el.getAttribute('stroke');
                const swAttr = el.getAttribute('stroke-width');

                return {
                    fill: fillAttr != null ? fillAttr : 'none',
                    stroke: strokeAttr != null ? strokeAttr : 'black',
                    strokeWidth: swAttr != null ? parseFloat(swAttr) || 1 : 1
                };
            }

            static _makeCompositeShape(shapes) {
                return {
                    type: 'svg_group',
                    shapes,

                    draw(grid, ctx) {
                        for (const s of shapes) {
                            if (s && typeof s.draw === 'function') {
                                s.draw(grid, ctx);
                            }
                        }
                    },

                    inside(grid, wx, wy) {
                        return shapes.some(
                            s => s && typeof s.inside === 'function' && s.inside(grid, wx, wy)
                        );
                    },

                    toJSON() {
                        return {
                            type: 'svg_group',
                            shapes: shapes.map(s => (s.toJSON ? s.toJSON() : s))
                        };
                    },

                    drawSVG(grid, renderer, glyph) {
                        const isNum = v => typeof v === 'number' && !Number.isNaN(v);

                        for (const s of shapes) {
                            if (!s) continue;

                            if (typeof s.drawSVG === 'function') {
                                s.drawSVG(grid, renderer, glyph || this);
                                continue;
                            }

                            const hasRect =
                                isNum(s.x) && isNum(s.y) && isNum(s.w) && isNum(s.h);
                            const hasLine =
                                isNum(s.x1) && isNum(s.y1) && isNum(s.x2) && isNum(s.y2);
                            const hasCircle =
                                isNum(s.cx) && isNum(s.cy) && isNum(s.r);
                            const hasEllipse =
                                isNum(s.cx) && isNum(s.cy) && isNum(s.rx) && isNum(s.ry);
                            const hasPoints =
                                Array.isArray(s.pts) && s.pts.length > 0 &&
                                isNum(s.pts[0].x) && isNum(s.pts[0].y);

                            if (hasRect && typeof renderer.rect === 'function') {
                                renderer.rect(s.x, s.y, s.w, s.h, {
                                    fill: "white",
                                    stroke: "black",
                                    "stroke-width": 0.5
                                });
                            } else if (hasLine && typeof renderer.line === 'function') {
                                renderer.line(s.x1, s.y1, s.x2, s.y2, {
                                    stroke: "black",
                                    "stroke-width": 0.5
                                });
                            } else if (hasCircle) {
                                if (typeof renderer.circle === 'function') {
                                    renderer.circle(s.cx, s.cy, s.r, {
                                        fill: "none",
                                        stroke: "black",
                                        "stroke-width": 0.5
                                    });
                                } else if (typeof renderer.rect === 'function') {
                                    renderer.rect(s.cx - s.r, s.cy - s.r, 2 * s.r, 2 * s.r, {
                                        fill: "none",
                                        stroke: "black",
                                        "stroke-width": 0.5
                                    });
                                }
                            } else if (hasEllipse) {
                                if (typeof renderer.ellipse === 'function') {
                                    renderer.ellipse(s.cx, s.cy, s.rx, s.ry, {
                                        fill: "none",
                                        stroke: "black",
                                        "stroke-width": 0.5
                                    });
                                } else if (typeof renderer.rect === 'function') {
                                    renderer.rect(s.cx - s.rx, s.cy - s.ry, 2 * s.rx, 2 * s.ry, {
                                        fill: "none",
                                        stroke: "black",
                                        "stroke-width": 0.5
                                    });
                                }
                            } else if (hasPoints && typeof renderer.polyline === 'function') {
                                renderer.polyline(s.pts, {
                                    fill: s.isClosed ? "white" : "none",
                                    stroke: "black",
                                    "stroke-width": 0.5
                                });
                            }
                        }

                        return renderer;
                    }
                };
            }

            static createShapeFromSvgElement(el, ShapeModule) {
                const tag = el.tagName.toLowerCase();

                const factories = {
                    rect: SvgGlyph._makeRect,
                    line: SvgGlyph._makeLine,
                    circle: SvgGlyph._makeCircle,
                    ellipse: SvgGlyph._makeEllipse,
                    polyline: SvgGlyph._makePolyline,
                    polygon: SvgGlyph._makePolygon,
                    text: SvgGlyph._makeText
                };

                const factory = factories[tag];
                if (!factory) {
                    throw new Error(`Unsupported SVG element: <${tag}>`);
                }

                return factory(el, ShapeModule);
            }

            static _makeRect(el) {
                const x = parseFloat(el.getAttribute('x') || '0');
                const ySvg = parseFloat(el.getAttribute('y') || '0');
                const w = parseFloat(el.getAttribute('width') || '0');
                const h = parseFloat(el.getAttribute('height') || '0');
                const style = SvgGlyph._readStyle(el);

                const y = -(ySvg + h);

                return {
                    x, y, w, h,
                    xf: x + w,
                    yf: y + h,
                    style,
                    draw(grid, ctx) {
                        const sx = grid.X(this.x);
                        const syTop = grid.Y(this.y + this.h);
                        const sw = grid.screenWidth(this.w);
                        const sh = grid.screenHeight(this.h);

                        ctx.lineWidth = this.style.strokeWidth;
                        ctx.strokeStyle = this.style.stroke;

                        if (this.style.fill && this.style.fill !== 'none') {
                            ctx.fillStyle = this.style.fill;
                        } else {
                            ctx.fillStyle = 'transparent';
                        }

                        ctx.beginPath();
                        ctx.rect(sx, syTop, sw, sh);
                        if (this.style.fill && this.style.fill !== 'none') {
                            ctx.fill();
                        }
                        ctx.stroke();
                    },
                    inside(grid, wx, wy) {
                        return (
                            wx >= this.x &&
                            wx <= this.x + this.w &&
                            wy >= this.y &&
                            wy <= this.y + this.h
                        );
                    }
                };
            }

            static _makeLine(el) {
                const x1 = parseFloat(el.getAttribute('x1') || '0');
                const y1Svg = parseFloat(el.getAttribute('y1') || '0');
                const x2 = parseFloat(el.getAttribute('x2') || '0');
                const y2Svg = parseFloat(el.getAttribute('y2') || '0');
                const style = SvgGlyph._readStyle(el);

                const y1 = -y1Svg;
                const y2 = -y2Svg;

                return {
                    x1, y1, x2, y2,
                    style,
                    draw(grid, ctx) {
                        ctx.strokeStyle = this.style.stroke;
                        ctx.lineWidth = this.style.strokeWidth;
                        ctx.beginPath();
                        ctx.moveTo(grid.X(this.x1), grid.Y(this.y1));
                        ctx.lineTo(grid.X(this.x2), grid.Y(this.y2));
                        ctx.stroke();
                    }
                };
            }

            static _makeCircle(el) {
                const cx = parseFloat(el.getAttribute('cx') || '0');
                const cySvg = parseFloat(el.getAttribute('cy') || '0');
                const r = parseFloat(el.getAttribute('r') || '0');
                const style = SvgGlyph._readStyle(el);

                const cy = -cySvg;

                return {
                    cx, cy, r,
                    x: cx - r,
                    y: cy - r,
                    w: 2 * r,
                    h: 2 * r,
                    xf: cx + r,
                    yf: cy + r,
                    style,
                    draw(grid, ctx) {
                        const sx = grid.X(this.cx);
                        const sy = grid.Y(this.cy);
                        const sr = grid.screenWidth(this.r);

                        ctx.strokeStyle = this.style.stroke;
                        ctx.lineWidth = this.style.strokeWidth;

                        if (this.style.fill && this.style.fill !== 'none') {
                            ctx.fillStyle = this.style.fill;
                        }

                        ctx.beginPath();
                        ctx.arc(sx, sy, sr, 0, 2 * Math.PI);
                        if (this.style.fill && this.style.fill !== 'none') {
                            ctx.fill();
                        }
                        ctx.stroke();
                    },
                    inside(grid, wx, wy) {
                        const dx = wx - this.cx;
                        const dy = wy - this.cy;
                        return dx * dx + dy * dy <= this.r * this.r;
                    }
                };
            }

            static _makeEllipse(el) {
                const cx = parseFloat(el.getAttribute('cx') || '0');
                const cySvg = parseFloat(el.getAttribute('cy') || '0');
                const rx = parseFloat(el.getAttribute('rx') || '0');
                const ry = parseFloat(el.getAttribute('ry') || '0');
                const style = SvgGlyph._readStyle(el);

                const cy = -cySvg;

                return {
                    cx, cy, rx, ry,
                    x: cx - rx,
                    y: cy - ry,
                    w: rx * 2,
                    h: ry * 2,
                    style,
                    draw(grid, ctx) {
                        const sx = grid.X(this.cx);
                        const sy = grid.Y(this.cy);
                        const srx = grid.screenWidth(this.rx);
                        const sry = grid.screenHeight(this.ry);

                        ctx.strokeStyle = this.style.stroke;
                        ctx.lineWidth = this.style.strokeWidth;
                        if (this.style.fill && this.style.fill !== 'none') {
                            ctx.fillStyle = this.style.fill;
                        }

                        ctx.beginPath();
                        ctx.save();
                        ctx.translate(sx, sy);
                        ctx.scale(srx, sry);
                        ctx.arc(0, 0, 1, 0, Math.PI * 2);
                        ctx.restore();

                        if (this.style.fill && this.style.fill !== 'none') {
                            ctx.fill();
                        }
                        ctx.stroke();
                    }
                };
            }

            static _makePolyline(el) {
                const ptsStr = el.getAttribute('points') || '';
                const pts = ptsStr.trim().split(/\s+/).map(p => {
                    const [x, y] = p.split(',').map(Number);
                    return { x, y: -y };
                });
                const style = SvgGlyph._readStyle(el);

                return {
                    pts,
                    style,
                    draw(grid, ctx) {
                        ctx.strokeStyle = this.style.stroke;
                        ctx.lineWidth = this.style.strokeWidth;
                        ctx.beginPath();
                        this.pts.forEach((p, i) => {
                            const sx = grid.X(p.x);
                            const sy = grid.Y(p.y);
                            if (i === 0) ctx.moveTo(sx, sy);
                            else ctx.lineTo(sx, sy);
                        });
                        ctx.stroke();
                    }
                };
            }

            static _makePolygon(el) {
                const ptsStr = el.getAttribute('points') || '';
                const pts = ptsStr.trim().split(/\s+/).map(p => {
                    const [x, y] = p.split(',').map(Number);
                    return { x, y: -y };
                });
                const style = SvgGlyph._readStyle(el);

                return {
                    pts,
                    isClosed: true,
                    style,
                    draw(grid, ctx) {
                        ctx.strokeStyle = this.style.stroke;
                        ctx.lineWidth = this.style.strokeWidth;

                        if (this.style.fill && this.style.fill !== 'none') {
                            ctx.fillStyle = this.style.fill;
                        } else {
                            ctx.fillStyle = 'transparent';
                        }

                        ctx.beginPath();
                        this.pts.forEach((p, i) => {
                            const sx = grid.X(p.x);
                            const sy = grid.Y(p.y);
                            if (i === 0) ctx.moveTo(sx, sy);
                            else ctx.lineTo(sx, sy);
                        });
                        ctx.closePath();
                        if (this.style.fill && this.style.fill !== 'none') {
                            ctx.fill();
                        }
                        ctx.stroke();
                    }
                };
            }

            static _makeText(el) {
                const x = parseFloat(el.getAttribute('x') || '0');
                const ySvg = parseFloat(el.getAttribute('y') || '0');
                const text = el.textContent || '';
                const style = SvgGlyph._readStyle(el);
                const fontSizeAttr = el.getAttribute('font-size');
                const fontSize = fontSizeAttr != null ? (parseFloat(fontSizeAttr) || 10) : 10;

                const y = -ySvg;

                return {
                    x, y, text,
                    style,
                    fontSize,
                    draw(grid, ctx) {
                        const unitY = typeof grid.screenHeight === 'function'
                            ? Math.abs(grid.screenHeight(1))
                            : 1;
                        const px = Math.max(1, unitY * this.fontSize);
                        ctx.fillStyle = this.style.fill && this.style.fill !== 'none'
                            ? this.style.fill
                            : (this.style.stroke || 'black');
                        ctx.font = px + 'px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(this.text, grid.X(this.x), grid.Y(this.y));
                    }
                };
            }
        }

        return resolve(SvgGlyph);
    })
}
