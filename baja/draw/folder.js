function (platetrack, formula) {

    let cursorPos = 0;
    let text = ''

    let hd = {
        startX: null,
        startY: null,
        currentX: null,
        currentY: null,
        isDrawing: true,
        id: 'override-draw-text',

        draw: (grid, ctx) => {
            if (hd.startX !== null && hd.startY !== null) {
                const rectWidth = hd.currentX - hd.startX;
                const rectHeight = hd.currentY - hd.startY

                const xsc = hd.startX;
                const ysc = hd.startY;

                ctx.shadowBlur = 20;
                ctx.shadowOffsetX = 3;
                ctx.shadowOffsetY = 3;
                ctx.shadowColor = "rgba(0,0,0,0.3)";

                const w = rectWidth;
                const h = rectHeight;
                const r = Math.max(6, Math.min(14, Math.min(w, h) * 0.06));
                const tabW = Math.min(w * 0.35, 120);
                const tabH = Math.min(h * 0.22, 28);
                const tabLeft = Math.max(r, w * 0.06);

                const bodyFill = "#a7c7ff";
                const tabFill = "#8fb6ff";
                const stroke = "#4a6fb3";

                ctx.beginPath();
                ctx.moveTo(xsc + r, ysc + tabH);
                ctx.lineTo(xsc + tabLeft, ysc + tabH);
                ctx.lineTo(xsc + tabLeft, ysc);
                ctx.lineTo(xsc + tabLeft + tabW, ysc);
                ctx.lineTo(xsc + tabLeft + tabW, ysc + tabH);
                ctx.lineTo(xsc + w - r, ysc + tabH);
                ctx.quadraticCurveTo(xsc + w, ysc + tabH, xsc + w, ysc + tabH + r);
                ctx.lineTo(xsc + w, ysc + h - r);
                ctx.quadraticCurveTo(xsc + w, ysc + h, xsc + w - r, ysc + h);
                ctx.lineTo(xsc + r, ysc + h);
                ctx.quadraticCurveTo(xsc, ysc + h, xsc, ysc + h - r);
                ctx.lineTo(xsc, ysc + tabH + r);
                ctx.quadraticCurveTo(xsc, ysc + tabH, xsc + r, ysc + tabH);

                ctx.fillStyle = bodyFill;
                ctx.fill();
                ctx.lineWidth = 1.25;
                ctx.strokeStyle = stroke;
                ctx.stroke();

                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.shadowColor = "transparent";

                ctx.fillStyle = tabFill;
                ctx.fillRect(xsc + tabLeft + 1, ysc + 1, tabW - 2, tabH - 2);

            }
        },
        keydown: (event) => {
            if (event.key === 'Enter') {
                console.log('Enter key pressed');
            } else {
                if (/^[a-zA-Z0-9!.\-%$*&#@()\[\]{}]$/.test(event.key)) {
                    cursorPos += 1;
                } else {
                    console.log('----Non-alphanumeric key pressed: ' + event.key);
                }
            }
        },
        mouseDownListener: async (x, y) => {
            hd.isDrawing = true;

            hd.startX = x;
            hd.startY = y;
            hd.currentX = x;
            hd.currentY = y;
        },

        mouseMoveListener: (x, y) => {
            hd.currentX = x;
            hd.currentY = y;
        },

        mouseUpListener: async (x, y) => {
            if (hd.isDrawing) {
                hd.isDrawing = false;
                platetrack.wb(null)
                let Plate = await exec('baja/plate/plate.js');
                let attr_window = ''
                let va = await prompt("Folder name: ", ["Name"], { "Name": attr_window }, 500, 300)
                let HM = await exec('baja/history/HM')
                let PlateTrack = await exec('baja/plate/plate-track')
                let m = 'Folder:'+va['Name']
                let plate = new Plate(m, 1, 1);
                plate.plateType = 'package'
                plate.completeNullValues();
                let index = 0;
                const rectWidth = platetrack.grid.worldWidth(hd.currentX - hd.startX);
                const rectHeight = platetrack.grid.worldHeight(hd.currentY - hd.startY);
                plate.setWellValue(0, index, m)
                let pt = new PlateTrack("")
                const stringData = compressbinaryData(compressString(HM(pt)))
                plate.wells[0][0].properties['package'] = stringData;
                plate.setWellType(0, index, 'PACKAGE')
                plate.grid.width = (rectWidth);
                plate.grid.height = (rectHeight);
                plate.grid.xi = (platetrack.grid.Xwc(x) - rectWidth);
                plate.grid.yi = platetrack.grid.Ywc(y);
                platetrack.root.push(plate);
                setTimeout(() => {
                    platetrack.generateTables();
                    platetrack.unModal();
                }, 400)

                let names = ['Simple', 'Import...', 'Templates']

            }
        },

        priority: true,

        close: () => {
        },
    };
    platetrack.wb(hd)
    hd.startX = null;
    hd.startY = null;
    hd.currentX = null;
    hd.currentY = null;

}
