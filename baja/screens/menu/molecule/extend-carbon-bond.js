function (platetrack, formula) {

    try {

        let clickIndex = 0;

        let hd = {
            startWx: null,
            startWy: null,
            endWx: null,
            endWy: null,
            isDrawing: false,
            priority: true,
            id: 'glyph-override-extend-carbon-bond',

            draw: (grid, ctx) => {
                if (!hd.isDrawing) return;
                if (![hd.startWx, hd.startWy, hd.endWx, hd.endWy].every(v => typeof v === 'number' && Number.isFinite(v))) return;

                const now = Date.now();
                const pulse = (Math.sin(now / 400) + 1) / 2;

                ctx.save();
                ctx.globalAlpha = 0.4 + 0.3 * pulse;
                ctx.lineWidth = 2 + 3 * pulse;
                ctx.strokeStyle = 'rgba(0,150,255,1)';
                ctx.lineCap = 'round';

                ctx.beginPath();
                ctx.moveTo(grid.X(hd.startWx), grid.Y(hd.startWy));
                ctx.lineTo(grid.X(hd.endWx), grid.Y(hd.endWy));
                ctx.stroke();
                ctx.restore();
            },

            mouseDownListener: async (x, y) => {
                const grid = platetrack.grid;
                const wx = grid.Xwc(x);
                const wy = grid.Ywc(y);
                clickIndex++;

                if (clickIndex === 1) {
                    const node = findNearestExistingNode(platetrack, wx, wy, grid);
                    if (!node) {
                        clickIndex = 0;
                        hd.isDrawing = false;
                        hd.startWx = null;
                        hd.startWy = null;
                        hd.endWx = null;
                        hd.endWy = null;
                        return;
                    }
                    hd.startWx = node.x;
                    hd.startWy = node.y;
                    const preview = snappedEndpointFromPointer(grid, hd.startWx, hd.startWy, wx, wy);
                    hd.endWx = preview.x;
                    hd.endWy = preview.y;
                    hd.isDrawing = true;
                    return;
                }

                if (clickIndex === 2) {
                    const snapped = snappedEndpointFromPointer(grid, hd.startWx, hd.startWy, wx, wy);
                    hd.endWx = snapped.x;
                    hd.endWy = snapped.y;

                    let Shape = await exec('flexigraph/shapes/shape.js');
                    const Glyph = await exec('baja/draw/glyph.js');

                    const line = Shape._makeLineFromWorld(
                        hd.startWx, hd.startWy,
                        hd.endWx, hd.endWy,
                        { stroke: '#0096ff', strokeWidth: 2, 'stroke-linecap': 'round' },
                        Shape.getGfx?.() || Shape.DefaultGfx
                    );

                    if (line) {
                        const glyph = new Glyph(line);
                        platetrack.addGlyphNoSelect(glyph);
                    }

                    platetrack.wb(null);
                }
            },

            mouseMoveListener: (x, y) => {
                if (!hd.isDrawing) return;
                const grid = platetrack.grid;
                const wx = grid.Xwc(x);
                const wy = grid.Ywc(y);
                const snapped = snappedEndpointFromPointer(grid, hd.startWx, hd.startWy, wx, wy);
                hd.endWx = snapped.x;
                hd.endWy = snapped.y;
            },

            mouseUpListener: () => {},
            close: () => { hd.isDrawing = false; }
        };

        function snappedEndpointFromPointer(grid, startWx, startWy, rawWx, rawWy) {
            const pxTarget = 120;
            const worldPerPxX = Math.abs(grid.Xwc(1) - grid.Xwc(0)) || 0.01;
            const bondLen = pxTarget * worldPerPxX;
            let dx = rawWx - startWx;
            let dy = rawWy - startWy;
            if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) { dx = 1; dy = 0; }
            const step = 30 * Math.PI / 180;
            const angle = Math.atan2(dy, dx);
            const snappedAngle = Math.round(angle / step) * step;
            return {
                x: startWx + bondLen * Math.cos(snappedAngle),
                y: startWy + bondLen * Math.sin(snappedAngle)
            };
        }

        function findNearestExistingNode(platetrack, wx, wy, grid) {
            const hitRadiusPx = 20;
            const hitRadiusWorld = Math.abs(grid.Xwc(hitRadiusPx) - grid.Xwc(0)) || 0.2;
            const candidates = collectLineEndpoints(platetrack);
            if (!candidates.length) return null;
            let best = null;
            let bestDist = Infinity;
            for (const p of candidates) {
                const dx = p.x - wx;
                const dy = p.y - wy;
                const d = Math.sqrt(dx * dx + dy * dy);
                if (d < hitRadiusWorld && d < bestDist) {
                    best = p;
                    bestDist = d;
                }
            }
            return best;
        }

        function collectLineEndpoints(platetrack) {
            const pts = [];
            const seen = new Set();
            const addPt = (x, y) => {
                if (!(typeof x === 'number' && Number.isFinite(x))) return;
                if (!(typeof y === 'number' && Number.isFinite(y))) return;
                const key = `${x.toFixed(4)}|${y.toFixed(4)}`;
                if (seen.has(key)) return;
                seen.add(key);
                pts.push({ x, y });
            };
            const visitShape = (shape) => {
                if (!shape) return;
                if (shape.type === 'line') {
                    addPt(shape.x1, shape.y1);
                    addPt(shape.x2, shape.y2);
                }
                if ('x1' in shape && 'y1' in shape) addPt(shape.x1, shape.y1);
                if ('x2' in shape && 'y2' in shape) addPt(shape.x2, shape.y2);
                if (Array.isArray(shape.shapes)) {
                    for (const child of shape.shapes) visitShape(child);
                }
                if (shape.shape && shape.shape !== shape) visitShape(shape.shape);
            };
            const pools = [platetrack?.glyphs, platetrack?.drawables, platetrack?.items, platetrack?.wbv?.glyphs, platetrack?.model?.glyphs];
            for (const pool of pools) {
                if (!Array.isArray(pool)) continue;
                for (const g of pool) visitShape(g);
            }
            return pts;
        }

        setTimeout(() => {
            platetrack.wb(hd);
        }, 50);

    } catch (err) {
        console.error('Extend carbon bond failed:', err);
        platetrack.wb(null);
    }
}