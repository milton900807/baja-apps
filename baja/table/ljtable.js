function () {

    return new Promise(async (resolve, reject) => {
        let MGrid = await exec('flexigraph/grid.js');
        let GenericWell = await exec('baja/plate/well.js')
        const Menu = await exec('flexigraph/menu')
        let WellDisplay = await exec('baja/plate/views/well-display-factory')

        const bsize = 30;
        let cursorVisible = true;
        let cursorPos = 0;
        let cursorBlinkInterval = 500;
        function blinkCursor() {
            cursorVisible = !cursorVisible;
        }

        setInterval(blinkCursor, cursorBlinkInterval);

        function getMaxDimensions(array2D) {
            let maxRow = array2D.length;
            let maxCol = 0;

            for (let row = 0; row < array2D.length; row++) {
                let currentRowLength = array2D[row].length;
                if (currentRowLength > maxCol) {
                    maxCol = currentRowLength;
                }
            }

            return { maxRow, maxCol };
        }
        function filterWells(wells, conditionFn) {
            let filteredWells = [];
            for (let x = 0; x < wells.length; x++) {
                let filteredRow = [];
                for (let y = 0; y < wells[x].length; y++) {
                    let well = wells[x][y];

                    if (well && conditionFn(well)) {
                        filteredRow.push(well);
                    }
                }

                if (filteredRow.length > 0) {
                    filteredWells.push(filteredRow);
                }
            }
            console.log('debubg');

            return filteredWells;
        }

        function drawRoundedRect(ctx, x, y, width, height, radius) {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + width - radius, y);
            ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
            ctx.lineTo(x + width, y + height - radius);
            ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
            ctx.lineTo(x + radius, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();

        }

        function isObjectNotVisible(ctx, xscreen_min_, xscreen_max, yscreen_min_, yscreen_max) {

            const canvasWidth = ctx.canvas.width;
            const canvasHeight = ctx.canvas.height;
            const isOutsideHorizontal = (xscreen_max < 0 && xscreen_min_ < 0) || (xscreen_min_ > canvasWidth && xscreen_max > canvasWidth);
            const isOutsideVertical = (yscreen_max < 0 && yscreen_min_ < 0) || (yscreen_min_ > canvasHeight && yscreen_max > canvasHeight);
            return isOutsideHorizontal && isOutsideVertical;
        }

        let Plate = class Plate {
            selected = false;
            visible = true;
            wells;
            barcode;
            name = '';
            plates = []
            grid;
            menu_selected;
            menu;
            xmouse;
            selectedWells = [];
            plateType;
            location;
            uid;
            excelImg = `assets/img/icons/png/Excel-icon.png`
            docImageLoaded = false;
            plots = [];
            aspect_ratio = 1;
            textActive = false;
            text = ''
            message;

            constructor(name, xmax, ymax) {
                this.uid = uuid();
                if (!xmax) {
                    xmax = 12;
                }
                if (!ymax) {
                    ymax = 8;
                }
                this.name = name;
                this.grid = new MGrid(0, 0, 100, 100);
                this.grid.xi = 0;
                this.grid.yi = 0;
                this.grid.setxmax(xmax);
                this.grid.setymax(ymax);
                this.grid.setxmin(0);
                this.grid.setymin(0);
                this.grid.setInset(0, 0)
                this.grid.rescale();
                this.margin = { top: 20, right: 50, bottom: 50, left: 50 };
                this.buttons = [
                    {
                        name: "move", x: 10, y: 10, width: 80, height: 20, action: async (bx, by, x, y, pt) => { return await this.devnull(bx, by, x, y, pt) },
                        highlight: async (bx, by, x, y, pt) => { return await this.setMoveListeners(bx, by, x, y, pt) }
                    },
                    {
                        name: "Operations", x: 10 + bsize, y: 10, width: 80, height: 20, action: async (bx, by, x, y, pt) => { return await this.button2Action(bx, by, x, y, pt) },
                        highlight: async (bx, by, x, y, pt) => { return await this.button2Action(bx, by, x, y, pt) }
                    },
                    {
                        name: "test", x: 10 + bsize, y: 10, width: 80, height: 20, action: async (bx, by, x, y, pt) => { return await this.button2Action(bx, by, x, y, pt) },
                        highlight: async (bx, by, x, y, pt) => { return await this.createConnectMenu(bx, by, x, y, pt) }
                    },
                    {
                        name: "view", x: 10 + bsize, y: 10, width: 80, height: 20, action: async (bx, by, x, y, pt) => { return await this.button2Action(bx, by, x, y, pt) },
                        highlight: async (bx, by, x, y, pt) => { return await this.createViewMenu(bx, by, x, y, pt) }
                    }

                ];
                this.wells = Array.from(Array(this.grid.xmax), () => new Array(this.grid.ymax))
                for (let x = 0; x < this.grid.xmax; x++) {
                    for (let y = this.grid.ymax - 1; y >= 0; y--) {
                        this.wells[x][this.grid.ymax - y - 1] = new GenericWell(this.getAlph(this.grid.ymax - y - 1) + (1 + x));
                    }
                }
            }

            drawButtons(ctx, graph, __sw) {
                if (this.selected) {
                    ctx.shadowBlur = 2;
                    ctx.shadowColor = "blue";
                }
                let colors = ['lightYellow', 'lightBlue', 'lightGreen', 'lightGray', 'lightPurple']
                this.grid.rescale();
                let index = 0;
                let init = graph.X(this.grid.X(0.0));

                for (let button of this.buttons) {
                    if (index > 2 && __sw < 600)
                        break;
                    ctx.fillStyle = colors[index];
                    ctx.fillRect(init + index * bsize, graph.Y(this.grid.yi + this.grid.height) -
                        this.margin.top, bsize, button.height);
                    ctx.strokeStyle = 'black';
                    ctx.strokeRect(init + index * bsize, graph.Y(this.grid.yi + this.grid.height) -
                        this.margin.top, bsize, button.height)

                    ctx.fillStyle = 'black';
                    ctx.font = '8px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    index++;
                }
                ctx.restore();
            }

            async highlightWells(search_term) {
                this.unhighlightWells();
                if (search_term === null || search_term.length <= 0)
                    return;

                let wells = this.searchWells(search_term)
                for (let w of wells) {
                    w.selectIt()
                }

                let count = 0;
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        let well = this.wells[x][y];
                        if (well && well.select === true) {
                            count++;
                        }
                    }
                }
                setTimeout(() => {

                    this.message = "Selected " + count

                }, 4000)

            }
            async unhighlightWells() {
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        try {
                            let well = this.wells[x][y];

                            if (well && typeof well.deselectIt === 'function') {
                                well.select = false;
                            }
                        } catch (error) {
                            console.error(`Error deselecting well at [${x}, ${y}]:`, error);
                        }
                    }
                }
            }

            searchWells(search_term) {
                let matchedWells = [];
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        let well = this.wells[x][y];
                        if (well) {
                            for (let key in well) {
                                if (typeof well[key] === 'string' && well[key].startsWith(search_term)) {
                                    matchedWells.push(well);
                                    break;
                                }
                            }
                        }
                    }
                }
                return matchedWells;
            }

            async handleMouseClick(mouseX, mouseY, pt) {
                let graph = pt.grid;
                let index = 0;
                let bw = 0.5;
                pt.grid.rescale();
                this.grid.rescale();
                let screen_width = Math.abs(grid.screenWidth(this.grid.width));

                for (let button of this.buttons) {
                    if (index > 2 && screen_width < 600)
                        break;

                    let buttonX = graph.X(this.grid.X(0.0)) + index * bsize;
                    let buttonY = graph.Y(this.grid.yi + this.grid.height) - this.margin.top;
                    index += 1
                    let bbw = bsize;
                    if (
                        mouseX >= buttonX &&
                        mouseX <= buttonX + bbw &&
                        mouseY >= buttonY &&
                        mouseY <= buttonY + button.height
                    ) {
                        return await button.action(buttonX, buttonY, mouseX, mouseY, pt);
                    }
                }
            }

            async handleMouseOver(mouseX, mouseY, pt) {
                let graph = pt.grid;
                let index = 0;
                pt.grid.rescale();
                this.grid.rescale();
                let screen_width = Math.abs(graph.screenWidth(this.grid.width));

                let init = graph.X(this.grid.X(0.0));
                for (let button of this.buttons) {
                    if (index > 2 && screen_width < 600)
                        break;

                    let buttonX = init + index * bsize;
                    let buttonY = graph.Y(this.grid.yi + this.grid.height) - this.margin.top;
                    index++;
                    let bbw = bsize;
                    if (
                        mouseX >= buttonX &&
                        mouseX <= buttonX + bbw &&
                        mouseY >= buttonY &&
                        mouseY <= buttonY + button.height
                    ) {
                        return await button.highlight(buttonX, buttonY, mouseX, mouseY, pt);
                    }
                }
            }

            async devnull(bx, by, x, y, pt) {
            }

            async createConnectMenu(bx, by, x, y, pt) {

                let m = [
                    {
                        label: 'Connect...',
                        click: (x, y) => {
                            pt.fromPlate = this;
                            pt.wb(null)
                        },
                        move: () => {
                        },
                    }

                ]

                m.push(
                    {
                        label: 'Deselect wells',
                        click: async (x, y) => {
                            for (let x = 0; x < this.wells.length; x++) {
                                for (let y = 0; y < this.wells[x].length; y++) {
                                    let well = this.wells[x][y];
                                    if (well) {
                                        well.select = false;
                                    }
                                }
                            }

                        },
                        move: () => {
                        },
                    });

                m.push(
                    {
                        label: 'Highlighter...',
                        click: async (x, y) => {
                            this.textActive = true;
                            pt.updateworkbench({
                                mouseDownListener: async (x, y) => {
                                },
                                mouseMoveListener: async (x, y) => {
                                },
                                mouseUpListener: async (x, y) => {
                                }
                                ,
                                close: () => {
                                    this.textActive = false;
                                    this.text = ""
                                },
                                keydown: (event) => {
                                    if (event.key === 'ArrowLeft') {
                                        console.log('Left arrow pressed');
                                        cursorPos -= 1;
                                    } else if (event.key === 'ArrowRight') {
                                        console.log('Right arrow pressed');
                                        cursorPos += 1;
                                    } else if (event.key === 'Backspace') {
                                        if (cursorPos > 0) {
                                            this.text = this.text.slice(0, cursorPos - 1) + this.text.slice(cursorPos);
                                            cursorPos -= 1;
                                        }
                                        this.highlightWells(this.text);

                                    } else if (event.key === 'Enter') {
                                        console.log('Enter key pressed');
                                    } else {
                                        if (/^[a-zA-Z0-9]$/.test(event.key)) {
                                            this.text = this.text.slice(0, cursorPos) + event.key + this.text.slice(cursorPos);
                                            this.highlightWells(this.text);

                                            cursorPos += 1;

                                        } else {
                                            console.log('Non-alphanumeric key pressed: ' + event.key);
                                        }
                                    }
                                }
                                ,
                                draw: (grid, ctx) => {
                                },

                            })

                        },
                        move: () => {
                        },
                    });

                m.push(
                    {
                        label: 'Assign Selected Wells',
                        click: async (x, y) => {
                            let group = ''
                            let va = await prompt("", ["Group"], { "Group": group }, 300, 300)
                            let m = va['Group']
                            if (m != null) {
                                group = m;
                            }
                            for (let x = 0; x < this.wells.length; x++) {
                                for (let y = 0; y < this.wells[x].length; y++) {
                                    let well = this.wells[x][y];
                                    if (well && well.select) {
                                        well.setGroup(group);
                                    }
                                }
                            }

                        },
                        move: () => {
                        },
                    });

                m.push(
                    {
                        label: 'Export All (csv)',

                        click: async (x, y) => {
                            let csvContent = '';
                            const excludedFields = ['select', 'color', 'props'];
                            let attributeKeys = [];
                            let propertyKeys = [];
                            for (let x = 0; x < this.wells.length; x++) {
                                for (let y = 0; y < this.wells[x].length; y++) {
                                    let well = this.wells[x][y];
                                    if (well) {
                                        attributeKeys = Object.keys(well).filter(key => !excludedFields.includes(key));
                                        if (well.properties && typeof well.properties === 'object') {
                                            propertyKeys = Object.keys(well.properties);
                                        }
                                        break;
                                    }
                                }
                                if (attributeKeys.length > 0) break;
                            }

                            csvContent += ['Well Position', ...attributeKeys, ...propertyKeys].join(',') + '\n';

                            for (let x = 0; x < this.wells.length; x++) {
                                for (let y = 0; y < this.wells[x].length; y++) {
                                    let well = this.wells[x][y];
                                    if (well) {
                                        let wellPosition = `${this.getAlph(y)}${x + 1}`;
                                        let attributeValues = attributeKeys.map(key => well[key] !== undefined ? well[key] : '');
                                        let propertyValues = propertyKeys.map(key => (well.properties && well.properties[key] !== undefined) ? well.properties[key] : '');
                                        csvContent += [wellPosition, ...attributeValues, ...propertyValues].join(',') + '\n';
                                    }
                                }
                            }
                            downloadCSV(csvContent, this.name + "_" + '.csv')
                        },
                        move: () => {
                        },

                    });

                m.push(
                    {
                        label: 'Export Selected (csv)',

                        click: async (x, y) => {
                            let csvContent = '';

                            const excludedFields = ['select', 'color', 'props', 'properties'];

                            let attributeKeys = [];
                            let propertyKeys = [];

                            let found_ = false;

                            for (let x = 0; x < this.wells.length; x++) {
                                for (let y = 0; y < this.wells[x].length; y++) {
                                    let well = this.wells[x][y];
                                    if (well && well.select === true) {
                                        found_ = true;
                                        attributeKeys = Object.keys(well).filter(key => !excludedFields.includes(key));

                                        if (well.properties && typeof well.properties === 'object') {
                                            propertyKeys = Object.keys(well.properties);
                                        }
                                        break;
                                    }
                                }
                                if (attributeKeys.length > 0) break;
                            }
                            if (!found_) {
                                infoPrompt("No wells are selected in this table ")
                                return;
                            }
                            csvContent += ['Well Position', ...attributeKeys, ...propertyKeys].join(',') + '\n';
                            for (let x = 0; x < this.wells.length; x++) {
                                for (let y = 0; y < this.wells[x].length; y++) {
                                    let well = this.wells[x][y];

                                    if (well && well.select) {

                                        let wellPosition = `${this.getAlph(y)}${x + 1}`;

                                        let attributeValues = attributeKeys.map(key => well[key] !== undefined ? well[key] : '');

                                        let propertyValues = propertyKeys.map(key => (well.properties && well.properties[key] !== undefined) ? well.properties[key] : '');

                                        csvContent += [wellPosition, ...attributeValues, ...propertyValues].join(',') + '\n';
                                    }
                                }
                            }
                            downloadCSV(csvContent, this.name + "_" + '.csv')
                        },
                        move: () => {
                        },

                    });

                m.push(
                    {
                        label: 'Export selected to LJTable',
                        click: async (x, y) => {
                            let filtered = filterWells(this.wells, (well) => {
                                return well.select
                            })

                            let maxRow = 0;
                            let maxCol = 0;
                            const createDefaultWell = (row, col) => new GenericWell(`DWelle${String.fromCharCode(65 + col)}${row + 1}`);
                            let twells = filtered.map(row => row.map(well => well ? well.deepCopy() : createDefaultWell(row, col)));
                            if (twells.length <= 0) {
                                infoPrompt("No wells are selected in this table ")
                                return;
                            }
                            let mvmax = getMaxDimensions(twells)
                            let newPlate = new Plate(this.name + '.sub', mvmax['maxCol'], mvmax['maxRow']);
                            newPlate.plateType = 'data'
                            newPlate.setWells(twells);
                            this.addChildPlate(newPlate)
                        },
                        move: () => {
                        },

                    });

                m.push(
                    {
                        label: 'Remove connections',
                        click: async (x, y) => {
                            infoPrompt(" To remove the connection use the connection menu ")
                        },
                        move: () => {
                        },
                    });
                m.push(
                    {
                        label: 'Delete...' + this.name,
                        click: async (x, y) => {
                            let confirm = await exec('baja/lib/confirm.js', 'Delete this?', async () => {
                                pt.removePlate(this)
                            })
                            showModal(confirm)
                        },
                        move: () => {
                        },
                    });

                let smenu = new Menu(m, pt.grid.Xwc(bx - 10), pt.grid.Ywc(by + 13), 'lightGreen', 'black')
                let t = {
                    id: 'plate-menu-connection',
                    mouseMoveListener: null,
                    mouseUpListener: null,
                    mouseDownListener: null,
                    draw: null,
                    menuManager: null,
                    smenu: smenu
                }
                t.draw = (grid, ctx) => {
                    smenu.draw(ctx, grid)
                }
                t.mouseDownListener = (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                    }
                    else {
                        pt.wb(null)
                    }
                }
                t.mouseMoveListener = (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    pt.grid.rescale();
                    this.grid.rescale();
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                        smenu.mouseMove(pt.grid, mmx, mmy)
                    }

                }
                t.mouseUpListener = async (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                        await smenu.mouseUp(pt.grid, mmx, mmy)
                    }
                }
                pt.wb(t)

            }

            updateWellView(_type) {

                let wellfn = WellDisplay[_type]
                for (let x = 0; x < this.wells.length; x++) {
                    for (let y = 0; y < this.wells[x].length; y++) {
                        let well = this.wells[x][y];
                        if (well) {
                            well.skin_transient = wellfn
                            well.skin_type = _type;
                        }
                    }
                }
            }

            async createViewMenu(bx, by, x, y, pt) {
                let m = [
                    {
                        label: 'Target',
                        click: (x, y) => {
                            this.updateWellView('Targets')
                        },
                        move: () => {
                        },
                    }

                ]
                m.push(
                    {
                        label: 'R2',
                        click: async (x, y) => {
                            this.updateWellView('R2')
                        },
                        move: () => {
                        },
                    });
                m.push(
                    {
                        label: 'Layout',

                        click: async (x, y) => {

                            this.updateWellView('Layout')

                        },
                        move: () => {
                        },

                    });
                m.push(
                    {
                        label: 'Test',
                        click: async (x, y) => {
                            this.updateWellView('Test')

                        },
                        move: () => {
                        },

                    });

                m.push(
                    {
                        label: 'Heatmap',
                        click: async (x, y) => {
                            let filtered = filterWells(this.wells, (well) => {
                                console.log(' well select ' + well.select)
                                return well.select
                            })

                            let maxRow = 0;
                            let maxCol = 0;
                            const createDefaultWell = (row, col) => new GenericWell(`DefaultWell_${String.fromCharCode(65 + col)}${row + 1}`);
                            let twells = filtered.map(row => row.map(well => well ? well.deepCopy() : createDefaultWell(row, col)));
                            if (twells.length <= 0) {
                                infoPrompt("No wells are selected in this table ")
                                return;
                            }
                            let mvmax = getMaxDimensions(twells)
                            let newPlate = new Plate(this.name + '.sub', mvmax['maxCol'], mvmax['maxRow']);
                            newPlate.plateType = 'data'
                            newPlate.setWells(twells);
                            this.addChildPlate(newPlate)
                        },
                        move: () => {
                        },

                    });

                m.push(
                    {
                        label: 'Default',
                        click: async (x, y) => {
                        },
                        move: () => {
                        },
                    });

                let smenu = new Menu(m, pt.grid.Xwc(bx - 10), pt.grid.Ywc(by + 13), 'darkGray', 'white')
                let t = {
                    id: 'plate-menu-connection',
                    mouseMoveListener: null,
                    mouseUpListener: null,
                    mouseDownListener: null,
                    draw: null,
                    menuManager: null,
                    smenu: smenu
                }
                t.draw = (grid, ctx) => {
                    smenu.draw(ctx, grid)
                }
                t.mouseDownListener = (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                    }
                    else {
                        pt.wb(null)
                    }
                }
                t.mouseMoveListener = (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    pt.grid.rescale();
                    this.grid.rescale();
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                        smenu.mouseMove(pt.grid, mmx, mmy)
                    }

                }
                t.mouseUpListener = async (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                        await smenu.mouseUp(pt.grid, mmx, mmy)
                    }
                }
                pt.wb(t)

            }

            async button2Action(bx, by, x, y, pt) {
                let m = [
                    {
                        label: 'Name: ' + this.name,
                        click: (x, y) => {
                            let attr_window = ''
                            let va = prompt("Name", ["Name"], { "Name": attr_window }, 300, 300)
                            let m = va['Name']
                            this.name = m;
                            pt.updateworkbench(null)

                        },
                        move: () => {
                        },
                    }
                ]
                let TableOps = await exec('baja/table/table-ops')
                let menuList = await TableOps.load(pt, this)
                m = m.concat(menuList)
                m.push(
                    {
                        label: 'Delete ' + this.name,
                        click: async (x, y) => {
                            pt.fromPlate = null;
                            pt.removeRootplate(this)
                            pt.updateworkbench(null)
                        },
                        move: () => {
                        },
                    });

                let smenu = new Menu(m, pt.grid.Xwc(bx - 4), pt.grid.Ywc(by + 15), 'lightBlue', 'black')
                let t = {
                    id: 'plate-menu',
                    mouseMoveListener: null,
                    mouseUpListener: null,
                    mouseDownListener: null,
                    draw: null,
                    menuManager: null,
                    smenu: smenu
                }
                t.draw = (grid, ctx) => {
                    smenu.draw(ctx, grid)
                }
                t.mouseDownListener = (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                    }
                    else {
                        pt.wb(null)
                    }
                }
                t.mouseMoveListener = (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    pt.grid.rescale();
                    this.grid.rescale();
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                        smenu.mouseMove(pt.grid, mmx, mmy)
                    }

                }
                t.mouseUpListener = async (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                        await smenu.mouseUp(pt.grid, mmx, mmy)
                    }
                }
                pt.wb(t)
            }
            async highlight1() {
            }
            async highligh2() {
            }
            async setMoveListeners(bx, by, x, y, pt) {
                let m = await exec('baja/plate/views/move-plate.js', pt, this)
                pt.wb({
                    id: 'table-move',
                    priority: false,
                    mouseMoveListener: m.mouseMoveListener,
                    mouseUpListener: m.mouseUpListener,
                    mouseDownListener: m.mouseDownListener,
                    draw: m.draw,
                    menuManager: m.menuManager
                })
            }

            static buildPlateFromJSON(jsonData) {

                let plate = new Plate(jsonData.name, jsonData.grid.xmax, jsonData.grid.ymax);

                plate.uid = jsonData.uid;
                plate.visible = jsonData.visible;
                plate.plateType = jsonData.plateType;
                plate.grid = Object.assign(new MGrid(), jsonData.grid);

                if (Array.isArray(jsonData.wells)) {
                    plate.wells = jsonData.wells.map((row, x) => {
                        return row.map((wellData, y) => {
                            if (wellData) {

                                let well = new GenericWell(wellData.name || 'unknown');

                                well.score = wellData.score || null;
                                well.obj = wellData.obj || null;
                                well.concentration = wellData.concentration || null;
                                well.wellType = wellData.wellType || null;
                                well.select = wellData.select || false;
                                well.structure = wellData.structure || null;

                                well.properties = wellData.properties || {};

                                if (wellData.group) {

                                    if (!well.groups) {
                                        well.groups = {};
                                    }

                                    for (let groupKey in wellData.group) {
                                        if (wellData.group.hasOwnProperty(groupKey)) {
                                            if (!well.groups[groupKey]) {
                                                well.groups[groupKey] = [];
                                            }
                                            well.groups[groupKey] = well.groups[groupKey].concat(wellData.group[groupKey]);
                                        }
                                    }
                                }

                                well.color = wellData.color || 'rgba(100,150,150,1)';
                                well.value = wellData.value || null;
                                well.source = wellData.source || null;
                                well.compoundId = wellData.compoundId || null;
                                well.idt = wellData.idt || null;
                                well.props = wellData.props || null;
                                well.dye = wellData.dye || null;
                                well.position = wellData.position || null;

                                well.slope = wellData.slope || null;
                                well.intercept = wellData.intercept || null;
                                well.rSquared = wellData.rSquared || null;

                                return well;
                            } else {
                                return null;
                            }
                        });
                    });
                }

                if (Array.isArray(jsonData.plates)) {
                    plate.plates = jsonData.plates.map(plateData => Plate.buildPlateFromJSON(plateData));
                }

                return plate;
            }

            getPlateWithUID(uuid) {
                console.log('debubg');
                if (this.uid === uuid) {
                    return this;
                }
                for (let p of this.plates) {
                    return p.getPlateWithUID(uuid)
                }
            }

            toJSON(circleTracker = [], depth) {
                if (depth > 200) {
                    return { message: "Max depth reached" };
                }

                return {
                    uid: this.uid,
                    name: this.name,
                    selected: this.selected,
                    visible: this.visible,
                    plateType: this.plateType,
                    grid: {
                        xi: this.grid.xi,
                        yi: this.grid.yi,
                        width: this.grid.width,
                        height: this.grid.height,
                        xmin: this.grid.xmin,
                        xmax: this.grid.xmax,
                        ymin: this.grid.ymin,
                        ymax: this.grid.ymax,
                        xinset: this.grid.xinset,
                        yinset: this.grid.yinset,
                    },
                    wells: this.wells.map(row => row.map(well => {
                        if (well) {
                            return {
                                name: well.name || 'unknown',
                                score: well.score || null,
                                obj: well.obj || null,
                                concentration: well.concentration || null,
                                wellType: well.wellType || null,
                                select: well.select || false,
                                structure: well.structure || null,
                                group: well.group || null,
                                color: well.color || null,
                                value: well.value || null,
                                source: well.source || null,
                                compoundId: well.compoundId || null,
                                idt: well.idt || null,
                                props: well.props || null,
                                dye: well.dye || null,
                                position: well.position || null,
                                properties: well.properties || {},

                                slope: well.slope || null,
                                intercept: well.intercept || null,
                                rSquared: well.rSquared || null
                            };
                        } else {
                            return null;
                        }
                    })),
                    plates: this.plates.map(plate => plate.toJSON(circleTracker, depth + 1))
                };
            }

            getColumns() {
                if (this.wells)
                    return this.wells[0].length;
                else
                    return 0
            }

            getGroups() {
                let g = []
                for (let r of this.wells) {
                    for (let w of r) {
                        if (w.group != null && w.group.length > 0) {
                            if (g.indexOf(w.group.toString()) < 0) {
                                g.push(w.group.toString())
                            }
                        }
                    }
                }
                return g;
            }

            getGroup(name) {
                if (name == null || name.length <= 0) {
                    return;
                }

                let g = []

                for (let r of this.wells) {
                    for (let w of r) {
                        if (w.group != null && w.group.length > 0 && w.group.toLowerCase() === name.toLowerCase()) {
                            if (g.indexOf(w) < 0) {
                                g.push(w)
                            }
                        }
                    }
                }
                return g;
            }

            getPlateWithUID(uid) {
                if (this.uid === uid) {
                    return this;
                }
                else {
                    for (let p of this.plates) {
                        let vp = p.getPlateWithUID(uid);
                        if (vp) {
                            return vp;
                        }
                    }
                }
            }

            setVisible(va) {
                this.visible = va;

                if (!this.visible) {
                    let xmax = 1;
                    let ymax = 1;
                    this.grid.rescale();

                }

            }

            setCompoundId(well, value) {
                for (let row of this.wells) {
                    for (let col of row) {
                        if (col.name.toLowerCase() === well.toLowerCase()) {
                            col.compoundId = value;
                        }
                    }
                }
            }

            setValueByIndex(x, y, value) {
                if (this.wells[y] == null) {
                    console.log(" Attempting to add to the table with greater index than avalable columns Columns:  " + y);

                } else if (this.wells[y][x] == null) {
                    console.log(" Attempting to add to the table with greater index than avalable columns Rows:  " + x);

                } else {
                    this.wells[y][x].value = value;
                }
            }

            setValue(well, value) {
                for (let row of this.wells) {
                    for (let col of row) {

                        if (col.name && col.name.toLowerCase() === well.toLowerCase()) {

                            if (typeof value === 'number') {
                                col.value = Number(value);
                            } else {
                                col.value = value;
                            }
                        }
                    }
                }
            }

            getWellInRange(xx, xy, ww, hh) {
                this.grid.rescale();
                let x = Math.floor(this.grid.Xwc(xx - this.grid.xi * 2))
                let y = Math.floor(this.grid.Ywc(xy - this.grid.yi * 2))
                let w = Math.ceil(this.grid.worldWidth(ww));
                let h = Math.ceil(this.grid.worldHeight(hh));

                if (x >= 0 && x < this.wells.length && y >= 0 && y < this.wells[0].length) {
                    for (let xi = x; xi < (x + w); xi++) {
                        for (let yi = y; yi < (y + h); yi++) {
                            if (this.wells[xi] != null && this.wells[xi][yi] != null) {
                                this.wells[xi][yi].select = true;

                                if (this.selectedWells.indexOf(this.wells[xi][yi]) < 0) {
                                    this.selectedWells.push(this.wells[xi][yi])
                                }
                            }

                        }
                    }
                }
            }

            getWell(xx, xy) {
                let x = Math.floor(this.grid.Xwc(xx - this.grid.xi * 2))
                let y = Math.floor(this.grid.Ywc(xy - this.grid.yi * 2))
                if (this.wells[x] != null && this.wells[x][y] != null) {
                    if (this.selectedWells.indexOf(this.wells[x][y]) < 0) {
                        this.selectedWells.push(this.wells[x][y])
                    }
                    return this.wells[x][y];
                }
                return null;
            }

            selectWell(xx, xy) {
                let x = Math.floor(this.grid.Xwc(xx - this.grid.xi * 2))
                let y = Math.floor(this.grid.Ywc(xy - this.grid.yi * 2))
                if (this.wells[x] != null && this.wells[x][y] != null) {
                    if (this.selectedWells.indexOf(this.wells[x][y]) < 0) {
                        this.selectedWells.push(this.wells[x][y])
                    }
                    this.wells[x][y].select = true;
                }
            }
            setConcentration(well, con) {
                for (let row of this.wells) {
                    for (let col of row) {
                        if (col)
                            if (col.name.toLowerCase() === well.toLowerCase()) {
                                col.concentration = con;
                            }
                    }
                }
            }

            deselectPlate() {
                this.selected = false;
                this.deselectPlateRoot();
            }
            deselectPlateRoot() {
                this.selected = false;
                for (let p of this.plates) {
                    p.deselectPlateRoot();
                }
            }
            deselectWells() {
                this.selectedWells = []
                for (let row of this.wells) {
                    for (let col of row) {
                        if (col)
                            col.select = false;
                    }
                }
            }
            deselectAll() {
                this.selected = false;
                for (let p of this.plates) {
                    p.deselectAll();
                }

            }
            setName(name) {
                this.name = name;
            }
            setType(plateType) {
                this.plateType = plateType;
            }
            setStructure(index, structure) {
                let t = index;
                let y = Math.floor(t / 12);
                let ti = t - y * 12;
                let x = Math.floor(ti)
                if (this.wells[x][y] != null) {
                    this.wells[x][y].structure = structure
                }
            }

            getAlph(i) {
                let char = String.fromCharCode(65 + i);
                return char;
            }
            addPlate(x, y) {
                if (x > this.grid.xi && x < (this.grid.xi + this.grid.width) && y < this.grid.yi && y > (this.grid.yi - this.grid.height)) {
                    console.log(' found it ' + name)
                }
            }
            inside(grid, x, y) {
                let scy = grid.Y(y)
                let screen_height = Math.abs(grid.screenHeight(this.grid.height));
                let screen_width = Math.abs(grid.screenWidth(this.grid.width));
                let scx = grid.X(x)
                let _scy = grid.Y(this.grid.yi);
                let _sc = grid.X(this.grid.xi);
                if (scx > _sc && scx < _sc + screen_width + 20) {
                    if (scy < _scy &&
                        scy > _scy - screen_height - 20) {
                        return true;
                    }
                }

                let mouseX = x;
                let mouseY = y;

                let index = 0;
                let init = grid.X(this.grid.X(0.0));
                for (let button of this.buttons) {
                    let buttonX = init + index * bsize;
                    let buttonY = grid.Y(this.grid.yi + this.grid.height) - this.margin.top;
                    index++;
                    let bbw = bsize;
                    if (
                        mouseX >= buttonX &&
                        mouseX <= buttonX + bbw &&
                        mouseY >= buttonY &&
                        mouseY <= buttonY + button.height
                    ) {
                        return true;
                    }
                }

                return false;
            }
            getMenu(x, y, graph) {

                let xsc = graph.X(x);
                let nameLocation = graph.X(this.grid.xi + 0.9) - 4;

                if (xsc > nameLocation - 5 && xsc < (nameLocation) + 15) {
                    return new NameMenu(this.grid.xi + 0.9, y);
                } else {
                    return new DefaultMenu(this.grid.xi + 0.95, y);
                }
            }

            mouseDown(grid, x, y) {
                let scy = grid.Y(y)
                let screen_height = grid.screenHeight(this.grid.height);

                let xsc = grid.X(x)

                if (this.menu_selected) {
                    if (xsc > grid.X(this.menu.x) - 10 && xsc < (grid.X(this.grid.xi) + grid.screenWidth(this.grid.width) + this.menu.menu_width) &&
                        scy >= grid.Y(this.grid.yi) &&
                        scy < grid.Y(this.grid.yi) + this.menu.menu_height) {
                        this.menu.mouseDown(grid, x, y)
                        this.menu_selected = true;
                    } else {
                        this.menu_selected = false;
                    }
                } else {
                    this.menu_selected
                }
            }

            mouseOver(grid, x, y) {
                let scy = grid.Y(y)
                if (!this.menu_selected) {
                    if (x > this.grid.xi && x < (this.grid.xi + this.grid.width) &&
                        scy > grid.Y(this.grid.yi) &&
                        scy < grid.Y(this.grid.yi) + 10) {
                        this.menu = this.getMenu(x, y, grid);
                        this.menu_selected = true;
                    } else {
                        this.menu_selected = false;
                    }
                } else {
                    let xsc = grid.X(x)
                    if (xsc > grid.X(this.menu.x) - 10 && xsc < (grid.X(this.grid.xi) + grid.screenWidth(this.grid.width) + this.menu.menu_width) &&
                        scy >= grid.Y(this.grid.yi) &&
                        scy < grid.Y(this.grid.yi) + this.menu.menu_height) {
                        this.menu = this.getMenu(x, grid);
                        this.menu.mouseOver(grid, x, y)

                        this.menu_selected = true;
                    } else {
                        this.menu_selected = false;
                    }
                }
            }

            selectIt() {
                this.selected = true;
            }

            select(grid, x, y) {

                let scy = grid.Y(y)

                if (x > this.grid.xi && x < (this.grid.xi + this.grid.width) &&
                    scy > grid.Y(this.grid.yi) &&
                    scy < grid.Y(this.grid.yi) + 20) {
                    this.menu_selected = true;
                } else {
                    this.menu_selected = false;
                }
            }

            addChildPlate(p) {
                p.grid.xi = 0;
                p.grid.yi = this.grid.yi - 2;
                p.grid.width = 1;
                p.grid.height = 1;
                this.plates.push(p);
            }

            getXMin(xmin) {
                if (xmin === undefined) {
                    xmin = this.grid.xi;
                }
                if (this.grid.xi < xmin) {
                    xmin = this.grid.xi;
                }
                for (let p of this.plates) {
                    xmin = p.getXMin(xmin)
                }
                return xmin;
            }
            getXMax(xmax) {
                let _xmax = this.grid.xi + Math.abs(this.grid.width);
                if (xmax === undefined) {
                    xmax = _xmax;
                }
                if ((_xmax) > xmax) {
                    xmax = _xmax;
                }
                for (let p of this.plates) {
                    xmax = p.getXMax(xmax)
                }
                return xmax;
            }
            getYMin(ymin) {
                if (!ymin) {
                    ymin = this.grid.yi;
                } else
                    if (this.grid.yi < ymin) {
                        ymin = this.grid.yi;
                    }
                for (let p of this.plates) {
                    ymin = p.getYMin(ymin)
                }
                return ymin;
            }
            getYMax(ymax) {
                let _ymax = this.grid.yi + Math.abs(this.grid.height);
                if (ymax === undefined) {
                    ymax = _ymax;
                }
                if ((_ymax) > ymax) {
                    ymax = _ymax;
                }
                for (let p of this.plates) {
                    ymax = p.getYMax(ymax)
                }
                return ymax;
            }

            removerPlate(plate) {
                let index = this.plates.indexOf(plate);
                if (index >= 0) {
                    this.plates.splice(index, 1)
                }
            }

            adjustY(value) {
                this.grid.yi = value;
                for (let p of this.plates) {
                    p.adjustY(this.grid.yi - 2)
                }
            }

            getNumberOfColumns() {

                if (this.wells && this.wells.length > 0) {
                    return this.wells.length;
                } else {
                    return 0;
                }
            }
            getNumberOfRows() {
                let maxRows = 0;

                this.wells.forEach(column => {
                    if (column && column.length > maxRows) {
                        maxRows = column.length;
                    }
                });

                return maxRows;
            }

            resizeToFitWithinSquare() {
                const maxDimension = 1;
                let aspectRatio = this.aspect_ratio;
                let newWidth, newHeight;
                if (aspectRatio > 1) {
                    this.w = maxDimension;
                    this.h = maxDimension / aspectRatio;
                } else {
                    this.h = maxDimension;
                    this.w = maxDimension * aspectRatio;
                }
            }

            find_aspect_ratio(graph) {
                let w = 0;
                let h = 0;
                let numberOfColumns = this.getNumberOfColumns();
                if (numberOfColumns > 0) {
                    w = numberOfColumns * graph.worldWidth(100);
                }
                let numberOfRows = this.getNumberOfRows();
                if (numberOfRows > 0) {
                    h = numberOfRows * graph.worldHeight(35);
                }
                this.aspect_ratio = w / h
            }

            addScrollbar(graph, ctx) {
                const totalHeight = graph.screenHeight(1);
                const scrollbarWidth = graph.screenWidth(0.02);
                const trackColor = "darkGray";
                const handleColor = "cyan";
                const fix_height_sc = graph.screenHeight ( this.grid.height);
                const visibleHeight = graph.worldHeight(fix_height_sc);
                const handleHeight = (visibleHeight / totalHeight) * (this.grid.ymax - this.grid.ymin);
                const handlePosition = (this.grid.ymax - this.grid.yi - visibleHeight) / totalHeight * (this.grid.ymax - this.grid.ymin);
                const trackHeight = graph.screenHeight(1);
                let scx = this.grid.xi;
                ctx.fillStyle = trackColor;
                ctx.fillRect(graph.X(this.grid.xi) - this.grid.screenWidth(scrollbarWidth) - 5, 10, scrollbarWidth, trackHeight);
                ctx.fillStyle = handleColor;
                ctx.fillRect(graph.X(this.grid.xi) - this.grid.screenWidth(scrollbarWidth), this.grid.yi, scrollbarWidth, totalHeight)

            }

            setWells(wells) {

                this.wells = wells;

                for (let x = 0; x < this.grid.xmax; x++) {
                    for (let y = this.grid.ymax - 1; y >= 0; y--) {

                        if (this.wells[x])
                            if (this.wells[x][this.grid.ymax - y - 1] == null) {
                                this.wells[x][this.grid.ymax - y - 1] = new GenericWell(
                                    this.getAlph(this.grid.ymax - y - 1) + (1 + x)
                                );
                            }
                    }
                }

            }

            getWidth(index) {
                let t = 0;
                if (this.grid.yi === index) {
                    t += this.grid.width;
                }
                for (let p of this.plates) {
                    t += p.getWidth(index);
                }
                return t;
            }

            adjust(x, i) {
                if (this.grid.yi === i) {
                    this.grid.xi = x;
                    x += this.grid.width;
                }
                for (let p of this.plates) {
                    x += p.adjust(x, i)
                }
                return x;
            }

            getX() {
                return this.grid.xi + this.grid.width / 2;
            }
            getY() {
                return this.grid.yi;
            }

            getPlate(scx, scy, grid) {
                if (this.inside(grid, scx, scy)) {
                    return this;
                }
                for (let f of this.plates) {
                    let pl = f.getPlate(scx, scy, grid);
                    if (pl) {
                        return pl;
                    }
                }
                return null;
            }

            drawTextBoxWithCursor(ctx, text, cursorPos, x, y, width, height, bgColor, borderColor, textColor, cursorColor) {
                let radius = 10;
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 5;
                ctx.shadowOffsetY = 5;
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.fillStyle = bgColor;

                drawRoundedRect(ctx, x, y, width, height, radius);

                ctx.fill();

                ctx.shadowBlur = 0;
                ctx.lineWidth = 2;
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;

                ctx.strokeStyle = borderColor;
                ctx.stroke();
                ctx.lineWidth = 2;
                ctx.strokeStyle = borderColor;
                ctx.stroke();

                ctx.font = '16px Arial';
                ctx.fillStyle = textColor;
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';

                let textX = x + 10;
                let textY = y + height / 2;
                ctx.fillText(text, textX, textY);
                let cursorX = textX + ctx.measureText(text.slice(0, cursorPos)).width;
                if (cursorVisible) {
                    ctx.beginPath();
                    ctx.moveTo(cursorX, textY - 10);
                    ctx.lineTo(cursorX, textY + 10);
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = cursorColor;
                    ctx.stroke();
                }

                ctx.shadowBlur = 0;
                ctx.lineWidth = 2;
                ctx.shadowBlur = 0;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.stroke();

            }

            drawMessagePanel(ctx, text, x, y) {
                let height = 100;
                ctx.shadowBlur = 10;
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.fillStyle = 'black';
                ctx.font = '16px Arial';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                let textX = x + 10;
                let textY = y + height / 2;
                ctx.fillText(text, textX, textY);
            }

            drawTextBox(ctx, text, x, y, width, height, bgColor, borderColor, textColor) {
                let radius = 10;
                ctx.fillStyle = bgColor;
                drawRoundedRect(ctx, x, y, width, height, radius);
                ctx.fill();
                ctx.lineWidth = 2;
                ctx.strokeStyle = borderColor;
                ctx.stroke();
                ctx.font = '12px Arial';
                ctx.fillStyle = textColor;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                let textX = x + width / 2;
                let textY = y + height / 2;

                ctx.fillText(text, textX, textY);
            }

            async draw(graph, ctx, x, y) {
                if (ctx) {

                    let yscreen_height = graph.screenHeight(this.grid.height);
                    let yscreen_min_ = graph.Y(this.grid.yi);
                    let yscreen_max = yscreen_min_ + yscreen_height;

                    let screen_width = graph.screenWidth(this.grid.width);
                    let xscreen_min_ = graph.X(this.grid.xi);
                    let xscreen_max = xscreen_min_ + screen_width;

                    this.find_aspect_ratio(graph);
                    this.resizeToFitWithinSquare();
                    graph.rescale();
                    this.grid.width = this.w;
                    this.grid.rescale();

                    ctx.shadowBlur = 0;
                    let ysheight = graph.screenHeight(this.grid.height);
                    let ysc = graph.Y(this.grid.yi + this.grid.height);

                    if (this.selected) {
                        ctx.shadowBlur = 20;
                        ctx.shadowColor = "darkGray";
                        ctx.fillRect(graph.X(this.grid.xi), graph.Y(this.grid.yi + this.grid.height),
                            graph.screenWidth(this.grid.width), graph.screenHeight(this.grid.height));
                        ctx.restore();
                    }

                    ctx.font = "19pt Arial";
                    ctx.fillStyle = 'rgb(0, 87, 163)';

                    ctx.save();

                    ctx.translate(graph.X(this.grid.xi) - 20, graph.Y(this.grid.yi + this.grid.height / 2));
                    ctx.rotate(-Math.PI / 2);

                    if (this.plateType != null && this.plateType.length > 0) {
                        ctx.fillText(this.name + '[' + this.plateType + ']', 0, 0);
                    } else {
                        ctx.fillText(this.name, 0, 0);
                    }

                    ctx.restore();

                    ctx.fillStyle = "white";
                    ctx.shadowBlur = 0;
                    ctx.fillRect(graph.X(this.grid.xi), ysc, graph.screenWidth(this.grid.width), ysheight);
                    ctx.stroke();
                    let screenw = graph.screenWidth(this.grid.width);

                    if (screenw < 50) {
                        ctx.fillStyle = "lightGray";
                        ctx.strokeStyle = "darkGray";
                        ctx.shadowBlur = 2;
                        ctx.fillRect(graph.X(this.grid.xi), ysc, graph.screenWidth(this.grid.width), ysheight);

                        if (this.plateType && this.plateType.toLowerCase() === 'excel') {
                            if (this.docImage && this.docImageLoaded) {
                                ctx.drawImage(this.docImage, graph.X(this.grid.xi), graph.Y(this.grid.yi) + 2, 48, 48);
                            } else {
                                this.docImage = new Image();
                                this.docImage.src = this.excelImg;
                                this.docImage.onload = (e) => {
                                    this.docImageLoaded = true;
                                    ctx.drawImage(this.docImage, graph.X(this.grid.xi), graph.Y(this.grid.yi) + 2, 48, 48);
                                };
                            }
                        }
                    } else {
                        if (this.type === 'excel') {
                            if (this.docImage && this.docImageLoaded) {
                                ctx.drawImage(this.docImage, graph.X(this.grid.xi), graph.Y(this.grid.yi) + 2, 48, 48);
                            } else {
                                this.docImage = new Image();
                                this.docImage.src = this.excelImg;
                                this.docImage.onload = (e) => {
                                    this.docImageLoaded = true;
                                    ctx.drawImage(this.docImage, graph.X(this.grid.xi), graph.Y(this.grid.yi) + 2, 48, 48);
                                };
                            }
                        } else {
                            this.drawPlate(graph, ctx);
                        }
                    }

                    this.drawConnections(graph, ctx);
                    for (let plate of this.plates) {
                        plate.draw(graph, ctx);
                    }
                    if (this.menu) {
                        this.menu.draw(ctx, graph);
                    }

                    ctx.save();
                    for (let c of this.plots) {
                        this.grid.rescale();
                        await c.draw___new(graph, ctx);
                    }
                    this.drawButtons(ctx, graph, screen_width);
                    if (this.textActive) {
                        cursorVisible = !cursorVisible;
                        this.drawTextBoxWithCursor(ctx, this.text, graph.X(this.grid.X(cursorPos)), graph.X(this.grid.xi + this.grid.width / 2),
                        graph.Y((this.grid.yi + this.grid.height)) - 45, 200, 40, '#f0f0f0', '#000000', '#000000', '#000000');

                    }

                    if (this.textActive && this.message && this.message.length > 0) {
                        this.drawMessagePanel(ctx, this.message, graph.X(this.grid.xi + this.grid.width),
                            graph.Y((this.grid.yi + this.grid.height)) - 45)
                    }

                }
            }

            add(plate) {

            }

            selectWells(w) {

                for (let row of this.wells) {
                    for (let col of row) {
                        if (col) {
                            for (let address of w) {
                                if (col.name.toLowerCase() === address.toLowerCase() ||
                                    col.position.toLowerCase() === address.toLowerCase()
                                ) {
                                    col.selectIt();
                                }
                            }
                        }
                    }
                }

                for (let p of this.plates) {
                    p.selectWells(w)
                }
            }

            getMaxCoordinates() {
                let maxXi = this.grid.xi;
                let maxYi = this.grid.yi;

                for (let nestedPlate of this.plates) {
                    let { xi: nestedXi, yi: nestedYi } = nestedPlate.getMaxCoordinates();
                    maxXi = Math.max(maxXi, nestedXi);
                    maxYi = Math.min(maxYi, nestedYi);
                }

                return { xi: maxXi, yi: maxYi };
            }
            getPlates(plates, y) {

                if (Math.floor(this.grid.yi) === y) {
                    if (plates.indexOf(this) < 0) {
                        plates.push(this)
                    }
                }

                for (let p of this.plates) {
                    if (Math.floor(p.grid.yi) === y) {
                        if (plates.indexOf(p) < 0)
                            plates.push(p)
                    }
                    plates = p.getPlates(plates, y)
                }
                return plates;
            }

            drawConnections(graph, ctx, x, y) {
                ctx.lineWidth = 1;
                ctx.strokeStyle = "lightBlue";

                if (this.grid && this.plates) {
                    for (let plate of this.plates) {
                        ctx.beginPath();
                        ctx.moveTo(graph.X(this.grid.xi + 0.5), graph.Y(this.grid.yi));

                        ctx.lineTo(graph.X(plate.grid.xi + 0.5), graph.Y(plate.grid.yi + 1));
                        ctx.stroke();
                    }
                }
            }

            drawLine = async (graph, ctx, xi, yi, xf, yf, color, lineSize, lineCap) => {
                if (color != null) {
                    ctx.strokeStyle = color;
                }
                if (lineSize == null) {
                    lineSize = 2;
                }
                if (lineCap == null) {
                    ctx.lineCap = lineCap;
                }
                else {
                    ctx.lineCap = 'butt';
                }

                ctx.beginPath();
                ctx.moveTo(graph.X(this.grid.X(xi)), graph.Y(this.grid.Y(yi)));
                ctx.lineTo(graph.X(this.grid.X(xf)), graph.Y(this.grid.Y(yf)));
                ctx.lineWidth = lineSize;
                ctx.stroke();
            }

            drawWellsAnnotations = (graph, ctx) => {

                let scrwidth = graph.screenWidth(this.grid.screenWidth(1))
                let scrheight = graph.screenWidth(this.grid.screenWidth(1))

                for (let x = 0; x < this.grid.xmax; x++) {
                    for (let y = 0; y < this.grid.ymax; y++) {

                    }
                }
            }

            addPlot(plot) {
                this.plots.push(plot)
            }

            drawPlate(graph, ctx) {
                this.grid.rescale();

                this.drawWellsAnnotations(graph, ctx)
                this.drawLine(graph, ctx, this.grid.getxmin(), this.grid.getymin(), this.grid.getxmin(), this.grid.getymax(), 'lightBlue', 1);
                this.drawLine(graph, ctx, this.grid.getxmax(), this.grid.getymin(), this.grid.getxmax(), this.grid.getymax(), 'black', 1);
                this.drawLine(graph, ctx, this.grid.getxmin(), this.grid.getymin(), this.grid.getxmax(), this.grid.getymin(), 'black', 1);
                ctx.shadowBlur = 8;
                this.drawLine(graph, ctx, this.grid.getxmin(), this.grid.getymax(), this.grid.getxmax(), this.grid.getymax(), 'black', 5);
                ctx.shadowBlur = 0;

            }
        }

        resolve(Plate)
    })

}
