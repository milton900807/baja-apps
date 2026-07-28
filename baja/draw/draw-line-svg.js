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
            id: 'glyph-override-draw-line',

            draw: (grid, ctx) => {
                if (!hd.isDrawing) return;
                if (![hd.startWx, hd.startWy, hd.endWx, hd.endWy]
                    .every(v => typeof v === 'number' && Number.isFinite(v))) return;

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
                const wx = platetrack.grid.Xwc(x);
                const wy = platetrack.grid.Ywc(y);

                clickIndex++;

                if (clickIndex === 1) {

                    hd.startWx = wx;
                    hd.startWy = wy;
                    hd.endWx = wx;
                    hd.endWy = wy;
                    hd.isDrawing = true;
                    return;
                }

                if (clickIndex === 2) {
                    hd.endWx = wx;
                    hd.endWy = wy;

                    let Shape = await exec('flexigraph/shapes/shape.js')
                    const Glyph = await exec('baja/draw/glyph.js');

                    const line = Shape._makeLineFromWorld(
                        hd.startWx, hd.startWy,
                        hd.endWx, hd.endWy,
                        { stroke: '#0096ff', strokeWidth: 2 },
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
                hd.endWx = platetrack.grid.Xwc(x);
                hd.endWy = platetrack.grid.Ywc(y);
            },

            mouseUpListener: () => { },
            close: () => {
                hd.isDrawing = false;
            }
        };

        setTimeout(() => {
            platetrack.wb(hd);
        }, 50);

    } catch (err) {
        console.error('Draw SVG line failed:', err);
        platetrack.wb(null);
    }
}
