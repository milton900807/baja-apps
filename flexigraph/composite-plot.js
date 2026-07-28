function (MGrid) {

    return new Promise(async (resolve, reject) => {

        if (!MGrid)
            MGrid = await exec('flexigraph/grid')
        let Menu = await exec('flexigraph/menu')

        let ref;

        function stringToPattern(str, flags = '') {

            const escapedStr = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            return new RegExp(escapedStr, flags);
        }
        function getRandomColor() {

            const r = Math.floor(Math.random() * 256);
            const g = Math.floor(Math.random() * 256);
            const b = Math.floor(Math.random() * 256);
            const a = 1
            return `rgb(${r},${g},${b})`;
        }

        let CompositePlot = class CompositePlot {

            typeof = 'plot'

            composites = []

            tabHeight = 40;
            tabWidth = 40;
            aspectRatio = 0;
            highlightTab = null;
            config_script = {};
            grid;
            type = 'scatter'
            _highlight = true;
            x = 1000;
            y = 0;
            w = 1;
            h = 1;
            x_axis_label = ''
            y_axis_label = ''
            data = null;
            name = null;
            highlightPatterns = []
            layers = []
            mode = null;
            fitScaleToData = true;
            lineColor = 'lightGray'
            drawErrors = false;
            pointColor = getRandomColor()
            errorBarColor = 'gray';
            fitScaleToData = true;
            lineEquations = []
            showPointLabels = false;
            showTopMenuBar = true;
            backgroundColor = 'white';
            uid;
            fixed_ymin = null;
            fixed_ymax = null;
            fixed_xmin = null;
            fixed_xmax = null;
            last_touched = null;

            constructor(Grid) {
                this.uid = uuid();
                this.grid = Grid ? new Grid(this.x, this.y, this.w, this.h) : new MGrid(this.x, this.y, this.w, this.h);
                this.composites = [];
                if (Grid)
                    this.grid = new Grid(this.x, this.y, this.w, this.h);
                else
                    this.grid = new MGrid(this.x, this.y, this.w, this.h);
                this.grid.setInset(0, 0)
                this.tabHeight = 15;
                this.tabWidth = 20;
                this.tabGap = 0;

            }

            getLastTouched() {
                return this.last_touched;
            }

            addPlot(plot) {
                this.composites.push(plot);
            }

            findBounds() {

                let xmin = this.grid.xi;
                let xmax = this.grid.xi + (this.grid.width);
                let ymin = this.grid.yi + this.grid.height;
                let ymax = this.grid.yi;
                return { xmin, xmax, ymin, ymax };
            }

            setymax(ymax) {
                if (!this.fixed_ymax)
                    this.grid.ymax = ymax;
                else {
                    this.grid.ymax = this.fixed_ymax;
                }
                this.grid.rescale();
            }
            setxmax(xmax) {
                if (!this.fixed_xmax)
                    this.grid.xmax = xmax;
                else {
                    this.grid.xmax = this.fixed_xmax;
                }
                this.grid.rescale();

            }
            setxmin(xmin) {
                if (!this.fixed_xmin)
                    this.grid.xmin = xmin;
                else {
                    this.grid.xmin = this.fixed_xmin;
                }
                this.grid.rescale();

            }

            buildCurrentConfig() {

                this.config_script.plot = {
                    w: this.w,
                    h: this.h,
                    x: this.x,
                    y: this.y,
                    fitScaleToData: this.fitScaleToData
                };
                return this.config_script;

            }

            setymin(ymin) {
                if (!this.fixed_ymin)
                    this.grid.ymin = ymin;
                else
                    this.grid.ymin = this.fixed_ymin;
                this.grid.rescale();
            }

            highlight() {
                this.last_touched = new Date();
                this.composites.forEach(plot => plot.highlight());
                this._highlight = true;
            }

            unhighlight() {
                this._highlight = false;
                this.composites.forEach(plot => plot.unhighlight());
            }

            highlight_points(regex) {
                this.composites.forEach(plot => plot.highlight_points(regex));
            }

            deselectIt() {
                this.composites.forEach(plot => plot.deselectIt());
            }

            getSelectedPoints() {
                let selectedPoints = [];
                this.composites.forEach(plot => {
                    selectedPoints = selectedPoints.concat(plot.getSelectedPoints());
                });
                return selectedPoints;
            }

            append(newScatterData) {
                this.composites.forEach(plot => plot.append(newScatterData));
            }

            hideUnhighlighted() {
                this.composites.forEach(plot => plot.hideUnhighlighted());
            }

            showUnhighlighted() {
                this.composites.forEach(plot => plot.showUnhighlighted());
            }

            showAll() {
                this.composites.forEach(plot => plot.showAll());
            }

            lassoSelect(lassoPolygon, graph) {
                this.composites.forEach(plot => plot.lassoSelect(lassoPolygon, graph));
            }

            addLineEquation(line) {
                this.composites.forEach(plot => plot.addLineEquation(line));
            }

            sortAscending() {
                this.composites.forEach(plot => plot.sortAscending());
            }

            sortDescending() {
                this.composites.forEach(plot => plot.sortDescending());
            }

            plotLines(_grid, ctx) {
                this.composites.forEach(plot => plot.plotLines(_grid, ctx));
            }

            drawSTDVERROR = (graph, ctx) => {
                this.composites.forEach(plot => plot.drawSTDVERROR(graph, ctx));
            };
            drawWithErrorBars = (ctx, config) => {
                this.composites.forEach(plot => plot.drawWithErrorBars(ctx, config));
            }
            getGroupDimensions() {

                let xmin = 0;
                let xmax = -Infinity;
                let ymin = Infinity;
                let ymax = -Infinity;

                this.composites.forEach(obj => {
                    if (!obj.scatterData || !obj.scatterData.points) return;

                    const validPoints = obj.scatterData.points.filter(p => !isNaN(p.y));
                    if (validPoints.length === 0) {
                        console.warn("No valid points in this object to calculate dimensions.");
                        return;
                    }

                    xmax = Math.max(xmax, validPoints.length);

                    const currentYMin = Math.min(...validPoints.map(p => p.y));
                    const currentYMax = Math.max(...validPoints.map(p => p.y));

                    ymin = Math.min(ymin, currentYMin);
                    ymax = Math.max(ymax, currentYMax);
                });

                return { xmin, xmax, ymin, ymax };
            }

            plotBarChart(graph, ctx) {
                if (!this.grid || !this.grid.rescale) {
                    this.grid.xi = graph.X(this.x);
                    this.grid.yi = graph.Y(this.y);
                    let sw = graph.screenWidth(this.w)
                    this.grid = new MGrid(graph.X(this.x), graph.Y(this.y), sw, sw);
                    this.grid.rescale();
                } else {
                    const { xmin, xmax, ymin, ymax } = this.getGroupDimensions();

                    if (!this.fixed_xmax)
                        this.grid.setxmax(parseFloat(xmax));
                    else
                        this.grid.setxmax(parseFloat(this.fixed_xmax));

                    if (!this.fixed_ymax)
                        this.grid.setymax(parseFloat(ymax));
                    else
                        this.grid.setymax(parseFloat(this.fixed_ymax));

                    if (!this.fixed_xmin)
                        this.grid.setxmin(parseFloat(xmin));
                    else
                        this.grid.setxmin(parseFloat(this.fixed_xmin));

                    if (!this.fixed_ymin)
                        this.grid.setymin(parseFloat(ymin));
                    else
                        this.grid.setymin(parseFloat(this.fixed_ymin));
                    this.grid.rescale();
                    graph.rescale();

                    ctx.fillStyle = 'rgba(55, 55, 255, 0.3)';
                    ctx.lineWidth = 1;
                    ctx.shadowBlur = 20;

                    ctx.beginPath();

                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo((this.grid.X(xmin)), (this.grid.Y(ymin)));
                    ctx.lineTo((this.grid.X(xmin)), (this.grid.Y(ymax)));
                    ctx.stroke();
                    this.grid.xi = graph.X(this.x);
                    this.grid.yi = graph.Y(this.y);
                    let sw = graph.screenWidth(this.w)
                    if (this.aspectRatio === 1) {
                        this.grid.width = sw;
                        this.grid.height = sw;
                    } else {

                    }
                    this.grid.rescale();
                    this.drawAxisLabels(ctx, this.grid, this.x_axis_label, this.y_axis_label)
                    if (labels.length > 0 && !this.fixed_xmax)
                        this.grid.setxmax(labels.length)
                    this.grid.rescale();
                    if (this._highlight) {
                        const rectWidth = this.grid.width;
                        const rectHeight = this.grid.height;
                        const cornerSize = 20;
                        const rectX = this.grid.xi - cornerSize / 2;
                        const rectY = this.grid.yi - cornerSize / 2;

                        let radius = 10;
                        let centerX_crescent = graph.X(this.grid.xi + this.grid.width) + 10 - radius - 5;
                        let centerY_crescent = graph.Y(this.grid.yi) + 10 - radius - 5;
                        ctx.shadowBlur = 3;
                        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
                        ctx.shadowOffsetX = 4;
                        ctx.shadowOffsetY = 4;
                        ctx.beginPath();
                        ctx.arc(centerX_crescent, centerY_crescent, radius, 0, Math.PI * 2, false);
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                        ctx.fill();

                        ctx.beginPath();
                        ctx.arc(centerX_crescent + radius / 2, centerY_crescent, radius, 0, Math.PI * 2, false);
                        ctx.fillStyle = 'rgba(20, 20, 100, 0.3)';
                        ctx.fill();

                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;

                        ctx.shadowColor = "transparent";
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                    } else {
                        ctx.shadowBlur = 0;
                    }
                    ctx.font = "10px Arial";
                    this.composites.forEach(plot => plot.plotBarChart(graph, ctx));

                }
            }

            async toPNG(graph) {
                for (let plot of this.composites) {
                    await plot.toPNG(graph);
                }
            }

            drawTabs(ctx) {
                if (MGrid.GP) return;

                ctx.lineWidth = 1;

                const nameTabX = this.grid.xi;
                const optionsTabX = nameTabX + this.tabWidth + this.tabGap;
                const moveTabX = optionsTabX + this.tabWidth + this.tabGap;
                const tabY = this.grid.yi - this.tabHeight - 25;

                const drawTab = (x, color, highlight, text, icon) => {

                    ctx.fillStyle = highlight ? 'rgba(255, 255, 0, 1)' : color;
                    ctx.fillRect(x, tabY, this.tabWidth, this.tabHeight);
                    ctx.strokeStyle = 'black';
                    ctx.strokeRect(x, tabY, this.tabWidth, this.tabHeight);

                    if (text) {
                        ctx.fillStyle = 'black';
                        ctx.font = '16px Arial';
                        ctx.textAlign = 'center';
                        const textX = x + this.tabWidth / 2;
                        const textY = tabY + this.tabHeight / 2 + 6;
                        ctx.fillText(text, textX, textY);
                    }

                    if (icon && icon.draw) {
                        const iconX = x + this.tabWidth / 2 - 10;
                        const iconY = tabY + 5;
                        icon.draw(ctx, iconX, iconY, 20, 20);
                    }
                };

                const icons = {
                    move: {
                        draw: (ctx, x, y, width, height) => {
                            ctx.beginPath();
                            ctx.moveTo(x, y + height / 2);
                            ctx.lineTo(x + width / 2, y);
                            ctx.lineTo(x + width, y + height / 2);
                            ctx.lineTo(x + width / 2, y + height);
                            ctx.closePath();
                            ctx.fillStyle = 'black';
                            ctx.fill();
                        }
                    },
                    options: {
                        draw: (ctx, x, y, width, height) => {
                            ctx.fillStyle = 'black';
                            ctx.beginPath();
                            ctx.arc(x + width / 2, y + height / 2, 6, 0, 2 * Math.PI);
                            ctx.fill();
                        }
                    },
                    connect: {
                        draw: (ctx, x, y, width, height) => {
                            ctx.fillStyle = 'black';
                            ctx.fillRect(x + width / 4, y + height / 4, width / 2, height / 2);
                        }
                    }
                };

                ctx.textAlign = 'left';
            }
            isHighlighted() {
                return this._highlight;
            }

            async setExportListeners(bx, by, pt) {
                let m = this.getExportMenuList(pt)
                let smenu = new Menu(m, pt.grid.Xwc(bx - 5), pt.grid.Ywc(by + 10), 'lightGreen', 'black')
                let t = {
                    id: 'plot-export-menu',
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

            async handleKeyDown(scx, scy, plateTrack) {

            }

            async handleMouseOver(scx, scy, pt) {
                pt.grid.rescale();
                this.grid.rescale();
                if (this.inside(pt.grid, scx, scy)) {
                    const activeTab = this.isMouseInTab(scx, scy);
                    if (activeTab) {
                        if (activeTab === 'move') {
                            await this.setMoveListeners(pt)
                        } else
                            if (activeTab === 'options') {
                                await this.setOptionListeners(scx, scy, pt)
                            }
                            else
                                if (activeTab === 'export') {
                                    await this.setExportListeners(scx, scy, pt)
                                }
                    } else {

                    }
                }
            }
            async handleMouseDown(scx, scy, pt) {
                if (this.inside(pt.grid, scx, scy)) {
                    this.highlight();
                    const activeTab = this.isMouseInTab(scx, scy);
                    if (activeTab) {
                        if (activeTab === 'move') {
                            await this.setMoveListeners(pt)
                        }
                    } else {

                    }
                }
            }

            isMouseInTab(px, py) {
                this.highlightTab = null;
                const nameTabX = this.grid.xi;
                const optionsTabX = nameTabX + this.tabWidth + this.tabGap;
                const moveTabX = optionsTabX + this.tabWidth + this.tabGap;
                const tabY = this.grid.yi - this.tabHeight - 25;
                const isInMoveTab = px >= nameTabX && px <= (nameTabX + this.tabWidth) &&
                    py >= tabY && py <= (tabY + this.tabHeight + 20);
                const isInOptionsTab = px >= optionsTabX && px <= (optionsTabX + this.tabWidth) &&
                    py >= tabY && py <= (tabY + this.tabHeight + 20);
                const isInNameTab = px >= moveTabX && px <= (moveTabX + this.tabWidth) &&
                    py >= tabY && py <= (tabY + this.tabHeight + 20);

                if (isInNameTab) {
                    this.showMenuBar = true;
                    this.highlightTab = 'export'
                    return 'export';
                }
                if (isInOptionsTab) {
                    this.showMenuBar = true;

                    this.highlightTab = 'options'

                    return 'options';
                }
                if (isInMoveTab) {
                    this.showMenuBar = true;

                    this.highlightTab = 'move'
                    return 'move';
                }
                return null;
            }

            async setOptionListeners(bx, by, pt) {
                let m = this.getOptionsMenuList(pt)
                let smenu = new Menu(m, pt.grid.Xwc(bx - 5), pt.grid.Ywc(by + 10), 'lightBlue', 'black')
                let t = {
                    id: 'plate-options-menu',
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

            setWidth(w) {
                console.log(" width " + w)
                this.w = w;
            }
            setHeight(h) {
                console.log(" height  " + h)
                this.h = h;
            }

            getOptionsMenuList(pt) {
                let menuList = []
                ref;

                menuList.push(
                    {
                        label: `Title`,
                        click: async (scx, scy) => {

                            let va = await prompt("Name", ["Name"], { "Name": this.name }, 300, 300)
                            let m = va['Name']
                            if (m != null) {
                                this.name = m;
                            }

                        },
                        move: () => {
                        }
                    });

                if (this.showPointLabels) {
                    menuList.push(
                        {
                            label: `Hide point labels`,
                            click: async (scx, scy) => {
                                this.showPointLabels = false;
                            },
                            move: () => {
                            }
                        });
                } else {
                    menuList.push(
                        {
                            label: `Show point labels`,
                            click: async (scx, scy) => {

                                this.showPointLabels = true;

                            },
                            move: () => {
                            }
                        });

                }
                menuList.push(
                    {
                        label: `Delete`,
                        click: async (scx, scy) => {
                            let confirm = await exec('baja/lib/confirm.js', 'Delete this?', async () => {
                                pt.removePlot(this)
                                pt.wb(null)
                            })
                            showModal(confirm)

                        },
                        move: () => {
                        }
                    }); menuList.push(
                        {
                            label: `Show Script`,
                            click: async (scx, scy) => {

                                function objectToString(obj) {
                                    return Object.entries(obj)
                                        .map(([key, value]) => `${key}=${value}`)
                                        .join('\n');
                                }

                                let combined_config_script = ''
                                for (let ps of this.composites) {
                                    combined_config_script += ps.config_script + '\n\n'
                                }
                                let st = combined_config_script
                                if (!st) {
                                    st = ''
                                } else {
                                    st = objectToString(st)
                                }

                                let pm = CurrentLayout.getStashed('plate-track')
                                let canvas = CurrentLayout.getStashed('graph-canvas')
                                let t =
                                {
                                    height: '200px',
                                    editorOptions: {
                                        language: 'bajabio',
                                        value: st,
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
                                    objects: pm.plateTrack.root,
                                    keybinding: {
                                        'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {
                                        })
                                    },
                                    code: `x=\ny=\nx-label=\ny-label=\nerror=
        `,
                                    buttons: [{
                                        'label': 'Create plot', "color": 'blue', action: async () => {
                                            let code = canvas.textEditor.getContent();
                                            buildMultiplePlots(code);
                                            ref.hideEditor();

                                        }
                                    },

                                    {
                                        'label': 'Close', 'color': 'black', "action": () => {
                                            ref.hideEditor();
                                        }
                                    }

                                    ]
                                }

                                t.objects = pm.plateTrack.root;
                                ref = pt.showTextEditor(t);

                            },
                            move: () => {
                            }
                        });
                menuList.push(
                    {
                        label: `Background color`,
                        click: (scx, scy) => {

                            let sequence_input = {
                                wid: 'card',
                                "height": "500px",
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
                                                                                this.backgroundColor = `rgba(${_color["rgb"]['r']},${_color['rgb']['g']},${_color['rgb']['b']},${_color['rgb']['a']})`

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

                                                                    CurrentLayout.reset('mainPanel');
                                                                })
                                                            },
                                                            {
                                                                label: 'Save', ionFunction: createIonFunction(async () => {

                                                                    CurrentLayout.reset('mainPanel');
                                                                })
                                                            },
                                                        ]
                                                    }
                                                }
                                            }
                                        ]]
                                }
                            }
                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', sequence_input);

                        },
                        move: () => {
                        }
                    });

                menuList.push(
                    {
                        label: `Lasso Select`,
                        click: (scx, scy) => {

                            let lassoPolygon = [];
                            let isDrawing = false;
                            let lasso = {
                                id: 'lasso-select-table',
                                priority: true,
                                mouseMoveListener: (x, y) => {
                                    if (!isDrawing) return;
                                    lassoPolygon.push({ x: x, y: y });
                                },
                                mouseUpListener: (x, y) => {
                                    if (!isDrawing) {

                                        return;
                                    }

                                    isDrawing = false;
                                    lassoPolygon.push({ x: x, y: y });

                                    if (lassoPolygon.length > 1) {
                                        lassoPolygon.push({ x: lassoPolygon[0].x, y: lassoPolygon[0].y });
                                    }

                                    let scPolygon = lassoPolygon.map(point => {
                                        return {
                                            x: (point.x),
                                            y: (point.y)
                                        };
                                    });
                                    pt.lassoSelect(scPolygon, pt.grid);

                                    pt.wb(null)

                                },
                                mouseDownListener: (x, y) => {
                                    isDrawing = true;
                                    lassoPolygon = [{ x: x, y: y }];
                                },
                                draw: (grid, ctx) => {
                                    ctx.strokeStyle = 'black';
                                    ctx.lineWidth = 2;

                                    if (lassoPolygon && lassoPolygon.length > 0) {
                                        ctx.beginPath();
                                        ctx.moveTo((lassoPolygon[0].x), (lassoPolygon[0].y));
                                        for (let i = 1; i < lassoPolygon.length; i++) {
                                            let lx = (lassoPolygon[i].x);
                                            let ly = (lassoPolygon[i].y);
                                            ctx.lineTo(lx, ly);
                                        }
                                        if (!isDrawing)
                                            ctx.closePath();
                                        ctx.stroke();
                                    }
                                },
                                menuManager: null
                            }
                            pt.wb(lasso)

                        },
                        move: () => {
                        }
                    });

                menuList.push(
                    {
                        label: `X Axis labels`,
                        click: async (scx, scy) => {
                            let va = await prompt("Label", ["Label"], { "Label": this.labelX }, 300, 300)
                            let m = va['Label']
                            if (m != null) {
                                this.x_axis_label = m;
                            }
                        },
                        move: () => {
                        }
                    });
                menuList.push(
                    {
                        label: `Y Axis labels`,
                        click: async (scx, scy) => {
                            let va = await prompt("Label", ["Label"], { "Label": this.labelY }, 300, 300)
                            let m = va['Label']
                            if (m != null) {
                                this.y_axis_label = m;
                            }

                        },
                        move: () => {
                        }
                    });

                menuList.push(
                    {
                        label: `Sort...`,
                        click: async (scx, scy) => {

                            function sortScatterDataByY(scatterPlotData) {
                                scatterPlotData.points.sort((a, b) => a.y - b.y);
                            }
                            this.scatterData = sortScatterDataByY(this.scatterData)

                        },
                        move: () => {
                        }
                    });

                return menuList;

            }

            async setMoveListeners(pt) {
                let m = await exec('baja/plate/views/move-plot.js', pt, this)
                pt.updateworkbench({
                    id: 'plot-move',
                    priority: true,
                    mouseMoveListener: m.mouseMoveListener,
                    mouseUpListener: m.mouseUpListener,
                    mouseDownListener: m.mouseDownListener,
                    draw: m.draw,
                    menuManager: m.menuManager
                })
            }

            updateHighlightTab(px, py) {
                this.highlightTab = this.isMouseInTab(px, py);
            }

            showMenuBar(v) {
                this.showTopMenuBar = false;
            }

            toJSON() {
                return {
                };
            }

            toJSON() {
                return this.composites.map(plot => plot.toJSON());
            }

            drawPlot(graph, ctx, grid, fixed) {
                const { xmin, xmax, ymin, ymax } = this.getGroupDimensions();
                if (!this.fixed_xmax)
                    this.grid.setxmax(parseFloat(xmax));
                else
                    this.grid.setxmax(parseFloat(this.fixed_xmax));

                if (!this.fixed_ymax)
                    this.grid.setymax(parseFloat(ymax));
                else
                    this.grid.setymax(parseFloat(this.fixed_ymax));

                if (!this.fixed_xmin)
                    this.grid.setxmin(parseFloat(xmin));
                else
                    this.grid.setxmin(parseFloat(this.fixed_xmin));

                if (!this.fixed_ymin)
                    this.grid.setymin(parseFloat(ymin));
                else
                    this.grid.setymin(parseFloat(this.fixed_ymin));
                this.grid.rescale();
                let c = 'rgba(255,255,255,0.9)';
                if (this.backgroundColor) {
                    c = this.backgroundColor;
                }

                if (this._highlight) {
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = 'red'
                }
                ctx.fillStyle = 'black';
                ctx.fillRect(grid.xi - 70, grid.yi - 70, grid.width + 140, grid.height + 140);

                if (!grid || !grid.rescale) {
                    let sw = graph.screenWidth(this.w);
                    grid = new MGrid(graph.X(this.x), graph.Y(this.y), sw, sw);
                }
                ctx.shadowBlur = 0;
                if (this.showTopMenuBar) {
                    this.drawTabs(ctx);
                }
                ctx.textAlign = 'left';
                if (this._highlight) {
                    ctx.strokeStyle = 'gray';
                } else {
                    ctx.strokeStyle = 'lightGray';
                }

                if (this.showAxis) {
                    ctx.lineWidth = 3;
                    ctx.lineWidth = 3;
                    ctx.setLineDash([15, 6]);
                    ctx.strokeStyle = 'red';

                    ctx.beginPath();
                    ctx.moveTo((grid.X(xmin)), (grid.Y(ymin)));
                    ctx.lineTo((grid.X(xmax)), (grid.Y(ymin)));
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(grid.X(xmin), grid.Y(ymin));
                    ctx.lineTo(grid.xi, (grid.yi));
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(grid.X(xmin), grid.Y(ymin));
                    ctx.lineTo(grid.X(xmin), grid.Y(ymax));
                    ctx.stroke();
                    ctx.shadowBlur = 1;
                    ctx.lineWidth = 1;
                }

                ctx.setLineDash([]);
                ctx.shadowColor = 'black';
                ctx.strokeStyle = 'gray';
                ctx.beginPath();
                ctx.textAlign = 'left';

                if (this._highlight) {
                    const rectWidth = grid.width;
                    const rectHeight = grid.height;
                    const cornerSize = 15;
                    const rectX = grid.xi - cornerSize / 2;
                    const rectY = grid.yi - cornerSize / 2;
                    ctx.stroke();
                    ctx.fillStyle = "rgba(150,100,100,0.6)";
                    ctx.fillRect(rectX + rectWidth - cornerSize / 2, rectY + rectHeight - cornerSize / 2, cornerSize, cornerSize);
                    ctx.shadowBlur = 1;
                } else {
                    ctx.shadowBlur = 1;
                }
                if (grid.width > 100) {
                    const xminLabel = grid.xmin.toFixed(1);
                    const xmaxLabel = grid.xmax.toFixed(1);
                    const yminLabel = grid.ymin.toFixed(1);
                    const ymaxLabel = grid.ymax.toFixed(1);

                    ctx.shadowBlur = 0;
                    ctx.fillStyle = 'black';
                    ctx.font = "10px Arial";
                    if (this.name) ctx.fillText(`${this.name}`, grid.xi + (grid.width / 2), grid.yi - 15);

                    ctx.fillStyle = 'black';
                    ctx.font = "12px Arial";

                    ctx.fillText(`xmin: ${xminLabel}`, grid.X(xmin) + 5, grid.Y(ymin) + 15);
                    ctx.fillText(`xmax: ${xmaxLabel}`, grid.X(xmax) - 50, grid.Y(ymin) + 15);
                    ctx.fillText(`ymin: ${yminLabel}`, grid.X(xmin) + 5, grid.Y(ymin) - 5);
                    ctx.fillText(`ymax: ${ymaxLabel}`, grid.X(xmin) + 5, grid.Y(ymax) + 15);
                    ctx.stroke();
                }
                this.grid.rescale();
                this.composites.forEach(plot => {
                    plot.drawBackground = false;
                    plot._highlight = this._highlight;
                    plot.x = this.x; plot.y = this.y; plot.h =
                        this.h; plot.w = this.w;
                    plot.grid.xi = this.grid.xi;
                    plot.grid.xy = this.grid.xy;
                    plot.grid.width = this.grid.width;
                    plot.grid.height = this.grid.height;
                    plot.fixed_xmax = xmax; plot.fixed_xmin = xmin; plot.fixed_ymax = ymax;
                    plot.fixed_ymin = ymin; plot.fitScaleToData = this.fitScaleToData;
                    plot.drawPlot(graph, ctx, grid, fixed);
                });
            }

            async drawAxisTicks(ctx, _grid, minVal, maxVal) {
                const tickCount = 7;
                const range = maxVal - minVal;
                const tickInterval = range / tickCount;
                ctx.lineWidth = 0;
                ctx.shadowBlur = 0;

                for (let i = 0; i <= tickCount; i++) {
                    const value = minVal + i * tickInterval;
                    const position = _grid.Y(value);
                    const cxmin = _grid.X(_grid.xmin);

                    ctx.moveTo(cxmin, position);
                    ctx.lineTo(cxmin - 5, position);

                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    const text = (typeof value === 'number' && !isNaN(value))
                        ? value.toFixed(1)
                        : (parseFloat(value) ? parseFloat(value).toFixed(1) : 'N/A');

                    const textWidth = ctx.measureText(text).width;
                    const padding = 5;
                    const ovalWidth = textWidth + padding * 2;
                    const ovalHeight = 16;

                    const textX = cxmin - 12 - ovalWidth / 2;
                    const textY = position;

                    ctx.beginPath();
                    ctx.ellipse(textX, textY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                    ctx.fillStyle = 'white';
                    ctx.fill();

                    ctx.fillStyle = 'black';
                    ctx.fillText(text, textX, textY);
                }
                ctx.fillStyle = 'white';
                ctx.strokStyle = 'white';
                for (let plot of this.composites) {
                    await plot.drawAxisTicks(ctx, _grid, minVal, maxVal);
                }

            }

            async drawAxisLabels(ctx, grid, x_axis_label, y_axis_label) {
                const axisLabelFont = '13px Arial';
                const labelPadding = 40;
                const backgroundPadding = 10;
                if (grid.width > 100) {
                    if (y_axis_label) {
                        ctx.save();
                        ctx.translate((grid.xi) - labelPadding - 50, (grid.yi) + (grid.height / 5));
                        ctx.rotate(-Math.PI / 2);
                        ctx.textAlign = 'center';
                        ctx.font = axisLabelFont;

                        const textWidth = ctx.measureText(y_axis_label).width;
                        const textHeight = 26;
                        ctx.fillStyle = 'white';

                        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                        ctx.shadowBlur = 2;
                        ctx.fillStyle = 'black';
                        ctx.fillText(y_axis_label, 0, 0);
                        ctx.restore();
                    }

                    if (x_axis_label) {
                        ctx.textAlign = 'center';
                        grid.rescale();
                        const xTextWidth = ctx.measureText(x_axis_label).width;
                        ctx.fillStyle = 'white';

                        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                        ctx.shadowBlur = 3;
                        ctx.fillStyle = 'black';
                        ctx.font = axisLabelFont;
                        ctx.fillText(x_axis_label, grid.xi + grid.width / 2 - 10, grid.yi + grid.height + labelPadding);
                    }
                    await this.drawAxisTicks(ctx, grid, grid.ymin, grid.ymax, true);

                }
                for (let plot of this.composites) {
                    await plot.drawAxisLabels(ctx, grid, x_axis_label, y_axis_label);
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
                        scy > _scy - screen_height - 70) {
                        return true;
                    }
                }
                let value = this.isMouseInTab(x, y)
                if (value != null)
                    return true;
                else
                    return false;

            }

            inResize(mouseX, mouseY) {

                const rectWidth = Math.abs(this.grid.width);
                const rectHeight = Math.abs(this.grid.height);
                const rectX = this.grid.xi;
                const rectY = this.grid.yi;
                const cornerSize = 150;
                const cornerX = rectX + rectWidth - cornerSize / 2
                const cornerY = rectY + rectHeight - cornerSize / 2
                return (
                    mouseX >= cornerX &&
                    mouseX <= cornerX + cornerSize &&
                    mouseY >= cornerY &&
                    mouseY <= cornerY + cornerSize
                );
            }

            toJSON() {
                return {
                    uid: this.uid,
                    x: this.x,
                    y: this.y,
                    w: this.w,
                    h: this.h,
                    x_axis_label: this.x_axis_label,
                    y_axis_label: this.y_axis_label,
                    data: this.data,
                    name: this.name,
                    highlightPatterns: this.highlightPatterns,
                    mode: this.mode,
                    fitScaleToData: this.fitScaleToData,
                    lineColor: this.lineColor,
                    drawErrors: this.drawErrors,
                    pointColor: this.pointColor,
                    errorBarColor: this.errorBarColor,
                    lineEquations: this.lineEquations,
                    showPointLabels: this.showPointLabels,
                    showTopMenuBar: this.showTopMenuBar,
                    backgroundColor: this.backgroundColor,
                    fixed_ymin: this.fixed_ymin,
                    fixed_ymax: this.fixed_ymax,
                    fixed_xmin: this.fixed_xmin,
                    fixed_xmax: this.fixed_xmax,
                    composites: this.composites.map(plot => plot.toJSON())
                };
            }

            static buildFromJSON(data, Grid, MPlot) {
                const compositePlot = new CompositePlot(Grid);
                compositePlot.uid = data.uid;
                compositePlot.x = data.x;
                compositePlot.y = data.y;
                compositePlot.w = data.w;
                compositePlot.h = data.h;
                compositePlot.x_axis_label = data.x_axis_label;
                compositePlot.y_axis_label = data.y_axis_label;
                compositePlot.data = data.data;
                compositePlot.name = data.name;
                compositePlot.highlightPatterns = data.highlightPatterns;
                compositePlot.mode = data.mode;
                compositePlot.fitScaleToData = data.fitScaleToData;
                compositePlot.lineColor = data.lineColor;
                compositePlot.drawErrors = data.drawErrors;
                compositePlot.pointColor = data.pointColor;
                compositePlot.errorBarColor = data.errorBarColor;
                compositePlot.lineEquations = data.lineEquations;
                compositePlot.showPointLabels = data.showPointLabels;
                compositePlot.showTopMenuBar = data.showTopMenuBar;
                compositePlot.backgroundColor = data.backgroundColor;
                compositePlot.fixed_ymin = data.fixed_ymin;
                compositePlot.fixed_ymax = data.fixed_ymax;
                compositePlot.fixed_xmin = data.fixed_xmin;
                compositePlot.fixed_xmax = data.fixed_xmax;

                compositePlot.composites = []

                data.composites = data.composites.map(plotData => {
                    let plot = MPlot.fromJSON(plotData);
                    compositePlot.composites.push(plot)
                });

                return compositePlot;
            }

        };

        return resolve(CompositePlot)
    })
}
