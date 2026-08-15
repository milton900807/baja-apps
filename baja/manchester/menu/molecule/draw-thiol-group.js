function (platetrack, formula) {

    try {

        let hd = {
            priority: true,
            id: 'draw-thiol-group',

            mouseDownListener: async (x, y) => {
                try {
                    const grid = platetrack.grid;
                    const wx = grid.Xwc(x);
                    const wy = grid.Ywc(y);

                    let Shape = await exec('flexigraph/shapes/shape.js');
                    const Glyph = await exec('baja/draw/glyph.js');

        const addAtomLabel = (Shape, Glyph, tx, ty, label) => {
            try {
                const svgNS = 'http://www.w3.org/2000/svg';
                const el = document.createElementNS(svgNS, 'text');
                el.setAttribute('x', String(tx));
                el.setAttribute('y', String(-ty));
                el.setAttribute('text-anchor', 'middle');
                el.setAttribute('font-size', '14');
                el.setAttribute('fill', '#111');
                el.textContent = label;
                const textShape = Shape._makeText(
                    el,
                    Shape.getGfx?.() || Shape.DefaultGfx
                );
                if (textShape) {
                    textShape.textFill = '#111';
                    textShape.boxFill = 'rgba(255,255,255,0.90)';
                    textShape.boxStroke = 'rgba(0,0,0,0.25)';
                    textShape.boxLineWidth = 1;
                    platetrack.addGlyphNoSelect(new Glyph(textShape));
                }
            } catch (err) {
                console.warn('Atom label failed:', err);
            }
        };

        const addBond = (Shape, Glyph, x1, y1, x2, y2, style = {}) => {
            const line = Shape._makeLineFromWorld(
                x1, y1,
                x2, y2,
                Object.assign({
                    stroke: '#0096ff',
                    strokeWidth: 2,
                    'stroke-linecap': 'round'
                }, style),
                Shape.getGfx?.() || Shape.DefaultGfx
            );
            if (line) {
                platetrack.addGlyphNoSelect(new Glyph(line));
            }
        };

        const getBondLen = (grid, pxTarget = 120) => {
            const worldPerPxX = Math.abs(grid.Xwc(1) - grid.Xwc(0)) || 0.01;
            return pxTarget * worldPerPxX;
        };

        const hexPts = (cx, cy, r, startDeg = -30) => {
            const pts = [];
            for (let i = 0; i < 6; i++) {
                const a = (startDeg + i * 60) * Math.PI / 180;
                pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
            }
            return pts;
        };

        const ringFromPts = (Shape, Glyph, pts, bondStyle = {}) => {
            for (let i = 0; i < pts.length; i++) {
                const p1 = pts[i];
                const p2 = pts[(i + 1) % pts.length];
                addBond(Shape, Glyph, p1.x, p1.y, p2.x, p2.y, bondStyle);
            }
        };

        const chainPts = (cx, cy, step, anglesDeg) => {
            const pts = [{ x: cx, y: cy }];
            let x = cx, y = cy;
            for (const deg of anglesDeg) {
                const a = deg * Math.PI / 180;
                x += step * Math.cos(a);
                y += step * Math.sin(a);
                pts.push({ x, y });
            }
            return pts;
        };


                    const bondLen = getBondLen(grid, 120);
                    const pts = chainPts(wx, wy, bondLen, [0]);
                    for (let i = 0; i < pts.length - 1; i++) {
                        addBond(Shape, Glyph, pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y);
                    }
                        addAtomLabel(Shape, Glyph, pts[1].x, pts[1].y, 'S');

                    platetrack.wb(null);

                } catch (err) {
                    console.error('draw thiol group failed:', err);
                    platetrack.wb(null);
                }
            },

            mouseMoveListener: () => {},
            mouseUpListener: () => {},
            close: () => {}
        };

        setTimeout(() => {
            platetrack.wb(hd);
        }, 50);
    } catch (err) {
        console.error('Draw tool failed:', err);
        platetrack.wb(null);
    }
}