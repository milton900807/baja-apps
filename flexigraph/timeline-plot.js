function (MGrid) {

    return new Promise(async (resolve, reject) => {
        if (!MGrid)
            MGrid = await exec('flexigraph/grid')
        let Menu = await exec('flexigraph/menu')
        let LogGrid = await exec('flexigraph/grid-with-logscales.js')
        let CompositePlot = await exec('flexigraph/composite-plot', MGrid)
        let smenu;

        const bsize = 25;
        let cursorVisible = true;
        let cursorPos = 0;
        let cursorBlinkInterval = 500;
        let selectText = false;
        let ___highlightButton

        let cdic;
        function drawRoundedRectShadow(ctx, x, y, width, height, radius) {
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
            ctx.fill();
        }
        function formatTimeLabel(x, xMin, xMax) {
            const isAllYears = Number.isInteger(xMin) && Number.isInteger(xMax);
            const range = xMax - xMin;

            if (isAllYears && range < 500) {
                const year = Math.floor(x);
                const fraction = x - year;

                const startOfYear = new Date(Date.UTC(year, 0, 1));
                const startOfNextYear = new Date(Date.UTC(year + 1, 0, 1));
                const interpolatedDate = new Date(startOfYear.getTime() + fraction * (startOfNextYear - startOfYear));

                if (fraction === 0) {
                    return year.toString();
                }

                if (range > 10) {
                    return interpolatedDate.toLocaleString('default', { month: 'short' });
                } else {
                    return interpolatedDate.toLocaleString('default', { month: 'short', year: 'numeric' });
                }
            }

            const date = new Date(x);
            const totalRange = xMax - xMin;

            if (totalRange > 10 * 365 * 24 * 60 * 60 * 1000) {
                return date.getFullYear().toString();
            }

            if (totalRange > 60 * 24 * 60 * 60 * 1000) {
                return `${date.toLocaleString('default', { month: 'short' })} ${date.getFullYear()}`;
            }

            if (totalRange > 24 * 60 * 60 * 1000) {
                return `${date.getMonth() + 1}/${date.getDate()}`;
            }

            if (totalRange > 60 * 60 * 1000) {
                return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
            }

            return `${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
        }

        const integerAxis = (ctx, _grid, minVal, maxVal) => {
            const tickCount = 5;
            const range = maxVal - minVal;
            const tickInterval = Math.round(range / tickCount);
            ctx.lineWidth = 0;
            ctx.shadowBlur = 0;

            for (let i = 0; i <= tickCount; i++) {
                const value = Math.round(minVal + i * tickInterval);
                const position = _grid.Y(value);
                const cxmin = _grid.X(_grid.xmin);

                ctx.moveTo(cxmin, position);
                ctx.lineTo(cxmin - 5, position);

                ctx.font = '12px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';

                let text = `${value}`;

                const textWidth = ctx.measureText(text).width;
                const padding = 5;
                const ovalWidth = textWidth + padding * 2;
                const ovalHeight = 16;

                const textX = cxmin - 30 - ovalWidth / 2;
                const textY = position;

                ctx.beginPath();
                ctx.ellipse(textX, textY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'white';
                ctx.fill();

                ctx.fillStyle = 'black';
                ctx.fillText(text, textX, textY);
            }
        };

        const dollarAxis = (ctx, _grid, minVal, maxVal) => {

            const formatCurrency = (value) => {
                if (typeof value === 'number' && !isNaN(value)) {
                    if (Math.abs(value) >= 1_000_000) {
                        return `$${(value / 1_000_000).toFixed(1)}M`;
                    } else if (Math.abs(value) >= 1_000) {
                        return `$${(value / 1_000).toFixed(1)}K`;
                    } else {
                        return `$${value.toFixed(2)}`;
                    }
                } else {
                    return 'N/A';
                }
            }
            const tickCount = 5;
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

                let text;
                if (typeof value === 'number' && !isNaN(value)) {
                    if (Math.abs(value) >= 1_000_000) {
                        text = `$${(value / 1_000_000).toFixed(1)}M`;
                    } else {
                        try {
                            text = formatCurrency(value)
                        } catch (exception) {

                        }
                    }
                } else {
                    text = 'N/A';
                }

                const textWidth = ctx.measureText(text).width;
                const padding = 5;
                const ovalWidth = textWidth + padding * 2;
                const ovalHeight = 16;

                const textX = cxmin - 30 - ovalWidth / 2;
                const textY = position;

                ctx.beginPath();
                ctx.ellipse(textX, textY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'white';
                ctx.fill();

                ctx.fillStyle = 'black';
                ctx.fillText(text, textX, textY);
            }
        }
        const percentAxis = (ctx, _grid, minVal, maxVal) => {
            const tickCount = 5;
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

                let text;
                if (typeof value === 'number' && !isNaN(value)) {
                    if (Math.abs(value) >= 1_000_000) {
                        text = `${(value / 1_000_000).toFixed(1)}M%`;
                    } else if (Math.abs(value) >= 1_000) {
                        text = `${(value / 1_000).toFixed(1)}K%`;
                    } else {
                        text = `${value.toFixed(1)}%`;
                    }
                } else {
                    text = 'N/A';
                }

                const textWidth = ctx.measureText(text).width;
                const padding = 5;
                const ovalWidth = textWidth + padding * 2;
                const ovalHeight = 16;

                const textX = cxmin - 30 - ovalWidth / 2;
                const textY = position;

                ctx.beginPath();
                ctx.ellipse(textX, textY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'white';
                ctx.fill();

                ctx.fillStyle = 'black';
                ctx.fillText(text, textX, textY);
            }
        };

        const thousandsAxis = (ctx, _grid, minVal, maxVal) => {
            const tickCount = 5;
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

                let text;
                if (typeof value === 'number' && !isNaN(value)) {
                    if (Math.abs(value) >= 1_000) {
                        text = `${(value / 1_000).toFixed(1)}K`;
                    } else {
                        text = `${value.toFixed(1)}`;
                    }
                } else {
                    text = 'N/A';
                }

                const textWidth = ctx.measureText(text).width;
                const padding = 5;
                const ovalWidth = textWidth + padding * 2;
                const ovalHeight = 16;

                const textX = cxmin - 30 - ovalWidth / 2;
                const textY = position;

                ctx.beginPath();
                ctx.ellipse(textX, textY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                ctx.fillStyle = 'white';
                ctx.fill();

                ctx.fillStyle = 'black';
                ctx.fillText(text, textX, textY);
            }
        };

        function linearRegression(allScatterData) {
            const points = allScatterData.points;
            if (points.length === 0) {
                throw new Error("The points array is empty.");
            }
            const x = points.map(point => point.x);
            const y = points.map(point => point.y);
            const n = points.length;
            const sumX = x.reduce((sum, xi) => sum + xi, 0);
            const sumY = y.reduce((sum, yi) => sum + yi, 0);
            const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
            const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
            const meanX = sumX / n;
            const meanY = sumY / n;
            const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
            const intercept = meanY - slope * meanX;
            const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
            const ssResidual = points.reduce(
                (sum, point) => sum + Math.pow(point.y - (slope * point.x + intercept), 2),
                0
            );
            const rSquared = 1 - ssResidual / ssTotal;

            return { slope, intercept, rSquared };
        }
        function analyzePoints(allScatterData) {
            const points = allScatterData.points;

            const xValues = points.map(point => parseFloat(point.x));
            const areAllFloats = xValues.every(value => !isNaN(value));

            if (areAllFloats) {

                const xmin = Math.min(...xValues);
                const xmax = Math.max(...xValues);
                return { xmin, xmax };
            } else {

                const areAllStrings = points.every(point => typeof point.x === "string");
                if (areAllStrings) {

                    const xmin = 0;
                    const xmax = points.length;
                    return { xmin, xmax };
                } else {
                    console.log("x values must all be either castable to floats or strings.");
                    const xmin = 0;
                    const xmax = points.length;
                    return { xmin, xmax };

                }
            }
        }

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

        let parseInput = (inputString) => {
            const parsedObj = {};
            const lines = inputString.trim().split('\n');
            lines.forEach(line => {
                const [key, value] = line.split('=');
                if (key !== undefined && value !== undefined) {
                    parsedObj[key.trim()] = value.trim();
                } else {
                    console.warn(`Invalid line format: ${line}`);
                }
            });

            return parsedObj;
        }
        let highlightTab = null;
        let ref;

        const scatter = 'scatter';
        const barchart = 'barchart'
        const pie = 'pie'
        const timeline = 'timeline';

        let MTimelinePlot = class MTimelinePlot {

            __date;
            __scx_;
            __scy_;

            typeof = 'plot'
            tabHeight = 40;
            tabWidth = 40;
            aspectRatio = 0;
            config_script = {};
            grid;
            resizing = false;
            scaleType = null;
            type = 'timeline'
            _highlight = true;
            x = 1000;
            y = 0;
            w = 1;
            h = 1;
            x_axis_label = ''
            y_axis_label = ''
            data = null;
            name = '';
            highlightPatterns = []
            layers = []
            mode = null;
            fitScaleToData = true;
            lineColor = 'lightGray'
            drawErrors = false;
            pointColor = getRandomColor()
            errorBarColor = 'gray';

            lineEquations = []
            showPointLabels = false;
            showTopMenuBar = true;
            backgroundColor = 'white';
            uid;
            drawBackground = true;
            last_touched = -Infinity;
            code = null;
            broken = false;
            __resizing = false;
            __moving = false;
            margin = { top: 35, right: 0, bottom: 0, left: 0 };
            showEquation = true;
            sigmoid = null;
            progress = null;
            formatAxis = null;

            buttons = [
                {
                    name: "minimize", x: 0 + bsize, y: 10, width: 20, height: 20, action: async (bx, by, x, y, pt) => { return this.createMinimizedMenu(bx, by, x, y, pt) },
                    highlight: async (bx, by, x, y, pt) => { return await this.highlightButton('minimize') }, color: 'lightcyan'
                },
                {
                    name: "close", x: 0 + bsize, y: 10, width: 20, height: 20, action: async (bx, by, x, y, pt) => { return await this.test_menu(bx, by, x, y, pt) },
                    highlight: async () => { return await this.highlightButton("close") }, color: 'lightcyan'
                },

            ];

            constructor(scatterData, Grid) {
                this.uid = uuid()
                this.scatterData = scatterData;
                this.name = generateNautName();
                if (Grid)
                    this.grid = new Grid(this.x, this.y, this.w, this.h);
                else
                    this.grid = new MGrid(this.x, this.y, this.w, this.h);
                this.grid.setInset(40, 40)
                this.tabWidth = 20;
                this.tabGap = 5;
                this.margin = { top: 50, right: 60, bottom: 50, left: 60 };
            }

            async dev_null(bx, by, mmx, mmy) {
                highlightTab = null;

            }
            async highlightButton(name) {
                highlightTab = name;
            }

            createMinimizedMenu(bx, by, x, y, pt) {

                let m = [
                    {
                        label: 'Hide rows',
                        click: async (x, y) => {
                        },
                        move: () => {
                        },
                    },
                    {
                        label: 'Top 10',
                        click: async (x, y) => {
                        },
                        move: () => {
                        },
                    },
                    {
                        label: 'Bottom 10',
                        click: async (x, y) => {
                        },
                        move: () => {
                        },
                    },
                    {
                        label: 'Set rows...',
                        click: async (x, y) => {
                        },
                        move: () => {
                        },
                    },
                ]

                m.unshift({
                    label: 'Show all rows',
                    click: async (x, y) => {
                    },
                    move: () => {
                    },
                },
                )
                smenu = new Menu(m, pt.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200), pt.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * m.length / 2), 'rgb(205, 255, 155)', 'navy', 2)

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
                    if (smenu)
                        smenu.draw(ctx, grid)
                }
                t.mouseDownListener = (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {

                    }
                }
                t.close = () => {
                    smenu = null;
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

            showYAxisTickOptions(pt) {
                let ml = []

                ml.push({
                    label: `Floating points`,
                    click: (xwc, ywc) => {
                        this.formatAxis = null;
                    },
                    bg: 'orange',
                    fg: 'black'

                })

                ml.push({
                    label: `Integer`,
                    click: (xwc, ywc) => {
                        this.formatAxis = integerAxis;
                    },
                    bg: 'orange',
                    fg: 'black'

                })
                ml.push({
                    label: `$Millions`,
                    click: (xwc, ywc) => {
                        this.formatAxis = dollarAxis;
                    },
                    bg: 'orange',
                    fg: 'black'

                })
                ml.push({
                    label: `$Thousands`,
                    click: async (xwc, ywc) => {

                        this.formatAxis = thousandsAxis;

                    },
                    bg: 'orange',
                    fg: 'black'
                })

                ml.push({
                    label: `Percent`,
                    click: async (xwc, ywc) => {

                        this.formatAxis = percentAxis;

                    },
                    bg: 'orange',
                    fg: 'black'
                })
                let cols = Math.ceil(ml.length / 20);
                pt.menu = new Menu(ml, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * ml.length / 2), 'rgb(205, 255, 155)', 'navy', cols)
                pt.menu_vis = true;
            }

            isModal() {
                if (smenu) {
                    return true;
                }
                if (this.__moving) {
                    return true;
                }
                if (this.__resizing) {
                    return true;
                }
                return false;
            }

            highlight() {
                this._highlight = true;
                this.showTopMenuBar = true;
                this.resizing = false;

            }

            unhighlight() {
                this._highlight = false;
                this.showTopMenuBar = false;
                this.resizing = false;
            }

            highlight_points(regex) {

            }
            deselectIt() {

                this.unhighlight();
            }

            getLastTouched() {
                return this.last_touched;
            }

            deselectPoints() {
                this.scatterData.points.forEach(point => {
                    point.isSelected = false;
                });
            }

            getSelectedPoints() {
                let sel = []
                this.scatterData.points.forEach(point => {
                    if (point.isSelected) {
                        sel.push(point)
                    }
                });
                return sel;
            }

            colorSelectedPoints(color) {
                this.scatterData.points.forEach(point => {
                    if (point.isSelected) {
                        point.color = color;
                    }
                });

            }

            append(newScatterData) {
                if (newScatterData && newScatterData.points) {
                    this.scatterData.points = this.scatterData.points.concat(newScatterData.points);
                }
            }

            findBounds() {

                let xmin = this.grid.xi;
                let xmax = this.grid.xi + (this.grid.width);
                let ymin = this.grid.yi + this.grid.height;
                let ymax = this.grid.yi;

                return { xmin, xmax, ymin, ymax };
            }

            hideUnhighlighted() {
                this.hide_unhighlighted = true;
            }

            showUnhighlighted() {

                this.hide_unhighlighted = false;
            }

            showAll() {
                this.hide_unhighlighted = false;
            }
            lassoSelect(lassoPolygon, graph) {
                let isPointInPolygon = (point, polygon) => {
                    let inside = false;
                    const x = (this.grid.X((point.x)));
                    const y = (this.grid.Y((point.y)));
                    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                        const xi = polygon[i].x, yi = polygon[i].y;
                        const xj = polygon[j].x, yj = polygon[j].y;
                        const intersect = ((yi > y) !== (yj > y)) &&
                            (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                        if (intersect) inside = !inside;
                    }
                    return inside;

                }
                this.scatterData.points.forEach(point => {
                    if (isPointInPolygon(point, lassoPolygon)) {
                        point.isSelected = true;
                    } else {
                        point.isSelected = false;
                    }
                });

            }

            setymax(ymax) {
                this.grid.setymax(ymax);
                this.fitScaleToData = false;
            }
            setxmax(xmax) {
                this.grid.setxmax(xmax);
                this.fitScaleToData = false;
            }
            setxmin(xmin) {
                this.grid.setxmin(xmin)
                this.fitScaleToData = false;
            }

            setymin(ymin) {
                this.grid.setymin(ymin)
                this.fitScaleToData = false;

            }
            addLineEquation(line) {
                this.lineEquations.push(line);
            }
            sortAscending() {
                this.scatterData.points.sort((a, b) => a.y - b.y);

                this.scatterData.points.forEach((point, index) => {
                    point.x = index;
                });
            }

            sortDescending() {
                this.scatterData.points.sort((a, b) => b.y - a.y);

                this.scatterData.points.forEach((point, index) => {
                    point.x = index;
                });
            }

            plotLines(_grid, ctx) {
                if (this.fitScaleToData) {
                    const xmin = Math.min(...this.scatterData.points.map(p => p.x));
                    const xmax = Math.max(...this.scatterData.points.map(p => p.x));
                    const ymin = Math.min(...this.scatterData.points.map(p => p.y));
                    const ymax = Math.max(...this.scatterData.points.map(p => p.y));
                    _grid.zoom(xmin, xmax, ymin, ymax);
                    _grid.rescale();
                }

                let globalYMin = Infinity;
                let globalYMax = -Infinity;
                let equationsText = "";
                const labelOffsetY = 1;
                let labelYPositions = [];

                this.drawScatter(_grid, ctx)

                this.lineEquations.forEach((line, index) => {
                    const { slope, intercept, label, color, rSquared } = line;

                    if (slope != null && intercept != null) {
                        const xMin = _grid.xmin;
                        const xMax = _grid.xmax;
                        const yMin = slope * xMin + intercept;
                        const yMax = slope * xMax + intercept;

                        globalYMin = Math.min(globalYMin, yMin, yMax);
                        globalYMax = Math.max(globalYMax, yMin, yMax);

                        const xScreenMin = _grid.X(xMin);
                        const yScreenMin = _grid.Y(yMin);
                        const xScreenMax = _grid.X(xMax);
                        const yScreenMax = _grid.Y(yMax);

                        if (rSquared != null) {
                            const parsedRSquared = typeof rSquared === 'string' ? parseFloat(rSquared) : rSquared;

                            ctx.beginPath();
                            ctx.moveTo(xScreenMin, yScreenMin);
                            ctx.lineTo(xScreenMax, yScreenMax);
                            ctx.strokeStyle = color || 'black';
                            ctx.lineWidth = 2;
                            ctx.stroke();

                            const labelX = (xScreenMin + xScreenMax) / 2;
                            let labelY = (yScreenMin + yScreenMax) / 2 + 20;
                            while (labelYPositions.some(pos => Math.abs(labelY - pos) < labelOffsetY)) {
                                labelY -= labelOffsetY;
                            }
                            labelYPositions.push(labelY);
                            const rSquaredText = ` (R²: ${parsedRSquared.toFixed(2)})`;
                            ctx.font = '12px Arial';
                            ctx.shadowBlur = 0;
                            ctx.shadowColor = 'lightGray';

                            if (this.showEquation) {
                                ctx.fillText(`${label}${rSquaredText}`, labelX + 5, labelY - 5);
                            }

                            ctx.lineWidth = 1;
                            ctx.shadowBlur = 0;
                            equationsText += `${label} y = ${slope.toFixed(2)}x + ${intercept.toFixed(2)}\n`;
                        }

                    } else if (line.mfunction) {
                        try {
                            line.mfunction(_grid, ctx, line.data);
                        } catch (exception) {
                            console.log(' --> ' + exception);
                        }
                    }
                });

                if (this.type === 'line') {
                    _grid.setymin(globalYMin);
                    _grid.setymax(globalYMax + 0.1 * globalYMax);
                    _grid.rescale();
                }

                if (this.showEquation) {
                    ctx.fillStyle = 'black';
                    ctx.font = '15px Arial';
                    const lineHeight = 20;
                    equationsText.split("\n").forEach((equation, i) => {
                        ctx.fillText(equation, (_grid.xi) + 250, (_grid.yi) + i * lineHeight + Math.floor(_grid.height / 2));
                    });
                }
            }

            solveForY(xValue) {
                if (!this.lineEquations || !Array.isArray(this.lineEquations)) {
                    throw new Error("lineEquations must be defined and an array.");
                }

                const results = [];

                this.lineEquations.forEach(line => {
                    const { slope, intercept } = line;

                    const y = slope * xValue + intercept;
                    results.push({ line, y });
                });

                return results;
            }
            solveForX(yValue) {
                if (!this.lineEquations || !Array.isArray(this.lineEquations)) {
                    throw new Error("lineEquations must be defined and an array.");
                }

                const results = [];

                this.lineEquations.forEach(line => {
                    const { mfunction } = line;
                    if (mfunction) {
                        return mfunction(this.grid)
                    } else {
                        const { slope, intercept } = line;
                        if (slope !== 0) {
                            const x = (yValue - intercept) / slope;
                            results.push({ line, x });
                        } else {
                            results.push({ line, x: null, error: "Horizontal line - no unique x for given y" });
                        }
                    }
                });

                return results;
            }

            drawSTDVERROR = (graph, ctx) => {
                if (!this.scatterData || !this.scatterData.points || this.scatterData.points.length === 0) {
                    return;
                }
                const barWidth = 20;
                this.scatterData.points.forEach(point => {
                    const xScreen = graph.X(this.grid.X(point.x));
                    const yScreen = graph.Y(this.grid.Y(point.y)) + graph.Y(this.grid.Y(point["stdDev"]));
                    ctx.fillStyle = point.pointColor || 'navy';
                    ctx.fillRect(xScreen - barWidth / 2, yScreen, barWidth, this.grid.Y(point.y) - yScreen);
                    const error = point['stdDev'];
                    const upperError = graph.Y(this.grid.Y(point['stdDev'] + error)) + graph.Y(this.grid.Y(point.y));
                    const lowerError = yScreen;
                    ctx.strokeStyle = this.errorBarColor || 'gray';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(xScreen, upperError);
                    ctx.lineTo(xScreen, lowerError);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(xScreen - 5, upperError);
                    ctx.lineTo(xScreen + 5, upperError);
                    ctx.stroke();
                });
            };
            drawWithErrorBars = (ctx, config) => {

                if (!this.scatterData || !this.scatterData.points || this.scatterData.points.length === 0) {
                    return;
                }

                const { errorBarXKey, errorBarYKey, errorBarKey } = config;

                this.scatterData.points.forEach(point => {
                    const xScreen = this.grid.X(point[errorBarXKey]);
                    const yScreen = this.grid.Y(point[errorBarYKey]);

                    ctx.fillStyle = this.pointColor || 'red';
                    ctx.beginPath();
                    ctx.arc(xScreen, yScreen, 3, 0, 2 * Math.PI);
                    ctx.fill();

                    const error = point[errorBarKey];
                    const upperError = this.grid.Y(point[errorBarYKey] + error);
                    const lowerError = this.grid.Y(point[errorBarYKey] - error);

                    ctx.strokeStyle = this.errorBarColor || 'gray';
                    ctx.lineWidth = 1;
                    ctx.beginPath();

                    ctx.moveTo(xScreen, upperError);
                    ctx.lineTo(xScreen, lowerError);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(xScreen - 5, upperError);
                    ctx.lineTo(xScreen + 5, upperError);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(xScreen - 5, lowerError);
                    ctx.lineTo(xScreen + 5, lowerError);
                    ctx.stroke();
                })
            }

            plotAggregatedBarChartWithErrors(graph, ctx) {
                let xmin = Infinity;
                let xmax = -Infinity;
                let ymin = Infinity;
                let ymax = -Infinity;
                if (!this.grid || !this.grid.rescale) {
                    this.grid.xi = graph.X(this.x);
                    this.grid.yi = graph.Y(this.y);
                    let sw = graph.screenWidth(this.w)
                    this.grid = new MGrid(graph.X(this.x), graph.Y(this.y), sw, sw);
                    this.scatterData.points.forEach(point => {
                        const xValue = point.x;
                        const yValue = point.y;
                        const stdDev = point.stdDev;
                        if (typeof xValue === 'number') {
                            xmin = Math.min(xmin, xValue);
                            xmax = Math.max(xmax, xValue);
                        }
                        ymin = Math.min(ymin, yValue - stdDev);
                        ymax = Math.max(ymax, yValue + stdDev);
                    });
                    if (xmin === Infinity || xmax === -Infinity) {
                        return;
                    }
                    if (ymin === Infinity || ymax === -Infinity) {
                        return;
                    }

                    this.grid.zoom(xmin, xmax, ymin, ymax);
                    this.grid.rescale();
                } else {
                    graph.rescale();
                    this.scatterData.points.forEach(point => {
                        const xValue = point.x;
                        const yValue = point.y;
                        const stdDev = point.stdDev;
                        if (typeof xValue === 'number') {
                            xmin = Math.min(xmin, xValue);
                            xmax = Math.max(xmax, xValue);
                        }
                        ymin = Math.min(ymin, yValue - stdDev);
                        ymax = Math.max(ymax, yValue + stdDev);
                    });
                    if (xmin === Infinity || xmax === -Infinity) {
                        return;
                    }
                    if (ymin === Infinity || ymax === -Infinity) {
                        return;
                    }

                    this.grid.rescale();
                    ctx.fillStyle = 'rgba(55, 55, 255, 0.3)';
                    ctx.lineWidth = 1;
                    ctx.shadowBlur = 20;
                    ctx.beginPath();
                    ctx.moveTo((this.grid.X(this.grid.xmin)) - 2, (this.grid.Y(this.grid.ymin)));
                    ctx.lineTo((this.grid.X(this.grid.xmin)) - 2, (this.grid.Y(this.grid.ymax)));
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
                        ctx.shadowBlur = 0;
                        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
                        ctx.shadowOffsetX = 4;
                        ctx.shadowOffsetY = 4;
                        ctx.beginPath();
                        ctx.arc(centerX_crescent, centerY_crescent, radius, 0, Math.PI * 2, false);
                        ctx.fillStyle = 'rgba(255, 55, 55, 0.3)';
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
                }
                ctx.font = "10px Arial";

                const barWidth = (this.grid.width) / (this.scatterData.length * 3);
                this.scatterData.forEach((point, index) => {
                    const xScreen = this.grid.X(index);
                    const yScreen = this.grid.Y(point.y);

                    ctx.fillStyle = 'rgb(0, 87, 163)';
                    ctx.fillRect(xScreen - barWidth / 2, yScreen, barWidth, this.grid.Y(this.grid.ymin) - yScreen);

                    const upperError = this.grid.Y(point.y + point.stdDev);
                    const lowerError = this.grid.Y(point.y - point.stdDev);
                    ctx.strokeStyle = 'gray';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(xScreen, upperError);
                    ctx.lineTo(xScreen, lowerError);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(xScreen - 5, upperError);
                    ctx.lineTo(xScreen + 5, upperError);
                    ctx.moveTo(xScreen - 5, lowerError);
                    ctx.lineTo(xScreen + 5, lowerError);
                    ctx.stroke();
                });

                if (this.name && this.name != 'untitled') {
                    ctx.fillStyle = 'lightBlue';
                    ctx.font = '21px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText(this.name, this.grid.xi + this.grid.width / 2, this.grid.yi - 10);
                }
            }

            isHighlighted() {
                return this._highlight;
            }

            pieChart(graph, ctx) {

                const worldCenterX = (this.grid.xmax + this.grid.xmin) / 2;
                const worldCenterY = (this.grid.ymax + this.grid.ymin) / 2;
                const radiusWorld = Math.min(this.grid.xmax - this.grid.xmin, this.grid.ymax - this.grid.ymin) / 4;
                const centerX = grid.X(worldCenterX);
                const centerY = grid.Y(worldCenterY);
                const radius = radiusWorld * this.grid.xscale;
                let startAngle = 0;
                const total = data.reduce((sum, d) => sum + d.percentage, 0);
                this.scatterData.points.forEach((item) => {
                    const sliceAngle = (item.percentage / total) * 2 * Math.PI;
                    ctx.beginPath();
                    ctx.moveTo(centerX, centerY);
                    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
                    ctx.closePath();
                    ctx.fillStyle = `hsl(${Math.random() * 360}, 70%, 70%)`;
                    ctx.fill();
                    const midAngle = startAngle + sliceAngle / 2;
                    const labelX = centerX + Math.cos(midAngle) * radius * 0.7;
                    const labelY = centerY + Math.sin(midAngle) * radius * 0.7;
                    ctx.fillStyle = "navy";
                    ctx.font = "14px Arial";
                    ctx.textAlign = "center";
                    ctx.textBaseline = "middle";
                    ctx.fillText(item.name, labelX, labelY);
                    startAngle += sliceAngle;
                });
            }

            plotBarChart(graph, ctx) {

                if (!this.grid || !this.grid.rescale) {
                    this.grid.xi = graph.X(this.x);
                    this.grid.yi = graph.Y(this.y);
                    let sw = graph.screenWidth(this.w)
                    this.grid = new MGrid(graph.X(this.x), graph.Y(this.y), sw, sw);
                    const xmin = 0;
                    const xmax = this.scatterData.points.length;
                    let validPoints = this.scatterData.points.filter(p => !isNaN(p.y));
                    if (validPoints.length === 0) {
                        console.warn("No valid points to calculate ymax.");
                        this.broken = true;
                        return null;
                    }
                    const ymin = Math.min(...validPoints.map(p => p.y));
                    const ymax = Math.max(...validPoints.map(p => p.y));
                    this.grid.zoom(xmin, xmax, ymin, ymax);
                    this.grid.rescale();
                } else {
                    graph.rescale();
                    const xmin = 0;
                    const xmax = this.scatterData.points.length;
                    let validPoints = this.scatterData.points.filter(p => !isNaN(p.y));
                    if (validPoints.length === 0) {
                        console.warn("No valid points to calculate ymax.");
                        this.broken = true;

                        return null;
                    }
                    this.grid.rescale();
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                    ctx.lineWidth = 2;
                    ctx.shadowBlur = 20;

                    this.grid.xi = graph.X(this.x);
                    this.grid.yi = graph.Y(this.y);
                    let sw = graph.screenWidth(this.w)
                    if (this.aspectRatio === 1) {
                        this.grid.width = sw;
                        this.grid.height = sw;
                    } else {

                    }

                    const ymax = Math.max(...validPoints.map(p => p.y));

                    this.setxmax(xmax)
                    this.setymax(ymax)
                    this.grid.rescale();
                    this.drawAxisLabels(ctx, this.grid, this.x_axis_label, this.y_axis_label)
                    let labels = this.scatterData.points.map(point => point.name ?? point.x);

                    const data = this.scatterData.points.map(point => point.y);
                    if (labels.length > 0 && !this.grid.xmax)
                        this.grid.setxmax(labels.length)
                    this.grid.rescale();

                    ctx.font = "13px Arial";
                    const barWidth = (this.grid.width) / (labels.length * 3);
                    labels.forEach((label, index) => {
                        const xScreen = (this.grid.X(index));
                        const yScreen = (this.grid.Y(data[index]));
                        ctx.fillStyle = 'rgba(0, 87, 163, 1)'

                        if (this.scatterData.points[index].isSelected) {
                            ctx.fillStyle = 'rgba(221, 0, 255, 0.8)';
                        } else
                            if (this.scatterData.points[index]?.color) {
                                ctx.fillStyle = this.scatterData.points[index].color;
                            }

                        ctx.fillRect(xScreen - barWidth / 2, yScreen, barWidth, (this.grid.Y(this.grid.ymin)) - yScreen);
                        ctx.save();
                        ctx.translate(xScreen, (this.grid.Y(this.grid.ymin) + 10));
                        ctx.rotate(-Math.PI / 4);
                        ctx.fillStyle = 'gray';
                        ctx.textAlign = 'right';
                        ctx.fillText(label, 0, 0);
                        ctx.restore();
                        if (this.scatterData.points[index].stdDev && (this.scatterData.points[index].stdDev != NaN)) {
                            const stdv = this.scatterData.points[index].stdDev;
                            const upperError = (this.grid.Y(data[index] + stdv));
                            const lowerError = (this.grid.Y(data[index] - stdv));
                            let scrDv = this.grid.Y(stdv);

                            ctx.strokeStyle = 'orange';
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            ctx.moveTo(xScreen, upperError);
                            ctx.lineTo(xScreen, lowerError);
                            ctx.stroke();
                            ctx.beginPath();
                            ctx.moveTo(xScreen - 5, upperError);
                            ctx.lineTo(xScreen + 5, upperError);
                            ctx.moveTo(xScreen - 5, lowerError);
                            ctx.lineTo(xScreen + 5, lowerError);
                            ctx.stroke();
                        }
                    });

                    if (this.name && this.name != 'untitled') {
                        ctx.fillStyle = 'navy';
                        ctx.font = '21px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText(this.name, this.grid.xi + this.grid.width / 2, this.grid.yi - 10);
                    }

                    if (this._highlight) {
                        const arrowSize = 15;
                        const rectWidth = Math.abs(this.grid.width);
                        const rectHeight = Math.abs(this.grid.height);
                        const cornerSize = 30;
                        const bottomRightStartX = this.grid.xi + rectWidth + 65;
                        const bottomRightStartY = this.grid.yi + rectHeight + 65;
                        const cornerX = bottomRightStartX - cornerSize
                        const cornerY = bottomRightStartY - cornerSize

                        ctx.fillStyle = "lightCyan";
                        ctx.strokeStyle = "lightCyan";
                        ctx.lineWidth = 2;
                        ctx.shadowBlur = 1;
                        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";

                        if (this.resizing) {
                            ctx.fillStyle = "cyan";
                            ctx.strokeStyle = "lightCyan";
                            ctx.lineWidth = 4;
                            ctx.shadowBlur = 10;
                            ctx.shadowColor = "rgba(0, 0, 0, 0.9)";

                        }

                        ctx.beginPath();
                        ctx.moveTo(cornerX, cornerY);
                        ctx.lineTo(cornerX - arrowSize, cornerY);
                        ctx.lineTo(cornerX, cornerY - arrowSize);
                        ctx.closePath();
                        ctx.fill();

                        ctx.shadowBlur = 0;
                        ctx.shadowColor = "transparent";
                    }
                }
            }

            plotBarChartDoseResponse(graph, ctx) {
                if (!this.grid || !this.grid.rescale) {
                    this.grid.xi = graph.X(this.x);
                    this.grid.yi = graph.Y(this.y);
                    let sw = graph.screenWidth(this.w)
                    this.grid = new MGrid(graph.X(this.x), graph.Y(this.y), sw, sw);
                    const xmin = 0;
                    const xmax = this.scatterData.points.length;
                    let validPoints = this.scatterData.points.filter(p => !isNaN(p.y));
                    if (validPoints.length === 0) {
                        console.warn("No valid points to calculate ymax.");
                        this.broken = true;
                        return null;
                    }
                    const ymin = Math.min(...validPoints.map(p => p.y));
                    const ymax = Math.max(...validPoints.map(p => p.y));
                    this.grid.zoom(xmin, xmax, ymin, ymax);
                    this.grid.rescale();
                } else {
                    graph.rescale();
                    const xmin = 0;
                    const xmax = this.scatterData.points.length;
                    let validPoints = this.scatterData.points.filter(p => !isNaN(p.y));
                    if (validPoints.length === 0) {
                        console.warn("No valid points to calculate ymax.");
                        this.broken = true;

                        return null;
                    }
                    this.grid.rescale();
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
                    ctx.lineWidth = 2;
                    ctx.shadowBlur = 20;

                    this.grid.xi = graph.X(this.x);
                    this.grid.yi = graph.Y(this.y);
                    let sw = graph.screenWidth(this.w)
                    if (this.aspectRatio === 1) {
                        this.grid.width = sw;
                        this.grid.height = sw;
                    } else {

                    }

                    const ymax = Math.max(...validPoints.map(p => p.y));

                    this.setxmax(xmax)
                    this.setymax(ymax)
                    this.grid.rescale();
                    this.drawAxisLabels(ctx, this.grid, this.x_axis_label, this.y_axis_label)
                    let labels = this.scatterData.points.map(point => point.name ?? point.x);

                    const data = this.scatterData.points.map(point => point.y);
                    if (labels.length > 0 && !this.grid.xmax)
                        this.grid.setxmax(labels.length)
                    this.grid.rescale();

                    ctx.font = "13px Arial";
                    const barWidth = (this.grid.width) / (labels.length * 3);
                    labels.forEach((label, index) => {
                        const xScreen = (this.grid.X(index));
                        const yScreen = (this.grid.Y(data[index]));
                        ctx.fillStyle = 'rgb(0, 87, 163, 0.5)'

                        ctx.fillRect(xScreen - barWidth / 2, yScreen, barWidth, (this.grid.Y(this.grid.ymin)) - yScreen);
                        ctx.save();
                        ctx.translate(xScreen, (this.grid.Y(this.grid.ymin) + 10));
                        ctx.rotate(-Math.PI / 4);
                        ctx.fillStyle = 'gray';
                        ctx.textAlign = 'right';
                        ctx.fillText(label, 0, 0);
                        ctx.restore();
                        const stdv = this.scatterData.points[index].stdDev;
                        if (stdv) {
                            const upperError = (this.grid.Y(data[index] + stdv));
                            const lowerError = (this.grid.Y(data[index] - stdv));
                            let scrDv = this.grid.Y(stdv);

                            ctx.strokeStyle = 'gray';
                            ctx.lineWidth = 1;
                            ctx.beginPath();
                            ctx.moveTo(xScreen, upperError);
                            ctx.lineTo(xScreen, lowerError);
                            ctx.stroke();
                            ctx.beginPath();
                            ctx.moveTo(xScreen - 5, upperError);
                            ctx.lineTo(xScreen + 5, upperError);
                            ctx.moveTo(xScreen - 5, lowerError);
                            ctx.lineTo(xScreen + 5, lowerError);
                            ctx.stroke();
                        }
                    });

                    if (this.name) {
                        ctx.fillStyle = 'navy';
                        ctx.font = '21px Arial';
                        ctx.textAlign = 'center';
                        ctx.fillText(this.name, this.grid.xi + this.grid.width / 2, this.grid.yi - 10);
                    }

                    if (this._highlight) {
                        const rectWidth = this.getWidth();
                        const rectHeight = this.getHeight();
                        const arrowSize = 15;

                        ctx.fillStyle = "lightCyan";
                        ctx.strokeStyle = "lightCyan";
                        ctx.lineWidth = 2;
                        ctx.shadowBlur = 1;
                        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";

                        const bottomRightStartX = this.grid.xi + rectWidth + 40;
                        const bottomRightStartY = this.grid.yi + rectHeight + 40;
                        ctx.beginPath();
                        ctx.moveTo(bottomRightStartX, bottomRightStartY);
                        ctx.lineTo(bottomRightStartX - arrowSize, bottomRightStartY);
                        ctx.lineTo(bottomRightStartX, bottomRightStartY - arrowSize);
                        ctx.closePath();
                        ctx.fill();

                        ctx.shadowBlur = 0;
                        ctx.shadowColor = "transparent";
                    }
                }

                if (this.sigmoid != null) {
                    function sigmoid(x, min, max, ic50, slope) {
                        return min + (max - min) / (1 + Math.pow(10, (Math.log10(ic50 + 1e-6) - x) * slope));
                    }
                    ctx.strokeStyle = 'red';
                    ctx.beginPath();
                    for (let x = this.grid.xmin; x <= this.grid.xmax; x += 0.1) {
                        const y = sigmoid(x, this.sigmoid.min, this.sigmoid.max, this.sigmoid.ic50, this.sigmoid.slope);
                        const xWorld = this.grid.X(x);
                        const yWorld = this.grid.Y(y);
                        if (x === this.grid.xmin)
                            ctx.moveTo(xWorld, yWorld);
                        else
                            ctx.lineTo(xWorld, yWorld);
                    }
                }
            }

            static fromJSON = (data) => {
                if (Array.isArray(data)) {
                    let composite = new CompositePlot()
                    for (let chunk of data) {
                        composite.addPlot(this.fromJSON(chunk));
                    }
                    composite.name = data.name;
                    composite.w = composite.composites[0].w;
                    composite.h = composite.composites[0].h;
                    composite.x = composite.composites[0].x;
                    composite.y = composite.composites[0].y;
                    return composite
                }
                else if (data.composites) {

                    let c = CompositePlot.buildFromJSON(data, MGrid, MTimelinePlot)
                    return c;

                }
                else {

                    const plot = new MTimelinePlot(data.scatterData);
                    plot.config_script = data.config_script || {};
                    if (data.lineEquations && data.lineEquations.length > 0) {
                        plot.lineEquations = data.lineEquations.map(eq => {
                            if (eq.mfunction && typeof eq.mfunction === 'string') {
                                try {
                                    eq.mfunction = new Function(`return ${decodeURIComponent(eq.mfunction)}`)();
                                } catch (e) {
                                    console.error('Failed to decode mfunction:', e);
                                }
                            }
                            return eq;
                        });

                    }

                    plot.name = data.name;
                    plot.scaleType = data.scaleType;
                    plot.grid.xmin = data.grid.xmin;
                    plot.grid.xmax = data.grid.xmax;
                    plot.grid.ymin = data.grid.ymin;
                    plot.grid.ymax = data.grid.ymax;

                    plot.x = data.x;
                    plot.y = data.y;
                    plot.w = data.w;
                    plot.h = data.h;
                    plot.type = data.type;
                    plot.lineColor = data.lineColor;
                    plot.pointColor = data.pointColor;
                    plot.errorBarColor = data.errorBarColor;
                    plot.fitScaleToData = data.fitScaleToData;

                    if (data.formatAxis && typeof data.formatAxis === 'string') {
                        try {
                            plot.formatAxis = new Function(`return ${atob(data.formatAxis)}`)();
                        } catch (e) {
                            console.error('Failed to decode integerAxis:', e);
                        }
                    }

                    return plot;
                }

            }

            fitData() {

                this.fitScaleToData = true;
            }

            async toPNG(pt) {

                const graph = pt.grid;

                graph.width = 1500
                graph.height = 1500
                let offscreenCanvas = document.createElement('canvas');
                offscreenCanvas.width = graph.width;
                offscreenCanvas.height = graph.height;

                let offscreenCtx = offscreenCanvas.getContext('2d');
                offscreenCtx.fillStyle = 'white';
                offscreenCtx.fillRect(0, 0, graph.width, graph.height);
                MGrid.GP = true;
                let ng = this.grid.clone();
                ng.width = graph.width - 600;
                ng.height = graph.height - 600;
                ng.xi = 300
                ng.yi = 300
                ng.rescale();
                this.highlight = false;

                this.drawPlot(pt, offscreenCtx, ng, true)

                let dataURL = offscreenCanvas.toDataURL('image/png');
                let link = document.createElement('a');
                link.href = dataURL;
                link.download = this.name + ".png";
                link.click();
                MGrid.GP = false;
            }

            async applyConfig(code, plateTrack) {
                let allScatterData = {
                    points: []
                };
                if (typeof code === 'object') {
                    cdic = code;
                } else
                    cdic = parseInput(code);
                let name = code.name;
                let xvalues_expression = cdic['x']
                let yvalues_expression = cdic['y']
                let stdDev_expression = cdic['stdDev']

                let yvalObjectBool = false;
                let color = cdic['color']
                if (!color) {
                    color = 'blue'
                }
                if (!xvalues_expression) {
                    xvalues_expression = 'index'
                }
                let yvalues = await exec('baja/plate/ops/frun-object', yvalues_expression, plateTrack);
                let stdDev_values = []
                if (stdDev_expression) {
                    stdDev_values = await exec('baja/plate/ops/frun-object', stdDev_expression, plateTrack);
                }

                let stdDevs = stdDev_values?.results || [];

                if (xvalues_expression.startsWith('index')) {
                    let i = 0;
                    for (let yv of yvalues.results) {
                        let stdDev = stdDevs[i]?.value ?? null;
                        if (typeof yv === 'object' && yv !== null && 'value' in yv && 'uid' in yv) {
                            yvalObjectBool = true;
                            allScatterData.points.push({
                                x: i,
                                y: yv.value,
                                name: `${yv.value}`,
                                color: color,
                                yrefid: yv.uid,
                                stdDev: stdDev
                            });
                        } else {
                            allScatterData.points.push({
                                x: i,
                                y: yv,
                                name: `${yv}`,
                                color: color,
                                stdDev: stdDev
                            });
                        }
                        i++;
                    }
                } else {
                    let xvalues = await exec('baja/plate/ops/frun-object', xvalues_expression, plateTrack);
                    let i = 0;
                    for (let xv of xvalues.results) {
                        let yv = yvalues.results[i];
                        let stdDev = stdDevs[i]?.value ?? null;

                        if (typeof xv === 'object' && xv !== null && 'value' in xv && 'uid' in xv) {
                            allScatterData.points.push({
                                x: xv.value,
                                y: yv.value,
                                name: `${xv.value}`,
                                color: color,
                                xrefid: xv.uid,
                                yrefid: yv.uid,
                                stdDev: stdDev
                            });
                        } else {
                            allScatterData.points.push({
                                x: xv,
                                y: yv,
                                name: `${xv}`,
                                color: color,
                                stdDev: stdDev
                            });
                        }
                        i++;
                    }

                }

                if (yvalObjectBool) {
                    allScatterData.points = allScatterData.points.filter(point => {
                        const yValue = typeof point.y === 'object' && 'value' in point ? point.y.value : point.y;
                        return typeof yValue === 'number' && !isNaN(yValue);
                    });
                } else {
                    allScatterData.points = allScatterData.points.filter(point => {
                        return typeof point.y === 'number' && !isNaN(point.y);
                    });
                }

                if (cdic['type']) {
                    if (cdic['type'].startsWith('barchart')) {

                    }
                    else if (cdic['type'] === 'pie') {
                    }
                    else {
                        allScatterData.points = allScatterData.points.filter(point => {
                            return typeof point.x === 'number' && !isNaN(point.x);
                        });
                    }

                    if (cdic['type'].indexOf('aggregate') > 0) {
                        const aggregatedData = {};
                        allScatterData.points.forEach(point => {
                            if (!aggregatedData[point.name]) {
                                aggregatedData[point.name] = [];
                            }
                            aggregatedData[point.name].push(point.y);
                        });
                        const aggregatedPoints = [];
                        Object.keys(aggregatedData).forEach(xValue => {
                            const yValues = aggregatedData[xValue];
                            const mean = yValues.reduce((sum, val) => sum + val, 0) / yValues.length;
                            const variance = yValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / yValues.length;
                            const stdDev = Math.sqrt(variance);
                            aggregatedPoints.push({
                                x: xValue,
                                y: mean,
                                stdDev: stdDev,
                                name: xValue
                            });
                        });
                        allScatterData.points = aggregatedPoints;
                    }

                }
                this.config_script = cdic;
                this.name = name;
                if (!this.name) {
                    this.name = generateNautName();
                }
                if (cdic['type']) {
                    this.type = cdic['type']
                } else {
                    this.type = null;
                }
                this.scatterData = allScatterData;

                if (cdic['equation']) {
                    if (cdic["equation"].toLowerCase() === 'linearregression') {
                        let eqLabel = ''
                        if (cdic['equation_label']) {
                            eqLabel = cdic['equation_label']
                        }
                        const { slope, intercept, rSquared } = linearRegression(allScatterData);
                        this.addLineEquation({
                            slope: slope,
                            intercept: intercept,
                            label: `${eqLabel}`,
                            color: 'black',
                            rSquared: rSquared
                        });
                    }
                }
                if (cdic['sort']) {
                    if (cdic.sort.toLowerCase() === 'descending') {
                        this.sortDescending()
                    } else if (cdic.sort.toLowerCase() == 'ascending') {
                        this.sortAscending();
                    }
                }
                this.fitScaleToData = true;
                this.x_axis_label = cdic['x-label']
                this.y_axis_label = cdic['y-label']
                if (cdic['ymin'] != null) {
                    this.grid.ymin = parseFloat(cdic['ymin'])
                }
                if (cdic['ymax'] != null) {
                    this.grid.ymax = parseFloat(cdic['ymax'])
                }
                if (cdic['xmin'] != null) {
                    this.grid.xmin = parseFloat(cdic['xmin'])
                }
                if (cdic['xmax'] != null) {
                    this.grid.xmax = parseFloat(cdic['xmax'])
                }

                const result = analyzePoints(allScatterData);
                this.lineColor = 'blue';
                this.pointColor = 'red';
                this.errorBarColor = 'gray';
            }

            setScale(type) {
                if (type === 'log') {
                    this.grid = LogGrid.fromGrid(this.grid)
                    this.grid.xLogScale = true
                    this.grid.yLogScale = true;

                }
                else if (type === 'logx') {
                    this.grid = LogGrid.fromGrid(this.grid)
                    this.grid.xLogScale = true;
                    this.grid.yLogScale = false;

                } if (type === 'logy') {
                    this.grid = LogGrid.fromGrid(this.grid)
                    this.grid.xLogScale = false;
                    this.grid.yLogScale = true;

                }
                else if (type === 'linear') {
                    this.grid = MGrid.fromGrid(this.grid)
                }
                this.grid.rescale();
                this.scaleType = type;

            }

            isMouseInTab(px, py) {
                highlightTab = null;
                const nameTabX = this.grid.xi - this.margin.left;
                const optionsTabX = nameTabX + this.tabWidth + this.tabGap;
                const moveTabX = optionsTabX + this.tabWidth + this.tabGap;

                const tabY = this.grid.yi - this.tabHeight - 25;
                const isInMoveTab = px >= nameTabX && px <= (nameTabX + this.tabWidth) &&
                    py >= tabY && py <= (tabY + this.tabHeight + 25);
                const isInOptionsTab = px >= optionsTabX && px <= (optionsTabX + this.tabWidth) &&
                    py >= tabY && py <= (tabY + this.tabHeight + 20);

                if (isInOptionsTab) {
                    this.showTopMenuBar = true;
                    highlightTab = 'options'
                    return 'options';
                }

                if (isInMoveTab) {
                    this.showTopMenuBar = true;
                    highlightTab = 'move'
                    this.__moving = true;
                    return 'move';
                }

                this.grid.rescale();
                let x = px;
                let y = py;
                let b = this.buttons;
                let init = (this.grid.xi + this.grid.width);
                if (init < 0) {
                    init = (0)
                }
                let index = 0;
                for (let button of b) {
                    let buttonX = init + index * bsize;

                    let buttonY = (this.grid.yi - (this.margin.top));
                    let bbw = bsize;
                    index++;
                    if (
                        x >= buttonX &&
                        x <= buttonX + bbw &&
                        y >= buttonY &&
                        y <= buttonY + button.height
                    ) {
                        button.highlight()
                        return button.name;
                    }
                }

                return null;
            }

            buildTimelineMenu(pt, menuList) {

                let scx_;
                let scy_;

                menuList.push(
                    {
                        label: `Add point (click+add)`,
                        __date: '',
                        click: async (scx, scy) => {

                            let lasso = {
                                id: 'point-add-to-timeline',
                                priority: true,
                                mouseMoveListener: (x, y) => {

                                    scx_ = x;
                                    scy_ = y - 10;
                                    let tx = (this.grid.Xwc(x - this.grid.xi * 2))

                                    this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax)

                                },
                                mouseUpListener: async (x, y) => {
                                    let va = await prompt("Name", ["Name"], { "Name": this.name }, 300, 300)
                                    let m = va['Name']
                                    if (m != null) {
                                        let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                                        let ty = (this.grid.Ywc(y - this.grid.yi * 2))

                                        this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax)
                                        const yvalue = this.grid.Ywc(y)
                                        this.scatterData.points.push({
                                            x: tx,
                                            y: ty,
                                            name: `${m}`,
                                            color: 'red',
                                        });

                                    }
                                },
                                mouseDownListener: (x, y) => {
                                },
                                draw: (grid, ctx) => {
                                    ctx.lineWidth = 2;
                                    ctx.fillStyle = 'black';
                                    ctx.font = '14px Arial';
                                    ctx.textAlign = 'left';

                                    ctx.fillText(this.__date, this.__scx_, this.__scy_)
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
                        label: `Add progress point (click+add)`,
                        __date: '',
                        click: async (scx, scy) => {
                            let startx = this.grid.xmin;

                            let lasso = {
                                id: 'point-add-to-timeline',
                                priority: true,
                                mouseMoveListener: (x, y) => {

                                    scx_ = x;
                                    scy_ = y - 10;
                                    let tx = (this.grid.Xwc(x - this.grid.xi * 2))

                                    this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax)

                                },
                                mouseUpListener: async (x, y) => {
                                    let va = await prompt("Name", ["Name"], { "Name": this.name }, 300, 300)
                                    let m = va['Name']
                                    if (m != null) {

                                        let __color = 'rgba(0, 87, 163, 0.5)'

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
                                                                                            __color = _color;

                                                                                            let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                                                                                            let ty = (this.grid.Ywc(y - this.grid.yi * 2))

                                                                                            this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax)
                                                                                            const yvalue = this.grid.Ywc(y)
                                                                                            this.scatterData.points.push({
                                                                                                x: tx,
                                                                                                y: ty,
                                                                                                startX: startx,
                                                                                                name: `${m}`,
                                                                                                color: __color,
                                                                                            });
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
                                                                            label: 'Apply', ionFunction: createIonFunction(async () => {

                                                                                hideAllModal();

                                                                                let tx = (this.grid.Xwc(x - this.grid.xi * 2))
                                                                                let ty = (this.grid.Ywc(y - this.grid.yi * 2))

                                                                                this.__date = formatTimeLabel(tx, this.grid.xmin, this.grid.xmax)
                                                                                const yvalue = this.grid.Ywc(y)
                                                                                this.scatterData.points.push({
                                                                                    x: tx,
                                                                                    y: ty,
                                                                                    startX: startx,
                                                                                    name: `${m}`,
                                                                                    color: __color,
                                                                                });

                                                                            })

                                                                        }
                                                                    ]
                                                                }
                                                            }
                                                        }
                                                    ]]
                                            }
                                        }

                                        await showModal(sequence_input);

                                    }
                                },
                                mouseDownListener: (x, y) => {
                                },
                                draw: (grid, ctx) => {
                                    ctx.lineWidth = 2;
                                    ctx.fillStyle = 'black';
                                    ctx.font = '14px Arial';
                                    ctx.textAlign = 'left';

                                    ctx.fillText(this.__date, this.__scx_, this.__scy_)
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
                        label: `Add timeline labels`,
                        __date: '',
                        click: async (scx, scy) => {

                            const addQuarterStartPoints = (startTimestamp, endTimestamp) => {

                                if (
                                    typeof startTimestamp !== 'number' ||
                                    typeof endTimestamp !== 'number' ||
                                    isNaN(startTimestamp) ||
                                    isNaN(endTimestamp)
                                ) {
                                    console.warn("Invalid input: startTimestamp or endTimestamp is not a number.");
                                    return;
                                }

                                const isYearOnly = Number.isInteger(startTimestamp) && startTimestamp < 3000;

                                const startDate = isYearOnly
                                    ? new Date(startTimestamp, 0, 1)
                                    : new Date(startTimestamp);
                                const endDate = isYearOnly
                                    ? new Date(endTimestamp, 11, 31, 23, 59, 59)
                                    : new Date(endTimestamp);

                                if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                                    console.warn("Invalid start or end date after conversion.");
                                    return;
                                }

                                if (startDate < this.grid.xmin) {
                                    console.warn("Invalid start--- before the offiial .");
                                    return;
                                }

                                const currentQuarterStart = new Date(startDate);
                                currentQuarterStart.setMonth(Math.floor(currentQuarterStart.getMonth() / 3) * 3);
                                currentQuarterStart.setDate(1);
                                currentQuarterStart.setHours(0, 0, 0, 0);

                                while (currentQuarterStart <= endDate) {
                                    const ty = 0.4;

                                    const year = currentQuarterStart.getFullYear();
                                    const month = currentQuarterStart.getMonth();
                                    const tx = year + month / 12;

                                    const qNum = Math.floor(currentQuarterStart.getMonth() / 3) + 1;
                                    const label = `Q${qNum}`;

                                    if (tx > this.grid.xmin && tx < this.grid.xmax) {

                                        this.scatterData.points.push({
                                            x: tx,
                                            y: ty,
                                            name: label,
                                            color: 'lightGray',
                                            offset: -10,
                                        });
                                    }
                                    currentQuarterStart.setMonth(currentQuarterStart.getMonth() + 3);
                                }
                            }

                            const xMin = Math.min(...this.scatterData.points.map(p => p.x));
                            const xMax = Math.max(...this.scatterData.points.map(p => p.x));

                            addQuarterStartPoints(this.grid.xmin, xMax);

                        },
                        move: () => {
                        }
                    });
                return menuList;
            }

            getOptionsMenuList(pt) {
                let menuList = []

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

                menuList.push(
                    {
                        label: `Download PNG`,
                        click: async (scx, scy) => {
                            await this.toPNG(pt)
                        },
                        move: () => {
                        }
                    });

                if (this.type === 'timeline') {
                    return this.buildTimelineMenu(pt, menuList)
                }

                menuList.push(
                    {
                        label: `Set axis range`,
                        click: async (scx, scy) => {
                            let options = this.getXAxisMenuOptions(pt)
                            let smenu = new Menu(options, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * options.length / 2), 'rgb(205, 255, 155)', 'navy', 2)

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
                            }
                            t.mouseDownListener = (x, y) => {
                                let mmx = pt.grid.Xwc(x);
                                let mmy = pt.grid.Ywc(y);
                                if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {

                                }
                            }
                            t.close = () => {
                                smenu = null;
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
                                pt.wb(null)
                            }
                            pt.wb(t)

                        },
                        move: () => {
                        }
                    });

                if (!this.fitScaleToData)
                    menuList.push(
                        {
                            label: `Fit scale to points`,
                            click: async (scx, scy) => {
                                this.fitScaleToData = true;
                            },
                            move: () => {
                            }
                        });

                if (this.lineEquations && this.lineEquations.length > 0) {
                    menuList.push(
                        {
                            label: `Copy equations`,
                            click: async (scx, scy) => {
                                try {
                                    function getEquationsText(lineEquations) {
                                        return lineEquations.map(({ slope, intercept, label, color, rSquared }, index) => {
                                            return `y = ${slope}x + ${intercept}`;
                                        }).join("\n");
                                    }
                                    let t = getEquationsText(this.lineEquations)
                                    navigator.clipboard.writeText(t).then(() => {
                                        console.log("Object copied to clipboard!");
                                    }).catch(err => {
                                        console.error("Failed to copy object to clipboard: ", err);
                                    });
                                } catch (exception) {

                                }
                            },
                            move: () => {
                            }
                        });
                }
                menuList.push(
                    {
                        label: `Configuration`,
                        click: async (scx, scy) => {
                            function objectToString(obj) {
                                return Object.entries(obj)
                                    .map(([key, value]) => `${key}=${value}`)
                                    .join('\n');
                            }

                            let st = formatForEditing(flattenJson(formatFloats(this.buildCurrentConfig())))
                            if (!st) {
                                st = ''
                            }
                            let pm = CurrentLayout.getStashed('plate-track')
                            let canvas = CurrentLayout.getStashed('graph-canvas')
                            let t =
                            {
                                height: '200px',
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
                                code: st,
                                buttons: [{
                                    'label': 'Update', "color": 'blue', action: async () => {
                                        let code = ref.getEditorText();
                                        let config = parseEditedFormat(code)

                                        await this.applyConfig(config, pt);
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

                            t.objects = pt.root;
                            ref = await pt.showTextEditor(t);

                        },
                        move: () => {
                        }
                    });

                if (this.type === scatter) {
                    menuList.push({
                        label: 'IC50',
                        click: async (sx, sy) => {
                            smenu = null;
                            this.progress = 10

                            function extractDoseResponse(scatterData) {
                                const doses = [];
                                const responses = [];
                                scatterData.points.forEach(point => {
                                    doses.push(point.x);
                                    responses.push(point.y);
                                });
                                return {
                                    doses,
                                    responses
                                };
                            }

                            let engineMonitor = new EngineMonitor((msg) => {
                                pt.setMessage(msg)
                            });
                            engineMonitor.addProgressListener(async (v) => {
                                this.progress = (v);
                            })

                            this.progress = 30;
                            let { doses, responses } = extractDoseResponse(this.scatterData)
                            let ic50js = await exec('py/baja/dose-response/bayesian-ic50.py', engineMonitor, doses, responses);
                            this.progress = 100;
                            const drawDoseResponseCurve = (grid, ctx, data) => {
                                const doseResponse = data['dose-response'];
                                const { IC50, top, bottom, hill_slope, doses, responses } = doseResponse;

                                function sigmoid(dose) {
                                    return bottom + (top - bottom) / (1 + Math.pow(dose / IC50, hill_slope));
                                }

                                const minDose = Math.min(...doses);
                                const maxDose = Math.max(...doses);
                                const numPoints = 500;
                                grid.setymax(top)
                                grid.setymin(bottom)
                                grid.rescale();

                                const polygonPoints = [];
                                for (let i = 0; i < numPoints; i++) {
                                    const dose = minDose * Math.pow(maxDose / minDose, i / (numPoints - 1));
                                    const response = sigmoid(dose);
                                    polygonPoints.push([dose, response]);
                                }

                                const polygon = polygonPoints;

                                ctx.strokeStyle = 'black';
                                ctx.lineWidth = 2;
                                ctx.beginPath();
                                let scx = grid.X(polygon[0][0]);
                                ctx.moveTo(scx, grid.Y(polygon[0][1]));
                                for (let i = 1; i < polygon.length; i++) {
                                    let lx = grid.X(polygon[i][0]);
                                    let ly = grid.Y(polygon[i][1]);
                                    ctx.lineTo(lx, ly);
                                }
                                ctx.stroke();

                                const IC50X = grid.X(IC50);
                                ctx.strokeStyle = 'red';
                                ctx.setLineDash([5, 5]);
                                ctx.beginPath();
                                ctx.moveTo(IC50X, grid.Y(top));
                                ctx.lineTo(IC50X, grid.Y(bottom));
                                ctx.stroke();
                                ctx.setLineDash([]);

                                ctx.fillStyle = 'black';
                                ctx.font = '14px Arial';
                                ctx.textAlign = 'left';

                                const textX = IC50X + 10;
                                const textY = grid.Y(top) + 30;

                                ctx.fillText(`IC50: ${IC50.toFixed(2)} `, textX, textY);

                            }

                            this.addLineEquation({
                                name: 'Bayesian Dose-response',
                                data: JSON.parse(ic50js),
                                mfunction: drawDoseResponseCurve
                            })
                        }

                    }
                    )

                    menuList.push({
                        label: 'Polynomial fit',
                        click: async (sx, sy) => {
                            function extractDoseResponse(scatterData) {
                                const doses = [];
                                const responses = [];
                                scatterData.points.forEach(point => {
                                    doses.push(point.x);
                                    responses.push(point.y);
                                });
                                return {
                                    doses,
                                    responses
                                };
                            }

                            let engineMonitor = new EngineMonitor((msg) => {
                                pt.setMessage(msg)
                            });
                            engineMonitor.addProgressListener(async (v) => {
                                this.progress = (v);
                            })
                            let { doses, responses } = extractDoseResponse(this.scatterData)
                            let polyfit = await exec('py/baja/dose-response/polyfit.py', engineMonitor, doses, responses);

                            const drawPolynomialCurve = (grid, ctx, polynomialData) => {
                                const { coefficients, degree } = polynomialData;

                                function evaluatePolynomial(x) {
                                    return coefficients.reduce((sum, coeff, index) => sum + coeff * Math.pow(x, index), 0);
                                }

                                ctx.strokeStyle = 'blue';
                                ctx.lineWidth = 2;
                                ctx.beginPath();

                                const xMin = grid.xmin;
                                const xMax = grid.xmax;
                                const steps = 500;
                                const stepSize = (xMax - xMin) / steps;

                                let x = xMin;
                                let y = evaluatePolynomial(x);
                                let scx = grid.X(x);
                                let scy = grid.Y(y);
                                ctx.moveTo(scx, scy);

                                for (let i = 1; i <= steps; i++) {
                                    x += stepSize;
                                    y = evaluatePolynomial(x);
                                    scx = grid.X(x);
                                    scy = grid.Y(y);
                                    ctx.lineTo(scx, scy);
                                }

                                ctx.stroke();

                                ctx.fillStyle = 'black';
                                ctx.font = '14px Arial';
                                ctx.textAlign = 'left';
                                const textX = grid.X(grid.xmax) - 150;
                                const textY = grid.Y(grid.ymax) + 30;

                                ctx.fillText(` ${polynomialData.expression}`, textX, textY);
                            }
                            this.addLineEquation({
                                name: ' LJ fit',
                                data: JSON.parse(polyfit),
                                mfunction: drawPolynomialCurve
                            })

                        }
                    }
                    )
                }

                if (this.showEquation) {
                    menuList.push(
                        {
                            label: `Hide equations`,
                            click: async (scx, scy) => {
                                this.showEquation = false;
                            },
                            move: () => {
                            }
                        });

                } else {
                    menuList.push(
                        {
                            label: `Show equations`,
                            click: async (scx, scy) => {
                                this.showEquation = true;

                            },
                            move: () => {
                            }
                        });

                }

                if (this.scaleType !== 'log') {
                    menuList.push(
                        {
                            label: `Set log scale`,
                            click: async (scx, scy) => {
                                this.setScale('log')
                            },
                            move: () => {
                            }
                        });

                }

                if (this.scaleType !== 'logx') {
                    menuList.push(
                        {
                            label: `Set X-axis log scale`,
                            click: async (scx, scy) => {
                                this.setScale('logx')
                            },
                            move: () => {
                            }
                        });

                }
                if (this.scaleType !== 'logy') {
                    menuList.push(
                        {
                            label: `Set Y-axis log scale`,
                            click: async (scx, scy) => {
                                this.setScale('logy')
                            },
                            move: () => {
                            }
                        });

                }

                if (this.scaleType !== 'linear') {
                    menuList.push(
                        {
                            label: `Set linear scale`,
                            click: async (scx, scy) => {
                                this.setScale('linear')
                            },
                            move: () => {
                            }
                        });

                }
                menuList.push(
                    {
                        label: `Add linear regression... `,
                        click: async (scx, scy) => {

                            let va = await prompt("Label", ["Label"], { "Label": this.labelX }, 300, 300)
                            let m = va['Label']

                            if (m === null || m.length === 0) {
                                m = generateNautName();
                            }
                            const { slope, intercept, rSquared } = linearRegression(this.scatterData);
                            this.addLineEquation({
                                slope: slope,
                                intercept: intercept,
                                label: `${m}`,
                                color: 'black',
                                rSquared: rSquared
                            });
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
                                                                                if (typeof _color === 'string') {
                                                                                    if (_color.startsWith('#')) {
                                                                                        this.backgroundColor = _color
                                                                                    }
                                                                                } else {
                                                                                    this.backgroundColor = `rgba(${_color["rgb"]['r']},${_color['rgb']['g']},${_color['rgb']['b']},${_color['rgb']['a']})`
                                                                                }
                                                                                infoPrompt('' + this.backgroundColor, 600, 200);
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

                            showModal(sequence_input, 500, 150);

                        },
                        move: () => {
                        }
                    });

                if (this.type === scatter) {

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

                }

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

                if (this.type === barchart) {

                    menuList.push(
                        {
                            label: `Y axis ticks`,
                            click: async (scx, scy) => {

                                this.showYAxisTickOptions(pt)

                            },
                            move: () => {
                            }
                        });

                    menuList.push(
                        {
                            label: `Ascending`,
                            click: async (scx, scy) => {
                                this.sortAscending();
                            },
                            move: () => {
                            }
                        });
                    menuList.push(
                        {
                            label: `Descending`,
                            click: async (scx, scy) => {
                                this.sortDescending();
                            },
                            move: () => {
                            }
                        });

                }
                else if (this.type === scatter) {
                    menuList.push(
                        {
                            label: `Sort...`,
                            click: async (scx, scy) => {

                                if (type === scatter) {

                                    function sortScatterDataByY(scatterPlotData) {
                                        scatterPlotData.points.sort((a, b) => a.y - b.y);
                                    }
                                    this.scatterData = sortScatterDataByY(this.scatterData)

                                }

                            },
                            move: () => {
                            }
                        });
                }

                return menuList;

            }

            setExportListeners(bx, by, pt) {
                let mm = this.getExportMenuList(pt)
                this.highlight();
                smenu = new Menu(mm, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * mm.length / 2), 'rgb(205, 255, 155)', 'navy', 2)
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
                    if (smenu)
                        smenu.draw(ctx, grid)
                }
                t.mouseDownListener = (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {

                    }
                }
                t.close = () => {
                    smenu = null;
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

            displayXAxisMenuOptions(bx, by, pt) {
                let mm = this.getXAxisMenuOptions(pt)
                smenu = new Menu(mm, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * mm.length / 2), 'rgb(205, 255, 155)', 'navy', 2)
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
                    if (smenu)
                        smenu.draw(ctx, grid)
                }
                t.mouseDownListener = (x, y) => {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {

                    } else {
                        smenu = null
                        pt.wb(null)
                    }
                }
                t.close = () => {
                    smenu = null;
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

            isMajorityXStrings() {
                if (this.scatterData && this.scatterData.points) {
                    const totalPoints = this.scatterData.points.length;
                    const stringXCount = this.scatterData.points.filter(point => typeof point.x === 'string').length;
                    return stringXCount > totalPoints / 2;
                }
                return false;

            }

            getExportMenuList(pt) {
                let menuList = []
                menuList.push(
                    {
                        label: `Download image (PNG)`,
                        click: async (scx, scy) => {

                            await this.toPNG(pt)

                        },
                        move: () => {
                        }
                    });
                return menuList
            }

            getXAxisMenuOptions(pt) {
                let _grid = this.grid;
                const menuList = [
                    {
                        label: `ymin ${_grid.ymin}`,
                        click: async (scx, scy) => {
                            let va = await prompt("ymin", ["ymin"], { "ymin": _grid.ymin.toFixed(3) }, 300, 300);
                            let m = va['ymin'];
                            if (m != null) {
                                this.fitScaleToData = false;
                                this.setymin(parseFloat(m));
                                console.log("Y min changed " + _grid.ymin);
                            }
                        },
                        move: () => { }
                    },

                    {
                        label: `xmin ${_grid.xmin}`,
                        click: async (scx, scy) => {
                            let va = await prompt("xmin", ["xmin"], { "xmin": _grid.xmin.toFixed(3) }, 300, 300);
                            let m = va['xmin'];
                            if (m != null) {
                                this.setxmin(parseFloat(m));
                                console.log("X min changed " + _grid.xmin);
                            }
                        },
                        move: () => { }
                    },

                    {
                        label: `ymax ${_grid.ymax}`,
                        click: async (scx, scy) => {
                            let va = await prompt("ymax", ["ymax"], { "ymax": _grid.ymax.toFixed(3) }, 300, 300);
                            let m = va['ymax'];
                            if (m != null) {
                                this.setymax(parseFloat(m));
                                console.log("Y max changed " + _grid.ymax);
                            }
                        },
                        move: () => { }
                    },

                    {
                        label: `xmax ${_grid.xmax}`,
                        click: async (scx, scy) => {
                            let va = await prompt("xmax", ["xmax"], { "xmax": _grid.xmax.toFixed(3) }, 300, 300);
                            let m = va['xmax'];
                            if (m != null) {
                                this.setxmax(parseFloat(m));
                                console.log("X max changed " + _grid.xmax);
                            }
                        },
                        move: () => { }
                    },

                ];
                return menuList
            }

            getNameMenuOptions(pt) {
                let menuList = []

                menuList.push(
                    {
                        label: `Title: ${this.name}`,
                        click: async (scx, scy) => {
                            let va = await prompt("Name", ["Name"], { "Name": this.name }, 300, 300);
                            let m = va['Name'];
                            if (m != null) {
                                this.name = (m);
                            }
                        },
                        move: () => {
                        }
                    },
                    {
                        label: `Type: ${this.type}`,
                        click: async (scx, scy) => {
                            let va = await prompt("Type", ["Type"], { "Type": this.type }, 300, 300);
                            let m = va['Type'];
                            if (m != null) {
                                this.type = (m);
                            }
                        },
                        move: () => {
                        }
                    },

                );
                menuList.push(
                    {
                        label: `Configuration`,
                        click: async (scx, scy) => {

                            function objectToString(obj) {
                                return Object.entries(obj)
                                    .map(([key, value]) => `${key}=${value}`)
                                    .join('\n');
                            }
                            let st = JSON.stringify(this.config_script);
                            if (!st) {
                                st = ''
                            }
                            let pm = CurrentLayout.getStashed('plate-track')
                            let canvas = CurrentLayout.getStashed('graph-canvas')
                            let t =
                            {
                                height: '200px',
                                editorOptions: {
                                    language: 'bajabio',
                                    value: JSON.stringify(this.config_script),
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
                                        alert(" go ")
                                    })
                                },
                                code: st,
                                buttons: [{
                                    'label': 'Update', "color": 'blue', action: async () => {
                                        let code = ref.getEditorText();
                                        await this.applyConfig(code, pt);
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
                            ref = await pt.showTextEditor(t);

                        },
                        move: () => {
                        }
                    });

                if (this.scaleType !== 'log') {
                    menuList.push(
                        {
                            label: `Set log scale`,
                            click: async (scx, scy) => {
                                this.setScale('log')
                            },
                            move: () => {
                            }
                        });

                }
                if (this.scaleType !== 'linear') {
                    menuList.push(
                        {
                            label: `Set linear scale`,
                            click: async (scx, scy) => {
                                this.setScale('linear')
                            },
                            move: () => {
                            }
                        });

                }

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

                return menuList
            }

            getYAxisMenuOptions(pt) {
                let menuList = []
                menuList.push(
                    {
                        label: `ymin ${this.grid.ymin}`,
                        click: async (scx, scy) => {
                            let va = await prompt("ymin", ["ymin"], { "ymin": this.grid.ymin }, 300, 300);
                            let m = va['ymin'];
                            if (m != null) {
                                this.grid.ymin = parseInt(m);
                            }
                        },
                        move: () => {
                        }
                    },
                    {
                        label: `ymax ${this.grid.ymax}`,
                        click: async (scx, scy) => {
                            let va = await prompt("ymax", ["ymax"], { "ymax": this.grid.ymax }, 300, 300);
                            let m = va['ymax'];
                            if (m != null) {
                                this.grid.ymax = parseInt(m);
                            }
                        },
                        move: () => {
                        }
                    }
                );
                return menuList
            }

            drawTabs(ctx) {
                if (MGrid.GP) return;

                ctx.lineWidth = 1;

                const nameTabX = this.grid.xi - this.margin.left;
                const optionsTabX = nameTabX + this.tabWidth + this.tabGap;
                const moveTabX = optionsTabX + this.tabWidth + this.tabGap;
                const tabY = this.grid.yi - this.tabHeight;

                const drawTab = (x, color, highlight, text, icon) => {
                    if (icon && icon.draw) {
                        const iconX = x;
                        const iconY = tabY;
                        icon.draw(ctx, iconX, iconY, 20, 20);
                        return;
                    }

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

                };

                const icons = {

                    move: {
                        draw: (ctx, x, y, width, height) => {

                            let circleRadius = Math.min(width, height) / 2;
                            let centerX = x + width / 2;
                            let centerY = y + height / 2;

                            ctx.fillStyle = 'lightCyan';

                            if (highlightTab === 'move') {
                                ctx.fillStyle = 'cyan';
                            }

                            ctx.beginPath();
                            ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                            ctx.fill();

                            ctx.shadowBlur = 0;
                            ctx.shadowOffsetX = 0;
                            ctx.shadowOffsetY = 0;
                            ctx.strokeStyle = 'black';
                            ctx.lineWidth = 1;
                            ctx.stroke();

                            ctx.strokeStyle = 'black';
                            ctx.lineWidth = 1;
                            let arrowLength = circleRadius * 0.8;
                            let arrowHead = 2;

                            ctx.beginPath();
                            ctx.moveTo(centerX, centerY - arrowLength);
                            ctx.lineTo(centerX, centerY - arrowLength + arrowHead);
                            ctx.lineTo(centerX - arrowHead, centerY - arrowLength + arrowHead);
                            ctx.moveTo(centerX, centerY - arrowLength + arrowHead);
                            ctx.lineTo(centerX + arrowHead, centerY - arrowLength + arrowHead);
                            ctx.stroke();

                            ctx.beginPath();
                            ctx.moveTo(centerX, centerY + arrowLength);
                            ctx.lineTo(centerX, centerY + arrowLength - arrowHead);
                            ctx.lineTo(centerX - arrowHead, centerY + arrowLength - arrowHead);
                            ctx.moveTo(centerX, centerY + arrowLength - arrowHead);
                            ctx.lineTo(centerX + arrowHead, centerY + arrowLength - arrowHead);
                            ctx.stroke();

                            ctx.beginPath();
                            ctx.moveTo(centerX - arrowLength, centerY);
                            ctx.lineTo(centerX - arrowLength + arrowHead, centerY);
                            ctx.lineTo(centerX - arrowLength + arrowHead, centerY - arrowHead);
                            ctx.moveTo(centerX - arrowLength + arrowHead, centerY);
                            ctx.lineTo(centerX - arrowLength + arrowHead, centerY + arrowHead);
                            ctx.stroke();

                            ctx.beginPath();
                            ctx.moveTo(centerX + arrowLength, centerY);
                            ctx.lineTo(centerX + arrowLength - arrowHead, centerY);
                            ctx.lineTo(centerX + arrowLength - arrowHead, centerY - arrowHead);
                            ctx.moveTo(centerX + arrowLength - arrowHead, centerY);
                            ctx.lineTo(centerX + arrowLength - arrowHead, centerY + arrowHead);
                            ctx.stroke();
                        }
                    },
                };

                drawTab(nameTabX, 'lightYellow', highlightTab === 'move', '', icons.move);

                ctx.textAlign = 'left';
            }

            async handleKeyDown(scx, scy, plateTrack) {

            }

            async handleMouseOver(scx, scy) {

                this.__moving = false;

                this.grid.rescale();
                let x = scx;
                let y = scy;
                let b = this.buttons;
                let tw = (((30 * b.length)))
                let init = (this.grid.xi + this.grid.width);
                if (init < 0) {
                    init = (0)
                }
                let index = 0;
                for (let button of b) {
                    let buttonX = init + index * bsize;
                    let buttonY = (this.grid.yi - (this.margin.top));
                    let bbw = bsize;
                    index++;
                    if (
                        x >= buttonX &&
                        x <= buttonX + bbw &&
                        y >= buttonY &&
                        y <= buttonY + button.height
                    ) {
                        return await button.highlight(buttonX, buttonY, x, y);

                    }
                }

            }

            async handleMouseUp(scx, scy, pt) {

                this.__moving = false;

                if (this.inside(pt.grid, scx, scy)) {
                    this.highlight();
                    const activeTab = this.isMouseInTab(scx, scy);
                    if (activeTab) {

                        if (activeTab === 'close') {

                            setTimeout(async () => {
                                let confirm = await exec('baja/lib/confirm-widget.js', async () => {
                                    let pm = CurrentLayout.getStashed('plate-track')
                                    pm.plateTrack.setMessage(" Removing plot...")

                                    return this.close();
                                }, " Are you sure you want to delete this plot?")
                                showModal(confirm, 400, 200)
                            }, 100)

                            return;
                        }
                    }

                    let minDistance = 3;
                    let selectedPoint = null;
                    let mouseX = scx;
                    let mouseY = scy;

                    this.scatterData.points.forEach(point => {
                        const pointX = this.grid.X(point.x);
                        const pointY = this.grid.Y(point.y);

                        const distance = Math.sqrt((mouseX - pointX) ** 2 + (mouseY - pointY) ** 2);

                        if (distance <= minDistance) {
                            selectedPoint = point;
                        }
                    });

                    if (selectedPoint) {
                        selectedPoint.isSelected = true;
                    }

                }
            }

            removeSelectedPoints() {

                let removePoints = []
                for (let point of this.scatterData.points) {
                    if (point.isSelected) {
                        removePoints.push(point)
                    }
                }
                this.scatterData.points = this.scatterData.points.filter(point => !removePoints.includes(point));
            }

            close() {
                let pm = CurrentLayout.getStashed('plate-track')
                setTimeout(() => {
                    pm.plateTrack.removePlot(this);
                    pm.plateTrack.wb(null)

                }, 1000);

            }

            async handleMouseDown(scx, scy, pt) {

                if (this.inside(pt.grid, scx, scy)) {
                    this.last_touched = new Date();

                    this.highlight();
                    const activeTab = this.isMouseInTab(scx, scy);
                    if (activeTab) {
                        if (activeTab === 'move') {
                            await this.setMoveListeners(pt, scx, scy)
                        } else if (activeTab === 'minimize') {
                            await this.setOptionListeners(scx, scy, pt)
                        } else if (activeTab === 'close') {

                            setTimeout(async () => {
                                let confirm = await exec('baja/lib/confirm.js', 'Delete this?', async () => {
                                    pt.removePlot(this)
                                    pt.wb(null)
                                })
                                showModal(confirm)

                            }, 200)
                            return;
                        }
                    }

                }

            }

            async setOptionListeners(bx, by, pt) {
                let m = this.getOptionsMenuList(pt)

                smenu = new Menu(m, pt.grid.Xwc(this.grid.xi + this.grid.width / 2 - 200), pt.grid.Ywc(this.grid.yi + this.grid.height / 2 - 20 * m.length / 2), 'rgb(205, 255, 155)', 'navy', 2)

                let active = false;
                let t = {
                    id: 'plot-options-menu',
                    mouseMoveListener: null,
                    mouseUpListener: null,
                    mouseDownListener: null,
                    draw: null,
                    menuManager: null,
                }
                t.draw = (grid, ctx) => {
                    active = true;

                    if (smenu)
                        smenu.draw(ctx, grid)
                }
                t.close = () => {
                    smenu = null;
                }
                t.mouseDownListener = (x, y) => {
                    if (!active)
                        return;
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                    }
                    else {
                        smenu = null;
                        setTimeout(() => {
                            pt.wb(null)
                        }, 200)
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
                    if (!active)
                        return;

                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                        await smenu.mouseUp(pt.grid, mmx, mmy)

                    }
                    smenu = null;

                },

                    setTimeout(() => {
                        pt.wb(t)

                    }, 200)

            }
            updateScatteredDataToHandleIncrememtn() {
                this.scatterData.points = this.scatterData.points.map((point, index) => {
                    return {
                        ...point,
                        name: point.x,
                        x: index
                    };
                });

            }

            async setMoveListeners(pt, x, y) {
                let m = await exec('baja/plate/views/move-plot.js', pt, this, x, y)
                pt.wb({
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
                highlightTab = this.isMouseInTab(px, py);
            }

            showMenuBar(v) {
                this.showTopMenuBar = false;
            }

            buildCurrentConfig() {
                this.config_script.plot = {
                    lineColor: this.lineColor,
                    pointColor: this.pointColor,
                    errorBarColor: 'lightBlue',
                    w: this.w,
                    h: this.h,
                    x: this.x,
                    y: this.y,
                    fitScaleToData: this.fitScaleToData
                };
                return this.config_script;
            }

            toJSON() {
                return {
                    name: this.name,
                    scaleType: this.scaleType,
                    scatterData: this.scatterData,
                    lineEquations: this.lineEquations.map(eq => {

                        if (typeof eq.mfunction === 'function') {
                            return {
                                ...eq,
                                mfunction: encodeURIComponent(eq.mfunction.toString())
                            };
                        }
                        return eq;
                    }),
                    showEquation: this.showEquation,
                    config_script: this.buildCurrentConfig(),
                    grid: {
                        xmin: this.grid.xmin,
                        xmax: this.grid.xmax,
                        ymin: this.grid.ymin,
                        ymax: this.grid.ymax,
                    },
                    x: this.x,
                    y: this.y,
                    w: this.w,
                    h: this.h,
                    type: this.type,
                    lineColor: this.lineColor,
                    pointColor: this.pointColor,
                    errorBarColor: this.errorBarColor,
                    fitScaleToData: this.fitScaleToData,

                    formatAxis: typeof this.formatAxis === 'function'
                        ? btoa(this.formatAxis.toString())
                        : null,
                };
            }

            draw(graph) {

                this.drawPlot(graph, graph.canvas.getCTX(), this.grid, true)
            }

            drawProgressBar(ctx, progress, xi, yi, w, h) {

                const barHeight = 30;
                const barWidth = w * 0.8;
                const x = xi + (w - barWidth) / 2;
                const y = yi + (h - barHeight) / 2;

                const clampedProgress = Math.max(0, Math.min(progress, 100));

                const fillWidth = (clampedProgress / 100) * barWidth;

                console.log(' x ' + x + " y " + y)

                ctx.fillStyle = '#ddd';
                ctx.fillRect(x, y, barWidth, barHeight);

                ctx.fillStyle = 'rgb(0, 87, 163)';
                ctx.fillRect(x, y, fillWidth, barHeight);

                ctx.strokeStyle = '#000';
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, barWidth, barHeight);

                ctx.fillStyle = '#000';
                ctx.font = '16px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`${Math.round(clampedProgress)}%`, x + barWidth / 2, y + barHeight / 2);
            }

            setWidth(_w) {
                this.w = _w;
            }
            setHeight(_h) {
                this.h = _h;
            }

            selectIt() {
                this.highlight()
            }

            deselectAll() {
                this.unhighlight();
            }

            drawScatter(_grid, ctx) {

                if (this.fitScaleToData) {
                    const xmin = Math.min(...this.scatterData.points.map(p => p.x));
                    const xmax = Math.max(...this.scatterData.points.map(p => p.x));
                    const ymin = Math.min(...this.scatterData.points.map(p => p.y));
                    const ymax = Math.max(...this.scatterData.points.map(p => p.y));

                    _grid.zoom(xmin, xmax, ymin, ymax);
                    _grid.rescale();

                }
                const graph = _grid;

                const xmin = 0;
                const xmax = this.scatterData.points.length;
                let validPoints = this.scatterData.points.filter(p => !isNaN(p.y));
                if (validPoints.length === 0) {
                    console.warn("No valid points to calculate ymax.");
                    return null;
                }

                const maxX = Math.max(...this.scatterData.points.map(p => p.x));
                const maxY = Math.max(...this.scatterData.points.map(p => p.y));

                this.grid.setymax(maxY);
                this.grid.setymin(0)
                this.grid.setxmin(0);
                this.grid.rescale();
                ctx.fillStyle = 'rgba(55, 55, 255, 0.3)';
                ctx.lineWidth = 2;
                ctx.shadowBlur = 20;

                let sw = _grid.screenWidth(this.w)
                if (this.aspectRatio === 1) {
                    this.grid.width = sw;
                    this.grid.height = sw;
                }
                this.grid.rescale();
                ctx.lineWidth = 3;
                ctx.setLineDash([2, 6]);
                ctx.strokeStyle = 'lightGray';

                ctx.beginPath();
                ctx.moveTo((this.grid.X(this.grid.xmin)), (this.grid.Y(this.grid.ymin)));
                ctx.lineTo((this.grid.X(this.grid.xmax)), (this.grid.Y(this.grid.ymin)));
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(this.grid.X(this.grid.xmin), this.grid.Y(this.grid.ymin));
                ctx.lineTo(this.grid.X(this.grid.xmin), this.grid.Y(this.grid.ymax));
                ctx.stroke();
                ctx.shadowBlur = 1;
                ctx.lineWidth = 1;

                this.drawAxisLabels(ctx, this.grid, this.x_axis_label, this.y_axis_label)
                const labels = this.scatterData.points.map(point => point.name);
                const data = this.scatterData.points.map(point => point.y);

                if (labels.length > 0 && !this.grid.xmax)
                    this.grid.setxmax(labels.length)

                this.grid.rescale();
                if (this._highlight) {

                    const rectWidth = this.grid.width;
                    const rectHeight = this.grid.height;
                    const cornerSize = 20;
                    const rectX = this.grid.xi - cornerSize / 2;
                    const rectY = this.grid.yi - cornerSize / 2;
                    ctx.shadowBlur = 3;
                    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
                    ctx.shadowOffsetX = 4;
                    ctx.shadowOffsetY = 4;

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

                for (let point of this.scatterData.points) {
                    const xwidth = this.grid.screenWidth(this.w);
                    const xScreen = this.grid.X(point.x);
                    const yScreen = this.grid.Y(point.y);
                    let highlightColor = 'navy';

                    for (let { pattern, color } of this.highlightPatterns) {
                        pattern = stringToPattern(pattern);
                        if (pattern.test(point.name)) {
                            highlightColor = color;
                            break;
                        }
                    }

                    if (!highlightColor && this.hide_unhighlighted) {
                        return;
                    }

                    if (highlightColor) {
                        ctx.fillStyle = "green";
                        if (point.color) ctx.fillStyle = point.color;
                    } else {
                        if (point.color) ctx.fillStyle = point.color;
                    }

                    ctx.beginPath();
                    ctx.lineWidth = 1;

                    if (point.isSelected) {
                        ctx.fillStyle = 'magenta';
                        ctx.lineWidth = 10;
                    }

                    ctx.arc(xScreen, yScreen, 3, 0, 2 * Math.PI);
                    ctx.fill();

                    if (xwidth > 300 && this.showPointLabels) {
                        const randomSignX = Math.random() < 0.5 ? -1 : 1;
                        const randomSignY = Math.random() < 0.5 ? -1 : 1;
                        let randoff = Math.random() * 50 + 50;
                        if (!point.offfsetx) {
                            point.offfsetx = randomSignX * (Math.random() * randoff) - 10;
                        }
                        if (!point.offfsety) {
                            point.offfsety = randomSignY * (Math.random() * randoff) - 10;
                        }
                        const textX = xScreen + point.offfsetx;
                        const textY = yScreen + point.offfsety;
                        if (highlightColor) ctx.fillStyle = highlightColor;
                        else ctx.fillStyle = 'rgba(100,30,90,0.7)';
                        ctx.font = "12px Arial";
                        ctx.fillText(point.name, textX - 10, textY);
                        ctx.stroke();

                        const textMetrics = ctx.measureText(point.name);
                        const textMidX = textX + textMetrics.width / 2;
                        const textMidY = textY - 6;
                        ctx.strokeStyle = 'rgba(250,250,250,0.3)';
                        ctx.fillStyle = 'rgba(250,250,250,0.3)';
                        ctx.beginPath();
                        ctx.moveTo(xScreen, yScreen);
                        ctx.lineTo(textMidX, textMidY);
                        ctx.stroke();
                    }
                }

                if (this.grid.width > 100) {

                    ctx.shadowBlur = 0;
                    ctx.fillStyle = 'blue';
                    ctx.font = "20px Arial";
                    if (this.name && this.name.toLowerCase() != 'untitled')
                        ctx.fillText(`${this.name}`, this.grid.xi + (this.grid.width / 2), this.grid.yi - 15);

                    ctx.fillStyle = 'transparent';
                    ctx.font = "12px Arial";

                    ctx.stroke();
                }

                if (this.drawErrors) {
                    this.drawWithErrorBars(ctx, {
                        errorBarXKey: 'x',
                        errorBarYKey: 'average',
                        errorBarKey: 'stdDev'
                    });
                }

                ctx.shadowBlur = 0;
                ctx.shadowColor = "transparent";

            }

            drawPlot(pt, ctx, fixed) {

                const graph = pt.grid;
                if (this.w <= 0) {
                    this.w = 1
                }
                if (this.h <= 0) {
                    this.h = 1;
                }

                let sw = graph.screenWidth(this.w);
                let sh = graph.screenHeight(this.h);
                if (sw < 10 || sh < 10) {
                    return;
                }

                const grid = this.grid;
                let screen_height = (this.getHeight());
                let screen_width = (this.getWidth());
                const radius = 30;

                ctx.shadowBlur = 4;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
                ctx.fillStyle = "white";
                ctx.shadowColor = "black";

                if (isObjectNotVisible(ctx, (this.grid.xi), (this.grid.yi), sw, sh)) {
                    return;
                }
                if (this.__resizing || this.__moving) {
                    ctx.shadowBlur = 1;
                    ctx.shadowColor = 'black'
                    ctx.fillStyle = 'rgba(100,30,90,0.7)';
                    ctx.fillRect(graph.X(this.x), graph.Y(this.y), sw, sh);
                }
                ctx.shadowBlur = 0;
                if (this.broken || !this.scatterData || !this.scatterData.points) {
                    ctx.fillStyle = 'red'
                    ctx.fillRect(grid.xi, grid.yi, grid.width, grid.height);
                    ctx.fillStyle = 'rgba(100,30,90,0.7)';
                    ctx.font = "22px Arial";

                    ctx.stroke();
                    this.drawButtons(ctx, pt.grid)
                    pt.removePlot(this)
                    return;
                }
                if (fixed) {
                } else {
                    grid.setInset(25, 25);
                    grid.xi = graph.X((this.x));
                    grid.yi = graph.Y((this.y));
                    grid.height = (sh);
                    grid.width = (sw);
                }
                grid.rescale();
                graph.rescale();
                if (this.drawBackground) {
                    let c = 'white';
                    if (this.backgroundColor) {
                        c = this.backgroundColor;
                    }
                    if (this._highlight) {
                        ctx.shadowBlur = 2;
                        ctx.shadowColor = 'lightBlue'
                    } else {

                        ctx.shadowBlur = 0;
                        ctx.shadowColor = 'lightGray'
                    }
                    ctx.fillStyle = c;
                    ctx.fillRect(grid.xi - 70, grid.yi - 70, grid.width + 140, grid.height + 140);
                }

                ctx.shadowBlur = 0;

                if (!MGrid.GP && this.showTopMenuBar) {
                    this.drawTabs(ctx);
                    this.drawButtons(ctx, pt.grid)
                }

                if (this.progress) {
                    if (this.progress === 100) {
                        this.progress = null;
                    }
                    this.drawProgressBar(ctx, this.progress, (this.grid.xi), (this.grid.yi), sw, sh);
                    return;
                }
                ctx.textAlign = 'left';
                if (this.type && this.type === 'dose-response') {
                    this.plotBarChartDoseResponse(graph, ctx)
                } else
                    if (this.type && this.type.startsWith('bar')) {
                        if (this.type.indexOf('aggregate') > 0) {
                            this.plotBarChart(graph, ctx);
                        } else
                            this.plotBarChart(graph, ctx);
                        if (this.lineEquations != null && this.lineEquations.length > 0) {
                            this.plotLines(grid, ctx);
                        }
                        return;
                    } else if (this.type && this.type === 'pie') {
                        this.pieChart(graph, ctx)
                    } else if (this.type === scatter) {
                        this.drawScatter(graph, ctx)
                    }
                    else if (this.type && this.type === 'timeline') {
                        const timelinePoints = this.scatterData.points;
                        if (!timelinePoints || timelinePoints.length === 0) return;

                        const grid = this.grid;
                        const xMin = Math.min(...timelinePoints.map(p => p.x));
                        const xMax = Math.max(...timelinePoints.map(p => p.x));
                        grid.zoom(xMin, xMax, 0, 1);
                        grid.rescale();

                        ctx.lineWidth = 2;
                        ctx.strokeStyle = 'black';
                        ctx.fillStyle = 'black';

                        const timelineY = grid.Y(0.0);
                        const maxY = Math.max(...this.scatterData.points.map(p => p.y));

                        ctx.beginPath();
                        ctx.moveTo(grid.X(xMin), timelineY);
                        ctx.lineTo(grid.X(xMax), timelineY);
                        ctx.stroke();

                        timelinePoints.forEach(point => {
                            const x = grid.X(point.x);
                            const y = grid.Y(point.y);

                            let label = point.name;
                            ctx.fillStyle = point.color || 'navy';
                            ctx.font = '14px Arial';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'bottom';

                            const offset = 20 + (point.offset || 0);

                            if (typeof label === 'number') {
                                if (Number.isInteger(label) && Math.abs(label) >= 1000) {
                                    const absValue = Math.abs(label);
                                    if (absValue >= 1_000_000_000) {
                                        label = (label / 1_000_000_000).toFixed(1) + 'B';
                                    } else if (absValue >= 1_000_000) {
                                        label = (label / 1_000_000).toFixed(1) + 'M';
                                    } else {
                                        label = (label / 1_000).toFixed(1) + 'K';
                                    }
                                } else if (!Number.isInteger(label)) {
                                    label = label.toFixed(2);
                                }
                            }

                            ctx.fillText(label, x, y - offset);

                            if (point.isSelected) {
                                ctx.beginPath();
                                ctx.arc(x, y, 5, 0, 2 * Math.PI);
                                ctx.fillStyle = 'magenta';
                                ctx.fill();
                            }

                            if (point.startX !== undefined) {
                                const startX = grid.X(point.startX);
                                const arrowY = y - 10;

                                ctx.strokeStyle = point.color || 'black';
                                ctx.fillStyle = point.color || 'black';
                                ctx.lineWidth = 4.5;

                                ctx.beginPath();
                                ctx.moveTo(startX, arrowY);
                                ctx.lineTo(x - 12, arrowY);
                                ctx.stroke();

                                const arrowSize = 24;
                                const direction = startX < x ? 1 : -1;

                                ctx.beginPath();
                                ctx.moveTo(x, arrowY);
                                ctx.lineTo(x - direction * arrowSize, arrowY - 10);
                                ctx.lineTo(x - direction * arrowSize, arrowY + 10);
                                ctx.closePath();
                                ctx.fill();
                            }
                        });

                        const tickCount = 6;
                        const interval = (xMax - xMin) / (tickCount - 1);
                        ctx.font = '12px Arial';
                        ctx.fillStyle = 'black';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'top';

                        for (let i = 0; i < tickCount; i++) {
                            const tickXVal = xMin + i * interval;
                            const x = grid.X(tickXVal);

                            const timeLabel = formatTimeLabel(tickXVal, xMin, xMax);

                            ctx.beginPath();
                            ctx.moveTo(x, timelineY + 5);
                            ctx.lineTo(x, timelineY + 10);
                            ctx.stroke();

                            ctx.fillText(timeLabel, x, timelineY + 12);
                        }

                        if (this.name && !(this.name.toLowerCase() === 'untitled')) {
                            ctx.fillStyle = 'blue';
                            ctx.font = "20px Arial";
                            ctx.fillText(`${this.name}`, grid.xi + (grid.width / 2), grid.yi - 25);
                        }
                        if (this._highlight) {
                            const arrowSize = 15;
                            const rectWidth = Math.abs(this.grid.width);
                            const rectHeight = Math.abs(this.grid.height);
                            const cornerSize = 30;

                            const bottomRightStartX = this.grid.xi + rectWidth + 65;
                            const bottomRightStartY = this.grid.yi + rectHeight + 65;

                            const cornerX = bottomRightStartX - cornerSize
                            const cornerY = bottomRightStartY - cornerSize

                            ctx.fillStyle = "lightCyan";
                            ctx.strokeStyle = "lightCyan";
                            ctx.lineWidth = 2;
                            ctx.shadowBlur = 1;
                            ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
                            if (this.resizing) {
                                ctx.fillStyle = "black";
                                ctx.strokeStyle = "lightCyan";
                                ctx.lineWidth = 4;
                                ctx.shadowBlur = 10;
                                ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
                            }
                            ctx.beginPath();
                            ctx.moveTo(cornerX, cornerY);
                            ctx.lineTo(cornerX - arrowSize, cornerY);
                            ctx.lineTo(cornerX, cornerY - arrowSize);
                            ctx.closePath();
                            ctx.fill();

                            ctx.shadowBlur = 0;
                            ctx.shadowColor = "transparent";
                        } else {
                            ctx.shadowBlur = 1;
                        }
                        return;
                    }
                    else {
                        if (!this.grid || !this.grid.rescale) {
                            this.grid.xi = graph.X(this.x);
                            this.grid.yi = graph.Y(this.y);
                            let sw = graph.screenWidth(this.w)
                            this.grid = new MGrid(graph.X(this.x), graph.Y(this.y), sw, sw);
                            const xmin = 0;
                            const xmax = this.scatterData.points.length;
                            let validPoints = this.scatterData.points.filter(p => !isNaN(p.y));
                            if (validPoints.length === 0) {
                                console.warn("No valid points to calculate ymax.");
                                return null;
                            }
                            const ymin = Math.min(...validPoints.map(p => p.y));
                            const ymax = Math.max(...validPoints.map(p => p.y));
                            alert(' not should be .... ')
                            this.grid.zoom(xmin, xmax, ymin, ymax);
                            this.grid.rescale();
                        } else {

                        }
                        if (this._highlight) {
                            ctx.strokeStyle = 'gray';
                        } else {
                            ctx.strokeStyle = 'lightGray';
                        }

                        ctx.setLineDash([]);
                        ctx.shadowColor = 'black';
                        ctx.strokeStyle = 'gray';
                        ctx.beginPath();
                        ctx.textAlign = 'left';
                        ctx.strokeStyle = 'rgba(2, 6, 44, 0.7)';
                        this.plotLines(grid, ctx);
                        this.drawAxisLabels(ctx, grid, this.x_axis_label, this.y_axis_label)

                    }
                if (this._highlight) {
                    const arrowSize = 15;
                    const rectWidth = Math.abs(this.grid.width);
                    const rectHeight = Math.abs(this.grid.height);
                    const cornerSize = 30;

                    const bottomRightStartX = this.grid.xi + rectWidth + 65;
                    const bottomRightStartY = this.grid.yi + rectHeight + 65;

                    const cornerX = bottomRightStartX - cornerSize
                    const cornerY = bottomRightStartY - cornerSize

                    ctx.fillStyle = "lightCyan";
                    ctx.strokeStyle = "lightCyan";
                    ctx.lineWidth = 2;
                    ctx.shadowBlur = 1;
                    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";

                    if (this.resizing) {
                        ctx.fillStyle = "black";
                        ctx.strokeStyle = "lightCyan";
                        ctx.lineWidth = 4;
                        ctx.shadowBlur = 10;
                        ctx.shadowColor = "rgba(0, 0, 0, 0.9)";

                    }

                    ctx.beginPath();
                    ctx.moveTo(cornerX, cornerY);
                    ctx.lineTo(cornerX - arrowSize, cornerY);
                    ctx.lineTo(cornerX, cornerY - arrowSize);
                    ctx.closePath();
                    ctx.fill();

                    ctx.shadowBlur = 0;
                    ctx.shadowColor = "transparent";
                } else {
                    ctx.shadowBlur = 1;
                }
                ctx.setLineDash([]);

            }

            drawAxisTicks(ctx, _grid, minVal, maxVal) {
                const tickCount = 5;
                const range = maxVal - minVal;
                const tickInterval = range / tickCount;
                ctx.lineWidth = 0;
                ctx.shadowBlur = 0;

                try {
                    if (this.formatAxis) {
                        return this.formatAxis(ctx, _grid, minVal, maxVal)
                    }
                } catch (exception) {

                }

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
                        ? value.toFixed(3)
                        : (parseFloat(value) ? parseFloat(value).toFixed(1) : 'N/A');

                    const textWidth = ctx.measureText(text).width;
                    const padding = 5;
                    const ovalWidth = textWidth + padding * 2;
                    const ovalHeight = 16;

                    const textX = cxmin - 30 - ovalWidth / 2;
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

            }

            drawLogAxisTicks(ctx, _grid, minVal, maxVal, logBase = 10) {
                const tickCount = 5;
                const minThreshold = 1e-10;
                const safeMinVal = minVal > 0 ? minVal : minThreshold;

                const logMin = Math.log(safeMinVal) / Math.log(logBase);
                const logMax = Math.log(maxVal) / Math.log(logBase);
                const logRange = logMax - logMin;

                const tickInterval = logRange / tickCount;
                ctx.lineWidth = 0;
                ctx.shadowBlur = 0;

                for (let i = 0; i <= tickCount; i++) {

                    const logValue = logMin + i * tickInterval;
                    const value = Math.pow(logBase, logValue);
                    const position = _grid.Y(value);
                    const cxmin = _grid.X(_grid.xmin);

                    ctx.moveTo(cxmin, position);
                    ctx.lineTo(cxmin - 5, position);

                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    const text = value < 1 ? value.toPrecision(3) : value.toFixed(0);

                    const textWidth = ctx.measureText(text).width;
                    const padding = 5;
                    const ovalWidth = textWidth + padding * 2;
                    const ovalHeight = 16;

                    const textX = cxmin - 30 - ovalWidth / 2;
                    const textY = position;

                    ctx.beginPath();
                    ctx.ellipse(textX, textY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                    ctx.fillStyle = 'white';
                    ctx.fill();

                    ctx.fillStyle = 'black';
                    ctx.fillText(text, textX, textY);
                }

                ctx.fillStyle = 'white';
                ctx.strokeStyle = 'white';
            }

            drawXAxisTicks(ctx, _grid, minVal, maxVal) {
                const tickCount = 7;
                const range = maxVal - minVal;
                const tickInterval = range / tickCount;
                ctx.lineWidth = 0;
                ctx.shadowBlur = 0;
                for (let i = 0; i <= tickCount; i++) {
                    const value = minVal + i * tickInterval;

                    const position = _grid.X(value);
                    const cymin = _grid.Y(_grid.ymin);

                    ctx.moveTo(position, cymin);
                    ctx.lineTo(position, cymin + 5);

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

                    const textX = position;
                    const textY = cymin + 12 - ovalWidth / 2 + 20

                    ctx.beginPath();
                    ctx.ellipse(textX, textY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                    ctx.fillStyle = 'white';
                    ctx.fill();

                    ctx.fillStyle = 'black';
                    ctx.fillText(text, textX, textY);
                }
                ctx.fillStyle = 'white';
                ctx.strokStyle = 'white';
            }
            drawXTimelineAxisTicks(ctx, _grid, minVal, maxVal) {
                const tickCount = 7;
                const range = maxVal - minVal;
                const tickInterval = range / tickCount;
                ctx.lineWidth = 0;
                ctx.shadowBlur = 0;

                for (let i = 0; i <= tickCount; i++) {
                    const value = minVal + i * tickInterval;
                    const position = _grid.X(value);
                    const cymin = _grid.Y(_grid.ymin);

                    ctx.beginPath();
                    ctx.moveTo(position, cymin);
                    ctx.lineTo(position, cymin + 5);
                    ctx.strokeStyle = 'black';
                    ctx.stroke();

                    const year = Math.floor(value);
                    const fractional = value - year;
                    const monthIndex = Math.round(fractional * 12);
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

                    let text;
                    if (monthIndex === 0 || monthIndex === 12) {
                        text = `${year}`;
                    } else {
                        text = `${monthNames[monthIndex % 12]} ${year}`;
                    }

                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    const textWidth = ctx.measureText(text).width;
                    const padding = 5;
                    const ovalWidth = textWidth + padding * 2;
                    const ovalHeight = 16;

                    const textX = position;
                    const textY = cymin + 25;

                    ctx.beginPath();
                    ctx.ellipse(textX, textY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                    ctx.fillStyle = 'white';
                    ctx.fill();

                    ctx.fillStyle = 'black';
                    ctx.fillText(text, textX, textY);
                }

                ctx.fillStyle = 'white';
                ctx.strokeStyle = 'white';
            }

            drawXAxisLogTicks(ctx, _grid, minVal, maxVal, logBase = 10) {
                const tickCount = 7;
                const minThreshold = 1e-10;
                const safeMinVal = minVal > 0 ? minVal : minThreshold;

                const logMin = Math.log(safeMinVal) / Math.log(logBase);
                const logMax = Math.log(maxVal) / Math.log(logBase);
                const logRange = logMax - logMin;

                const tickInterval = logRange / tickCount;
                ctx.lineWidth = 0;
                ctx.shadowBlur = 0;

                for (let i = 0; i <= tickCount; i++) {

                    const logValue = logMin + i * tickInterval;
                    const value = Math.pow(logBase, logValue);

                    const position = _grid.X(value);
                    const cymin = _grid.Y(_grid.ymin);

                    ctx.moveTo(position, cymin);
                    ctx.lineTo(position, cymin + 5);

                    ctx.font = '12px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    const text = value < 1 ? value.toPrecision(3) : value.toFixed(0);

                    const textWidth = ctx.measureText(text).width;
                    const padding = 5;
                    const ovalWidth = textWidth + padding * 2;
                    const ovalHeight = 16;

                    const textX = position;
                    const textY = cymin + 24;

                    ctx.beginPath();
                    ctx.ellipse(textX, textY, ovalWidth / 2, ovalHeight / 2, 0, 0, Math.PI * 2);
                    ctx.fillStyle = 'white';
                    ctx.fill();

                    ctx.fillStyle = 'black';
                    ctx.fillText(text, textX, textY);
                }

                ctx.fillStyle = 'white';
                ctx.strokeStyle = 'white';
            }

            drawButtons(ctx) {
                this.grid.rescale();
                let screen_height = (this.getHeight());
                let screen_width = (this.getWidth());
                let sy = (this.grid.yi);
                if ((sy + screen_height) < 0) {
                    return;
                }
                let index = 0;
                let b = this.buttons;
                let init = (this.grid.xi + this.grid.width);
                if (init < 0) {
                    init = (0);
                }
                ctx.lineWidth = 1;
                for (let button of b) {
                    let buttonX = init + index * bsize;
                    let buttonY = (this.grid.yi - (this.margin.top));
                    let buttonHeight = button.height;

                    if (buttonY < 0 && (buttonY + screen_height) > 0) {
                        buttonY = 10;
                    }
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';

                    ctx.shadowBlur = 2;

                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 0;
                    if (button.name === "close") {
                        let circleRadius = Math.min(bsize, buttonHeight) / 2;
                        let centerX = buttonX + bsize / 2;
                        let centerY = buttonY + buttonHeight / 2;

                        ctx.fillStyle = button.color;

                        if (highlightTab === button.name) {
                            ctx.fillStyle = 'cyan';
                        }

                        ctx.beginPath();
                        ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                        ctx.fill();

                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 2;

                        let padding = 5;
                        let x1 = centerX - circleRadius + padding;
                        let y1 = centerY - circleRadius + padding;
                        let x2 = centerX + circleRadius - padding;
                        let y2 = centerY + circleRadius - padding;

                        ctx.beginPath();
                        ctx.moveTo(x1, y1);
                        ctx.lineTo(x2, y2);
                        ctx.moveTo(x1, y2);
                        ctx.lineTo(x2, y1);
                        ctx.stroke();
                    }

                    else if (button.name === "minimize") {
                        let circleRadius = Math.min(bsize, buttonHeight) / 2;
                        let centerX = buttonX + bsize / 2;
                        let centerY = buttonY + buttonHeight / 2;
                        ctx.fillStyle = button.color;
                        if (this.highlightbutton && button.name === this.highlightbutton)
                            ctx.fillStyle = button.highlight_color;
                        ctx.beginPath();
                        ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                        ctx.fill();
                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.strokeStyle = 'black';
                        ctx.lineWidth = 1;
                        ctx.stroke();

                        ctx.font = `${circleRadius}px Arial`;
                        ctx.fillStyle = 'black';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('M', centerX, centerY);

                    } else {

                        ctx.fillStyle = button.color;
                        ctx.fillRect(buttonX, buttonY, bsize, buttonHeight);

                        ctx.shadowBlur = 0;
                        ctx.shadowOffsetX = 0;
                        ctx.shadowOffsetY = 0;
                        ctx.strokeStyle = 'black';
                        ctx.strokeRect(buttonX, buttonY, bsize, buttonHeight);
                        ctx.fillStyle = 'black';
                        ctx.font = '9px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        let centerX = buttonX + bsize / 2;
                        let centerY = buttonY + buttonHeight / 2;
                        ctx.fillText(button.name, centerX, centerY);
                    }

                    index++;
                }
            }

            drawAxisLabels(ctx, grid, x_axis_label, y_axis_label) {
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
                        ctx.fillText(x_axis_label, grid.xi + grid.width / 2 - 20, grid.yi + grid.height + labelPadding);
                    }

                    if (this.grid.yLogScale) {
                        this.drawLogAxisTicks(ctx, this.grid, this.grid.ymin, this.grid.ymax, this.grid.yLogBase)
                    } else {
                        this.drawAxisTicks(ctx, this.grid, this.grid.ymin, this.grid.ymax, true);
                    }
                    if (this.type === scatter) {
                        if (this.grid.xLogScale) {
                            this.drawXAxisLogTicks(ctx, this.grid, this.grid.xmin, this.grid.xmax, this.grid.xLogBase)
                        } else {
                            this.drawXAxisTicks(ctx, this.grid, this.grid.xmin, this.grid.xmax, true);
                        }
                    }
                    if (this.type === timeline) {
                        this.drawXTimelineAxisTicks(ctx, this.grid, this.grid.xmin, this.grid.xmax, true);
                    }

                }

            }

            getHeight() {
                return this.grid.height;
            }

            getWidth() {
                return this.grid.width;
            }

            inside(grid, x, y, convert) {
                if (smenu) {
                    return true;
                }
                grid.rescale();
                let screen_width = (this.getWidth());
                let screen_height = (this.getHeight())
                let scy = (y)
                let scx = (x)
                if (convert) {
                    scx = grid.X(x)
                    scy = grid.Y(y)
                }

                let _scy = (this.grid.yi);
                let _sc = (this.grid.xi);
                let value = this.isMouseInTab(x, y)
                if (value != null) {
                    return true;
                }

                if (scx > _sc - this.margin.left && scx < _sc + screen_width + this.margin.right) {

                    if (scy > _scy - this.margin.top &&
                        scy < _scy + screen_height + this.margin.bottom) {
                        this.handleMouseOver(x, y)
                        return true;
                    }
                }

                return false;

            }

            drawRegions(context, grid, toleranceFactor = 0.25) {
                const rect_screen_height = Math.abs(grid.height);
                const rect_screen_width = Math.abs(grid.width);
                const rectYi = grid.yi;
                const rectXi = grid.xi;

                const regions = {
                    "bottom center": [rectXi + rect_screen_width / 2, rectYi + rect_screen_height],
                    "bottom right": [rectXi + rect_screen_width, rectYi + rect_screen_height],
                    "bottom left": [rectXi, rectYi + rect_screen_height],
                    "upper right": [rectXi + rect_screen_width, rectYi],
                    "upper center": [rectXi + rect_screen_width / 2, rectYi],
                    "upper left": [rectXi, rectYi],
                    "left center": [rectXi, rectYi + rect_screen_height / 2],
                    "right center": [rectXi + rect_screen_width, rectYi + rect_screen_height / 2],
                };

                context.strokeStyle = 'blue';
                for (const [_, [x, y]] of Object.entries(regions)) {
                    context.strokeRect(x - rect_screen_width * toleranceFactor / 2, y - rect_screen_height * toleranceFactor / 2, rect_screen_width * toleranceFactor, rect_screen_height * toleranceFactor);
                }
            }

            isCloseToPoint(x, y, position, toleranceFactor = 0.25) {

                let rect_screen_height = Math.abs((this.grid.height));
                let rect_screen_width = Math.abs((this.grid.width));
                let rectYi = (this.grid.yi);
                let rectXi = (this.grid.xi);

                let scy = (y);
                let scx = (x);

                let target_x = 0, target_y = 0;

                switch (position.toLowerCase()) {
                    case "bottom center":
                        target_x = rectXi + rect_screen_width / 2;
                        target_y = rectYi + rect_screen_height;
                        break;
                    case "bottom right":
                        target_x = rectXi + rect_screen_width;
                        target_y = rectYi + rect_screen_height;
                        break;
                    case "bottom left":
                        target_x = rectXi;
                        target_y = rectYi + rect_screen_height;
                        break;
                    case "upper right":
                        target_x = rectXi + rect_screen_width;
                        target_y = rectYi;
                        break;
                    case "upper center":
                        target_x = rectXi + rect_screen_width / 2;
                        target_y = rectYi;
                        break;
                    case "upper left":
                        target_x = rectXi;
                        target_y = rectYi;
                        break;
                    case "left center":
                        target_x = rectXi;
                        target_y = rectYi + rect_screen_height / 2;
                        break;
                    case "right center":
                        target_x = rectXi + rect_screen_width;
                        target_y = rectYi + rect_screen_height / 2;
                        break;
                    default:
                        throw new Error("Invalid position specified");
                }

                let tolerance_x = rect_screen_width * toleranceFactor;
                let tolerance_y = rect_screen_height * toleranceFactor;

                return (
                    Math.abs(scy - target_y) <= tolerance_y &&
                    Math.abs(scx - target_x) <= tolerance_x
                );
            }

            bottomCenter(grid, x, y) {

                let rect_screen_height = Math.abs(grid.screenHeight(this.grid.height));
                let rect_screen_width = Math.abs(grid.screenWidth(this.grid.width));
                let rectYi = grid.Y(this.grid.yi);
                let rectXi = grid.X(this.grid.xi);

                let scy = grid.Y(y);
                let scx = grid.X(x);

                let center_x = rectXi + rect_screen_width / 2;
                let center_y = rectYi + rect_screen_height;

                let tolerance_x = rect_screen_width * toleranceFactor;
                let tolerance_y = rect_screen_height * toleranceFactor;

                return (
                    Math.abs(scy - center_y) <= tolerance_y &&
                    Math.abs(scx - center_x) <= tolerance_x
                );
            }

            inButtons(x, y, pt) {
                if (!pt.selected_well) {
                    return false;
                }
                if (this.buttons && this.buttons.length > 0) {
                    let buttonWidth = 20;
                    let buttonY = pt.selected_well.__screen_y + pt.selected_well.__screen_height;

                    for (let index = 0; index < this.txbuttons.length; index++) {
                        let button = this.buttons[index];
                        let buttonX = 100 + pt.selected_well.__screen_x + index * (buttonWidth + 10);
                        let buttonHeight = button.height;

                        if (
                            x >= buttonX &&
                            x <= buttonX + buttonWidth &&
                            y >= buttonY &&
                            y <= buttonY + buttonHeight
                        ) {
                            return true;
                        }
                    }
                }
                return false;
            }

            inResize(mouseX, mouseY) {

                const rectWidth = Math.abs(this.grid.width);
                const rectHeight = Math.abs(this.grid.height);
                const cornerSize = 40;
                const bottomRightStartX = this.grid.xi + rectWidth + 40;
                const bottomRightStartY = this.grid.yi + rectHeight + 40;

                const cornerX = bottomRightStartX - cornerSize
                const cornerY = bottomRightStartY - cornerSize
                return (
                    mouseX >= cornerX &&
                    mouseX <= cornerX + cornerSize &&
                    mouseY >= cornerY &&
                    mouseY <= cornerY + cornerSize
                );
            }

        }
        return resolve(MTimelinePlot)
    })
}
