function () {

    return new Promise(async (resolve, rej) => {
        let Menu = await exec('flexigraph/menu.js');

        if (isMobile()) {
            Menu = await exec('flexigraph/menu-m.js')
        }

        let MGrid = await exec('flexigraph/grid.js');
        let HM = await exec('baja/history/HM')
        let GenericWell = await exec('baja/plate/well')
        let Glyph = await exec('baja/draw/glyph.js')
        let Plate = await exec('baja/plate/plate.js');
        let MPlot = await exec("flexigraph/plot-view.js");
        let AnimateGrid = await exec('flexigraph/animate-it.js')
        let scroll_y = 10;
        let scrollbarHeight = 25;
        let scrollbarWidth = 15;
        let scrollbarX = 20;
        let scrollbarY = 0;
        let scrollGrid = null;

        let text = '';
        let textActive = false;
        let cursorPos = 0;
        let textBoxX = 0;
        let textBoxY = 0;
        let textBoxWidth = 190;
        let textBoxHeight = 50;
        let selectText = false;
        let textStyle = 'search'
        let initBox = true;
        let selected_glyphs = [];
        let selectedPoints = []
        let clickedButtons = new Set();
        let buttonLabels = ["Exit Folder"];

        function getOverlappingRanges(singleRange, ro) {

            let rangeArray = Object.keys(ro)

            const rangeRegex = /^(\w+)\[(\d+):(\d+)\]\[(\d+):(\d+)\]$/;

            const singleMatch = singleRange.match(rangeRegex);
            if (!singleMatch) {
                throw new Error("Invalid range format for singleRange. Must be in 'table[xi:xf][yi:yf]'.");
            }

            const [, singleTable, singleXi, singleXf, singleYi, singleYf] = singleMatch.map((val, idx) =>
                idx > 1 ? parseInt(val, 10) : val
            );

            const overlappingRanges = [];

            for (const range of rangeArray) {
                const rangeMatch = range.match(rangeRegex);
                if (!rangeMatch) {
                    throw new Error(`Invalid range format in rangeArray: '${range}'. Must be in 'table[xi:xf][yi:yf]'.`);
                }

                const [, table, xi, xf, yi, yf] = rangeMatch.map((val, idx) =>
                    idx > 1 ? parseInt(val, 10) : val
                );

                if (singleTable === table) {

                    const xOverlap = singleXi <= xf && singleXf >= xi;
                    const yOverlap = singleYi <= yf && singleYf >= yi;

                    if (xOverlap && yOverlap) {
                        overlappingRanges.push(ro[range]);
                    }
                }
            }

            return overlappingRanges;
        }

        async function getSharedDocuments(userId, host_) {
            const res = await fetch(`${host_}/shared/${userId}`);
            if (!res.ok) throw new Error('Failed to fetch shared documents');
            const docs = await res.json();
            console.log('Shared docs:', docs);
            return docs;
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
        function getFadeAlpha(index, numRows) {
            if (index < 4) {
                return (index + 1) / 6;
            }
            return 1;
        }

        function extractTableNames(inputString) {

            const regex = /\b([a-zA-Z0-9_]+)\[/g;
            let match;
            const tableNames = new Set();

            while ((match = regex.exec(inputString)) !== null) {

                tableNames.add(match[1]);
            }

            return Array.from(tableNames);
        }

        function drawArrow(ctx, fromRect, toRect, graph) {

            const fromY = graph.Y(fromRect.grid.yi + fromRect.getHeight());
            const fromX = graph.X(fromRect.grid.xi);
            const fromCenterX = fromX + graph.screenWidth(fromRect.getWidth()) / 2;
            const fromCenterY = fromY + graph.screenHeight(fromRect.getHeight()) / 2;

            const toY = graph.Y(toRect.grid.yi + toRect.getHeight());
            const toX = graph.X(toRect.grid.xi);
            const toCenterX = toX + graph.screenWidth(toRect.getWidth()) / 2;
            const toCenterY = toY + graph.screenHeight(toRect.getHeight()) / 2;

            ctx.beginPath();
            ctx.moveTo(fromCenterX, fromCenterY);
            ctx.lineTo(toCenterX, toCenterY);
            ctx.strokeStyle = "rgba(208, 208, 233, 0.2)";
            ctx.lineWidth = 10;
            ctx.stroke();

            const angle = Math.atan2(toCenterY - fromCenterY, toCenterX - fromCenterX);
            const arrowheadLength = 10;

            const arrowX1 = toCenterX - arrowheadLength * Math.cos(angle - Math.PI / 6);
            const arrowY1 = toCenterY - arrowheadLength * Math.sin(angle - Math.PI / 6);

            const arrowX2 = toCenterX - arrowheadLength * Math.cos(angle + Math.PI / 6);
            const arrowY2 = toCenterY - arrowheadLength * Math.sin(angle + Math.PI / 6);

            ctx.beginPath();
            ctx.moveTo(toCenterX, toCenterY);
            ctx.lineTo(arrowX1, arrowY1);
            ctx.lineTo(arrowX2, arrowY2);
            ctx.lineTo(toCenterX, toCenterY);
            ctx.fillStyle = "black";
            ctx.fill();
        }

        stack = [];
        let selectedColor = 'magenta'
        let colors = [
            '#EADDCA',
            '#C4A484',
            'magenta',
            'red',
            'blue',
            'lightGreen',
            'lightBlue',
            'orange',
            'lightGray',
            'lightRed',
        ]
        let buttons__ = []
        let index = 1
        for (let t of colors) {
            buttons__.push({
                x: index++, y: 0, label: '', ionFunction: createIonFunction(async (button) => {
                    selectedColor = t;
                    console.log(' selected color ' + selectedColor)

                }), background: t
            })
        }
        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 20,
                'width': 300,
                'grid': {
                    xmin: 0,
                    xmax: colors.length,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': buttons__

            }
        }

        const arrowImg = new Image();
        arrowImg.src = "assets/img/icons/png/left-arrow-48x48-4817844.png";
        arrowImgLoaded = false;

        arrowImg.onload = () => {
            arrowImgLoaded = true;
        };
        function reconstituteObject(originalObject, jsonObject) {
            for (let key in jsonObject) {
                if (jsonObject.hasOwnProperty(key)) {
                    const originalValue = originalObject[key];
                    const jsonValue = jsonObject[key];

                    if (jsonValue === null || typeof jsonValue !== 'object') {
                        if (originalValue !== jsonValue) {
                            originalObject[key] = jsonValue;
                        }
                    } else if (typeof jsonValue === 'object' && originalValue && typeof originalValue === 'object') {
                        if (key === 'grid' && originalValue instanceof MGrid) {

                            Object.assign(originalValue, jsonValue);
                        } else if (key === 'wells' && Array.isArray(jsonValue)) {

                            for (let col = 0; col < jsonValue.length; col++) {
                                if (!originalValue[col]) {
                                    originalValue[col] = [];
                                }

                                for (let row = 0; row < jsonValue[col].length; row++) {
                                    const jsonWell = jsonValue[col][row];
                                    if (originalValue[col][row] instanceof GenericWell) {
                                        Object.assign(originalValue[col][row], jsonWell);
                                    } else {
                                        originalValue[col][row] = new GenericWell(
                                            jsonWell.name,
                                            jsonWell.value,
                                            jsonWell.obj,
                                            jsonWell.group
                                        );
                                        Object.assign(originalValue[col][row], jsonWell);
                                    }
                                }

                                if (originalValue[col].length > jsonValue[col].length) {
                                    originalValue[col].length = jsonValue[col].length;
                                }
                            }

                            if (originalValue.length > jsonValue.length) {
                                originalValue.length = jsonValue.length;
                            }
                        } else {
                            reconstituteObject(originalValue, jsonValue);
                        }
                    }
                }
            }
        }

        minObjectX = Infinity;
        maxObjectX = -Infinity;

        let PlateTrack = class PlateTrack {
            ptracks = []
            description = '';
            users = {}
            path = null;
            owner = null;
            formulas = {}
            attr__drawFormulaConnections = true;
            attr__showTablesMenu = true;
            attr__autoSave = true;
            attr__displayEvents = true;
            attr__hideWellDetailPopup = true;
            attr__showGrid = true;
            attr__displayBookMarks = true;
            buttons = [];
            name;
            minObjectY;
            maxObjectY;
            isDraggingScrollbar = false;
            color = 'gray'
            activePlot = null;
            root = [];
            ops = []
            transferFunctions = [];
            trackFunctions = [];
            connections = []
            m_plots = []
            glyphs = []
            bookmarks = {}
            ljl_bookmarks = {}

            grid;
            mode = 'select';
            layoutTool = null;
            menu = null;
            plate_menu = null;
            menu_vis = false;
            mx = 10;
            my = 10;
            selectedPlate;
            fromPlate;
            toPlate;
            wb;
            wbid = null;
            file = `${generateNautName()}.bjb`
            static main_layout;
            __msg;
            __msgb;
            __msgc;
            uid;
            __tables_menu = null;
            __bookmark_menu = null;
            attr__displayBookMarks = true;
            selected_well = null;
            __canvas_width;
            __canvas_height;
            __not_connected = true;
            __stack = []
            __redostack = [];
            __stack_menu = null;
            __redo_stack_menu = null;
            __canvas__;
            __menu__ = null;
            menu_plate;
            interpreter_scope = '_'
            pauseCalculations = false;
            _lastUpdateTime = Date.now();

            constructor(name) {
                this.name = name;
                this.uid = uuid();
                this.grid = new MGrid(0, 0, 1, 1);
                this.grid.setxmax(1.5);
                this.grid.setymax(1.5);
                this.grid.setxmin(0);
                this.grid.setymin(0);
                this.grid.setInset(0, 0)
                this.grid.rescale();
                this.setMessage("");
                scrollGrid = new MGrid(scrollbarX, scrollbarY, scrollbarWidth, scrollbarHeight)
                scrollGrid.setInset(0, 0)
                scrollGrid.rescale();
                scroll_y = 2;
                this.pauseCalculations = false;
                this.users['owner'] = getUser()

                if (isMobile()) {
                    this.attr__showTablesMenu = false;
                }
            }

            displayTopLevelTrack() {
                if (this.ptracks && this.ptracks.length > 0) {
                    function __decompress(compressedString) {
                        const chunkSize = 0x8000;
                        let binaryData = [];
                        for (let i = 0; i < compressedString.length; i += chunkSize) {
                            const chunk = compressedString.substring(i, i + chunkSize);
                            const chunkArray = Array.from(chunk, char => char.charCodeAt(0));
                            binaryData.push(...chunkArray);
                        }
                        let jsonString = decompressJson(Uint8Array.from(binaryData));
                        return jsonString;
                    }
                    const udata = __decompress(this.ptracks[0])

                    this.copyFromJSON(udata)
                    this.ptracks[0] = this.capturestate()

                }
            }

            removeTableByName(nameToRemove) {
                const index = this.root.findIndex(item => item.name === nameToRemove);
                if (index !== -1) {
                    this.root.splice(index, 1);
                }

            }

            removeItemsByTableName(tableName) {
                const keysToRemove = [];

                for (const key in this.formulas) {
                    if (this.formulas.hasOwnProperty(key)) {
                        const value = this.formulas[key];

                        if (key.includes(tableName) || String(value).includes(tableName)) {
                            keysToRemove.push(key);
                        }
                    }
                }

                keysToRemove.forEach(key => {
                    delete this.formulas[key];
                });
            }

            addFormula(wellselections, formula) {
                this.formulas[wellselections] = formula;
            }

            async capturePlateState() {

                let t = {
                    "plate_track": this
                }

                let gs = JSON.stringify(t, function (key, value) {
                    if (key != null && key.toLowerCase().startsWith('_')) {
                        return null;
                    }
                    else
                        if (typeof value === 'object' && value !== null) {
                            if (Array.isArray(value) && value.every(elem => elem && typeof elem === 'object' && 'x' in elem && 'y' in elem)) {
                                return value;
                            } else if (value.x != null && value.y != null && !isNaN(key) && parseInt(key, 10).toString() === key) {
                                return value;
                            }
                            else {
                                return value;
                            }
                        }
                    return value;
                });
                return gs;
            }

            capturestate() {
                let gs = JSON.stringify(this, function (key, value) {
                    if (key != null && key.toLowerCase().startsWith('_')) {
                        return null;
                    }

                    else
                        if (typeof value === 'object' && value !== null) {
                            if (Array.isArray(value) && value.every(elem => elem && typeof elem === 'object' && 'x' in elem && 'y' in elem)) {
                                return value;
                            } else if (value.x != null && value.y != null && !isNaN(key) && parseInt(key, 10).toString() === key) {
                                return value;
                            }
                            else {
                                return value;
                            }
                        }
                    return value;
                });
                let binaryData = compressString(gs)
                const chunkSize = 0x8000;
                let stringData = '';
                for (let i = 0; i < binaryData.length; i += chunkSize) {
                    const chunk = binaryData.subarray(i, i + chunkSize);
                    stringData += String.fromCharCode.apply(null, chunk);
                }
                return stringData;
            }

            copyPlates() {
                let loadPlates = (obj) => {
                    let ps = [];
                    for (let a of obj) {
                        let p = Object.assign(new Plate(), a);
                        if (p.plates && p.plates.length > 0) {
                            p.plates = loadPlates(p.plates);
                        }
                        p.grid = Object.assign(new MGrid(), p.grid);

                        let wellsArray = [];
                        if (a.wells) {
                            for (let row of a.wells) {
                                let newRow = row.map(well => Object.assign(new GenericWell(), well));
                                wellsArray.push(newRow);
                            }
                        }
                        p.wells = wellsArray;

                        ps.push(p);
                    }
                    return ps;
                };
                return loadPlates(this.root)
            }

            popFolder() {

                let content = this.ptracks.pop();
                const uid = content.substring(0, content.indexOf(':'))
                content = content.substring(content.indexOf(':') + 1)
                let gs = JSON.stringify(this, function (key, value) {
                    if (key != null && key.toLowerCase().startsWith('_')) {
                        return null;
                    }
                    else
                        if (typeof value === 'object' && value !== null) {
                            if (Array.isArray(value) && value.every(elem => elem && typeof elem === 'object' && 'x' in elem && 'y' in elem)) {
                                return value;
                            } else if (value.x != null && value.y != null && !isNaN(key) && parseInt(key, 10).toString() === key) {
                                return value;
                            }
                            else {
                                return value;
                            }
                        }
                    return value;
                });
                let binaryData = compressString(gs)
                const chunkSize = 0x8000;
                let stringData = '';
                for (let i = 0; i < binaryData.length; i += chunkSize) {
                    const chunk = binaryData.subarray(i, i + chunkSize);
                    stringData += String.fromCharCode.apply(null, chunk);
                }
                function __decompress(compressedString) {
                    const chunkSize = 0x8000;
                    let binaryData = [];
                    for (let i = 0; i < compressedString.length; i += chunkSize) {
                        const chunk = compressedString.substring(i, i + chunkSize);
                        const chunkArray = Array.from(chunk, char => char.charCodeAt(0));
                        binaryData.push(...chunkArray);
                    }
                    let jsonString = decompressJson(Uint8Array.from(binaryData));
                    return jsonString;
                }

                const previousState = this.capturestate();
                const udata = __decompress(content)
                this.copyFromJSON(udata)
                let folder = this.getPlateWithUID(uid)
                folder.wells[0][0].properties['package'] = previousState;
                this.deselectAll();
                this.unModal();

            }
            replaceObject(newObject) {
                for (let i = 0; i < this.root.length; i++) {
                    if (this.root[i].uid === newObject.uid) {
                        this.root[i] = newObject;
                        return true;
                    }
                }
                return false;
            }

            pushFolder(uid, previousState) {
                if (!previousState) {
                    this.ptracks.push(uid + ':' + this.capturestate())
                } else {
                    this.ptracks.push(uid + ':' + previousState);
                }
            }

            copyFromJSON(fs) {
                if (typeof fs !== "object" || fs === null) {
                    console.warn("Invalid JSON object provided");
                    return;
                }
                if (fs.uid) {
                    this.udi = fs.uid;
                }
                Object.assign(this, fs);
                this.grid = Object.assign(new MGrid(), fs.grid);
                this.transferFunctions = [];
                if (fs.transferFunctions && fs.transferFunctions.length > 0) {
                    for (let tr of fs.transferFunctions) {
                        let tf = Object.assign(new TransferFunction(), tr);
                        if (tf.fun && typeof tf.fun === "string" && tf.fun.startsWith('function')) {
                            tf.fun = eval(tf.fun);
                        }
                        this.transferFunctions.push(tf);
                    }
                }
                let loadPlates = (obj) => {
                    let ps = [];
                    for (let a of obj) {
                        let p = Object.assign(new Plate(), a);
                        if (p.plates && p.plates.length > 0) {
                            p.plates = loadPlates(p.plates);
                        }
                        p.grid = Object.assign(new MGrid(), p.grid);

                        let wellsArray = [];
                        if (a.wells) {
                            for (let row of a.wells) {
                                let newRow = row.map(well => Object.assign(new GenericWell(), well));
                                wellsArray.push(newRow);
                            }
                        }
                        p.wells = wellsArray;

                        ps.push(p);
                    }
                    return ps;
                };

                this.root = loadPlates(fs.root || []);

                for (let t of this.transferFunctions) {
                    for (let f of this.root) {
                        let pl = f.getPlateWithUID(t.to?.uid);
                        if (pl) t.to = pl;
                        let pl2 = f.getPlateWithUID(t.from?.uid);
                        if (pl2) t.from = pl2;
                    }
                }

                this.connections = [];
                if (fs.connections) {
                    for (let con of fs.connections) {
                        let fcon = Connection.buildConnectionFromJSON(con, this);
                        this.connections.push(fcon);
                    }
                }

                this.m_plots = [];
                if (fs.m_plots && fs.m_plots.length > 0) {
                    for (let p of fs.m_plots) {
                        this.m_plots.push(MPlot.fromJSON(p));
                    }
                }

                this.trackFunctions = [];
                if (fs.trackFunctions && fs.trackFunctions.length > 0) {
                    for (let t of fs.trackFunctions) {
                        let funcObj = Object.assign(new WorkbenchFunction(), t);
                        let paramObj = {};

                        if (t.param) {
                            for (let key of Object.keys(t.param)) {
                                let plateRef = this.getPlateWithUID(t.param[key]?.uid);
                                paramObj[key] = plateRef || t.param[key];
                            }
                        }
                        funcObj.param = paramObj;
                        this.trackFunctions.push(funcObj);
                    }
                }

                this.glyphs = [];
                if (fs.glyphs) {
                    for (let g of fs.glyphs) {
                        let gg = Glyph.buildFromJSON(g);
                        if (gg) this.glyphs.push(gg);
                    }
                }

                this.selected_well = null;
                this.setSelected(null);

                this.init();
            }

            getGridBounds() {
                items = this.root;
                if (!items || items.length === 0) {
                    return null;
                }
                let minX = Infinity;
                let minY = Infinity;
                let maxX = -Infinity;
                let maxY = -Infinity;

                items.forEach(item => {
                    const { x, y, width, height } = item.grid;

                    minX = Math.min(minX, x);
                    minY = Math.min(minY, y);
                    maxX = Math.max(maxX, x + width);
                    maxY = Math.max(maxY, y + height);
                });

                return {
                    minX,
                    minY,
                    maxX,
                    maxY,
                    width: maxX - minX,
                    height: maxY - minY
                };
            }

            async showMacroSteps(functions) {
                let interpreter = await exec('baja/engine/interpreter.js', this)
                let m = []
                let index = 0;
                for (let fun of functions) {
                    const i = index;
                    const t = {
                        label: fun.name,
                        click: async (xwc, ywc) => {
                            if (i > 0) {
                                for (let ii = 0; ii <= i; ii++) {
                                    interpreter.ref = this.interpreter_scope;
                                    await interpreter.run(functions[ii].function);
                                    await new Promise(resolve => setTimeout(resolve, 400));
                                    this.interpreter_scope = interpreter.ref;

                                }
                                functions.splice(0, i)
                                this.menu_vis = false;
                                this.menu = null;
                                if (m.length <= 0) {
                                    return;
                                }

                            } else {
                                interpreter.ref = this.interpreter_scope;
                                await interpreter.run(functions[0].function);
                                this.interpreter_scope = interpreter.ref
                            }

                            this.menu_vis = false;
                            this.menu = null;
                            if (functions.length <= 1) {
                                this.menu = null;
                                this.menu_vis = false;
                                m = [];
                                return;
                            } else {
                                setTimeout(() => {
                                    if (!m || m.length === 0) {
                                        this.menu = null;
                                        this.menu_vis = false;
                                        return;
                                    } else {
                                        functions.splice(0, 1)
                                        this.showMacroSteps(functions)
                                    }
                                }, 1000)
                            }

                        }
                    }
                    m.push(t);
                    index++;
                }
                const cols = 1;
                this.menu = new Menu(m, this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200), this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * m.length / 2), 'rgb(205, 255, 155)', 'navy', cols)
                this.menu_vis = true;

            }

            hideDetailPopUp() {
                for (let r of this.root) {

                    r.setHideDetailsPopUp(this.attr__hideWellDetailPopup)

                }
            }

            updatePlots() {

                for (let p of this.m_plots) {
                    if (p.scatterData && p.type != 'timeline') {
                        for (let point of p.scatterData.points) {
                            if (point.xuid) {
                                let w = this.getWellByUID(point.xuid)
                                if (w) {
                                    point.x = w.value
                                }
                            }
                            if (point.yuid) {
                                let w = this.getWellByUID(point.yuid)
                                if (w) {
                                    point.y = w.value
                                }
                            }
                        }
                    }

                }
                for (let p of this.m_plots) {
                    if (p.scatterData && p.type === 'timeline') {
                        for (let point of p.scatterData.points) {
                            if (point.xuid) {
                                let w = this.getWellByUID(point.xuid)
                                if (w) {
                                    point.x = w.value
                                }
                            }
                            if (point.yuid) {
                                let w = this.getWellByUID(point.yuid)
                                if (w) {
                                    point.name = w.value
                                }
                            }
                        }
                    }

                }
            }

            async updateCalculations() {
                function generateExpressionsInRange(funcString, startIndex, endIndex) {
                    const variablePattern = /\$\{[^}]+\}/g;
                    if (!variablePattern.test(funcString)) {
                        return [funcString];
                    }
                    const expressions = [];
                    for (let i = startIndex; i <= endIndex; i++) {
                        const indexStr = String(i);
                        const updatedString = funcString.replace(/\$\{i\}/g, indexStr);
                        expressions.push(updatedString);
                    }
                    return expressions;
                }

                function parseTableStructure(input) {

                    const pattern = /^(\w+)\[(\d+):(\d+)\]\[(\d+):(\d+)\]$/;
                    const match = input.match(pattern);
                    if (!match) return null;

                    return {
                        tableName: match[1],
                        startX: parseInt(match[2], 10),
                        stopX: parseInt(match[3], 10),
                        startY: parseInt(match[4], 10),
                        stopY: parseInt(match[5], 10),
                    };
                }
                for (let calculation_key of Object.keys(this.formulas)) {
                    try {
                        let calculation = this.formulas[calculation_key]
                        let well_ranges = calculation_key;
                        let { tableName, startX, stopX, startY, stopY } = parseTableStructure(well_ranges)
                        let callist = generateExpressionsInRange(calculation, startY, stopY)
                        if (callist && callist.length > 1) {
                            let index = startY;
                            for (let icl of callist) {
                                let v = await exec('baja/plate/ops/frun-object.js', icl, this);
                                if (!v['results']) {
                                    this.setMessage('No results: ' + calculation_key + ' = ' + calculation, 1)
                                } else {
                                    this.updateWells(v, tableName, startX, stopX, index, index);
                                    index++;
                                }
                            }
                        } else {
                            let v = await exec('baja/plate/ops/frun-object.js', calculation, this);
                            if (!v['results']) {
                                this.setMessage('No results: ' + calculation_key + ' = ' + calculation + '', 1)
                                if (v.message)
                                    this.setMessage(v.message, 2)

                            } else {

                                this.updateWells(v, tableName, startX, stopX, startY, stopY);
                            }
                        }
                    } catch (exception) {
                        console.error(`Message: ${exception.message}`);
                        console.error("Stack trace:");
                        console.error(exception.stack);
                        this.setMessage('Failed @ ' + calculation_key, 1)
                    }
                }
                for (let pl of this.root) {
                    try {
                        if (pl.wells[0][0].properties && pl.wells[0][0].properties['package']) {
                            const udata = __decompress(pl.wells[0][0].properties['package'])
                            if (udata) {
                                let ffs = Object.assign(new PlateTrack(), udata)
                                ffs.copyFromJSON(udata)
                                ffs.copyTables(this)
                                await ffs.updateCalculations();
                                this.copyTables(ffs)
                                pl.wells[0][0].properties['package'] = PlateTrack.compressToString(ffs)
                            }
                        }

                    } catch (exception) {
                        console.error(`Message: ${exception.message}`);
                        console.error("Stack trace:");
                        console.error(exception.stack);
                        LJScript.add('_', `Calculation failed  ${exception.message}`)
                    }
                }
                let index = 0;
                for (let raw of this.ptracks) {
                    try {
                        const udata_uid = __decompress_with_uid(raw)
                        const ffs = udata_uid.content;
                        if (ffs) {
                            for (let r of this.root) {
                                for (let rr of ffs.root) {
                                    if (r.uid === rr.uid) {
                                        rr.wells = r.wells;
                                    }
                                }
                            }
                            this.ptracks[index] = udata_uid.uid + ':' + PlateTrack.compressToString(ffs)
                        }
                        index++;

                    } catch (exception) {
                        console.error(`Message: ${exception.message}`);
                        console.error("Stack trace:");
                        console.error(exception.stack);
                        LJScript.add('_', `Calculation failed  ${exception.message}`)
                    }
                }

            }
            copyTables(_pt) {
                for (let r of _pt.root) {
                    for (let rr of this.root) {
                        if (r.uid === rr.uid) {
                            rr.wells = r.wells;
                        }
                    }
                }
            }

            updateWells(v, tableName, startX, stopX, startY, stopY) {
                let r = v['results']
                let t = v['group']
                let table = this.getTableByName(tableName)
                if (table) {
                    let selected_wells = table.getWells(startX, stopX, startY, stopY)
                    for (let it of selected_wells) {
                        for (let io of r) {
                            let i;

                            if (typeof io === 'number') {
                                i = io;
                            } else if (io && typeof io.value !== 'undefined') {
                                i = io.value;
                            }

                            if (i !== undefined && !isNaN(i)) {
                                it.setValue(parseFloat(i).toFixed(4), true);
                            } else {
                                it.value = i;
                            }

                            if (!it.properties) {
                                it.properties = {};
                            }

                            if (t) {
                                it.setGroup(t);
                            }
                        }
                    }
                }
            }

            getFormulaForWell(range) {
                return getOverlappingRanges(range, this.formulas)
            }

            static compressToString(pt) {
                let gs = JSON.stringify(pt, function (key, value) {
                    if (key != null && key.toLowerCase().startsWith('_')) {
                        return null;
                    }
                    else
                        if (typeof value === 'object' && value !== null) {
                            if (Array.isArray(value) && value.every(elem => elem && typeof elem === 'object' && 'x' in elem && 'y' in elem)) {
                                return value;
                            } else if (value.x != null && value.y != null && !isNaN(key) && parseInt(key, 10).toString() === key) {
                                return value;
                            }
                            else {
                                return value;
                            }
                        }
                    return value;
                });
                let binaryData = compressString(gs)
                const chunkSize = 0x8000;
                let stringData = '';
                for (let i = 0; i < binaryData.length; i += chunkSize) {
                    const chunk = binaryData.subarray(i, i + chunkSize);
                    stringData += String.fromCharCode.apply(null, chunk);
                }
                return stringData;
            }

            getFormulaInRange(range) {
                const obj = this.formulas;
                const rangeMatch = range.match(/^(\w+)\[(\d+):(\d+)\]\[(\d+):(\d+)\]$/);
                if (!rangeMatch) {
                    throw new Error("Invalid range format. Must be in 'tablename[rowStart:rowEnd][colStart:colEnd]'.");
                }
                const [_, tableName, rowStart, rowEnd, colStart, colEnd] = rangeMatch.map((val, idx) =>
                    idx > 1 ? parseInt(val, 10) : val
                );
                let f = []
                for (const key of Object.keys(obj)) {
                    const keyMatch = key.match(/^(\w+)\[(\d+):(\d+)\]\[(\d+):(\d+)\]$/);
                    if (keyMatch) {
                        const [__, keyTableName, keyRowStart, keyRowEnd, keyColStart, keyColEnd] = keyMatch.map((val, idx) =>
                            idx > 1 ? parseInt(val, 10) : val
                        );
                        if (
                            tableName === keyTableName &&
                            rowStart >= keyRowStart &&
                            rowEnd <= keyRowEnd &&
                            colStart >= keyColStart &&
                            colEnd <= keyColEnd
                        ) {
                            f.push(key);
                        }
                    }
                }
                return f;
            }

            setActive(plot) {
                this.activePlot = plot;
            }

            addGlyph(glyph) {
                this.glyphs.push(glyph)
            }

            setBookmark(name) {
                if (!name || name.length === 0) {
                    this.bookmarks[`${generateNautName()}`] = Object.assign(new MGrid(), this.grid)
                } else {
                    this.bookmarks[`${name}`] = Object.assign(new MGrid(), this.grid)

                }
            }

            pushGrid() {
                if (!this.__stack) {
                    this.__stack = []
                }
                if (this.__stack) {
                    this.__stack.push(JSON.parse(JSON.stringify(this.grid)));
                    this.__redostack = [];
                    if (this.__stack.length > 10) {
                        this.__stack.shift();
                    }
                    this.buildMenu();
                }
            }

            hasModalMenusOpen() {
                let allDrawables = [
                    ...this.glyphs,
                    ...(this.root || []),
                    ...(this.m_plots || []),
                ].filter(obj => obj && obj.getLastTouched() !== undefined);
                allDrawables.sort((a, b) => a.getLastTouched() - b.getLastTouched());
                for (let i = allDrawables.length - 1; i >= 0; i--) {
                    const obj = allDrawables[i];
                    if (obj.isModal && obj.isModal(this)) {
                        return true;
                    }
                }
                return false;
            }

            getTableNames() {
                const namesArray = this.root.map(obj => obj.name);
                return namesArray;

            }

            setNextToPlate(ch, chn, _y) {
                ch.grid.xi = chn.grid.xi + chn.grid.width + this.grid.worldWidth(100);
                ch.x = ch.grid.xi;
                if (_y)
                    ch.grid.yi = _y;
                else
                    ch.grid.yi = chn.grid.yi + chn.grid.height - ch.grid.height;
                ch.y = ch.grid.yi
            }
            onButtonClick(label) {
                switch (label) {
                    case "Exit Folder":

                        this.popFolder();
                        break;
                    case "Settings":
                        console.log("Settings button clicked");
                        break;
                    case "Profile":
                        console.log("Profile button clicked");
                        break;
                    case "Logout":
                        console.log("Logout button clicked");
                        break;
                    default:
                        console.log("Unknown button clicked");
                }
            }

            sortToBottom(selectedPlate) {
                if (!this.root || !Array.isArray(this.root)) return;

                this.root = this.root.sort((a, b) => {
                    if (a === selectedPlate) return 1;
                    if (b === selectedPlate) return -1;
                    return 0;
                });
                this.setSelected(null);;
                this.deselectAll();
            }

            mouseDown(x, y) {
                let mouseX = x;
                let mouseY = y;

                for (let button of this.buttons) {
                    if (
                        mouseX >= button.x &&
                        mouseX <= button.x + button.width &&
                        mouseY >= button.y &&
                        mouseY <= button.y + button.height
                    ) {
                        clickedButtons.add(button.label);
                        this.onButtonClick(button.label);
                        return;
                    }
                }

                if (textActive) {
                    textActive = false;
                }
                if (!this.hasModalMenusOpen()) {
                    if (this.__stack_menu && this.__stack_menu.mouseUp && this.__stack_menu.isIn(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))) {
                        this.__stack_menu.mouseUp(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                        return;
                    }
                    if (this.__redo_stack_menu && this.__redo_stack_menu.mouseUp && this.__redo_stack_menu.isIn(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))) {
                        this.__redo_stack_menu.mouseUp(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                        return;

                    }

                    if (this.attr__displayBookMarks) {
                        if (this.__bookmark_menu && this.__bookmark_menu.mouseUp && this.__bookmark_menu.isIn(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))) {
                            this.__bookmark_menu.mouseUp(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                            this.wb(null)
                            return;
                        }

                    }
                    if (this.attr__showTablesMenu && !this.attr__displayBookMarks) {
                        if (this.__tables_menu && this.__tables_menu.mouseUp && this.__tables_menu.isIn(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))) {
                            this.__tables_menu.mouseUp(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                            this.wb(null)
                            return;
                        }
                    }

                    if (this.menu && this.menu_vis) {
                        this.menu.mouseUp(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                        this.menu = null;

                        this.menu_vis = false;
                        this.wb(null)
                    }

                } else {
                }

                if (x >= scrollGrid.xi) {
                    this.isDraggingScrollbar = true;
                    scrollGrid.rescale();
                    scroll_y = scrollGrid.Ywc(y);
                    let range = (this.grid.ymax - this.grid.ymin);
                    this.grid.ymax = scroll_y + range / 2;
                    this.grid.ymin = scroll_y - range / 2;
                    if (this.grid.xmin > maxObjectX || this.grid.xmin > maxObjectX) {

                    }
                    return this.grid.rescale();
                }

                if (this.selectedPlate && this.selectedPlate.inside(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))) {
                    this.selectedPlate.handleMouseDown(x, y, this);
                    return;
                }

                if (this.wbid != null && this.wbid.startsWith('override')) {
                    return;
                }
                if (this.menu && this.menu.inside && this.menu_vis) {
                    if (this.menu.inside(this.grid, this.grid.Xwc(x), this.grid.Ywc(y)))
                        return;
                }

                let new_selected = this.getPlate(this.grid.Xwc(x), this.grid.Ywc(y))

                if (new_selected) {
                    if (this.hasModalMenusOpen()) {
                        return;
                    }

                    if (new_selected != this.selectedPlate || !this.selectedPlate) {
                        this.deselectAll();
                        this.setSelected(new_selected);
                        if (this.selectedPlate) {
                            this.selectedPlate.last_touched = new Date();
                            this.selectedPlate.clk_drag(this);
                            this.selectedPlate.selectIt(this);
                        }
                    }
                } else {
                    this.deselectAll();
                }
                if (!this.selectedPlate) {
                    for (let r of this.root) {
                        if (r.resetTextWindow) r.resetTextWindow();
                    }
                    if (this.wbid != null && this.wbid.startsWith('override')) {
                    } else
                        this.wb(null)
                } else {
                }
            }

            saveLJLBookmark(name, value) {
                this.ljl_bookmarks[name] = value;
            }

            mouseUp(x, y) {
                this.isDraggingScrollbar = false;

                if (this.__stack_menu && this.__stack_menu.mouseUp && this.__stack_menu.isIn(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))) {
                    return;
                }
                if (this.__redo_stack_menu && this.__redo_stack_menu.mouseUp && this.__redo_stack_menu.isIn(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))) {
                    return;

                }
                if (this.__tables_menu && this.__tables_menu.mouseUp && this.__tables_menu.isIn(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))) {
                    return;
                }

                if (this.hasModalMenusOpen()) {
                    return;
                }
                if (this.wbid != null && this.wbid.startsWith('override'))
                    return;

                const mmx = this.grid.Xwc(x)
                const mmy = this.grid.Ywc(y)

                let new_selected = this.getPlate(mmx, mmy)
                if (!new_selected) {
                    if (this.selectedPlate && this.selectedPlate.deselectAll && !this.selectedPlate.inButtons(x, y, this)) {
                        this.selectedPlate.deselectAll();
                        this.setSelected(null);
                        this.selected_well = null;
                        this.wb(null)
                    }
                }
            }

            handleKeyDown(event) {
                if (!textActive) {
                    return;
                }
                textStyle = 'search'
                const handleCharacterInput = (key) => {
                    try {

                        console.log(' key ' + key)
                        if (cursorPos <= 0) {
                            text = '' + key;
                            cursorPos = 1;
                        } else {
                            text = text.slice(0, cursorPos) + key;
                        }
                    } catch (exception) {
                        text = '';
                    }
                    cursorPos++;
                };

                const handleBackspace = () => {
                    if (initBox) {
                        text = ''
                        cursorPos = 0
                        initBox = false;
                        return;
                    }
                    if (cursorPos > 0) {
                        text = text.slice(0, cursorPos - 1) + text.slice(cursorPos);
                        cursorPos -= 1;
                    }
                    if (cursorPos < 0)
                        cursorPos = 0;
                };

                const handleEnter = () => {
                    textActive = false;
                    this.newRoot(text, 'data', 1, 1)
                    text = '';

                }
                switch (event.key) {
                    case 'Backspace':
                        handleBackspace();
                        break;
                    case 'Enter':
                        handleEnter();
                        break;
                    case 'Escape':
                        textActive = false;
                        break;

                    default:
                        initBox = false;
                        if (/^[a-zA-Z0-9!_ ]$/.test(event.key)) {
                            handleCharacterInput(event.key)
                            break;
                        } else {
                            console.log('Non-alphanumeric key pressed: ' + event.key);
                        }
                        break;
                }
            }

            setTextActive(va) {
                textActive = va;
            }

            IsInTableMenu(x, y) {
                if (!this.__tables_menu) {
                    return false;
                }

                return this.__tables_menu.isIn(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
            }

            buildBookmarkMenu() {
                let ml = []
                let keys = Object.keys(this.bookmarks);
                for (let key of keys) {
                    ml.push({
                        label: `${key}`,
                        click: (xwc, ywc) => {

                            this.setMessage(key)
                            this.goToBookmark(this.bookmarks[key])

                        }
                    })
                }
                let cols = Math.ceil(ml.length / 20);
                this.__bookmark_menu = new Menu(ml, 0, 60, 'rgb(205, 255, 155)', 'navy', cols)
            }

            showBookmarks() {
                let ml = []
                let keys = Object.keys(this.bookmarks);
                for (let key of keys) {
                    ml.push({
                        label: `${key}`,
                        click: (xwc, ywc) => {

                            this.setMessage(key)
                            this.goToBookmark(this.bookmarks[key])

                        }
                    })
                }

                ml.push({
                    label: `Bookmark`,
                    click: (xwc, ywc) => {
                        this.setBookmark();
                    },
                    bg: 'orange',
                    fg: 'black'

                })
                ml.push({
                    label: `Named bookmark...`,
                    click: async (xwc, ywc) => {

                        let attr_window = ''
                        let va = await prompt("Name", ["Name"], { "Name": attr_window }, 300, 300)
                        let m = va['Name']
                        this.setBookmark(m);

                    },
                    bg: 'orange',
                    fg: 'black'
                })
                ml.push({
                    label: `Delete bookmarks...`,
                    click: async (xwc, ywc) => {

                        setTimeout(async () => {
                            let ml = []
                            let keys = Object.keys(this.bookmarks);
                            for (let key of keys) {
                                ml.push({
                                    label: `${key}`,
                                    click: async (xwc, ywc) => {
                                        let confirm = await exec('baja/lib/confirm.js', 'Delete this bookmark?', async () => {
                                            delete this.bookmarks[key]
                                            setTimeout(() => {

                                                this.showBookmarks();

                                            }, 500)
                                        })
                                        showModal(confirm)

                                    },
                                    bg: 'lightRed',
                                    fg: 'black'
                                })
                            }
                            ml.push({
                                label: `Back to bookmarks`,
                                click: (xwc, ywc) => {
                                    this.showBookmarks();
                                }
                            })
                            let cols = Math.ceil(ml.length / 10);
                            this.menu = new Menu(ml, this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200), this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * ml.length / 2), 'rgb(205, 255, 155)', 'navy', cols)
                            this.menu.title = "Delete bookmark..."
                            this.menu_vis = true;
                        }, 100)

                    },
                    bg: 'orange',
                    fg: 'black'

                })
                let cols = Math.ceil(ml.length / 20);

                this.menu = new Menu(ml, this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200), this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * ml.length / 2), 'rgb(205, 255, 155)', 'navy', cols)
                this.menu.title = "Go to..."
                this.menu_vis = true;
            }

            showViews() {
                console.log('debubg');
                let ml = []
                for (let key of this.ptracks) {
                    ml.push({
                        label: `${key.name}`,
                        click: (xwc, ywc) => {
                        },
                        bg: 'orange',
                        fg: 'black'

                    })
                }
                let cols = Math.ceil(ml.length / 20);
                this.menu = new Menu(ml, this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200), this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * ml.length / 2), 'rgb(205, 255, 155)', 'navy', cols)
                this.menu.title = "Views..."
                this.menu_vis = true;

            }

            showYinYang() {
                let ml = []
                let keys = Object.keys(this.ljl_bookmarks);
                for (let key of keys) {
                    ml.push({
                        label: `${key}`,
                        click: async (xwc, ywc) => {
                            this.setMessage(key)
                            let code = this.ljl_bookmarks[key]
                            let interpreter = await exec('baja/engine/interpreter.js', this)
                            await interpreter.run(code);
                        }
                    })
                }

                if (this.ljl_bookmarks && Object.keys(this.ljl_bookmarks).length > 0) {
                    ml.push({
                        label: `Delete LJScript...`,
                        click: async (xwc, ywc) => {

                            setTimeout(async () => {
                                let ml = []
                                let keys = Object.keys(this.ljl_bookmarks);
                                for (let key of keys) {
                                    ml.push({
                                        label: `${key}`,
                                        click: async (xwc, ywc) => {
                                            let confirm = await exec('baja/lib/confirm.js', 'Delete this bookmark?', async () => {
                                                delete this.ljl_bookmarks[key]
                                                setTimeout(() => {

                                                    this.showBookmarks();

                                                }, 500)
                                            })
                                            showModal(confirm)

                                        },
                                        bg: 'lightRed',
                                        fg: 'black'
                                    })
                                }
                                ml.push({
                                    label: `Back to LJScript`,
                                    click: (xwc, ywc) => {
                                        this.showYinYang();
                                    }
                                })
                                let cols = Math.ceil(ml.length / 10);
                                this.menu = new Menu(ml, this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200), this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * ml.length / 2), 'rgb(205, 255, 155)', 'navy', cols)
                                this.menu.title = "Delete bookmark..."
                                this.menu_vis = true;
                            }, 100)

                        },
                        bg: 'orange',
                        fg: 'black'

                    })
                    ml.push({
                        label: `Edit LJScript...`,
                        click: async (xwc, ywc) => {

                            setTimeout(async () => {
                                let ml = []
                                let keys = Object.keys(this.ljl_bookmarks);
                                for (let key of keys) {
                                    ml.push({
                                        label: `${key}`,
                                        click: async (xwc, ywc) => {
                                            setTimeout(async () => {

                                                let ref = null;

                                                let t =
                                                {
                                                    height: '200px',
                                                    editorOptions: {
                                                        language: 'bajabio',
                                                        value: "Enter LJ-script here",
                                                        theme: 'no-border-theme',
                                                        minimap: { enabled: false },
                                                        scrollbar: {
                                                            vertical: 'hidden',
                                                            horizontal: 'hidden',
                                                        },
                                                        lineNumbers: 'off',
                                                        lineDecorationsWidth: 0,
                                                        lineNumbersMinChars: 0,
                                                        overviewRulerLanes: 0,
                                                        hideCursorInOverviewRuler: true,
                                                        folding: false,
                                                        highlightActiveIndentGuide: false,
                                                        renderLineHighlight: 'none',
                                                        renderLineHighlightOnlyWhenFocus: false,
                                                        renderWhitespace: 'none',
                                                        fontSize: 15,
                                                        automaticLayout: true,
                                                        padding: {
                                                            top: 20,
                                                            bottom: 20,
                                                            left: 30,
                                                            right: 30
                                                        }
                                                    },
                                                    objects: this.root,
                                                    keybinding: {
                                                        'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {
                                                        })
                                                    },
                                                    code: this.ljl_bookmarks[key],
                                                    buttons: [{
                                                        'label': 'Save', "color": 'blue', action: async () => {
                                                            let code = ref.getEditorText();
                                                            this.ljl_bookmarks[key] = code;
                                                        }
                                                    },
                                                    {
                                                        'label': 'Close', 'color': 'black', "action": () => {
                                                            ref.hideEditor();
                                                        }
                                                    }
                                                    ]
                                                }
                                                ref = await this.showTextEditor(t);

                                            }, 500)

                                        },
                                        bg: 'lightRed',
                                        fg: 'black'
                                    })
                                }
                                let cols = Math.ceil(ml.length / 10);
                                this.menu = new Menu(ml, this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200), this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * ml.length / 2), 'rgb(205, 255, 155)', 'navy', cols)
                                this.menu.title = "Delete bookmark..."
                                this.menu_vis = true;
                            }, 100)

                        },
                        bg: 'orange',
                        fg: 'black'

                    })

                }

                ml.push({
                    label: `New LJScript...`,
                    click: async (xwc, ywc) => {
                        await exec('baja/table/show-flow-editor')
                    },
                    bg: 'orange',
                    fg: 'black'

                })
                ml.push({
                    label: `LJScript Library`,
                    click: async (xwc, ywc) => {
                        await exec('baja/table/show-ljscript-library', null, this)
                    },
                    bg: 'orange',
                    fg: 'black'

                })

                let cols = Math.ceil(ml.length / 20);
                this.menu = new Menu(ml, this.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200), this.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * ml.length / 2), 'rgb(205, 255, 155)', 'navy', cols)
                this.menu.title = "Execute LJScript..."
                this.menu_vis = true;

            }

            displayOpsMenu() {
                let ml = []
                ml.push({
                    label: ``,
                    click: (xwc, ywc) => {
                        this.undo()
                    }
                })
                this.menu = new Menu(ml, this.grid.Xwc(10), this.grid.Ywc(20), 'rgb(0, 87, 163)', 'black')
            }

            mouseMove(x, y) {

                if (this.isDraggingScrollbar) {
                    scrollGrid.rescale();
                    scroll_y = scrollGrid.Ywc(y);
                    let range = (this.grid.ymax - this.grid.ymin);
                    this.grid.ymax = scroll_y + range / 2;
                    this.grid.ymin = scroll_y - range / 2;
                    this.grid.rescale();
                    return;
                }

                if (this.hasModalMenusOpen()) {
                    return;
                }

                if (this.selectedPlate && this.selectedPlate.__resizing) {
                    return;
                }

                if (this.selectedPlate && this.selectedPlate.__moving) {
                    return;
                }

                if (this.__menu__)
                    return;

                if (this.menu && this.menu.mouseMove) {
                    this.menu.mouseMove(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                }

                if (this.__stack_menu && this.__stack_menu.mouseMove) {
                    this.__stack_menu.mouseMove(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                }
                if (this.__redo_stack_menu && this.__redo_stack_menu.mouseMove) {
                    this.__redo_stack_menu.mouseMove(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                }
                if (this.attr__showTablesMenu) {
                    if (this.__tables_menu && this.__tables_menu.mouseMove) {
                        this.__tables_menu.mouseMove(this.grid, this.grid.Xwc(x), this.grid.Ywc(y))
                    }
                }
                if (this.selectedPlate && this.selectedPlate.handleMouseOver) {
                    this.selectedPlate.handleMouseOver(x, y)
                }
            }
            getWellByUID(uid) {
                for (let r of this.root) {
                    let w = r.getWellByUID(uid)
                    if (w) {
                        return w;
                    }
                }
                return null;
            }

            getImage(capturePlate, scx, scy, screenwidth, screenheight) {

                return new Promise((resolve, reject) => {
                    try {
                        let offscreenCanvas = document.createElement('canvas');
                        offscreenCanvas.width = this.grid.width;
                        offscreenCanvas.height = this.grid.height;
                        let offscreenCtx = offscreenCanvas.getContext('2d');
                        offscreenCtx.fillStyle = 'white';
                        offscreenCtx.fillRect(0, 0, this.grid.width, this.grid.height);
                        MGrid.GP = true;
                        for (let p of this.root) {
                            if (p !== capturePlate) {
                                p.draw(this, offscreenCtx);
                            }
                        }
                        let clippedCanvas = document.createElement('canvas');
                        clippedCanvas.width = screenwidth;
                        clippedCanvas.height = screenheight;
                        let clippedCtx = clippedCanvas.getContext('2d');
                        clippedCtx.drawImage(
                            offscreenCanvas,
                            scx, scy,
                            screenwidth, screenheight,
                            0, 0,
                            screenwidth, screenheight
                        );

                        let dataUrl = clippedCanvas.toDataURL('image/png');

                        let clippedImage = new Image();
                        clippedImage.onload = () => resolve(clippedImage);
                        clippedImage.onerror = (err) => reject(err);
                        clippedImage.src = dataUrl;

                    } catch (err) {
                        reject(err);
                    }

                });
            }

            pushHistoryOnSelectedWell() {
                let id = this.selectedPlate.getWellIndicies(this.selected_well)
                LJScript.add(this.selectedPlate.name, `update ${id.colIdx},${id.rowIdx} ` + this.selected_well.value)
                pushHistory(HM(this.selected_well))
                this.selected_well.__dirty = false;
            }

            getTablesByName() {
                let n = {}
                for (let r of this.root) {
                    n[r.name] = r;
                }
                return n;
            }

            restoreState(state) {
                if (state) {
                    this.grid.xi = state.xi;
                    this.grid.yi = state.yi;
                    this.grid.width = state.width;
                    this.grid.height = state.height;
                    this.grid.xinset = state.xinset;
                    this.grid.yinset = state.yinset;
                    this.grid.xmin = state.xmin;
                    this.grid.ymin = state.ymin;
                    this.grid.xmax = state.xmax;
                    this.grid.ymax = state.ymax;
                    this.grid.xscale = state.xscale;
                    this.grid.yscale = state.yscale;
                    this.grid.xshift = state.xshift;
                    this.grid.yshift = state.yshift;
                    this.grid.rescale();
                }
            }

            restoreGrid(state) {
                if (state) {
                    this.grid.xi = state.xi;
                    this.grid.yi = state.yi;
                    this.grid.width = state.width;
                    this.grid.height = state.height;
                    this.grid.xinset = state.xinset;
                    this.grid.yinset = state.yinset;
                    this.grid.xmin = state.xmin;
                    this.grid.ymin = state.ymin;
                    this.grid.xmax = state.xmax;
                    this.grid.ymax = state.ymax;
                    this.grid.xscale = state.xscale;
                    this.grid.yscale = state.yscale;
                    this.grid.xshift = state.xshift;
                    this.grid.yshift = state.yshift;
                    this.grid.rescale();

                }
            }
            buildMenu() {
                let ml = []
                if (this.__stack.length > 0) {
                    ml.push({
                        label: ``,
                        click: (xwc, ywc) => {
                            this.undo()
                        }
                    })
                }

                let rl = []
                if (this.__redostack.length > 0) {
                    rl.push({
                        label: ``,
                        click: (xwc, ywc) => {
                            this.redo()
                        }
                    })
                }
                this.grid.rescale();

                if (this.__stack && this.__stack.length > 0) {
                    this.__stack_menu = new Menu(ml, this.grid.Xwc(10), this.grid.Ywc(20), 'rgb(0, 87, 163)', 'black')
                    this.__stack_menu.menu_type = 'xx-small-left'
                }
                if (this.__redostack && this.__redostack.length > 0) {
                    this.__redo_stack_menu = new Menu(rl, this.grid.Xwc(10), this.grid.Ywc(20), 'lightGray', 'black')
                    this.__redo_stack_menu.menu_type = 'xx-small-right'
                }

            }
            popGrid() {
                if (this.__stack.length > 0) {
                    this.restoreGrid(this.__stack.pop());
                }
                this.buildMenu();
                return null;
            }
            canUndo() {
                return this.__stack.length > 0;
            }
            canRedo() {
                return this.__redostack.length > 0;
            }

            redo() {
                if (this.canRedo()) {
                    const nextState = this.__redostack.pop();
                    this.__stack.push(JSON.parse(JSON.stringify(this.grid)));
                    this.restoreGrid(nextState);
                    this.buildMenu();
                }
            }

            undo() {
                if (this.canUndo()) {
                    const previousState = this.__stack.pop();
                    this.__redostack.push(JSON.parse(JSON.stringify(this.grid)));

                    this.restoreGrid(previousState);
                    this.buildMenu();

                }
            }
            getParentPlate(plate) {
                let parent = []
                for (let t of this.transferFunctions) {
                    if (t.toPlate === plate) {
                        parent.push(t.fromPlate)
                    }
                }
                return parent;
            }

            highlightObjects(obja) {
                for (let p of obja) {
                    if (p.xrefid) {
                        this.selectReference([p.xrefid])
                    }
                    if (p.yrefid) {
                        this.selectReference([p.yrefid])
                    }
                }
            }

            async goToBookmark(togrid) {
                if (togrid == null) {
                    console.log(' the goto grid is not defined ')
                    return;
                }
                if (togrid.xmax && !togrid.getxmax) {
                    togrid = Object.assign(new MGrid(), togrid)
                }
                return new Promise(async (resolve, reject) => {
                    let increment_ = 170;
                    let fromCx = (this.grid.getxmax() - this.grid.getxmin()) / 2;
                    let toCx = (togrid.getxmax() - togrid.getxmin()) / 2;
                    let xdif = fromCx - toCx;
                    let translateMaxX = (this.grid.getxmax() - togrid.getxmax()) / increment_;
                    let translateMinX = (this.grid.getxmin() - togrid.getxmin()) / increment_;
                    let translateMaxY = (this.grid.getymax() - togrid.getymax()) / increment_;
                    let translateMinY = (this.grid.getymin() - togrid.getymin()) / increment_;
                    let yc = (this.grid.getymax() - this.grid.getymin()) / 2;
                    let ytc = (togrid.getymax() - togrid.getymin());
                    let ydif = ytc - yc;
                    let yincr = ydif / increment_;
                    for (let i = 0; i < increment_; i++) {
                        let max = this.grid.getxmax() - translateMaxX;
                        let min = this.grid.getxmin() - translateMinX;
                        if (max > min) {
                            this.grid.setxmin((min))
                            this.grid.setxmax((max))
                        } else {
                            this.grid.setxmin(togrid.getxmin());
                            this.grid.setxmax(togrid.getxmax());
                            i = increment_;
                        }

                        max = this.grid.getymax() - translateMaxY;
                        min = this.grid.getymin() - translateMinY;

                        if (max > min) {
                            this.grid.setymin(this.grid.getymin() - translateMinY)
                            this.grid.setymax(this.grid.getymax() - translateMaxY)
                        } else {
                            this.grid.setymin(togrid.getymin())
                            this.grid.setymax(togrid.getymax())
                            i = increment_;
                        }
                        this.grid.rescale();
                        await sleep(10)
                    }
                    this.grid.setxmin(togrid.getxmin());
                    this.grid.setxmax(togrid.getxmax());
                    this.grid.setymin(togrid.getymin())
                    this.grid.setymax(togrid.getymax())
                    this.grid.rescale();
                    return resolve();

                });

            }

            addConnection(connection) {
                this.connections.push(connection)
            }

            removeConnection(connection) {
                this.connections = this.connections.filter(conn => conn !== connection);
            }

            lassoSelect(lassoPolygon, graph, x, y) {

                let isPlotPointInPolygon = (plot, point, polygon) => {
                    let inside = false;
                    const x_ = (plot.grid.X(point.x));
                    const y_ = ((point.scy));

                    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                        const xi = polygon[i].x, yi = polygon[i].y;
                        const xj = polygon[j].x, yj = polygon[j].y;
                        const intersect = ((yi > y_) !== (yj > y_)) &&
                            (x_ < (xj - xi) * (y_ - yi) / (yj - yi) + xi);
                        if (intersect) inside = !inside;
                    }
                    return inside;
                };

                let isPointInPolygon = (point, polygon) => {
                    if (!polygon) {
                        return false;
                    }
                    let inside = false;

                    const x = (this.grid.X(point.x));
                    const y = (this.grid.Y(point.y));
                    console.log(' x ' + x + ' y ' + y)

                    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                        const xi = polygon[i].x, yi = polygon[i].y;
                        const xj = polygon[j].x, yj = polygon[j].y;
                        const intersect = ((yi > y) !== (yj > y)) &&
                            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                        if (intersect) inside = !inside;
                    }
                    return inside;
                };

                let isRectangleInPolygon = (x, y, width, height, polygon) => {

                    const topLeft = { x: x, y: y };
                    const topRight = { x: x + width, y: y };
                    const bottomLeft = { x: x, y: y + height };
                    const bottomRight = { x: x + width, y: y + height };

                    return (
                        isPointInPolygon(topLeft, polygon) &&
                        isPointInPolygon(topRight, polygon) &&
                        isPointInPolygon(bottomLeft, polygon) &&
                        isPointInPolygon(bottomRight, polygon)
                    );
                };

                let findPlatesInLasso = (objects, plates, lassoPolygon) => {
                    let checkPlates = (plateArray) => {
                        for (let plate of plateArray) {
                            if (isRectangleInPolygon(plate.grid.xi, plate.grid.yi, plate.grid.width, plate.grid.height, lassoPolygon)) {
                                objects.push(plate);
                            }
                            if (Array.isArray(plate.plates) && plate.plates.length > 0) {
                                checkPlates(plate.plates);
                            }
                        }
                    };
                    checkPlates(plates);

                    this.removedDangelingConnections();
                    return objects;
                };

                let findGlyphsInLasso = (objects, glyphs, lassoPolygon) => {
                    let checkPlates = (plateArray) => {
                        for (let g of plateArray) {
                            let t = [{ x: g.getX(), y: g.getY() }, { x: g.getXf(), y: g.getYf() }];
                            for (let i of t) {
                                if (i.x) {
                                    if (isPointInPolygon(i, lassoPolygon)) {
                                        objects.push(g)
                                    }
                                }
                            }
                        }
                    };
                    checkPlates(glyphs);
                    return objects;
                };

                let findPlotsInLasso = (objects, plots, lassoPolygon) => {
                    let checkPlots = (pArray) => {
                        for (let plate of pArray) {
                            if (isRectangleInPolygon(plate.grid.xi, plate.grid.yi, plate.grid.width, plate.grid.height, lassoPolygon)) {
                                objects.push(plate);
                            }
                            if (Array.isArray(plate.plates) && plate.plates.length > 0) {
                                checkPlates(plate.plates);
                            }
                        }
                    };
                    checkPlots(plots);
                    return objects;
                };

                let findPointsInLasso = (plot, points, lassoPolygon) => {
                    points.forEach(point => {
                        if (isPlotPointInPolygon(plot, point, lassoPolygon)) {
                            point.isSelected = true;
                        } else {
                            point.isSelected = false;
                        }
                    });
                };
                let findaObjectsLasso = (plot, points, lassoPolygon) => {
                };

                let objects = [];
                objects = findPlatesInLasso(objects, this.root, lassoPolygon);

                selected_glyphs = findGlyphsInLasso(selected_glyphs, this.glyphs, lassoPolygon);
                let menuList = [
                ]

                if (objects.length > 0) {

                    let haveplots = false;
                    for (let o of objects) {
                        if (typeof o == 'MPlot') {
                            haveplots = true;
                        }
                    }

                    if (haveplots) {
                        menuList.push({
                            label: `Delete tables or plots`,
                            click: (xwc, ywc) => {
                                for (let o of objects) {
                                    this.removePlate(o);
                                }
                            }
                        }
                        )

                        menuList.push({
                            label: `Remove`,
                            click: (xwc, ywc) => {
                                for (let plot of this.m_plots) {
                                    findPointsInLasso(plot, plot.scatterData.points, lassoPolygon);
                                }
                            }
                        })

                    }
                }
                selectedPoints = []
                for (let plot of this.m_plots) {
                    findPointsInLasso(plot, plot.scatterData.points, lassoPolygon);
                    let subselectedPoints = plot.getSelectedPoints();
                    selectedPoints = selectedPoints.concat(subselectedPoints);
                }

                if (selectedPoints && selectedPoints.length > 0) {
                    this.highlightObjects(selectedPoints)

                    menuList.push({
                        label: `Remove Points`,
                        click: (xwc, ywc) => {
                            for (let plot of this.m_plots) {
                                findPointsInLasso(plot, plot.scatterData.points, lassoPolygon);
                                let subselectedPoints = plot.getSelectedPoints();
                                plot.removeSelectedPoints();
                            }
                        }
                    })

                    menuList.push({
                        label: `move Points`,
                        click: (xwc, ywc) => {
                            for (let plot of this.m_plots) {
                                findPointsInLasso(plot, plot.scatterData.points, lassoPolygon);
                                let subselectedPoints = plot.getSelectedPoints();
                                plot.moveSelectedPoints(this);
                            }
                        }
                    })
                    menuList.push({
                        label: `Color points...`,
                        click: (xwc, ywc) => {

                            let color__ = 'blue'
                            let sequence_input = {
                                wid: 'card',
                                "height": "100px",
                                data: {
                                    "style.padding-top": '1px',
                                    "style.border": '1px',
                                    "style.height": "500px",
                                    cards: [
                                        [
                                            {

                                                'width': '100%',
                                                'component': {
                                                    wid: 'card',
                                                    data: {
                                                        cards: [
                                                            [

                                                                {
                                                                    'width': '100%',
                                                                    'height': "100px",
                                                                    "style.padding-top": '4px',
                                                                    "style.border": '1px',
                                                                    'component':
                                                                    {
                                                                        'wid': 'color-chooser',
                                                                        'width': '100%',

                                                                        "data": {
                                                                            "selectionListener": createIonFunction((_color) => {
                                                                                color__ = _color;

                                                                            })
                                                                        }
                                                                    }
                                                                },
                                                            ]
                                                        ]
                                                    }
                                                }

                                            },
                                            {
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                    hideAllModal();
                                                                })
                                                            },
                                                            {
                                                                label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                    for (let plot of this.m_plots) {
                                                                        plot.colorSelectedPoints(color__)
                                                                        plot.deselectPoints();
                                                                    }
                                                                    hideAllModal();

                                                                })
                                                            },
                                                        ]
                                                    }
                                                }
                                            }
                                        ]]
                                }
                            }
                            showModal(sequence_input, 500, 200)

                        }
                    })

                }

                if (selectedPoints && selectedPoints.length === 1) {
                    menuList.push({
                        label: `Go to point`,
                        click: (xwc, ywc) => {
                            let w = selectedPoints[0]
                            if (w.xrefid)
                                this.zoomIntoObject(w.xrefid)
                            if (w.yrefid)
                                setTimeout(() => {
                                    this.zoomIntoObject(w.yrefid)
                                }, 20000)
                            showModal({
                                wid: 'json',
                                data: JSON.stringify(w)
                            })
                        }
                    })
                }
                if (objects && objects.length > 0) {
                    menuList.push({
                        label: `Package into folder`,
                        click: async (xwc, ywc) => {
                            const a = await exec('baja/package/trackpack', graph, this, objects);

                        }
                    })
                    menuList.push({
                        label: `Copy...`,
                        click: async (xwc, ywc) => {

                            let c = {
                                objectType: 'array_of_objects',
                                objects: objects
                            }
                            const copytable = HM(c);
                            navigator.clipboard.writeText(copytable).then(() => {

                                this.setMessage(" Tables copied")
                                console.log("Object copied to clipboard!");
                            }).catch(err => {
                                console.error("Failed to copy object to clipboard: ", err);
                            });
                        }
                    })
                } if (objects && objects.length > 0) {
                    menuList.push({
                        label: `Delete`,
                        click: async (xwc, ywc) => {
                            for (let o of objects) {
                                this.removePlate(o)
                            }
                        }
                    })
                }
                this.menu = new Menu(menuList, this.grid.Xwc(x), this.grid.Ywc(y))
                this.menu_vis = true;
            }

            toJSON() {
                return {
                    name: this.name,
                    color: this.color,
                    uid: this.uid,
                    file: this.file,
                    users: this.users,
                    description: this.description,
                    owner: this.owner,
                    ptracks: this.ptracks,
                    formulas: this.formulas,
                    attr__showTablesMenu: this.attr__showTablesMenu,
                    attr__drawFormulaConnections: this.attr__drawFormulaConnections,
                    attr__displayEvents: this.attr__displayEvents,
                    attr__hideWellDetailPopup: this.attr__hideWellDetailPopup,
                    attr__showGrid: this.attr__showGrid,
                    attr__displayBookMarks: this.attr__displayBookMarks,
                    bookmarks: this.bookmarks,
                    ljl_bookmarks: this.ljl_bookmarks,
                    mode: this.mode,
                    selectedPlate: this.selectedPlate ? this.selectedPlate.uid : null,
                    fromPlate: this.fromPlate ? this.fromPlate.uid : null,
                    toPlate: this.toPlate ? this.toPlate.uid : null,
                    root: this.root.map(plate => plate.toJSON()),
                    transferFunctions: this.transferFunctions.map(tf => tf.toJSON()),
                    trackFunctions: this.trackFunctions.map(tf => tf.toJSON()),
                    connections: this.connections.map(conn => conn.toJSON()),
                    m_plots: this.m_plots.map(plot => plot.toJSON()),
                    glyphs: this.glyphs.map(glyph => glyph.toJSON()),
                    grid: this.grid.toJSON(),
                    layoutTool: this.layoutTool ? this.layoutTool.toJSON() : null,
                    __msg: this.__msg,

                };
            }

            removeConnectionWithThisPlate(plate_id) {
                let c = []
            }

            addPlot(plot) {
                this.m_plots.push(plot)
                LJScript.add(this.name, 'new plot ' + plot.name)

            }

            async createPlotConfig(t) {

                let temp = `new plot current_treasure
                        {
                            "plot": {
                                "lineColor": "lightGray",
                                "pointColor": "rgb(250,225,110)",
                                "errorBarColor": "gray",
                                "w": 0.07771108090321988,
                                "h": 2.681034344933893,
                                "x": 1.9087502877035156,
                                "y": 3.4880573358773885,
                                "fitScaleToData": true
                            }
                        }`

                let MPlot = await exec('flexigraph/plot.js')
                const plot = parsePlotObject(t);
                this.m_plots.push(plot)
                plot.highlight();
            }

            sortHighlight() {
                this.m_plots.sort((a, b) => {
                    return (b._highlight === true) - (a._highlight === true);
                });
            }

            showTablesMenu(bol) {
                this.attr__showTablesMenu = bol;

            }
            getPlot(scx, scy) {
                for (let i = this.m_plots.length - 1; i >= 0; i--) {
                    let p = this.m_plots[i];
                    if (p._highlight === true && p.inside(this.grid, scx, scy)) {
                        return p;
                    }
                }

                for (let i = this.m_plots.length - 1; i >= 0; i--) {
                    let p = this.m_plots[i];
                    if (p.inside(this.grid, scx, scy)) {
                        return p;
                    }
                }
                return null;
            }

            getRef(ref) {
                for (let c of this.connections) {
                    if (c.uid === ref) {
                        return c;
                    }
                }
                let f = null;
                if (this.root && this.root.length > 0) {
                    for (let r of this.root) {
                        f = r.getRef(ref)
                        if (f) {
                            return f;
                        }
                    }
                }
                for (let c of this.m_plots) {
                    if (c.uid == ref) {
                        return ref;
                    }
                }
                return this;
            }

            init() {
                let colorWells = (type) => {
                    if (type === 'STD') {
                        return 'lightBlue'
                    } else
                        if (type === 'CTRL') {
                            return 'lightOrange'
                        } else {
                            return 'lightYellow';
                        }
                }
                let menuList = [
                ]

            }

            setWorkbench(wb) {
                if (this.wb != wb)
                    this.wb = wb;
            }

            updateworkbench(wb) {
                this.wb(wb);
            }

            unhighlightPlots() {
                const highlightedPlots = [];
                const unhighlightedPlots = [];

                for (let p of this.m_plots) {
                    if (p.isHighlighted()) {
                        p.unhighlight();
                        highlightedPlots.push(p);
                    } else {
                        unhighlightedPlots.push(p);
                    }
                }

                this.m_plots = [...unhighlightedPlots, ...highlightedPlots];
            }

            unhighlightAll() {
                this.menu = null;
                for (let r of this.root) {
                    r.unhighlight();
                }
                for (let p of this.m_plots) {
                    p.unhighlight();
                }
            }

            deselectAll() {
                this.menu = null;
                if (this.selectedPlate) {
                    if (this.selectedPlate.setMenu)
                        this.selectedPlate.setMenu(pt, null)
                    this.setSelected(null);
                }
                for (let r of this.root) {
                    r.deselectAll();
                }
                for (let t of this.transferFunctions) {
                    t.deselectIt();
                }
                for (let t of this.trackFunctions) {
                    t.deselectIt();
                }
                for (let p of this.m_plots) {
                    p.deselectIt();
                }

            }

            getAllObjects() {
                let allDrawables = [
                    ...this.glyphs,
                    ...(this.root || []),
                    ...(this.m_plots || []),
                ].filter(obj => obj && obj.getLastTouched() !== undefined);

                return allDrawables;
            }

            getAllPlates() {
                let allDrawables = [
                    ...(this.root || []),
                ].filter(obj => obj && obj.getLastTouched() !== undefined);

                return allDrawables;
            }

            getAllPlots() {
                let allDrawables = [
                    ...(this.m_plots || []),
                ].filter(obj => obj && obj.getLastTouched() !== undefined);

                return allDrawables;
            }

            getAllGlyphs() {
                let allDrawables = [
                    ...this.glyphs,
                ].filter(obj => obj && obj.getLastTouched() !== undefined);

                return allDrawables;
            }

            unModal() {
                let allDrawables = [
                    ...this.glyphs,
                    ...(this.root || []),
                    ...(this.m_plots || []),
                ].filter(obj => obj && obj.getLastTouched() !== undefined);

                for (let i = allDrawables.length - 1; i >= 0; i--) {
                    const obj = allDrawables[i];
                    if (obj.unModal) {
                        obj.unModal();
                    }
                }
            }
            deselectWells() {
                this.pushState();

                this.menu = null;
                for (let r of this.root) {
                    r.deselectWells();
                }
            }
            removeRootplate(plate) {
                const index = this.root.indexOf(plate);
                if (index >= 0) {
                    this.root.splice(index, 1);
                }
            }
            removePlot(plot) {
                const index = this.m_plots.indexOf(plot);
                if (index >= 0) {
                    this.m_plots.splice(index, 1);
                }
            }

            selectPlate(plate) {
                this.setSelected(plate);
            }
            setSelected(plate) {
                this.selectedPlate = plate;
            }

            deselectPlateRoots() {
                this.pushState();

                for (let r of this.root) {
                    r.deselectPlateRoot();
                }
                for (let t of this.transferFunctions) {
                    t.deselectIt();
                }
                for (let t of this.trackFunctions) {
                    t.deselectIt();
                }
            }

            resetGrid() {
                this.grid = new MGrid(0, 0, 5, 5);
                this.grid.setxmax(2.5);
                this.grid.setymax(2.5);
                this.grid.setxmin(1);
                this.grid.setymin(1);
                this.grid.setInset(0, 0)
                this.grid.rescale();
            }

            createTable(name, rows, x, y) {
                const columns = Object.keys(rows[0]);
                let plate = new Plate(name, columns.length, rows.length);
                plate.wells = rows.map((rowData, rowIndex) => {

                    return columns.map((key, colIndex) => {
                        let well = new GenericWell(`${key}-${rowIndex}`);

                        well.value = rowData[key] || null;
                        well.name = `${key}`;

                        return well;
                    });
                });
                plate.plateType = 'data'
                plate.grid.width = 1;
                plate.grid.height = 1;
                plate.grid.xi = x;
                plate.grid.yi = y;
                this.grid.rescale();
                this.addNextAvailableX(plate)
                setTimeout(() => {
                    this.zoomintoplate(plate)

                }, 1000)
                return plate;
            }
            navigate(direction) {
                const xScaleIncrement = (this.grid.xmax - this.grid.xmin) * 0.1;
                const yScaleIncrement = (this.grid.ymax - this.grid.ymin) * 0.1;
                if (this.selected_well) {
                    let yc = this.selected_well.__screen_y;
                    let h = this.selected_well.__screen_height;
                    if (yc + h + 100 > this.grid.Y(this.grid.ymin)) {
                        this.grid.ymax -= yScaleIncrement;
                        this.grid.ymin -= yScaleIncrement;
                        this.grid.rescale();
                    } else if (yc - 100 < 0) {
                        this.grid.ymax += yScaleIncrement;
                        this.grid.ymin += yScaleIncrement;
                        this.grid.rescale();
                    }
                } else {
                    if (direction === 'down') {
                        this.grid.ymax -= yScaleIncrement;
                        this.grid.ymin -= yScaleIncrement;
                        this.grid.rescale();
                    } else if (direction === 'up') {
                        this.grid.ymax += yScaleIncrement;
                        this.grid.ymin += yScaleIncrement;
                        this.grid.rescale();
                    }
                    else if (direction === 'right') {
                        this.grid.xmax += xScaleIncrement;
                        this.grid.xmin += xScaleIncrement;
                        this.grid.rescale();
                    } else if (direction === 'left') {

                        this.grid.xmax -= xScaleIncrement;
                        this.grid.xmin -= xScaleIncrement;
                        this.grid.rescale();
                    }
                }
            }

            addNextAvailableX(pl) {
                let nextAvailableX = 0;
                let nexttotable = null;
                for (const table of this.root) {
                    const tableRightBoundary = table.grid.xi + table.grid.width;
                    let ttemp = Math.max(nextAvailableX, tableRightBoundary);
                    if (ttemp > nextAvailableX) {
                        nexttotable = table;
                        nextAvailableX = ttemp;

                    }
                    else if (!nexttotable) {
                        nexttotable = table;
                    }
                }
                this.root.push(pl)
                pl.grid.xi = nextAvailableX + this.grid.worldWidth(70)
                if (nexttotable) {
                    let ws = nexttotable.grid.width / nexttotable.grid.xmax;
                    let hs = nexttotable.grid.height / nexttotable.grid.ymax;
                    pl.grid.width = ws * pl.grid.xmax;
                    pl.grid.height = hs * pl.grid.ymax;
                    pl.grid.yi = nexttotable.grid.yi - (pl.grid.height - nexttotable.grid.height);

                }

            }

            newRoot(name, plateType, x, y) {
                let ch;
                if (y == null) {
                    y = 1;
                }
                let plates = []
                for (let r of this.root) {
                    plates = r.getPlates(plates, Math.floor(y));
                }
                if (x == null) {
                    x = plates.length * 2;
                }
                ch = new Plate(name, x, y)
                ch.completeNullValues();
                ch.setType(plateType);

                if (this.root && this.root.length > 0) {
                    let lastPlate = this.getLastTouchedPlate()
                    this.root.push(ch)
                    this.setPlatePositionNextTo(ch.name, lastPlate.name)

                } else {

                    ch.grid.width = 1;
                    ch.grid.height = 1;
                    ch.grid.yi = 1;

                    this.addNextAvailableX(ch)
                }
                setTimeout(() => {
                    this.zoomintoplate(ch)
                }, 1000)

            }
            newSimplePlate(name, x, y, nextToPlate, startY) {
                x = parseInt(x)
                y = parseInt(y)
                let ch;
                if (y == null) {
                    y = 1;
                }
                let nextAvailableX = 0;
                for (const table of this.root) {
                    const tableRightBoundary = table.grid.xi + table.grid.width;
                    nextAvailableX = Math.max(nextAvailableX, tableRightBoundary);
                }
                ch = new Plate(name, x, y)

                this.addNextAvailableX(ch)

                ch.completeNullValues();
                ch.setType('data');
                ch.grid.width = 1;
                ch.grid.height = 1;

                if (nextToPlate) {

                    let wd = x / (nextToPlate.grid.xmax - nextToPlate.grid.xmin)
                    let hd = y / ((nextToPlate.grid.ymax - nextToPlate.grid.ymin))
                    if (hd === 0) {
                        hd = 1
                    }
                    ch.grid.width = nextToPlate.grid.width * wd;
                    ch.grid.height = nextToPlate.grid.height * hd;
                    ch.grid.rescale();
                    this.setPlatePositionNextTo(name, nextToPlate.name, startY)
                } else {
                    this.addNextAvailableX(ch)

                }

                return ch;
            }

            setPlatePositionNextTo(table, nextToTable, _y) {

                let ch = this.getTableByName(table);
                let chn = this.getTableByName(nextToTable);

                let nextToPlate = chn;

                ch.grid.xi = chn.grid.xi + chn.grid.width + this.grid.worldWidth(40);

                const x = ch.grid.xmax;
                const y = ch.grid.ymax;

                ch.grid.width = 1;
                ch.grid.height = 1;

                let wd = x / (nextToPlate.grid.xmax - nextToPlate.grid.xmin)
                let hd = y / ((nextToPlate.grid.ymax - nextToPlate.grid.ymin))
                if (hd === 0) {
                    hd = 1
                }
                ch.grid.width = nextToPlate.grid.width * wd;
                ch.grid.height = nextToPlate.grid.height * hd;

                if (_y)
                    ch.grid.yi = _y;
                else
                    ch.grid.yi = chn.grid.yi + chn.grid.height - ch.grid.height;

                ch.grid.rescale();

            }

            setPlate(ch, x, y) {
                if (y == null) {
                    y = 1;
                }
                this.resetState()
                let plates = []
                for (let r of this.root) {
                    plates = r.getPlates(plates, Math.floor(y));
                }
                if (x == null) {
                    x = plates.length * 2;
                }

                this.grid.rescale();

                ch.grid.xi = x;
                ch.grid.yi = y;
                this.root.push(ch)

                return ch;
            }

            appendPlate(ch) {
                this.resetState()
                let isObjectNotVisible = (xscreen_min_, xscreen_max, yscreen_min_, yscreen_max) => {
                    const canvasWidth = this.grid.xi;
                    const canvasHeight = this.grid.height;
                    const isOutsideHorizontal = (xscreen_max < 0 && xscreen_min_ < 0) || (xscreen_min_ > canvasWidth && xscreen_max > canvasWidth);
                    const isOutsideVertical = (yscreen_max < 0 && yscreen_min_ < 0) || (yscreen_min_ > canvasHeight && yscreen_max > canvasHeight);
                    return isOutsideHorizontal || isOutsideVertical;
                }

                let ob = []
                let mxax = 0;
                let myax = 0;
                let nextToPlate = null;
                for (let r of this.root) {
                    let ysc = this.grid.Y(r.grid.yi + r.getHeight(this));
                    let xsc = this.grid.X(r.grid.xi);
                    let yscreen_height = this.grid.screenHeight(r.getHeight(this));
                    let screen_width = this.grid.screenWidth(r.getWidth(this));
                    if (isObjectNotVisible(xsc, xsc + screen_width, ysc, ysc + yscreen_height)) {
                        if (mxax < xsc + screen_width) {
                            mxax = this.grid.Xwc(xsc) + this.grid.worldWidth(screen_width);
                            myax = r.grid.yi;
                            ob.push(r)
                            nextToPlate = r;
                        }
                    }
                }
                this.root.push(ch)
                if (nextToPlate) {
                    let nextAvailableX = 0;
                    for (const table of this.root) {
                        const tableRightBoundary = table.grid.xi + table.grid.width;
                        nextAvailableX = Math.max(nextAvailableX, tableRightBoundary);
                    }
                    const x__ = ch.grid.xmax;
                    const y__ = ch.grid.ymax;
                    ch.grid.xi = nextAvailableX + 1;
                    ch.grid.width = 1;
                    ch.grid.height = 1;
                    let wd = x__ / (nextToPlate.grid.xmax - nextToPlate.grid.xmin)
                    let hd = y__ / ((nextToPlate.grid.ymax - nextToPlate.grid.ymin))
                    if (hd === 0) {
                        hd = 1
                    }
                    ch.grid.width = nextToPlate.grid.width * wd;
                    ch.grid.height = nextToPlate.grid.height * hd;
                    ch.grid.rescale();
                    this.setPlatePositionNextTo(ch.name, nextToPlate.name, nextToPlate.grid.yi + nextToPlate.grid.height - ch.grid.height)
                } else {

                    if (!myax) {
                        myax = 1;
                    }
                    if (!mxax) {
                        mxax = 1;
                    }
                    ch.grid.height = 1;
                    this.grid.rescale();
                    ch.grid.xi = mxax + this.grid.worldWidth(30);
                    ch.grid.yi = myax;
                    this.__tables_menu = new Menu(this.generateTables(), 0, 40)
                    return ch;
                }
            }

            generateTableMenu() {
                this.__tables_menu = new Menu(this.generateTables(), 0, 40)

            }

            getTablesAndPlots() {
                let p = []
                for (let r of this.root) {
                    p.push(r)
                }
                for (let r of this.m_plots) {
                    p.push(r)
                }
                return p;
            }

            generateTables() {
                let p = []
                for (let r of this.root) {
                    p.push({
                        label: `${r.name}`,
                        click: (xwc, ywc) => {

                            r.selectIt();
                            this.setSelected(r);
                            this.zoomintoplate(r);
                        }
                    })
                }
                for (let r of this.m_plots) {
                    p.push({
                        label: `${r.name} (plot)`,
                        click: async (xwc, ywc) => {
                            this.grid.rescale();

                            let padding = -1;

                            let totalWidth = r.w;
                            let xi = r.x;
                            await this.zoomto(xi - totalWidth / 2, r.y - (r.h + r.h / 2), totalWidth + totalWidth, r.h * 2)
                            this.wb(null)

                        },
                        bg: "navy",
                        fg: "white"
                    })
                }
                return p;
            }

            resetState() {

                this.toPlate = null;
                this.fromPlate = null;
            }

            appendPlot(ch) {
                this.resetState()

                ch.w = 1
                ch.grid.width = 1;
                let maxXi = 0;
                let maxYi = 1;

                for (let r of this.root) {
                    const { xi, yi } = r.getMaxCoordinates();
                    maxXi = Math.max(maxXi, xi);
                    maxYi = Math.min(maxYi, yi);
                }

                this.grid.rescale();
                ch.grid.width = 1;
                ch.grid.height = 1;
                ch.w = 1;
                ch.h = 1;
                ch.highlight();
                ch.w = 1;
                ch.x = maxXi + 2;
                ch.y = maxYi;
                ch.grid.xi = maxXi + 2;
                ch.grid.yi = maxYi + 1;
                this.m_plots.push(ch)
                return ch;
            }

            setPlot(ch) {
                this.grid.rescale();
                ch.highlight();
                this.m_plots.push(ch)
                LJScript.add(this.name, 'new plot ' + ch.name)

            }
            setPlotCenter(ch) {
                this.grid.rescale();
                ch.highlight();
                this.m_plots.push(ch)
                LJScript.add(this.name, 'new plot ' + ch.name)

            }

            newDRoot(name, plateType, columns, rows, x, y) {
                let ch;
                if (y == null) {
                    y = 1;
                }
                let plates = []
                for (let r of this.root) {
                    plates = r.getPlates(plates, Math.floor(y));
                }
                if (x == null) {
                    x = plates.length * 2;
                }
                ch = new Plate(name, columns, rows)
                ch.setType(plateType);
                ch.grid.width = 1;
                ch.grid.height = 1;
                ch.grid.xi = x;
                ch.grid.yi = y;
                this.root.push(ch)
                this.resetGrid();
                this.grid.rescale();
                this.alignPlates();

                return ch;
            }

            setAspectRatio(va) {
                this.grid.setAspectRatioIteratively(va, 9)
            }
            decreaseAspectratio() {
                this.grid.decreaseAspectratio(10, 10)
            }
            pinchY(v) {
                this.grid.pinchY(10, v)

            }
            pinchX(v) {
                this.grid.pinchX(10, v)

            }

            async zoomtolastplate() {
                this.zoomintoplate(this.root[this.root.length - 1])
            }

            async zoomintoplate(plate) {

                console.log('debubg');
                if (!plate) {
                    return;
                }

                if (plate.typeof && plate.typeof === 'plot') {
                    this.zoomintoplot(plate)
                    return;
                }

                function calculateGridHeight(grid, cellSizeInPixels) {
                    const worldCellSize = 1;
                    const worldHeight = grid.ymax - grid.ymin;
                    const numberOfCells = worldHeight / worldCellSize;

                    const heightInPixels = numberOfCells * cellSizeInPixels;

                    grid.setHeight(heightInPixels);

                    grid.rescale();

                    return heightInPixels;
                }

                if (this.name)
                    LJScript.add(this.name, 'zoomin ' + this.name)

                this.grid.rescale();
                if (plate.highlight) {
                    plate.highlight();
                }

                let ch = 24;
                let cw = 100;

                if (plate.plateType === 'package') {
                    ch = 60;
                    cw = 200;
                }

                let pixh = this.grid.height;
                let pixw = this.grid.width;
                let ycc = pixh / ch;
                let xcc = pixw / cw;
                let xwcc = plate.grid.screenWidth(xcc)

                let totalWidth = plate.grid.width;
                if (totalWidth > xwcc) {
                    let factor = 0.20;
                    let fl = totalWidth * factor
                    let xi = plate.grid.xi - fl
                    await this.zoomto(xi, (plate.grid.yi + plate.grid.height - plate.grid.screenHeight(ycc - 3)), totalWidth + (2 * fl), plate.grid.screenHeight(ycc))
                } else {
                    let xi = plate.grid.xi - (xwcc - totalWidth) / 2
                    await this.zoomto(xi, (plate.grid.yi + plate.grid.height - plate.grid.screenHeight(ycc - 3)), xwcc, plate.grid.screenHeight(ycc))
                }

            }

            async zoomintoplot(plate) {

                if (!plate) {
                    return;
                }

                this.setMessage(plate.name)
                this.deselectAll()
                if (plate.highlight) {
                    plate.highlight();
                }
                this.grid.rescale();
                let totalWidth = plate.w;
                let xi = plate.x;
                await this.zoomto(xi - totalWidth / 2, plate.y - (plate.h + plate.h / 2), totalWidth + totalWidth, plate.h * 2)

                if (this.name)
                    LJScript.add(this.name, 'zoominplot ' + this.name)

            }

            async zoomto(x, y, width, height) {
                this.pushGrid();
                AnimateGrid.INTERUPT = true;
                this.grid.rescale();
                let xii = x;
                let yii = y;
                let xmax = xii + width;
                let xmin = xii;
                let ymax = yii + height;
                let ymin = yii;
                let ag = new AnimateGrid(this.grid);
                await ag.animateTo(xmin, xmax, ymin, ymax, 20);
            }

            pushState() {
            }

            hasTable(uid) {
                for (let r of this.root) {
                    if (r.uid === uid)
                        return true;
                }
                return false;
            }

            async zoomtfit() {
                this.pushGrid();
                let xmin = 0;
                let xmax = 0;
                let ymin = 0;
                let ymax = 0;
                this.alignPlates();
                this.grid.rescale();

                let index = 0;
                for (let r of this.root) {
                    const childBounds = r.findBounds();
                    if (index === 0) {
                        xmin = childBounds.xmin;
                        xmax = childBounds.xmax;
                        ymin = childBounds.ymin;
                        ymax = childBounds.ymax;
                    } else {
                        xmin = Math.min(xmin, childBounds.xmin);
                        xmax = Math.max(xmax, childBounds.xmax);
                        ymin = Math.min(ymin, childBounds.ymin);
                        ymax = Math.max(ymax, childBounds.ymax);
                    }
                    index++;
                }
                for (let p of this.m_plots) {

                    const childBounds = p.findBounds();

                }

                if (isNaN(xmin) || isNaN(xmax) || isNaN(ymin) || isNaN(ymax) ||
                    xmin == null || xmax == null || ymin == null || ymax == null ||
                    xmin === undefined || xmax === undefined || ymin === undefined || ymax === undefined
                ) {
                    return null;
                }

                let ag = new AnimateGrid(this.grid);
                this.grid.rescale();
                const width = xmax - xmin;
                const height = ymax - ymin;

                let windowWidth = width;
                let windowHeight = height;

                const boxAspectRatio = width / height;

                const windowAspectRatio = windowWidth / windowHeight;

                let newWidth, newHeight;

                if (boxAspectRatio > windowAspectRatio) {

                    newWidth = windowWidth;
                    newHeight = newWidth / boxAspectRatio;
                } else {

                    newHeight = windowHeight;
                    newWidth = newHeight * boxAspectRatio;
                }

                const marginX = 2
                const marginY = 2

                await ag.animateTo(xmin - marginX, xmax + marginX, ymin - marginY - 5, ymax + marginY + 5, 50);

            }

            reset() {

                LJScript.reset();
                this.clearPlates();
                this.clearTransferfunctions();
                this.resetGrid();
                this.clearPlots();
                this.clearGlyphs();
                this.formulas = {}
                this.bookmarks = {}
                this.uid = uuid();
            }

            clearPlots() {
                this.m_plots = []
            }
            clearGlyphs() {
                this.glyphs = []
            }

            clearPlates() {
                this.root = [];
                this.transferFunctions = [];
                this.trackFunctions = [];
                this.connections = []
            }
            clearFormulas() {
                this.formulas = {}

            }

            getTransferFunctions(fromPlate, f) {
                if (!f) {
                    f = [];
                }
                for (let tf of this.transferFunctions) {
                    if (tf.from == fromPlate) {
                        f.push(tf);
                        this.getTransferFunctions(tf.to, f);
                    }
                }
                return f;
            }
            getFunction(x, y) {
                let xs = this.grid.X(x);
                let ys = this.grid.Y(y);

                for (let t of this.transferFunctions) {

                    let tsx = this.grid.X(t.x)
                    let tsy = this.grid.Y(t.y);
                    let screenWidth = t.screenWidth;

                    if (tsx - screenWidth < xs && tsx + screenWidth > xs &&
                        tsy + 30 > ys && tsy - 30 < ys) {
                        return t;
                    }
                }

                for (let t of this.trackFunctions) {
                    let tsx = this.grid.X(t.x)
                    let tsy = this.grid.Y(t.y);
                    let w = this.grid.screenWidth(t.w);
                    let h = this.grid.screenHeight(t.h);

                    if (tsx < xs && (tsx + w) > xs &&
                        tsy < ys && tsy + h > ys) {
                        return t;
                    }
                }
            }

            getTransferFunction(x, y) {
                let xs = this.grid.X(x);
                let ys = this.grid.Y(y);
                for (let t of this.transferFunctions) {
                    let tsx = this.grid.X(t.x)
                    let tsy = this.grid.Y(t.y);

                    console.log(" tsx " + tsx + '' + t.screenWidth);
                    if (tsx - t.screenWidth < xs && tsx + t.screenWidth > xs &&
                        tsy + 40 > ys && tsy - 40 < ys) {
                        return t;
                    }
                }
            }
            getTrackFunction(x, y) {
                let xs = this.grid.X(x);
                let ys = this.grid.Y(y);

                for (let t of this.trackFunctions) {
                    let tsx = this.grid.X(t.x)
                    let tsy = this.grid.Y(t.y);
                    let w = this.grid.screenWidth(t.w);
                    let h = this.grid.screenHeight(t.h);

                    if (tsx < xs && (tsx + w) > xs &&
                        tsy < ys && tsy + h > ys) {
                        return t;
                    }
                }
            }

            getTableByName(name) {
                for (let r of this.root) {
                    if (r.name.toLowerCase() === name.toLowerCase()) {
                        return r;
                    }
                }
                return null;
            }

            getPlotByName(name) {
                for (let r of this.m_plots) {
                    if (r.name.toLowerCase() === name.toLowerCase()) {
                        return r;
                    }
                }
                return null;
            }

            getPlateWithUID(uid) {
                if (!uid) {
                    return null;
                }

                if (this.uid === uid) {
                    return this;
                }
                else {
                    for (let p of this.root) {
                        let vp = p.getPlateWithUID(uid);
                        if (vp) {
                            return vp;
                        }
                    }

                    for (let con of this.connections) {
                        return con.find(uid)
                    }

                }
            }
            clearTransferfunctions() {
                this.transferFunctions = [];
            }

            searchByName(nameToSearch) {
                if (nameToSearch === this.name) {
                    return this;
                }
                const arraysToSearch = [this.root, this.transferFunctions, this.trackFunctions, this.connections, this.m_plots, this.glyphs];
                const normalizedSearchName = nameToSearch.toLowerCase();
                const results = [];
                for (const array of arraysToSearch) {
                    for (const obj of array) {

                        if (obj.name && obj.name.toLowerCase() === normalizedSearchName) {
                            results.push(obj);
                        }
                    }
                }
                return results;
            }
            getRefByName(name) {
                return this.searchByName(name)
            }

            getLastTouchedPlate() {
                let allDrawables = [
                    ...this.glyphs,
                    ...(this.root || []),

                ].filter(obj => obj && obj.getLastTouched() !== undefined);
                allDrawables = allDrawables.sort((a, b) => a.getLastTouched() - b.getLastTouched());

                return allDrawables[0]
            }

            getPlate(wx, wy) {

                const allObjects = [
                    ...this.root.slice().reverse(),
                    ...this.m_plots,
                    this.selectedPlate,
                    ...this.glyphs
                ].filter(obj => obj);

                allObjects.sort((a, b) => {
                    const aBg = a.isBackground ? 0 : 1;
                    const bBg = b.isBackground ? 0 : 1;
                    return aBg - bBg;
                });

                for (let i = allObjects.length - 1; i >= 0; i--) {
                    const obj = allObjects[i];
                    if (obj.inside && obj.inside(this.grid, wx, wy, true)) {
                        return obj;
                    }
                }

                return null;
            }

            getSelectedWells() {
                let w = []
                for (let r of this.root) {
                    let se = r.getSelectedWellsInOrder()
                    if (se && se.length > 0) {
                        w = w.concat(r.getSelectedWells());
                    }
                }
                return w;

            }

            getSelectedWellsInOrder() {
                let w = []
                for (let r of this.root) {
                    let se = r.getSelectedWellsInOrder()
                    w = w.concat(se);

                }
                return w;
            }

            async pasteValuesasTagsSelectedWells() {
                const vtext = await navigator.clipboard.readText();
                for (let r of this.root) {
                    let se = await r.getSelectedWellsInOrder()
                    let js = JSON.parse(vtext)
                    let se_len = js.length;
                    for (let i = 0; i < se_len; i++) {
                        if (i < se.length) {
                            let v = js[i].value
                            se[i].setGroup(v)
                        }
                    }
                }
            }

            async pasteIntoSelectedWells(__text) {

                function detectDelimiter(text) {
                    const delimiters = ['\n', '\t', ',', ';', '|', ' '];

                    const lines = text.split('\n');
                    const scores = {};

                    for (const delim of delimiters) {
                        const counts = lines.map(line => line.split(delim).length);
                        const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
                        const variance = counts.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / counts.length;
                        const stddev = Math.sqrt(variance);

                        scores[delim] = {
                            averageFields: avg,
                            consistency: 1 / (stddev + 0.0001),
                        };
                    }

                    const best = Object.entries(scores).sort((a, b) => {
                        return b[1].consistency - a[1].consistency || b[1].averageFields - a[1].averageFields;
                    })[0][0];

                    return best;
                }

                function isStringArray(arr) {
                    if (typeof arr === 'string' && arr.startsWith('[')) {
                        arr = arr.split(',').map(item => item.trim());
                    }
                    return Array.isArray(arr) && arr.every(item => typeof item === 'string');
                }
                function parseTableToArray(input) {
                    return input
                        .split('\n')
                        .map(row => row.split(/[\t,]+/).map(cell => cell.trim()))
                        .map(row => row.map(cell => cell === '' ? '' : cell))
                }

                if (!__text) {
                    __text = await navigator.clipboard.readText();
                }

                let delim = detectDelimiter(__text)
                console.log('debubg');

                try {
                    if (!delim && isStringArray(__text)) {
                        function parseToArray(input) {
                            try {
                                const parsed = JSON.parse(input);
                                return Array.isArray(parsed) ? parsed : [parsed];
                            } catch (e) {
                                return input
                                    .split(/[\n,\t\s]+/)
                                    .map(item => item.trim())
                                    .filter(item => item);
                            }
                        }
                        let parsedArray = parseToArray(__text);
                        let selectedWells = await this.selectedPlate.getSelectedWellsInOrder();
                        let index = 0;

                        for (let i = 0; i < selectedWells.length && index < parsedArray.length; i++) {
                            selectedWells[i].setValue(parsedArray[index++]);
                        }
                    } else {
                        let parsedData = (__text).split(delim);
                        for (let r of this.root) {
                            let selectedWells = await r.getSelectedWellsInOrder();
                            let numRows = parsedData.length;
                            let numCols = parsedData[0].length;
                            let index = 0;

                            for (let row = 0; row < numRows; row++) {
                                for (let col = 0; col < numCols; col++) {
                                    if (index < selectedWells.length) {

                                        const newValue = parsedData[row][col];
                                        selectedWells[index].setValue(newValue);
                                        index++;
                                    }
                                }
                            }
                        }
                    }
                } catch (exception) {
                    let lines = __text.split('\n');

                    for (let r of this.root) {
                        let selectedWells = await r.getSelectedWellsInOrder();
                        let numLines = lines.length;

                        for (let i = 0; i < numLines; i++) {
                            if (i < selectedWells.length) {
                                selectedWells[i].setValue(lines[i]);
                            }
                        }
                    }
                }
            }

            async pasteIntoSelectedWellsMatchAddresses() {
                function isStringArray(arr) {
                    if (typeof arr === 'string' && arr.startsWith('[')) {
                        arr = arr.split(',').map(item => item.trim());
                    }
                    return Array.isArray(arr) && arr.every(item => typeof item === 'string');
                }
                function parseTableToArray(input) {
                    return input
                        .split('\n')
                        .map(row => {

                            let leadingDelimiters = row.match(/^([\t,]+)/);
                            let result = [];

                            if (leadingDelimiters) {
                                let emptyCells = leadingDelimiters[0].split(/[\t,]/).length - 1;
                                for (let i = 0; i < emptyCells; i++) {
                                    result.push('');
                                }
                                row = row.slice(leadingDelimiters[0].length);
                            }

                            let cells = row.split(/[\t,]+/);
                            result = result.concat(cells.map(cell => cell.trim()));

                            return result;
                        });
                }

                let text = await navigator.clipboard.readText();
                try {
                    if (isStringArray(text)) {
                        function parseToArray(input) {
                            try {
                                const parsed = JSON.parse(input);
                                return Array.isArray(parsed) ? parsed : [parsed];
                            } catch (e) {
                                return input
                                    .split(/[\n,\t\s]+/)
                                    .map(item => item.trim())
                                    .filter(item => item);
                            }
                        }

                        let parsedArray = parseToArray(text);
                        let selectedWells = await this.selectedPlate.getSelectedWellsInOrder();
                        let index = 0;

                        for (let i = 0; i < selectedWells.length && index < parsedArray.length; i++) {
                            selectedWells[i].setValue(parsedArray[index++] + insertionText + selectedWells[i].getValue());
                        }
                    } else {
                        let parsedData = parseTableToArray(text);
                        for (let r of this.root) {
                            let selectedWells = await r.getSelectedWellsInOrder();
                            let numRows = parsedData.length;
                            let numCols = parsedData[0].length;
                            let index = 0;

                            let indexToWellAddress = (index, __cols) => {
                                const rowLetters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
                                let row = Math.floor(index / __cols);
                                let col = (index % __cols) + 1;
                                if (row >= rowLetters.length) {
                                    throw new Error('Row index out of range');
                                }
                                let rowLetter = rowLetters.charAt(row);
                                return `${rowLetter}${col}`;
                            }
                            let generateWellAddresses = (rows, cols) => {
                                let wellAddresses = [];
                                for (let index = 0; index < rows * cols; index++) {
                                    wellAddresses.push(indexToWellAddress(index, cols));
                                }
                                return wellAddresses;
                            }
                            let welladdr = generateWellAddresses(parsedData.length, parsedData[0].length)
                            for (let row = 0; row < numRows; row++) {
                                for (let col = 0; col < numCols; col++) {
                                    const newValue = parsedData[row][col];
                                    for (let s of selectedWells) {
                                        if (s.position === welladdr[index]) {
                                            selectedWells[index].setValue(newValue);
                                        }
                                    }
                                    index++;

                                }
                            }
                        }
                    }
                } catch (exception) {
                    let lines = text.split('\n');

                    for (let r of this.root) {
                        let selectedWells = await r.getSelectedWellsInOrder();
                        let numLines = lines.length;

                        for (let i = 0; i < numLines; i++) {
                            if (i < selectedWells.length) {
                                selectedWells[i].setValue(lines[i]);
                            }
                        }
                    }
                }
            }

            async pasteIntoSelectedWellsASAddresses() {
                function isStringArray(arr) {
                    if (typeof arr === 'string' && arr.startsWith('[')) {
                        arr = arr.split(',').map(item => item.trim());
                    }
                    return Array.isArray(arr) && arr.every(item => typeof item === 'string');
                }
                function parseTableToArray(input) {
                    return input
                        .split('\n')
                        .map(row => row.split(/[\t,]+/).map(cell => cell.trim()))
                        .map(row => row.map(cell => cell === '' ? '' : cell))
                }
                let text = await navigator.clipboard.readText();
                try {
                    if (isStringArray(text)) {
                        function parseToArray(input) {
                            try {
                                const parsed = JSON.parse(input);
                                return Array.isArray(parsed) ? parsed : [parsed];
                            } catch (e) {
                                return input
                                    .split(/[\n,\t\s]+/)
                                    .map(item => item.trim())
                                    .filter(item => item);
                            }
                        }
                        let parsedArray = parseToArray(text);
                        let selectedWells = await this.selectedPlate.getSelectedWellsInOrder();
                        let index = 0;

                        for (let i = 0; i < selectedWells.length && index < parsedArray.length; i++) {
                            selectedWells[i].setAddress(parsedArray[index++]);
                        }
                    } else {
                        let parsedData = parseTableToArray(text);
                        let r = this.selectedPlate;
                        let selectedWells = await r.getSelectedWellsInOrder();
                        let numRows = parsedData.length;
                        let numCols = parsedData[0].length;
                        let index = 0;
                        for (let row = 0; row < numRows; row++) {
                            for (let col = 0; col < numCols; col++) {
                                if (index < selectedWells.length) {
                                    const currentValue = selectedWells[index].getValue();
                                    const newValue = parsedData[row][col];
                                    selectedWells[index].setAddress(newValue);
                                    index++;
                                }
                            }
                        }
                    }
                } catch (exception) {
                    let lines = text.split('\n');

                    for (let r of this.root) {
                        let selectedWells = await r.getSelectedWellsInOrder();
                        let numLines = lines.length;

                        for (let i = 0; i < numLines; i++) {
                            if (i < selectedWells.length) {
                                selectedWells[i].setAddress(lines[i]);
                            }
                        }
                    }
                }
            }

            async pasteAndJoinOnAddressColumn(paste_address_column, destination_column) {

                if (!paste_address_column) {
                    paste_address_column = 0;
                }

                function isStringArray(arr) {
                    if (typeof arr === 'string' && arr.startsWith('[')) {
                        arr = arr.split(',').map(item => item.trim());
                    }
                    return Array.isArray(arr) && arr.every(item => typeof item === 'string');
                }
                function parseTableArray(input) {
                    return input
                        .split('\n')
                        .map(row => {

                            let leadingDelimiters = row.match(/^([\t,]+)/);
                            let result = [];

                            if (leadingDelimiters) {
                                let emptyCells = leadingDelimiters[0].split(/[\t,]/).length - 1;
                                for (let i = 0; i < emptyCells; i++) {
                                    result.push('');
                                }
                                row = row.slice(leadingDelimiters[0].length);
                            }

                            let cells = row.split(/[\t,]+/);
                            result = result.concat(cells.map(cell => cell.trim()));

                            return result;
                        });
                }

                let text = await navigator.clipboard.readText();
                let parsedData = parseTableArray(text);
                const r = this.selectedPlate;
                r.deselectAll();
                r.selectColumnAtRow(0, destination_column)
                let selectedWells = await r.getSelectedWellsInOrder();
                let numRows = parsedData.length;
                let numCols = parsedData[0].length;

                let start = r.wells.length;
                for (let i = 0; i < numCols; i++)
                    r.insertCol(r.wells.length)

                for (let row = 0; row < numRows; row++) {
                    const columns = parsedData[row];
                    let y = 0;
                    for (let s of selectedWells) {

                        if (('' + s.position).trim() === ('' + parsedData[row][paste_address_column]).trim()) {

                            for (let i = start; i < r.wells.length; i++) {
                                r.setValueByIndex(i, y, parsedData[row][i - start])
                            }
                        }
                        y++;
                    }

                }
            }

            joinOnAddressColumn(p1, c1, p2, c2) {
                const r = p1;
                this.deselectAll();
                r.deselectAll();
                r.selectColumnAtRow(0, c1)
                let selectedWells = r.getSelectedWellsInOrder();
                let numRows = p1.wells[0].length;
                let numCols = p1.wells.length;
                let start = p2.wells.length;
                for (let i = 0; i < numCols; i++)
                    p2.insertCol(p2.wells.length)

                for (let row = 0; row < numRows; row++) {
                    let y = 0;

                    for (let s of selectedWells) {

                        if (p2.wells[c2][row] && p2.wells[c2][row].value) {

                            if (('' + s.position).trim() === ('' + p2.wells[c2][row].value).trim()) {
                                for (let i = start; i < p2.wells.length; i++) {
                                    p2.setValueByIndex(i, row, s.value)
                                }
                            }
                        }

                        y++;
                    }

                }
                this.deselectAll();

            }
            join(p1, c1, p2, c2) {
                const r = p1;
                this.deselectAll();
                r.deselectAll();
                r.selectColumnAtRow(0, c1)
                let selectedWells = r.getSelectedWellsInOrder();
                let numRows = p1.wells[0].length;
                let numCols = p1.wells.length;
                let start = p2.wells.length;
                for (let i = 0; i < numCols; i++)
                    p2.insertCol(p2.wells.length)
                for (let row = 0; row < numRows; row++) {
                    let y = 0;

                    for (let s of selectedWells) {

                        if (p2.wells[c2][row] && p2.wells[c2][row].value) {

                            if (('' + s.value).trim() === ('' + p2.wells[c2][row].value).trim()) {
                                for (let i = start; i < p2.wells.length; i++) {
                                    p2.setValueByIndex(i, row, s.value)
                                }
                            }
                        }
                        y++;
                    }
                }
                this.deselectAll();

            }

            async pasteAndJoinOnValueColumn(paste_address_column, destination_column) {
                if (!paste_address_column) {
                    paste_address_column = 0;
                }
                function isStringArray(arr) {
                    if (typeof arr === 'string' && arr.startsWith('[')) {
                        arr = arr.split(',').map(item => item.trim());
                    }
                    return Array.isArray(arr) && arr.every(item => typeof item === 'string');
                }
                function parseTableArray(input) {
                    return input
                        .split('\n')
                        .map(row => {

                            let leadingDelimiters = row.match(/^([\t,]+)/);
                            let result = [];

                            if (leadingDelimiters) {
                                let emptyCells = leadingDelimiters[0].split(/[\t,]/).length - 1;
                                for (let i = 0; i < emptyCells; i++) {
                                    result.push('');
                                }
                                row = row.slice(leadingDelimiters[0].length);
                            }

                            let cells = row.split(/[\t,]+/);
                            result = result.concat(cells.map(cell => cell.trim()));

                            return result;
                        });
                }

                let text = await navigator.clipboard.readText();
                let parsedData = parseTableArray(text);
                const r = this.selectedPlate;
                r.deselectAll();
                r.selectColumnAtRow(0, destination_column)

                let selectedWells = await r.getSelectedWellsInOrder();
                let numRows = parsedData.length;
                let numCols = parsedData[0].length;

                let start = r.wells.length;
                for (let i = 0; i < numCols; i++)
                    r.insertCol(r.wells.length)

                for (let row = 0; row < numRows; row++) {
                    const columns = parsedData[row];
                    let y = 0;
                    for (let s of selectedWells) {

                        if (('' + s.value).trim() === ('' + parsedData[row][paste_address_column]).trim()) {

                            for (let i = start; i < r.wells.length; i++) {
                                r.setValueByIndex(i, y, parsedData[row][i - start])
                            }
                        }
                        y++;
                    }

                }
            }

            async pastePrependIntoSelectedWells(text, insertionText) {
                function isStringArray(arr) {
                    if (typeof arr === 'string' && arr.startsWith('[')) {
                        arr = arr.split(',').map(item => item.trim());
                    }
                    return Array.isArray(arr) && arr.every(item => typeof item === 'string');
                }

                function parseTableToArray(input) {
                    return input
                        .split('\n')
                        .map(row => row.split(/[\t,]+/).map(cell => cell.trim()))
                        .map(row => row.map(cell => cell === '' ? '' : cell))
                }

                if (!text) {
                    text = await navigator.clipboard.readText();
                }

                try {
                    if (isStringArray(text)) {
                        function parseToArray(input) {
                            try {
                                const parsed = JSON.parse(input);
                                return Array.isArray(parsed) ? parsed : [parsed];
                            } catch (e) {
                                return input
                                    .split(/[\n,\t\s]+/)
                                    .map(item => item.trim())
                                    .filter(item => item);
                            }
                        }

                        if (!insertionText) {
                            insertionText = '';
                        }

                        let parsedArray = parseToArray(text);
                        let selectedWells = await this.selectedPlate.getSelectedWellsInOrder();
                        let index = 0;

                        for (let i = 0; i < selectedWells.length && index < parsedArray.length; i++) {
                            selectedWells[i].setValue(parsedArray[index++] + insertionText + selectedWells[i].getValue());
                        }
                    } else {
                        let parsedData = parseTableToArray(text);

                        for (let r of this.root) {
                            let selectedWells = await r.getSelectedWellsInOrder();
                            let numRows = parsedData.length;
                            let numCols = parsedData[0].length;
                            let index = 0;

                            for (let row = 0; row < numRows; row++) {
                                for (let col = 0; col < numCols; col++) {
                                    if (index < selectedWells.length) {
                                        const currentValue = selectedWells[index].getValue();
                                        const newValue = parsedData[row][col];
                                        selectedWells[index].setValue(newValue + insertionText + currentValue);
                                        index++;
                                    }
                                }
                            }
                        }
                    }
                } catch (exception) {
                    let lines = text.split('\n');

                    for (let r of this.root) {
                        let selectedWells = await r.getSelectedWellsInOrder();
                        let numLines = lines.length;

                        for (let i = 0; i < numLines; i++) {
                            if (i < selectedWells.length) {
                                selectedWells[i].setValue(lines[i]);
                            }
                        }
                    }
                }
            }

            selectWells(n) {
                for (let r of this.root) {
                    r.selectWells(n)
                }
            }
            applyValuesToPlateField(field, n) {
                for (let r of this.root) {
                    r.applyValuesToPlateField(field, n)
                }
            }

            getSelectedPlate() {
                return this.selectedPlate;
            }

            deselectAll() {
                this.pushState();

                this.selected_well = null;
                for (let r of this.root) {
                    r.deselectAll()
                }

            }

            isPositionOccupied(x, y, newPlate, existingPlates) {
                for (let plate of existingPlates) {

                    if (
                        x >= plate.grid.xi &&
                        x < plate.grid.xi + plate.grid.width &&
                        y >= plate.grid.yi &&
                        y < plate.grid.yi + plate.grid.height
                    ) {
                        return true;
                    }
                }

                return false;
            }

            findEmptyLocation(newPlate) {

                let existingPlates = this.selectedPlate.plates;

                const gridWidth = this.selectedPlate.grid.width;
                const gridHeight = this.selectedPlate.grid.height;

                for (let x = 0; x < gridWidth; x++) {
                    for (let y = 0; y < gridHeight; y++) {

                        if (!this.isPositionOccupied(x, y, newPlate, existingPlates)) {
                            return { x, y };
                        }
                    }
                }

                return null;
            }

            getCanvasDimensions() {
                return this.__canvas_width, this.__canvas_height
            }
            applyHeaders() {
                for (let i of this.root) {
                    i.applycolumnheaders()
                }

            }
            showTextEditor(c1) {

                for (let i of this.root) {
                    i.applycolumnheaders()
                }

                if (!c1) {
                    c1 = {
                        height: '500px',
                        width: '500px',
                        editorOptions: {
                            language: 'bajabio',

                            theme: 'no-border-theme',
                            minimap: { enabled: false },
                            scrollbar: {
                                vertical: 'hidden',
                                horizontal: 'hidden',
                            },
                            lineNumbers: 'off',
                            lineDecorationsWidth: 0,
                            lineNumbersMinChars: 0,
                            overviewRulerLanes: 0,
                            hideCursorInOverviewRuler: true,
                            folding: false,
                            highlightActiveIndentGuide: false,
                            renderLineHighlight: 'none',
                            renderLineHighlightOnlyWhenFocus: false,
                            renderWhitespace: 'none',
                            fontSize: 18,
                            automaticLayout: true,
                            padding: {
                                top: 20,
                                bottom: 20,
                                left: 30,
                                right: 30
                            }
                        },
                        objects: this.root,
                        keybinding: {
                            'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {

                            })
                        },
                        code: ``,
                        buttons: [
                            {
                                'label': ' Insert  ', 'color': 'black', action: (async () => {
                                    let activeContent = editor.code;
                                    let v = await exec('baja/plate/ops/frun-fun.js', activeContent.trim(), this);
                                    let index = 0;
                                    let r = v['results']
                                    let t = v['tags']
                                    for (let i of r) {
                                        if (selected_wells[index]) {
                                            if (!isNaN(i)) {
                                                selected_wells[index].value = parseFloat(i).toFixed(2)
                                            } else {
                                                selected_wells[index].value = i;
                                            } for (let tag of t) {
                                                selected_wells[index].setGroup(tag)
                                            }
                                        }
                                        index++;
                                        if (index >= selected_wells.length)
                                            break;
                                    }
                                }),
                            },
                            {
                                'label': 'Close', 'color': 'red', 'action': (() => {
                                    this.__canvas__.hideEditor();
                                }),
                            },

                        ]
                    }

                }
                return this.__canvas__.setEditor(c1);

            }

            addChildPlate(dim, name) {
                if (!this.selectedPlate) {
                    return;
                }
                let p;
                if (dim === 384) {
                    p = new Plate(name, 24, 16)
                } else {
                    p = new Plate(name, 12, 8)
                }
                p.grid.xi = 0;
                p.grid.yi = this.selectedPlate.grid.yi - 2;
                p.grid.width = 1;
                p.grid.height = 1;
                return p;
            }

            addTrackFunction(wb) {
                this.trackFunctions.push(wb)
            }

            async exec() {
                this.transferFunctions.sort((xia, xib) => { return (xib.y - xia.y) });
                for (let t of this.transferFunctions) {
                    if (!t.complete) {
                        await t.exec();
                        t.complete = true;
                    }
                }
            }

            async execTrackFunctions() {
                this.trackFunctions.sort((xia, xib) => { return (xib.y - xia.y) });
                for (let t of this.trackFunctions) {
                    await t.exec(this);
                    t.complete = true;
                }
            }

            executeFrom(plate) {
                this.transferFunctions.sort((xia, xib) => { return (xib.y - xia.y) });
                let tf = this.getTransferFunctions(plate);
                for (let t of tf) {
                    t.exec();
                }
            }

            setMode(mode) {
                this.mode = mode;
                if (this.mode === 'dilution') {
                    this.layoutTool = new DilutionTool(this);
                }
            }
            getLayoutTool() {
                return this.layoutTool;
            }
            getMode() {
                return this.mode;
            }
            select(scx, scy) {
                this.grid.rescale();
                let x = this.grid.Xwc(scx);
                let y = this.grid.Ywc(scy);
            }

            searchByUid(uid) {

                if (uid === this.uid) {
                    return this;
                }

                let results = [];
                let searchPlatesAndWells = (plates) => {
                    for (let plate of plates) {

                        if (plate.uid === uid) {
                            results.push({ type: 'plate', object: plate });
                        }

                        for (let row of plate.wells) {
                            for (let well of row) {
                                if (well && well.uid === uid) {
                                    results.push({ type: 'well', object: well, parent: plate.uid });
                                }
                            }
                        }

                        if (Array.isArray(plate.plates) && plate.plates.length > 0) {
                            searchPlatesAndWells(plate.plates);
                        }
                    }
                };

                let searchPlotsAndPoints = (plots) => {
                    for (let plot of plots) {

                        if (plot.uid === uid) {
                            results.push({ type: 'plot', object: plot });
                        }

                        for (let point of plot.scatterData.points) {
                            if (point.uid === uid) {
                                results.push({ type: 'point', object: point });
                            }
                        }
                    }
                };

                searchPlatesAndWells(this.root);
                searchPlotsAndPoints(this.m_plots);
                return results;
            }

            replace(newObject) {
                let uid = newObject.uid
                let results = [];
                let searchPlatesAndWells = (plates) => {
                    for (let plate of plates) {

                        if (plate.uid === uid) {
                            plate.buildFromJSON(newObject)
                        }

                        for (let row of plate.wells) {
                            for (let well of row) {
                                if (well && well.uid === uid) {
                                    plate.loadFromJSON(newObject)
                                }
                            }
                        }

                        if (Array.isArray(plate.plates) && plate.plates.length > 0) {
                            searchPlatesAndWells(plate.plates);
                        }
                    }
                };

                let searchPlotsAndPoints = (plots) => {
                    for (let plot of plots) {

                        if (plot.uid === uid) {

                        }

                        for (let point of plot.scatterData.points) {
                            if (point.uid === uid) {

                            }
                        }
                    }
                };

                searchPlatesAndWells(this.root);

                return results;
            }

            selectReference(ref) {
                for (let r of ref) {
                    let rs = this.searchByUid(r)

                    for (let object of rs) {
                        if (object['object'].selectIt) {
                            object['object'].selectIt();
                        }
                    }
                }
            }

            zoomIntoObject(uid) {
                let varray = this.searchByUid(uid)
                if (varray != null && varray.length > 0) {
                    let v = varray[0]
                    if (varray[0].type === 'well') {
                        let plateo = this.getPlateWithUID(v.parent)
                        plateo.gotoWell(uid, this)
                    }
                }
            }

            async checkForSelections() {
                for (let plot of this.m_plots) {
                    let sel = plot.getSelectedPoints();
                    for (let s of sel) {
                        if (s.ref) {
                            this.selectReference(s.ref)
                        }
                    }
                }
            }
            drawVerticalScrollbar(ctx) {
                let ymin = Infinity
                let ymax = -Infinity
                let xmin = Infinity
                let xmax = -Infinity

                const updateBounds = (y) => {
                    if (y < ymin) ymin = y;
                    if (y > ymax) ymax = y;
                };
                const updateXBounds = (x) => {
                    if (x < xmin) xmin = x;
                    if (x > xmax) xmax = x;
                };

                for (let plate of this.root) {
                    updateBounds(plate.grid.yi);
                    updateBounds(plate.grid.yi + plate.grid.height);
                    updateXBounds(plate.grid.xi);
                    updateXBounds(plate.grid.xi + plate.grid.width);
                }

                for (let tf of this.transferFunctions) {
                    updateBounds(tf.y);

                }

                for (let tf of this.trackFunctions) {
                    updateBounds(tf.y);
                }

                for (let conn of this.connections) {
                    updateBounds(conn.y);
                }

                for (let plot of this.m_plots) {
                    updateBounds(this.grid.Ywc(plot.grid.yi));
                    updateBounds(this.grid.Ywc(plot.grid.yi + plot.grid.height));
                    updateXBounds(this.grid.Xwc(plot.grid.xi));
                    updateXBounds(this.grid.Xwc(plot.grid.xi + plot.grid.width));

                }

                for (let glyph of this.glyphs) {
                    updateBounds(glyph.y);
                    updateXBounds(glyph.x);

                }

                this.minObjectY = ymin;
                this.maxObjectY = ymax;
                minObjectX = xmin;
                maxObjectX = xmax;

                scrollbarHeight = ctx.canvas.height;
                scrollbarX = ctx.canvas.width - scrollbarWidth - 2;
                scrollGrid.ymin = this.minObjectY
                scrollGrid.ymax = this.maxObjectY
                scrollGrid.height = scrollbarHeight;
                scrollGrid.xi = scrollbarX;
                scrollGrid.rescale();
                ctx.fillStyle = 'lightBlue';
                ctx.fillRect(scrollGrid.xi, scrollGrid.yi, scrollGrid.width, scrollGrid.height);
                ctx.fillStyle = 'darkGray';
                ctx.fillRect(scrollGrid.xi, scrollGrid.Y(scroll_y) - 10, scrollGrid.width, 20);
            }

            drawGrid(ctx, width, height) {
                ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
                ctx.lineWidth = 0.5;

                for (let x = 0; x <= width; x += 10) {
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, height);
                    ctx.stroke();
                }

                for (let y = 0; y <= height; y += 10) {
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(width, y);
                    ctx.stroke();
                }
            }

            drawNautilusShell(ctx, width, height) {
                const centerX = width / 2;
                const centerY = height / 2;

                const a = 10;
                const b = 0.2;

                ctx.strokeStyle = "rgba(10,10,50,0.08)";
                ctx.lineWidth = 1;
                ctx.clearRect(0, 0, width, height)
                ctx.beginPath();

                for (let theta = 0; theta < 10 * Math.PI; theta += 0.05) {
                    const r = a * Math.exp(b * theta);
                    const x = centerX + r * Math.cos(theta);
                    const y = centerY + r * Math.sin(theta);

                    if (theta === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }

                ctx.stroke();
            }

            drawTextBox(ctx, text, cursorPos, x, y, width, height, isSelected, style) {
                let styles = {
                    data: {
                        bgColor: 'lightCyan',
                        borderColor: 'purple',
                        textColor: 'yellow',
                        cursorColor: 'rgba(255,100,100,0.6)'
                    },
                    search: {
                        bgColor: isSelected ? 'rgba(255,255,150,0.9)' : 'rgba(255,255,100,0.9)',
                        borderColor: isSelected ? '#ffcc00' : '#999999',
                        textColor: isSelected ? '#333333' : '#888888',
                        cursorColor: 'rgba(255,100,100,0.6)'
                    }
                };

                let chosenStyle = styles[style] || styles.data;
                let bgColor = chosenStyle.bgColor;
                let borderColor = chosenStyle.borderColor;
                let textColor = chosenStyle.textColor;
                let cursorColor = chosenStyle.cursorColor;

                let radius = 10;
                ctx.shadowBlur = 10;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.fillStyle = bgColor;

                ctx.font = '16px Arial';
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                let textWidth = ctx.measureText(text).width;

                if (textWidth + 20 > width) {
                    width = textWidth + 20;
                }

                drawRoundedRect(ctx, x, y, width, height, radius);
                ctx.fill();

                ctx.shadowBlur = 0;
                ctx.lineWidth = 2;
                ctx.strokeStyle = borderColor;
                ctx.stroke();

                ctx.fillStyle = textColor;
                let textX = x + 10;
                let textY = y + height / 2;

                let canvasWidth = ctx.canvas.width;
                let canvasHeight = ctx.canvas.height;
                if (textX < 0) textX = 0;
                else if (textX + ctx.measureText(text).width > canvasWidth) {
                    textX = canvasWidth - ctx.measureText(text).width - 10;
                }
                if (textY < 0) textY = 0;
                else if (textY > canvasHeight) {
                    textY = canvasHeight - height / 2;
                }

                ctx.fillText(text, textX, textY);

                if (!isSelected && text && typeof text === 'string') {
                    let cursorX = textX + ctx.measureText(text.slice(0, cursorPos)).width;
                    ctx.beginPath();
                    ctx.moveTo(cursorX, textY - 10);
                    ctx.lineTo(cursorX, textY + 10);
                    ctx.lineWidth = 5;
                    ctx.strokeStyle = cursorColor;
                    ctx.stroke();
                    ctx.strokeStyle = borderColor;
                }

                ctx.shadowBlur = 0;
                ctx.lineWidth = 2;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 0;
            }

            isTextActive() {
                return textActive;
            }
            setTextActive(v) {
                textActive = v;
            }

            adjustOverlappedObjects() {
                let allDrawables = [...(this.root || []), ...(this.m_plots || [])]
                function isOverlapping(grid1, grid2) {
                    return !(grid1.xi + grid1.width <= grid2.xi ||
                        grid2.xi + grid2.width <= grid1.xi ||
                        grid1.yi + grid1.height <= grid2.yi ||
                        grid2.yi + grid2.height <= grid1.yi);
                }
                const isOverlappingP = (grid1, grid2) => {
                    return !(this.grid.Xwc(grid1.xi) + this.grid.worldWidth(grid1.width) <= grid2.xi ||
                        grid2.xi + grid2.width <= this.grid.Xwc(grid1.xi) ||
                        this.grid.Ywc(grid1.yi) + this.grid.worldHeight(grid1.height) <= grid2.yi ||
                        grid2.yi + grid2.height <= this.grid.Ywc(grid1.yi));
                }
                const isOverlappingPP = (grid1, grid2) => {
                    let grid1X = this.grid.Xwc(grid1.xi);
                    let grid1Width = this.grid.worldWidth(grid1.width);
                    let grid1Y = this.grid.Ywc(grid1.yi);
                    let grid1Height = this.grid.worldHeight(grid1.height);

                    let grid2X = this.grid.Xwc(grid2.xi);
                    let grid2Width = this.grid.worldWidth(grid2.width);
                    let grid2Y = this.grid.Ywc(grid2.yi);
                    let grid2Height = this.grid.worldHeight(grid2.height);

                    return !(
                        grid1X + grid1Width <= grid2X ||
                        grid2X + grid2Width <= grid1X ||
                        grid1Y + grid1Height <= grid2Y ||
                        grid2Y + grid2Height <= grid1Y
                    );
                };

                const getSeparationVectorP = (grid1, grid2) => {
                    let grid1X = this.grid.Xwc(grid1.xi);
                    let grid1Width = this.grid.worldWidth(grid1.width);
                    let grid1Y = this.grid.Ywc(grid1.yi);
                    let grid1Height = this.grid.worldHeight(grid1.height);

                    let dx1 = grid2.xi - (grid1X + grid1Width);
                    let dx2 = (grid2.xi + grid2.width) - grid1X;
                    let dy1 = grid2.yi - (grid1Y + grid1Height);
                    let dy2 = (grid2.yi + grid2.height) - grid1Y;

                    if (dx1 > 0 || dx2 < 0 || dy1 > 0 || dy2 < 0) {

                        return { x: 0, y: 0 };
                    }

                    let xOffset = Math.abs(dx1) < Math.abs(dx2) ? dx1 : dx2;
                    let yOffset = Math.abs(dy1) < Math.abs(dy2) ? dy1 : dy2;

                    return Math.abs(xOffset) < Math.abs(yOffset) ? { x: xOffset, y: 0 } : { x: 0, y: yOffset };
                };

                const isOverlappingPlot_plate = (plot_grid, grid2) => {
                    let grid1X = this.grid.Xwc(plot_grid.xi);
                    let grid1Width = this.grid.worldWidth(plot_grid.width);
                    let grid1Y = this.grid.Ywc(plot_grid.yi);
                    let grid1Height = this.grid.worldHeight(plot_grid.height);
                    let grid2X = (grid2.xi);
                    let grid2Width = (grid2.width);
                    let grid2Y = (grid2.yi);
                    let grid2Height = (grid2.height);
                    return !(
                        grid1X + grid1Width <= grid2X ||
                        grid2X + grid2Width <= grid1X ||
                        grid1Y + grid1Height <= grid2Y ||
                        grid2Y + grid2Height <= grid1Y
                    );
                }

                const getVectorPlot_plate = (grid1, grid2) => {
                    let grid1X = this.grid.Xwc(grid1.xi);
                    let grid1Width = this.grid.worldWidth(grid1.width);
                    let grid1Y = this.grid.Ywc(grid1.yi);
                    let grid1Height = this.grid.worldHeight(grid1.height);

                    let grid2X = (grid2.xi);
                    let grid2Width = (grid2.width);
                    let grid2Y = (grid2.yi);
                    let grid2Height = (grid2.height);

                    let dx1 = grid2X - (grid1X + grid1Width);
                    let dx2 = (grid2X + grid2Width) - grid1X;
                    let dy1 = grid2Y - (grid1Y + grid1Height);
                    let dy2 = (grid2Y + grid2Height) - grid1Y;

                    if (dx1 > 0 || dx2 < 0 || dy1 > 0 || dy2 < 0) {

                        return { x: 0, y: 0 };
                    }

                    let xOffset = Math.abs(dx1) < Math.abs(dx2) ? dx1 : dx2;
                    let yOffset = Math.abs(dy1) < Math.abs(dy2) ? dy1 : dy2;

                    return Math.abs(xOffset) < Math.abs(yOffset) ? { x: xOffset, y: 0 } : { x: 0, y: yOffset };
                };

                function getSeparationVector(grid1, grid2) {
                    let dx1 = grid2.xi - (grid1.xi + grid1.width);
                    let dx2 = (grid2.xi + grid2.width) - grid1.xi;
                    let dy1 = grid2.yi - (grid1.yi + grid1.height);
                    let dy2 = (grid2.yi + grid2.height) - grid1.yi;

                    let xOffset = Math.abs(dx1) < Math.abs(dx2) ? dx1 : dx2;
                    let yOffset = Math.abs(dy1) < Math.abs(dy2) ? dy1 : dy2;

                    if (Math.abs(xOffset) < Math.abs(yOffset)) {
                        return { x: xOffset, y: 0 };
                    } else {
                        return { x: 0, y: yOffset };
                    }
                }

                let maxIterations = allDrawables.length * 20;
                let iterations = 0;
                let adjusted = true;

                while (adjusted && iterations < maxIterations) {
                    adjusted = false;
                    iterations++;

                    for (let i = 0; i < allDrawables.length; i++) {
                        for (let j = 0; j < allDrawables.length; j++) {

                            if ((allDrawables[i].typeof && allDrawables[i].typeof === 'plot') ||
                                (allDrawables[j].typeof && allDrawables[j].typeof === 'plot')) {

                            } else {
                                if (i !== j && isOverlapping(allDrawables[i].grid, allDrawables[j].grid)) {
                                    let move = getSeparationVector(allDrawables[i].grid, allDrawables[j].grid);
                                    let objectA = allDrawables[i];
                                    let objectB = allDrawables[j];

                                    objectA.grid.xi += move.x / 2;

                                    objectB.grid.xi -= move.x / 2;

                                    if (objectA.x) objectA.x = objectA.grid.xi;
                                    if (objectA.y) objectA.y = objectA.grid.yi;
                                    if (objectB.x) objectB.x = objectB.grid.xi;
                                    if (objectB.y) objectB.y = objectB.grid.yi;

                                    adjusted = true;
                                }
                            }
                        }
                    }
                }
            }
            pindex = 0;

            getVisiblePlots() {
                return this.m_plots.filter(obj => {
                    const { xi, yi, width, height } = obj.grid;

                    return (
                        xi + width > 0 &&
                        yi + height > 0 &&
                        xi < this.grid.width &&
                        yi < this.grid.height
                    );
                });
            }

            draw(ctx) {
                this.pindex++;
                this.pindex = 0;
                if (!sharedObjectListeners || Object.keys(sharedObjectListeners).length === 0) {
                    if (this.owner === getUser()) {
                    }
                    sharedObjectListeners[this.uid] = (data) => {

                        const dstate = (data.state)
                        if (dstate.owner === getUser()) {
                            return;
                        }
                        let objects = this.searchByUid(dstate.uid)
                        if (objects && objects.length > 0) {
                            for (let object of objects) {
                                reconstituteObject(object.object, dstate)
                            }
                        }
                    }

                }

                if (ctx != null && ctx != undefined) {

                    ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
                    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

                    if (this.attr__showGrid)
                        this.drawGrid(ctx, ctx.canvas.width, ctx.canvas.height)

                    const now = Date.now();
                    if (!this._lastUpdateTime) {
                        this._lastUpdateTime = now;
                    }
                    if (now - this._lastUpdateTime >= 5000) {
                        this.updateCalculations();
                        this.updatePlots();
                        this._lastUpdateTime = now;

                        if (this.__not_connected) {
                            connectToSharedFolder(this.uid, getUser());
                            listenForObjectUpdate(this.uid, getUser(), (data) => {
                                for (let sl of Object.keys(sharedObjectListeners)) {
                                    sharedObjectListeners[sl](data)
                                }
                            });
                            this.__not_connected = false;
                        }
                    }

                    try {
                        if (this.attr__autoSave) {
                            if (!this._lastAutoSaveTime) {
                                this._lastAutoSaveTime = now;
                            }

                            if (now - this._lastAutoSaveTime >= 25000) {
                                this.savePT();
                                this._lastAutoSaveTime = now;
                            }
                        }

                        if (!this.owner) {
                            this.owner = getUser();
                        }
                    } catch (exception) {
                        console.log("Failed to update share status");
                    }

                    if (this.ptracks && this.ptracks.length > 0) {
                        const buttonDiameter = 24;
                        const buttonSpacing = 20;
                        const totalButtonWidth = buttonLabels.length * (buttonDiameter + buttonSpacing) - buttonSpacing;
                        const startX = (ctx.canvas.width - totalButtonWidth) / 2;
                        const buttonY = 5;

                        buttonLabels.forEach((label, index) => {
                            const buttonX = startX + index * (buttonDiameter + buttonSpacing);
                            const centerX = buttonX + buttonDiameter / 2;
                            const centerY = buttonY + buttonDiameter / 2;
                            const radius = buttonDiameter / 2;

                            ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
                            ctx.shadowBlur = 10;
                            ctx.shadowOffsetX = 3;
                            ctx.shadowOffsetY = 3;

                            ctx.shadowColor = "transparent";

                            ctx.fillStyle = "white";
                            ctx.beginPath();
                            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                            ctx.fill();

                            if (label === "Exit Folder" && arrowImgLoaded) {
                                const iconSize = 24;
                                const iconX = centerX - iconSize / 2;
                                const iconY = centerY - iconSize / 2;
                                ctx.drawImage(arrowImg, iconX, iconY, iconSize, iconSize);
                            } else if (label !== "Exit Folder") {
                                ctx.fillStyle = "#333";
                                ctx.font = "14px Arial";
                                ctx.textAlign = "center";
                                ctx.textBaseline = "middle";
                                ctx.fillText(label, centerX, centerY);
                            }

                            this.buttons.push({ label, x: buttonX, y: buttonY, width: buttonDiameter, height: buttonDiameter });
                        });

                        ctx.shadowColor = "transparent";
                    }

                    if (this.formulas && Object.keys(this.formulas).length > 0 && this.attr__drawFormulaConnections) {
                        let keys = Object.keys(this.formulas);
                        for (let k of keys) {
                            try {
                                const from = extractTableNames(k)[0];
                                const fromtable = this.getTableByName(from);
                                const tolist = extractTableNames(this.formulas[k]);
                                for (let t of tolist) {
                                    const totable = this.getTableByName(t);
                                    drawArrow(ctx, fromtable, totable, this.grid);
                                }
                            } catch (exception) {
                                console.log("Formula error " + exception);
                            }
                        }
                    }

                    this.grid.width = ctx.canvas.width;
                    this.grid.height = ctx.canvas.height;
                    this.grid.rescale();
                    this.checkForSelections();

                    ctx.fillStyle = "black";
                    ctx.strokeStyle = "rgba(169, 215, 253, 0.1)";
                    ctx.lineWidth = 1;

                    if (this.attr__displayEvents) {
                        const textList = LJScript.getEvents().slice(-10);
                        const numRows = textList.length;
                        const fontSize = 15;
                        const startY = this.grid.height / 6;
                        ctx.font = `${fontSize}px Arial`;
                        ctx.textAlign = "center";
                        ctx.fillStyle = "white";

                        for (let i = 0; i < textList.length; i++) {
                            let y = startY + i * fontSize * 1.2 + 300;
                            let alpha = getFadeAlpha(i, numRows);
                            ctx.fillStyle = `rgba(200, 200, 200, ${alpha})`;
                            ctx.fillText(textList[i], 150, y);
                        }
                    }

                    const drawObj = (obj) => {
                        if (obj.drawPlot) {
                            obj.drawPlot(this, ctx);
                        } else if (obj.draw) {
                            obj.draw(this, ctx);
                        }
                    };

                    const allObjects = [
                        ...this.root.slice().reverse(),
                        ...this.m_plots,
                        this.selectedPlate,
                        ...this.glyphs
                    ].filter(obj => obj);

                    allObjects.sort((a, b) => {
                        const aBg = a.isBackground ? 0 : 1;
                        const bBg = b.isBackground ? 0 : 1;
                        return aBg - bBg;
                    });

                    for (let obj of allObjects) {
                        drawObj(obj);
                    }
                    if (this.__stack && this.__stack.length > 0) {
                        if (!this.__stack_menu || !this.__stack_menu.draw) {
                            this.__stack = [];
                            this.__redostack = [];
                        } else {
                            this.__stack_menu.x = this.grid.Xwc(10);
                            this.__stack_menu.y = this.grid.Ywc(10);
                            this.__stack_menu.menu_width = 15;
                            this.__stack_menu.draw(ctx, this.grid);
                        }
                    }

                    if (this.__redostack && this.__redostack.length > 0) {
                        this.__redo_stack_menu.x = this.grid.Xwc(10);
                        if (this.__stack && this.__stack.length > 0) {
                            this.__redo_stack_menu.y = this.__stack_menu.y - this.grid.worldHeight(this.__stack_menu.mheight);
                            this.__redo_stack_menu.x = this.grid.Xwc(10);
                            this.__redo_stack_menu.menu_width = 15;
                            this.__redo_stack_menu.draw(ctx, this.grid);
                        }
                    }

                    if (this.menu_plate) {
                        this.menu_plate.x = this.grid.Xwc(10);
                        this.menu_plate.y = this.grid.Ywc(10);
                        this.menu_plate.draw(ctx, this.grid);
                    }

                    if (this.attr__displayBookMarks) {
                        this.buildBookmarkMenu();
                        this.__bookmark_menu.menu_width = 100;
                        this.__bookmark_menu.x = this.grid.Xwc(2);
                        this.__bookmark_menu.y = this.grid.Ywc(70);
                        this.__bookmark_menu.draw(ctx, this.grid);

                    } else
                        if (this.__tables_menu && this.__tables_menu.draw && this.attr__showTablesMenu) {
                            this.__tables_menu.list = this.generateTables();
                            this.__tables_menu.menu_width = 100;
                            this.__tables_menu.x = this.grid.Xwc(2);
                            this.__tables_menu.y = this.grid.Ywc(70);
                            this.__tables_menu.draw(ctx, this.grid);
                        } else if (this.attr__showTablesMenu) {
                            let m = this.generateTables();
                            let cols = Math.ceil(m.length / 10);
                            this.__tables_menu = new Menu(m, 0, 40, 'rgb(205, 255, 155)', 'navy', cols)
                            this.__tables_menu.menu_width = 100;
                            this.__tables_menu.x = this.grid.Xwc(2);
                            this.__tables_menu.y = this.grid.Ywc(70);
                            this.__tables_menu.draw(ctx, this.grid);

                        }

                    if (this.activePlot) {
                        this.activePlot.drawPlot(this.grid, ctx, this.activePlot.grid);
                    }

                    if (this.__msg) {
                        if (this.fade) {
                            ctx.fillStyle = `rgba(255,255,255,0.${this.fade})`;
                            ctx.fillRect(this.grid.xi, this.grid.yi, this.grid.width, this.grid.height);
                            this.fade--;
                        }
                        ctx.font = "25px Helvetica";
                        ctx.fillStyle = "navy";
                        ctx.shadowColor = "rgba(110, 110, 110, 0.5)";
                        ctx.shadowBlur = 10;
                        ctx.shadowOffsetX = 4;
                        ctx.shadowOffsetY = 4;
                        const msgX = ctx.canvas.width / 2 - ctx.measureText(this.__msg).width / 2;
                        const msgY = ctx.canvas.height / 2;
                        ctx.fillText(this.__msg, msgX, msgY);
                        ctx.shadowColor = "transparent";
                    }

                    if (this.__msgb) {
                        ctx.font = "12px Arial";
                        ctx.fillStyle = "black";
                        ctx.shadowColor = "transparent";
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        const msgX = 10;
                        const msgY = ctx.canvas.height / 2;
                        ctx.fillText(this.__msgb, msgX, msgY);
                        ctx.shadowColor = "transparent";
                    }
                    if (this.__msgc) {
                        ctx.font = "12px Arial";
                        ctx.fillStyle = "black";
                        ctx.shadowColor = "transparent";
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        const msgX = 10;
                        const msgY = ctx.canvas.height / 2 + 20;
                        ctx.fillText(this.__msgc, msgX, msgY);
                        ctx.shadowColor = "transparent";
                    }

                    if (this.menu && this.menu_vis) {
                        ctx.fillStyle = 'rgba(255,255,255,0.83)';
                        ctx.fillRect(this.grid.xi, this.grid.yi, this.grid.width, this.grid.height);
                        this.menu.draw(ctx, this.grid);
                    }

                    this.drawVerticalScrollbar(ctx);

                    if (textActive) {
                        ctx.fillStyle = 'rgba(255,255,255,0.83)';
                        ctx.fillRect(this.grid.xi, this.grid.yi, this.grid.width, this.grid.height);

                        const centerX = this.grid.xi + this.grid.width / 2;
                        const centerY = this.grid.yi + this.grid.height / 2;

                        const textBoxX = centerX - textBoxWidth / 2;
                        const textBoxY = centerY - textBoxHeight / 2;

                        this.drawTextBox(ctx, text, cursorPos, textBoxX, textBoxY, textBoxWidth,
                            textBoxHeight, selectText, textStyle);
                    }

                }
            }

            newTable(table_name) {
                this.unModal();
                text = table_name;
                textActive = true;
                initBox = true;
                cursorPos = text.length;
            }

            setMessage(_msg, msgType) {
                if (msgType === 1) {
                    this.__msgb = _msg;
                    setTimeout(() => {
                        this.__msgb = null;
                    }, 10000)

                }
                else if (msgType === 2) {
                    this.__msgc = _msg;
                    setTimeout(() => {
                        this.__msgc = null;
                    }, 15000)

                }
                else {
                    this.__msg = _msg;
                    this.fade = 7;
                    setTimeout(() => {
                        this.__msg = null;
                    }, 6000)
                }
            }

            removeFunction(pf) {

                let index = this.transferFunctions.indexOf(pf)
                if (index >= 0) {
                    this.transferFunctions.splice(index, 1);
                }
            }
            removeWBFunction(pf) {
                let index = this.trackFunctions.indexOf(pf)
                if (index >= 0) {
                    let wf = this.trackFunctions[index]
                    wf.removePlots()
                    this.trackFunctions.splice(index, 1);
                }
            }

            removePlate(plate) {
                this.setSelected(null);
                this.deselectAll();
                const index = this.root.indexOf(plate);
                if (index >= 0) {
                    this.root.splice(index, 1);
                } else {
                    for (let r of this.root) {
                        r.removePlate(plate)
                    }
                }

            }

            removeGlyphs(gl) {
                for (let g of gl) {
                    const index = this.glyphs.indexOf(g);
                    if (index >= 0) {
                        this.glyphs.splice(index, 1);
                    }
                }
            }

            removedDangelingConnections() {

                let remE = []
                for (let c of this.connections) {
                    if (!c.isValid(this)) {
                        remE.push(c)
                    }
                }
                for (let r of remE) {
                    this.removeConnection(r)
                }

            }

            removedDangelingFunctions() {
                let rfun = []
                for (let ft of this.transferFunctions) {
                    if (this.root.indexOf(ft.toPlate) < 0) {
                        rfun.push(ft);
                    }
                    else if (this.root.indexOf(ft.fromPlate) < 0) {
                        rfun.push(ft);
                    }
                }

                for (let r of rfun) {
                    let i = this.transferFunctions.indexOf(r);
                    this.transferFunctions.splice(i, 1)
                }
            }

            async savePT() {

                const graph = CurrentLayout.getStashed('graph')
                let gs = JSON.stringify(graph, function (key, value) {
                    if (key != null && key.toLowerCase().startsWith('_')) {
                        return null;
                    }
                    else
                        if (typeof value === 'object' && value !== null) {
                            if (Array.isArray(value) && value.every(elem => elem && typeof elem === 'object' && 'x' in elem && 'y' in elem)) {
                                return value;
                            } else if (value.x != null && value.y != null && !isNaN(key) && parseInt(key, 10).toString() === key) {
                                return value;
                            }
                            else {
                                return value;
                            }
                        }
                    return value;
                });

                let name = graph.folder;
                let binaryData = compressString(gs)
                const chunkSize = 0x8000;
                let stringData = '';
                for (let i = 0; i < binaryData.length; i += chunkSize) {
                    const chunk = binaryData.subarray(i, i + chunkSize);
                    stringData += String.fromCharCode.apply(null, chunk);
                }
                let currentPath = this.file;
                let host_ = window['env']['apiUrl']
                let jsonobj = {
                    "name": name,
                    "key": "user",
                    "type": "autosave",
                    "user": getUser(),
                    "spath": currentPath,
                    "value": stringData
                }
                console.log(" saving to " + currentPath)

            }

            alignPlates() {

                let plates = this.root;
                this.grid.rescale();
                let screenx = 0.5;
                for (let i = 0; i < plates.length; i++) {
                    for (let j = i + 1; j < plates.length; j++) {
                        const plate1 = plates[i];
                        const plate2 = plates[j];
                        if (plate1.overlapsWithX(plate2) && plate1.overlapsWithY(plate2)) {
                            const overlapAmount = (plate1.grid.xi + plate1.grid.width * 2) - plate2.grid.xi + screenx;
                            plate1.shiftX(overlapAmount);
                        }
                    }
                }

            }

        }
        return resolve(PlateTrack)
    })

}
