function (pt, type, type_path, _name) {

    return new Promise(async (resolve, reject) => {
        let Plate = await exec('baja/plate/plate.js');
        if (type === 'transparent') {
            Plate = await exec('baja/plate/plate-transparent.js');
        }
        let va = await prompt("Table name", ["Name"], { "Name": '' }, 300, 300)
        let m = va['Name']
        if (!m || m.length <= 0) {
            m = generateNautName();
        }

        const text = await navigator.clipboard.readText();
        pt.setMessage(" Reading clipboard ")
        let table = await exec('baja/plate/data/data-table-parser.js', text)
        for (let t of table) {
            t.setName(m);
            t.plateType = 'data'
            t.removeEmptyRowsAndColumns()
            t.grid.rescale();
            pt.grid.rescale();
            await pt.panToNextSpot(10);
            if (t.rescaleDimensions) {
                t.rescaleDimensions(pt)
            }
            t.grid.yi = pt.grid.Ywc(50) - t.grid.height;
            t.grid.xi = pt.grid.Xwc((pt.grid.width / 2)) - t.grid.width / 2;
            pt.root.push(t)
            const plate = t;
            pt.setMessage(" Click and drag on canvas....")
            let cursorPos = 0;
            let hd = {
                md: false,
                priority: true,
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
                        ctx.fillStyle = 'rgba(10,10,200,0.4)';
                        ctx.fillRect(hd.startX, hd.startY, rectWidth, rectHeight);
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
                    hd.md = true;
                    hd.startX = x;
                    hd.startY = y;
                    hd.currentX = x;
                    hd.currentY = y;
                    plate.grid.xi = pt.grid.Xwc(x);
                    plate.grid.yi = pt.grid.Ywc(y);

                    pt.root.push(plate)
                },

                mouseMoveListener: (x, y) => {
                    if (hd.md) {
                        console.log(' drag ')
                        hd.currentX = x;
                        hd.currentY = y;
                        const rectWidth = hd.currentX - hd.startX;
                        const rectHeight = hd.currentY - hd.startY
                        plate.last_touched = new Date();
                        plate.grid.width = pt.grid.worldWidth(rectWidth);
                        plate.grid.height = pt.grid.worldHeight(rectHeight);
                        plate.grid.yi = pt.grid.Ywc(hd.startY) - plate.grid.height;
                    }
                },

                mouseUpListener: async (x, y) => {
                    if (hd.isDrawing) {
                        hd.isDrawing = false;
                        pt.wb(null)
                    }
                    if (hd.md) {
                        hd.currentX = x;
                        hd.currentY = y;
                        const rectWidth = hd.currentX - hd.startX;
                        const rectHeight = hd.currentY - hd.startY
                        plate.last_touched = new Date();
                        plate.grid.width = pt.grid.worldWidth(rectWidth);
                        plate.name = m;

                        plate.attr__displayMenuButtons = true;
                        plate.attr__ShowTableName = true;
                        plate.attr__displayNumberValues = true;
                        plate.attr__RowAddRemoveButtons = true;
                        plate.attr__ShowFishEyeLense = true;
                        plate.attr__displayCellButtons = true;

                        plate.renameTableInFormula(oldName, plate.name)
                        plate.grid.height = pt.grid.worldHeight(rectHeight);
                        plate.grid.yi = pt.grid.Ywc(hd.startY) - plate.grid.height;
                        plate.grid.rescale();
                    }
                    hd.md = false;
                },
                priority: true,
                close: () => {
                },
            };
            pt.wb(hd)
            resolve()
        }
        pt.wb(hd)
        hd.startX = null;
        hd.startY = null;
        hd.currentX = null;
        hd.currentY = null;
        resolve()
    });
}
