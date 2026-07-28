function () {
    return new Promise(async (resolve, reject) => {

        function getJsPDF() {
            if (window.jspdf && window.jspdf.jsPDF) {
                return window.jspdf.jsPDF;
            }
            console.error('jsPDF not found on window.jspdf.jsPDF. Did you include the jsPDF script?');
            return null;
        }
        function getJsPDF() {
            if (window.jspdf && window.jspdf.jsPDF) {
                return window.jspdf.jsPDF;
            }
            console.error('jsPDF not found on window.jspdf.jsPDF. Did you include the jsPDF script?');
            return null;
        }
        function exportToPDF(
            canvas,
            screenx,
            screeny,
            screenwidth,
            screenheight,
            ftWidth,
            ftHeight,
            fileName = 'graph-measurements.pdf',
            exportScale = 3
        ) {
            if (!canvas) {
                console.error('exportToPDF: canvas is null');
                return;
            }

            const jsPDF = getJsPDF();
            if (!jsPDF) return;

            const offCanvas = document.createElement('canvas');
            offCanvas.width = screenwidth * exportScale;
            offCanvas.height = screenheight * exportScale;

            const ctx = offCanvas.getContext('2d');

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            ctx.drawImage(
                canvas,
                screenx, screeny - screenheight,
                screenwidth, screenheight,
                0, 0,
                offCanvas.width, offCanvas.height
            );

            const imgData = offCanvas.toDataURL('image/png');

            const FEET_TO_POINTS = 864;

            const pdfWidthPts = ftWidth * FEET_TO_POINTS;
            const pdfHeightPts = ftHeight * FEET_TO_POINTS;

            const pdf = new jsPDF({
                orientation: pdfWidthPts > pdfHeightPts ? 'landscape' : 'portrait',
                unit: 'pt',
                format: [pdfWidthPts, pdfHeightPts],
            });

            const imgPixelWidth = offCanvas.width;
            const imgPixelHeight = offCanvas.height;

            const scale = Math.min(
                pdfWidthPts / imgPixelWidth,
                pdfHeightPts / imgPixelHeight
            );

            const drawWidth = imgPixelWidth * scale;
            const drawHeight = imgPixelHeight * scale;

            const offsetX = (pdfWidthPts - drawWidth) / 2;
            const offsetY = (pdfHeightPts - drawHeight) / 2;

            pdf.addImage(imgData, 'PNG', offsetX, offsetY, drawWidth, drawHeight);
            pdf.save(fileName);
        }

        let MeasurementBorder = class MeasurementBorder {
            name;
            type = 'measurement-border';
            x;
            y;
            w = 1;
            h = 1;
            feetPerWorldX = 1;
            feetPerWorldY = 1;
            color = '#444';
            textColor = '#000';
            hl = false;
            canvas__;

            constructor(x, y, w, h, feetPerWorldX = 10, feetPerWorldY = 10, color) {
                this.x = x;
                this.y = y;
                this.w = Number.isFinite(w) ? w : 1;
                this.h = Number.isFinite(h) ? h : 1;
                this.feetPerWorldX = feetPerWorldX || 1;
                this.feetPerWorldY = feetPerWorldY || 1;
                if (color) this.color = color;
            }

            getFeetX() {
                const worldLeft = this.getX();
                const feetPerWorldX = this.feetPerWorldX || 0;
                return worldLeft * feetPerWorldX;
            }

            getFeetY() {
                const worldBottom = this.getY();
                const feetPerWorldY = this.feetPerWorldY || 0;
                return worldBottom * feetPerWorldY;
            }

            getFeetWidth() {
                const wWorld = Number.isFinite(this.w) ? Math.abs(this.w) : 0;
                const feetPerWorldX = this.feetPerWorldX || 0;
                return wWorld * feetPerWorldX;
            }

            getFeetHeight() {
                const hWorld = Number.isFinite(this.h) ? Math.abs(this.h) : 0;
                const feetPerWorldY = this.feetPerWorldY || 0;
                return hWorld * feetPerWorldY;
            }

            getFeetRect() {
                return {
                    x: this.getFeetX(),
                    y: this.getFeetY(),
                    width: this.getFeetWidth(),
                    height: this.getFeetHeight(),
                };
            }

            getInchesX() {
                const worldLeft = this.getX();
                return worldLeft * (this.feetPerWorldX * 12);
            }

            getInchesY() {
                const worldBottom = this.getY();
                return worldBottom * (this.feetPerWorldY * 12);
            }

            getInchesWidth() {
                const wWorld = Number.isFinite(this.w) ? Math.abs(this.w) : 0;
                return wWorld * (this.feetPerWorldX * 12);
            }

            getInchesHeight() {
                const hWorld = Number.isFinite(this.h) ? Math.abs(this.h) : 0;
                return hWorld * (this.feetPerWorldY * 12);
            }

            getInchRect() {
                return {
                    x: this.getInchesX(),
                    y: this.getInchesY(),
                    width: this.getInchesWidth(),
                    height: this.getInchesHeight(),
                };
            }

            getX() {
                const w = Number.isFinite(this.w) ? this.w : 0;
                return this.x - w / 2;
            }

            getY() {
                const h = Number.isFinite(this.h) ? this.h : 0;
                return this.y - h / 2;
            }

            getXf() {
                const w = Number.isFinite(this.w) ? this.w : 0;
                return this.x + w / 2;
            }

            getYf() {
                const h = Number.isFinite(this.h) ? this.h : 0;
                return this.y + h / 2;
            }

            setX(nx) {
                if (!Number.isFinite(nx)) return;
                const oldLeft = this.getX();
                const dx = nx - oldLeft;
                if (!dx) return;
                if (Number.isFinite(this.x)) this.x += dx;
            }

            setY(ny) {
                if (!Number.isFinite(ny)) return;
                const oldTop = this.getY();
                const dy = ny - oldTop;
                if (!dy) return;
                if (Number.isFinite(this.y)) this.y += dy;
            }

            setXf(nxf) {
                if (!Number.isFinite(nxf)) return;
                const oldRight = this.getXf();
                const dx = nxf - oldRight;
                if (!dx) return;
                if (Number.isFinite(this.x)) this.x += dx;
            }

            setYf(nyf) {
                if (!Number.isFinite(nyf)) return;
                const oldBottom = this.getYf();
                const dy = nyf - oldBottom;
                if (!dy) return;
                if (Number.isFinite(this.y)) this.y += dy;

            }

            move(x, y) {
                if (x != null && y != null) {
                    const dx = x - this.getX();
                    const dy = y - this.getY();
                    if (Number.isFinite(this.x)) this.x += dx;
                    if (Number.isFinite(this.y)) this.y += dy;
                }
            }

            setColor(color) {
                this.color = color;
            }

            highlight(v) {
                this.hl = !!v;
            }

            update(x, y) {

                this.w = x - this.x;
                this.h = this.y - y;
            }

            inside(x, y) {
                const px = (x);
                const py = (y);

                const worldLeft = this.getX();
                const worldRight = this.getXf();
                const worldTop = this.getYf();
                const worldBottom = this.getY();

                const sxLeft = (worldLeft);
                const sxRight = (worldRight);
                const syTop = (worldTop);
                const syBottom = (worldBottom);

                const minX = Math.min(sxLeft, sxRight);
                const maxX = Math.max(sxLeft, sxRight);
                const minY = Math.min(syTop, syBottom);
                const maxY = Math.max(syTop, syBottom);

                return px >= minX && px <= maxX && py >= minY && py <= maxY;
            }

            isIn(px, py) {

                return false;
            }

            saveToPDF(
                graph,
                screenx,
                screeny,
                screenwidth,
                screenheight,
                fileName = 'graph-measurements.pdf'
            ) {
                if (!this.canvas__) {
                    console.error('MeasurementBorder.saveToPDF: canvas__ is not set yet (draw() not called?)');
                    return;
                }

                const worldLeft = this.getX();
                const worldRight = this.getXf();
                const worldTop = this.getYf();
                const worldBottom = this.getY();

                const sxLeftTop = graph.X(worldLeft);
                const syLeftTop = graph.Y(worldTop);
                const sxRightTop = graph.X(worldRight);
                const syLeftBottom = graph.Y(worldBottom);
                const widthScreen = Math.abs(sxRightTop - sxLeftTop);
                const heightScreen = Math.abs(syLeftBottom - syLeftTop);
                const feetPerPixelX = this.feetPerWorldX || 1;
                const feetPerPixelY = this.feetPerWorldY || 1;

                const totalFeetX = widthScreen * feetPerPixelX;
                const totalFeetY = heightScreen * feetPerPixelY;

                exportToPDF(
                    this.canvas__,
                    screenx,
                    screeny,
                    screenwidth,
                    screenheight,
                    totalFeetX,
                    totalFeetY,
                    fileName
                );
            }

            draw(ctx) {

                this.canvas__ = ctx.canvas;

                const worldLeft = this.getX();
                const worldRight = this.getXf();
                const worldTop = this.getYf();
                const worldBottom = this.getY();

                const sxLeftTop = (worldLeft);
                const syLeftTop = (worldTop);
                const sxRightTop = (worldRight);
                const syRightTop = (worldTop);
                const sxRightBottom = (worldRight);
                const syRightBottom = (worldBottom);
                const sxLeftBottom = (worldLeft);
                const syLeftBottom = (worldBottom);

                const widthScreen = Math.abs(sxRightTop - sxLeftTop);
                const heightScreen = Math.abs(syLeftBottom - syLeftTop);

                if (widthScreen < 40 || heightScreen < 40) return;

                const now = Date.now();
                const periodMs = 2000;
                const phase = Math.sin((now / periodMs) * 2 * Math.PI);
                const pulse = (phase + 1) / 2;

                const basePad = 6;
                const extraPad = 10;
                const padFactor = basePad + extraPad * pulse;

                const baseAlpha = 0.18;
                const extraAlpha = 0.20;
                const alpha = baseAlpha + extraAlpha * pulse;

                const baseLineWidth = 2;
                const extraLineWidth = 4;
                const haloLineWidth = baseLineWidth + extraLineWidth * pulse;

                const left = Math.min(sxLeftTop, sxRightBottom);
                const right = Math.max(sxLeftTop, sxRightBottom);
                const top = Math.min(syLeftTop, syRightBottom);
                const bottom = Math.max(syLeftTop, syRightBottom);

                const haloLeft = left - padFactor;
                const haloTop = top - padFactor;
                const haloWidth = (right - left) + padFactor * 2;
                const haloHeight = (bottom - top) + padFactor * 2;

                ctx.save();

                ctx.globalAlpha = alpha;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                ctx.lineWidth = haloLineWidth;

                const hue = 305;
                const saturation = 0.85;
                const lightness = 0.45 + 0.15 * pulse;
                ctx.strokeStyle = `hsl(${hue}deg ${saturation * 100}% ${lightness * 100}%)`;

                ctx.beginPath();
                ctx.rect(haloLeft, haloTop, haloWidth, haloHeight);
                ctx.stroke();

                ctx.globalAlpha = 1.0;
                ctx.lineWidth = this.hl ? 3 : 2;
                ctx.strokeStyle = this.color || '#444';
                ctx.setLineDash(this.hl ? [6, 4] : []);

                ctx.beginPath();
                ctx.moveTo(sxLeftTop, syLeftTop);
                ctx.lineTo(sxRightTop, syRightTop);
                ctx.lineTo(sxRightBottom, syRightBottom);
                ctx.lineTo(sxLeftBottom, syLeftBottom);
                ctx.closePath();
                ctx.stroke();

                ctx.setLineDash([]);

                const feetPerPixelX = this.feetPerWorldX || 0;
                const feetPerPixelY = this.feetPerWorldY || 0;

                const totalFeetX = widthScreen * feetPerPixelX;
                const totalFeetY = heightScreen * feetPerPixelY;

                const totalPixelsX = widthScreen;
                const totalPixelsY = heightScreen;

                const horizLabel = `${totalFeetX.toFixed(1)} ft (${Math.round(totalPixelsX)} px)`;
                const vertLabel = `${totalFeetY.toFixed(1)} ft (${Math.round(totalPixelsY)} px)`;

                ctx.fillStyle = this.textColor || '#000';
                ctx.font = '16px Arial';

                const labelOffset = 12;

                const sxMid = (sxLeftTop + sxRightTop) / 2;
                const syMid = (syLeftTop + syLeftBottom) / 2;

                {

                    ctx.save();
                    ctx.translate(sxLeftTop - labelOffset, syMid);
                    ctx.rotate(-Math.PI / 2);
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(vertLabel, 0, 0);
                    ctx.restore();

                    ctx.save();
                    ctx.translate(sxRightTop + labelOffset, syMid);
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
                    ctx.fillText(horizLabel, sxMid, syLeftBottom + labelOffset);
                    ctx.restore();

                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(horizLabel, sxMid, syLeftTop - labelOffset);
                    ctx.restore();
                }

                ctx.restore();
            }

        };

        resolve(MeasurementBorder)
    })

}
