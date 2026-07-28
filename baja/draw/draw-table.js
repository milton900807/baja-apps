function (platetrack, type, type_path, _name) {

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

        const graph = CurrentLayout.getStashed('graph')
        graph.setMouseMode("msg: Click and drag on the canvas... ")

        platetrack.setMessage("Click and drag on the canvas... ")

        let oldName = null;
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

        if (_name && type_path) {
            if (type_path === _name) {
                type_path = ''
            }
            const lf = await load_file(type_path, _name)
            if (lf && lf.rule_value) {
                const ts = __decompress(lf.rule_value);

                const pl = Plate.buildPlateFromJSON(ts)
                oldName = pl.name;
                pl.uid = uuid();
                pl.name = m;
                let plate = pl
                platetrack.setMessage(" Click and drag on canvas....")
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
                        plate.grid.xi = platetrack.grid.Xwc(x);
                        plate.grid.yi = platetrack.grid.Ywc(y);
                        graph.setMouseMode(null)
                        platetrack.root.push(plate)
                    },

                    mouseMoveListener: (x, y) => {
                        if (hd.md) {
                            console.log(' drag ')
                            hd.currentX = x;
                            hd.currentY = y;
                            const rectWidth = hd.currentX - hd.startX;
                            const rectHeight = hd.currentY - hd.startY
                            plate.last_touched = new Date();
                            plate.grid.width = platetrack.grid.worldWidth(rectWidth);
                            plate.grid.height = platetrack.grid.worldHeight(rectHeight);
                            plate.grid.yi = platetrack.grid.Ywc(hd.startY) - plate.grid.height;
                        }
                    },

                    mouseUpListener: async (x, y) => {
                        if (hd.isDrawing) {
                            hd.isDrawing = false;
                            platetrack.wb(null)
                        }
                        if (hd.md) {
                            hd.currentX = x;
                            hd.currentY = y;
                            const rectWidth = hd.currentX - hd.startX;
                            const rectHeight = hd.currentY - hd.startY
                            plate.last_touched = new Date();
                            plate.grid.width = platetrack.grid.worldWidth(rectWidth);
                            plate.name = m;

                            plate.attr__displayMenuButtons = true;
                            plate.attr__ShowTableName = true;
                            plate.attr__displayNumberValues = true;
                            plate.attr__RowAddRemoveButtons = true;
                            plate.attr__ShowFishEyeLense = true;
                            plate.attr__displayCellButtons = true;

                            plate.renameTableInFormula(oldName, plate.name)
                            plate.grid.height = platetrack.grid.worldHeight(rectHeight);
                            plate.grid.yi = platetrack.grid.Ywc(hd.startY) - plate.grid.height;
                            plate.grid.rescale();
                        }
                        hd.md = false;
                    },
                    priority: true,
                    close: () => {
                    },
                };
                platetrack.wb(hd)
                resolve()
            }
        } else {

            let plate = new Plate(m, 1, 1);
            let cursorPos = 0;
            let hd = {
                md: false,
                startX: null,
                startY: null,
                currentX: null,
                priority: true,
                currentY: null,
                isDrawing: true,
                id: 'override-draw-text',

                draw: (grid, ctx) => {

                    if (hd.startX !== null && hd.startY !== null) {
                        const rectWidth = hd.currentX - hd.startX;
                        const rectHeight = hd.currentY - hd.startY
                        ctx.fillStyle = 'rgba(200, 10, 105, 0.4)';
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
                    plate.grid.xi = platetrack.grid.Xwc(x);
                    plate.grid.yi = platetrack.grid.Ywc(y);

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
                        let fixedWellWidth = platetrack.grid.worldWidth(100)
                        let fixedWellHeight = platetrack.grid.worldHeight(30)
                        if (fixedWellWidth <= 0) {
                            fixedWellWidth = 1;
                        }

                        if (fixedWellHeight <= 0) {
                            fixedWellHeight = 1;
                        }

                        let columns = Math.floor(plate.grid.width / fixedWellWidth);
                        let rows = Math.floor(plate.grid.height / fixedWellHeight);

                        if (columns <= 0) {
                            columns = 1;
                        }
                        if (rows <= 0) {
                            rows = 1;
                        }

                        plate.grid.xmin = 0;
                        plate.grid.xmax = columns;
                        plate.grid.ymin = 0;
                        plate.grid.ymax = rows;
                        plate.grid.rescale();
                        plate.completeNullValues();
                    }

                },

                mouseUpListener: async (x, y) => {
                    if (hd.isDrawing) {
                        hd.isDrawing = false;
                        platetrack.wb(null)
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
                        let fixedWellWidth = platetrack.grid.worldWidth(100)
                        let fixedWellHeight = platetrack.grid.worldHeight(30)
                        if (fixedWellWidth <= 0) {
                            fixedWellWidth = 1;
                        }
                        if (fixedWellHeight <= 0) {
                            fixedWellHeight = 1;
                        }
                        let columns = Math.floor(plate.grid.width / fixedWellWidth);
                        let rows = Math.floor(plate.grid.height / fixedWellHeight);
                        if (columns <= 0) {
                            columns = 1;
                        }
                        if (rows <= 0) {
                            rows = 1;
                        }
                        plate.grid.xmin = 0;
                        plate.grid.xmax = columns;
                        plate.grid.ymin = 0;
                        plate.grid.ymax = rows;
                        plate.grid.rescale();
                        plate.attr__displayMenuButtons = true;
                        plate.attr__ShowTableName = true;
                        plate.attr__displayNumberValues = true;
                        plate.attr__RowAddRemoveButtons = true;
                        plate.attr__ShowFishEyeLense = true;
                        plate.attr__displayCellButtons = true;

                        plate.completeNullValues();
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
        }

    });

}
