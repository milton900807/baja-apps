function (platetrack, formula) {

    try {

        let hd = {
            priority: true,
            id: 'glyph-override-draw-morpholine-ring',

            mouseDownListener: async (x, y) => {
                try {
                    const grid = platetrack.grid;

                    const wx = grid.Xwc(x);
                    const wy = grid.Ywc(y);

                    let Shape = await exec('flexigraph/shapes/shape.js');
                    const Glyph = await exec('baja/draw/glyph.js');

                    // Make bond length about 20 screen px minimum
                    const pxTarget = 120;
                    const worldPerPxX = Math.abs(grid.Xwc(1) - grid.Xwc(0)) || 0.01;
                    const bondLen = pxTarget * worldPerPxX;

                    // For a regular hexagon, side length = circumradius
                    const r = bondLen;

                    const pts = [];

                    // Flat-ish hexagon orientation
                    for (let i = 0; i < 6; i++) {
                        const a = (-30 + i * 60) * Math.PI / 180;
                        pts.push({
                            x: wx + r * Math.cos(a),
                            y: wy + r * Math.sin(a)
                        });
                    }

                    // Draw the 6 ring bonds
                    for (let i = 0; i < 6; i++) {
                        const p1 = pts[i];
                        const p2 = pts[(i + 1) % 6];

                        const line = Shape._makeLineFromWorld(
                            p1.x, p1.y,
                            p2.x, p2.y,
                            {
                                stroke: '#0096ff',
                                strokeWidth: 2,
                                'stroke-linecap': 'round'
                            },
                            Shape.getGfx?.() || Shape.DefaultGfx
                        );

                        if (line) {
                            platetrack.addGlyphNoSelect(new Glyph(line));
                        }
                    }

                    // Add hetero atom labels as boxed text
                    // Opposite positions in ring: O and N
                    const addAtomLabel = (tx, ty, label) => {
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
                                // These fields are used by your _makeText boxed renderer
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

                    addAtomLabel(pts[0].x, pts[0].y, 'O');
                    addAtomLabel(pts[3].x, pts[3].y, 'N');

                    platetrack.wb(null);

                } catch (err) {
                    console.error('Morpholine ring draw failed:', err);
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
        console.error('Draw morpholine ring failed:', err);
        platetrack.wb(null);
    }
}