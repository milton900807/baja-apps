function (pm, grid, start_date, end_date) {

    let color = 'rgba(30,30,100,0.4)';
    let cursorPos = 0;
    const platetrack = pm.plateTrack;
    function formatTime(x, xMin, xMax, start, end) {
        const totalCanvasRange = xMax - xMin;
        const totalTimeRange = end.getTime() - start.getTime();
        const normalizedX = (x - xMin) / totalCanvasRange;
        const date = new Date(start.getTime() + normalizedX * totalTimeRange);
        return date;
    }

    if (!grid) {
        if (!start_date) {
            start_date = new Date();
        }

        if (!end_date) {
            end_date = new Date();
            end_date.setFullYear(start_date.getFullYear() + 1);
        }
    }

    let hd = {
        startX: null,
        startY: null,
        currentX: null,
        currentY: null,
        isDrawing: true,

        id: 'override-arrow-draw',
        draw: (grid, ctx) => {

            if (hd.startX !== null && hd.startY !== null) {
                hd.drawArrow(ctx, hd.startX, hd.startY, hd.currentX, hd.currentY, {
                    color: color,
                    lineWidth: 15,
                    headSize: 25
                });

            }
        },
        drawArrow: (ctx, startX, startY, endX, endY, options = {}) => {
            const {
                color = "black",
                lineWidth = 2,
                headSize = 10
            } = options;

            if (hd.startX !== null && hd.startY !== null) {
                const rectWidth = hd.currentX - hd.startX;
                const rectHeight = hd.currentY - hd.startY
                ctx.fillStyle = 'rgba(10,10,200,0.4)';
                ctx.fillRect(hd.startX, hd.startY, rectWidth, rectHeight);
            }

            const angle = Math.atan2(endY - startY, endX - startX);

            const headLengthX = headSize * Math.cos(angle);
            const headLengthY = headSize * Math.sin(angle);

            const lineEndX = endX - headLengthX;
            const lineEndY = endY - headLengthY;

            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = lineWidth;

            ctx.moveTo(startX, startY);
            ctx.lineTo(lineEndX, lineEndY);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(endX, endY);
            ctx.lineTo(
                endX - headSize * Math.cos(angle - Math.PI / 6),
                endY - headSize * Math.sin(angle - Math.PI / 6)
            );
            ctx.lineTo(
                endX - headSize * Math.cos(angle + Math.PI / 6),
                endY - headSize * Math.sin(angle + Math.PI / 6)
            );
            ctx.lineTo(endX, endY);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
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
            hd.startX = x;
            hd.startY = y;
            hd.currentX = x;
            hd.currentY = y;

            if (grid) {
                let mdate = grid.Xwc(x + grid.xi * 2)
                let date = formatTime(mdate, grid.xmin, grid.xmax, start_date, end_date)
                if (!start_date) {
                    start_date = date;
                }
            }
        },

        mouseMoveListener: (x, y) => {
            if (hd.isDrawing) {
                hd.currentX = x;
                hd.currentY = y;
            }
        },

        mouseUpListener: async (x, y) => {

            function parseHumanDate(dateStr) {

                const parsedDate = new Date(dateStr);

                if (isNaN(parsedDate)) {

                    throw new Error(`Invalid date format: ${dateStr}`);
                }

                return parsedDate;
            }

            if (hd.isDrawing) {

                if (grid) {
                    let mdate = grid.Xwc(x + grid.xi * 2)
                    let date = formatTime(mdate, grid.xmin, grid.xmax, start_date, end_date)
                    end_date = date;
                }

                let main_layout = {
                    wid: 'card',
                    height: '100%',
                    componentRef: 'mainPanel',
                    data: {
                        cards: [
                            [

                                {
                                    'width': '100%',
                                    'height': '100vh',
                                    'component': {
                                        wid: 'html',
                                        data: `<hr> Start date `
                                    }
                                },

                                {
                                    'width': '100%',
                                    'height': '100vh',
                                    'component': {
                                        wid: 'calendar-chooser',
                                        data: {
                                            date: start_date,
                                            select: createIonFunction((_date) => {
                                                start_date = _date;
                                            })
                                        }
                                    }
                                },
                                {
                                    'width': '100%',
                                    'height': '100vh',
                                    'component': {
                                        wid: 'html',
                                        data: `<hr> End date `
                                    }
                                },
                                {
                                    'width': '100%',
                                    'height': '100vh',
                                    'component': {
                                        wid: 'calendar-chooser',
                                        data: {
                                            date: end_date,
                                            select: createIonFunction((_date) => {
                                                end_date = _date;
                                            })
                                        }

                                    }
                                },
                                {
                                    'title': '',
                                    'width': '100%',
                                    'component': {
                                        wid: 'mt-button', data: {
                                            buttons: [
                                                {
                                                    label: 'Yes', ionFunction: createIonFunction(async () => {

                                                        hideAllModal();

                                                        const MPlot = await exec('flexigraph/plot')
                                                        const spanMs = end_date - start_date;
                                                        const spanHours = spanMs / (1000 * 60 * 60);
                                                        const numberOfPoints = 2;
                                                        const dataPoints = [];
                                                        const scatterData = { points: dataPoints };

                                                        const options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' };
                                                        const formattedDate = start_date.toLocaleDateString('en-US', options);
                                                        const formattedDate2 = end_date.toLocaleDateString('en-US', options);

                                                        let i = 0;
                                                        let fraction = i / (numberOfPoints - 1);
                                                        let pointTime = new Date(start_date.getTime() + fraction * spanMs);
                                                        let xHours = (pointTime - start_date) / (1000 * 60 * 60);
                                                        let y = 0.1;

                                                        const options2 = { month: 'long', day: 'numeric', year: 'numeric' };
                                                        const formattedDate3 = start_date.toLocaleDateString('en-US', options2);
                                                        dataPoints.push({ x: xHours, y, name: formattedDate3 });
                                                        i = 1;

                                                        fraction = i / (numberOfPoints - 1);
                                                        pointTime = new Date(start_date.getTime() + fraction * spanMs);
                                                        xHours = (pointTime - start_date) / (1000 * 60 * 60);
                                                        y = 0.1;
                                                        const options4 = { month: 'long', day: 'numeric', year: 'numeric' };
                                                        const formattedDate4 = end_date.toLocaleDateString('en-US', options4);
                                                        dataPoints.push({ x: xHours, y, name: formattedDate4 });
                                                        const plot = new MPlot(scatterData);
                                                        plot.startDate = (start_date);
                                                        plot.endDate = (end_date);
                                                        plot.type = 'timeline'

                                                        const xMin = Math.min(...scatterData.points.map(p => p.x));
                                                        const xMax = Math.max(...scatterData.points.map(p => p.x));
                                                        plot.grid.zoom(xMin, xMax, 0, 1);

                                                        plot.name = formattedDate + ' - ' + formattedDate2;
                                                        plot.x_axis_label = "Time (Years)";
                                                        plot.y_axis_label = "Sample Metric";
                                                        plot.fitScaleToData = false;
                                                        plot.x = pm.plateTrack.grid.Xwc(hd.startX);
                                                        plot.y = pm.plateTrack.grid.Ywc(hd.startY);
                                                        plot.setWidth(pm.plateTrack.grid.worldWidth(400))
                                                        plot.setHeight(pm.plateTrack.grid.worldHeight(200))
                                                        plot.grid.rescale();
                                                        pm.plateTrack.m_plots.push(plot)

                                                        hd.startX = null;
                                                        hd.startY = null;
                                                        hd.currentX = null;
                                                        hd.currentY = null;

                                                        pm.plateTrack.wb(null)

                                                        hd.startX = null;
                                                        hd.startY = null;
                                                        hd.currentX = null;
                                                        hd.currentY = null;

                                                        setTimeout(() => {

                                                            CurrentLayout.reset('mainPanel')

                                                        }, 300)

                                                    })
                                                },
                                                {
                                                    label: 'Cancel', ionFunction: createIonFunction(() => {
                                                        hideAllModal();
                                                        hd.startX = null;
                                                        hd.startY = null;
                                                        hd.currentX = null;
                                                        hd.currentY = null;
                                                        pm.plateTrack.wb(null)

                                                        setTimeout(() => {
                                                            CurrentLayout.reset('mainPanel')
                                                        }, 300)

                                                    })
                                                }
                                            ]
                                        }
                                    }
                                }

                            ]]
                    }
                }

                CurrentLayout.clearComponent('mainPanel')
                CurrentLayout.setComponent('mainPanel', main_layout);

            }

        },
        close: () => {
        },
    };

    pm.plateTrack.setMessage ( " Click and drag a rectangle on the canvas ")

    pm.plateTrack.wb(hd)
    hd.startX = null;
    hd.startY = null;
    hd.currentX = null;
    hd.currentY = null;
}
