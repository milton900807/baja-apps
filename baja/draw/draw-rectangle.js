function (platetrack) {

    return new Promise(async (resolve, reject) => {
        let Plate = await exec('baja/plate/plate-transparent.js');
        let m = generateNautName();
        platetrack.setMessage(" Click and drag on canvas....")

        const load_file = async (path, name) => {
            let jsonobj = {
                'spath': path,
                'rule_name': name,
                'user': getUser(),
                'type': 'ljt'
            };
            let host_ = window['env']['apiUrl'];
            let rs = await POSTJSON(jsonobj, host_ + '/get-script');
            return rs;
        };
        let plate = new Plate(m, 1, 1);
        plate.attr__ShowTableName = false;
        plate.attr__displayMenuButtons = true;
        plate.attr__displayNumberValues = false;
        plate.attr__RowAddRemoveButtons = false;
        plate.attr__ShowFishEyeLense = false;
        plate.subType = 'text_box'
        let cursorPos = 0;
        let hd = {
            md: false,
            startX: null,
            startY: null,
            currentX: null,
            currentY: null,
            isDrawing: true,
            priority: true,
            id: 'override-draw-text',

            draw: (grid, ctx) => {

            },
            keydown: (event) => {
                if (event.key === 'Enter') {
                    console.log('Enter key pressed');
                } else {
                    if (/^[-a-zA-Z0-9!.\%$*&#@()[\]{} :, ]$/.test(event.key)) {
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
                plate.grid.xi = platetrack.grid.Xwc(x);
                plate.grid.yi = platetrack.grid.Ywc(y);
                platetrack.setSelected(plate);
                plate.completeNullValues();
                let index = 0;
                platetrack.root.push(plate)

            },

            mouseMoveListener: (x, y) => {

                if (hd.md) {
                    hd.currentX = x;
                    hd.currentY = y;

                    const rectWidth = hd.currentX - hd.startX;
                    const rectHeight = hd.currentY - hd.startY

                    plate.last_touched = new Date();

                    plate.grid.width = platetrack.grid.worldWidth(rectWidth);
                    plate.grid.height = platetrack.grid.worldHeight(rectHeight);
                    plate.grid.yi = platetrack.grid.Ywc(hd.startY) - plate.grid.height;
                    plate.hideWellBorders();

                    plate.grid.xmin = 0;
                    plate.grid.xmax = 1;
                    plate.grid.ymin = 0;
                    plate.grid.ymax = 1;
                    plate.grid.rescale();
                    plate.completeNullValues();
                }
            },

            mouseUpListener: async (x, y) => {
                if (hd.isDrawing) {
                    hd.isDrawing = false;
                    platetrack.wb(null)
                    platetrack.setSelected(plate)
                    plate.clk_drag(platetrack)

                }
                if (hd.md) {
                    hd.currentX = x;
                    hd.currentY = y;
                    const rectWidth = hd.currentX - hd.startX;
                    const rectHeight = hd.currentY - hd.startY
                    plate.last_touched = new Date();
                    plate.grid.width = platetrack.grid.worldWidth(rectWidth);
                    plate.grid.height = platetrack.grid.worldHeight(rectHeight);
                    plate.grid.yi = platetrack.grid.Ywc(hd.startY) - plate.grid.height;

                    plate.grid.rescale();
                    plate.completeNullValues();
                    setTimeout(() => {
                        plate.hideWellBorders();

                        platetrack.setSelected(plate)
                        plate.clk_drag(platetrack)
                        plate.selectWellsByString('[0:0][0:0]')

                    }, 100)

                }
                hd.md = false;

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

        resolve()

    });

}
