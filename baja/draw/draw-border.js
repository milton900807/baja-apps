function (platetrack, formula) {

    let color = 'rgba(30,30,100,1.0)';

    const feetPerWorldX = 0.0051;
    const feetPerWorldY = 0.0051;

    const feetPerPixelX = 0.0055;
    const feetPerPixelY = 0.0055;
    const measurementColor = '#444';
    const measurementTextColor = '#000';

    let hd = {
        startX: null,
        startY: null,
        currentX: null,
        currentY: null,
        isDrawing: true,

        id: 'override-measurement-border-draw',

        draw: (grid, ctx) => {
            if (
                hd.startX === null || hd.startY === null ||
                hd.currentX === null || hd.currentY === null
            ) {
                return;
            }

            const worldX1 = (hd.startX);
            const worldY1 = (hd.startY);
            const worldX2 = (hd.currentX);
            const worldY2 = (hd.currentY);

            const centerX = (worldX1 + worldX2) / 2;
            const centerY = (worldY1 + worldY2) / 2;
            const w = Math.abs(worldX2 - worldX1);
            const h = Math.abs(worldY2 - worldY1);

            if (!Number.isFinite(w) || !Number.isFinite(h) || w === 0 || h === 0) return;

            if (typeof MeasurementBorder === 'function') {
                const tempBorder = new MeasurementBorder(
                    centerX,
                    centerY,
                    w,
                    h,
                    feetPerPixelX,
                    feetPerPixelY,
                    measurementColor
                );
                tempBorder.highlight(true);
                tempBorder.draw(grid, ctx);
            } else {

                const sx1 = (worldX1);
                const sy1 = (worldY1);
                const sx2 = (worldX2);
                const sy2 = (worldY2);

                const left = Math.min(sx1, sx2);
                const top = Math.min(sy1, sy2);
                const width = Math.abs(sx2 - sx1);
                const height = Math.abs(sy2 - sy1);

                if (width < 1 || height < 1) return;

                ctx.save();

                ctx.strokeStyle = measurementColor;
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.strokeRect(left, top, width, height);
                ctx.setLineDash([]);

                const totalFeetX = width * feetPerPixelX;
                const totalFeetY = height * feetPerPixelY;

                const horizLabel = `${totalFeetX.toFixed(1)} ft`;
                const vertLabel = `${totalFeetY.toFixed(1)} ft`;

                ctx.fillStyle = measurementTextColor;
                ctx.font = '16px Arial';

                const labelOffset = 12;

                const sxMid = left + width / 2;
                const syMid = top + height / 2;

                {

                    ctx.save();
                    ctx.translate(left - labelOffset, syMid);
                    ctx.rotate(-Math.PI / 2);
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(vertLabel, 0, 0);
                    ctx.restore();

                    ctx.save();
                    ctx.translate(left + width + labelOffset, syMid);
                    ctx.rotate(Math.PI / 2);
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(vertLabel, 0, 0);
                    ctx.restore();
                }

                {

                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText(horizLabel, sxMid, top + height + labelOffset);
                    ctx.restore();

                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(horizLabel, sxMid, top - labelOffset);
                    ctx.restore();
                }

                ctx.restore();
            }
        },

        keydown: (event) => {
            if (event.key === 'Escape') {
                hd.isDrawing = false;
                platetrack.wb(null);
            }
        },

        mouseDownListener: async (x, y) => {
            hd.startX = x;
            hd.startY = y;
            hd.currentX = x;
            hd.currentY = y;
            hd.isDrawing = true;
        },

        mouseMoveListener: (x, y) => {
            if (hd.isDrawing) {
                hd.currentX = x;
                hd.currentY = y;
            }
        },

        mouseUpListener: async (x, y) => {
            if (!hd.isDrawing) return;
            hd.isDrawing = false;

            const worldX1 = (hd.startX);
            const worldY1 = (hd.startY);
            const worldX2 = (x);
            const worldY2 = (y);

            const centerX = (worldX1 + worldX2) / 2;
            const centerY = (worldY1 + worldY2) / 2;
            const w = Math.abs(worldX2 - worldX1);
            const h = Math.abs(worldY2 - worldY1);

            if (!Number.isFinite(w) || !Number.isFinite(h) || w === 0 || h === 0) {
                platetrack.wb(null);
                return;
            }

            let MeasurementBorder = await exec('flexigraph/shapes/poster-border.js');
            let border = new MeasurementBorder(
                centerX,
                centerY,
                w,
                h,
                feetPerPixelX,
                feetPerPixelY,
                measurementColor
            );

            platetrack.___imageCaptureRect = border;

            platetrack.wb(null);
        },

        close: () => {

        },
    };

    console.log('measurement-border: init');
    platetrack.wb(hd);

    hd.startX = null;
    hd.startY = null;
    hd.currentX = null;
    hd.currentY = null;
}
