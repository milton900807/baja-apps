return new Promise(async (resolve, reject) => {

    let MGrid = await exec('flexigraph/grid.js')

    function stringToPattern(str, flags = '') {

        const escapedStr = str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        return new RegExp(escapedStr, flags);
    }

    let PCAPlot = class PCAPlot {
        grid;
        _highlight = false;
        x = 10000;
        y = 0;
        w = 0;
        h = 10;
        data = null;
        name = null;
        highlightPatterns = []
        layers = []

        constructor(scatterData, grid) {
            this.scatterData = scatterData;
            this.grid = grid;
        }
        highlight() {
            this._highlight = true;
        }

        unhighlight() {
            this._highlight = false;
        }

        highlight_points(regex) {

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

        append(newScatterData) {
            if (newScatterData && newScatterData.points) {
                this.scatterData.points = this.scatterData.points.concat(newScatterData.points);
            }
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
        plotBarChart(labels, data, chartTitle, graph) {
            const canvas = graph.canvas;
            const ctx = canvas.getCTX();

            const barWidth = this.grid.screenWidth(this.grid.width) / labels.length;
            const maxDataValue = Math.max(...data);
            this.grid.rescale();

            this.grid.rescaleY(0, maxDataValue);

            labels.forEach((label, index) => {
                const xScreen = this.grid.X(index);
                const yScreen = this.grid.Y(data[index]);

                ctx.fillStyle = 'rgba(75, 192, 192, 0.6)';
                ctx.fillRect(xScreen - barWidth / 2, yScreen, barWidth, this.grid.Y(0) - yScreen);

                ctx.fillStyle = 'black';
                ctx.textAlign = 'center';
                ctx.fillText(label, xScreen, this.grid.Y(0) + 20);

                ctx.fillText(data[index].toFixed(2), xScreen, yScreen - 10);
            });

            ctx.fillStyle = 'black';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(chartTitle, this.grid.xi + this.grid.width / 2, this.grid.yi - 20);
        }

        async drawPlot(graph, ctx, grid) {
            if (!this.scatterData) {
                return;
            }
            let canvas = graph.canvas;

            if (!this.grid || !this.grid.rescale) {
                let sw = graph.grid.screenHeight(this.h)
                this.grid = new MGrid(graph.grid.X(this.y), graph.grid.Y(this.x), sw, sw);
            }

            this.w = graph.grid.worldWidth(graph.grid.screenHeight(this.h))

            if (this.grid) {
                this.grid.xi = graph.X(this.x);
                this.grid.yi = graph.Y(this.y);
                this.grid.height = graph.grid.screenHeight(this.h);
                this.grid.width = graph.grid.screenWidth(this.w);
                this.grid.rescale();
            }

            ctx.lineWidth = 3;
            ctx.setLineDash([15, 6]);
            ctx.strokeStyle = 'red';
            const xmin = Math.min(...this.scatterData.points.map(p => p.x));
            const xmax = Math.max(...this.scatterData.points.map(p => p.x));
            const ymin = Math.min(...this.scatterData.points.map(p => p.y));
            const ymax = Math.max(...this.scatterData.points.map(p => p.y));
            this.grid.zoom(xmin, xmax, ymin, ymax);
            if (this._highlight) {
                ctx.strokeStyle = 'gray';
            } else {
                ctx.strokeStyle = 'lightGray';
            }

            ctx.beginPath();
            ctx.moveTo(this.grid.X(xmin), this.grid.Y(0));
            ctx.lineTo(this.grid.X(xmax), this.grid.Y(0));
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(this.grid.X(0), this.grid.Y(ymin));
            ctx.lineTo(this.grid.X(0), this.grid.Y(ymax));
            ctx.stroke();

            ctx.shadowBlur = 1;
            ctx.lineWidth = 1;
            ctx.setLineDash([]);

            ctx.shadowColor = 'black';
            ctx.strokeStyle = 'gray';
            ctx.beginPath();

            if (this._highlight) {
                const rectWidth = this.grid.width;
                const rectHeight = this.grid.height;

                const cornerSize = 15;

                const rectX = this.grid.xi - cornerSize / 2;
                const rectY = this.grid.yi - cornerSize / 2;
                ctx.rect(rectX, rectY, rectWidth, rectHeight);
                ctx.stroke();
                ctx.fillStyle = "rgba(200,0,0,0.4)";
                ctx.fillRect(rectX + rectWidth - cornerSize / 2, rectY + rectHeight - cornerSize / 2, cornerSize, cornerSize);
                ctx.shadowBlur = 1;
            } else {
                ctx.shadowBlur = 0;
            }
            ctx.strokeStyle = 'rgba(10,10,200,0.7)'
            this.scatterData.points.forEach(point => {
                const xwidth = graph.screenWidth(this.grid.width);
                const xScreen = this.grid.X(point.x);
                const yScreen = this.grid.Y(point.y);

                let highlightColor = 'navy';
                for (let { pattern, color } of this.highlightPatterns) {
                    pattern = stringToPattern(pattern)
                    if (pattern.test(point.name)) {
                        highlightColor = color;
                        break;
                    }
                }
                if (!highlightColor && this.hide_unhighlighted) {
                    return;
                }
                if (highlightColor) {
                    ctx.fillStyle = highlightColor;
                }
                else
                    ctx.strokeStyle = 'rgba(10,10,200,0.7)'
                if (point.isSelected) {
                    ctx.fillStyle = 'magenta';
                }
                else if (point.rgb) {
                    ctx.fillStyle = point.rgb;
                    for (let l of this.layers) {

                        l.setIntervalColor ( point.xi, point.xf, 1, '', point.rgb)
                    }

                } else {
                    ctx.fillStyle = 'rgba(10,10,200,0.4)'
                }
                ctx.beginPath();
                ctx.arc(xScreen, yScreen, 3, 0, 2 * Math.PI);
                ctx.fill();
                if (xwidth > 300) {
                    const randomSignX = Math.random() < 0.5 ? -1 : 1;
                    const randomSignY = Math.random() < 0.5 ? -1 : 1;
                    if (!point.offfsetx) {
                        point.offfsetx = randomSignX * (Math.random() * 120) - 10;
                    }
                    if (!point.offfsety) {
                        point.offfsety = randomSignY * (Math.random() * 130) - 10;
                    }
                    const textX = xScreen + point.offfsetx;
                    const textY = yScreen + point.offfsety;
                    if (highlightColor)
                        ctx.fillStyle = highlightColor;
                    else
                        ctx.fillStyle = 'rgba(100,30,90,0.7)';
                    ctx.font = "12px Arial";
                    ctx.fillText(point.name, textX, textY);
                    const textMetrics = ctx.measureText(point.name);
                    const textMidX = textX + textMetrics.width / 2;
                    const textMidY = textY - 6;

                    if (highlightColor)
                        ctx.strokeStyle = highlightColor;
                    else {
                        ctx.strokeStyle = 'lightGray'
                    }

                    ctx.beginPath();
                    ctx.moveTo(xScreen, yScreen);
                    ctx.lineTo(textMidX, textMidY);
                    ctx.stroke();

                }

            });

            const xminLabel = xmin.toFixed(2);
            const xmaxLabel = xmax.toFixed(2);
            const yminLabel = ymin.toFixed(2);
            const ymaxLabel = ymax.toFixed(2);
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'black';
            ctx.font = "10px Arial";
            if (this.name)
                ctx.fillText(`${this.name}`, this.grid.xi + 5, this.grid.yi - 15);

            ctx.fillStyle = 'black';
            ctx.font = "12px Arial";

            ctx.fillText(`xmin: ${xminLabel}`, this.grid.X(xmin) + 5, this.grid.Y(0) + 15);

            ctx.fillText(`xmax: ${xmaxLabel}`, this.grid.X(xmax) - 50, this.grid.Y(0) + 15);

            ctx.fillText(`ymin: ${yminLabel}`, this.grid.X(0) + 5, this.grid.Y(ymin) - 5);

            ctx.fillText(`ymax: ${ymaxLabel}`, this.grid.X(0) + 5, this.grid.Y(ymax) + 15);
            ctx.stroke();

        }

        inside(px, py) {
            let rx = this.grid.xi;
            let ry = this.grid.yi;
            let width = this.grid.width;
            let height = this.grid.height;
            const withinXBounds = px >= rx && px <= (rx + width);
            const withinYBounds = py >= ry && py <= (ry + height);
            return withinXBounds && withinYBounds;
        }

        inResize(mouseX, mouseY) {
            const rectWidth = Math.abs(this.grid.width);
            const rectHeight = Math.abs(this.grid.height);
            const rectX = this.grid.xi;
            const rectY = this.grid.yi;
            const cornerSize = 30;

            const cornerX = rectX + rectWidth - cornerSize / 2
            const cornerY = rectY + rectHeight - cornerSize / 2

            return (
                mouseX >= cornerX &&
                mouseX <= cornerX + cornerSize &&
                mouseY >= cornerY &&
                mouseY <= cornerY + cornerSize
            );
        }

    }
    return resolve(PCAPlot)
})
