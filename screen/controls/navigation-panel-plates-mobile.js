function (plate_graph) {
    return new Promise(async (resolve, reject) => {
        let AnimateGrid = await exec('flexigraph/animate-it.js')
        let PlateTrack = await exec('baja/plate/plate-track.js')
        let MGrid = await exec('flexigraph/grid.js')
        let MPlot = await exec('flexigraph/plot.js')
        let Plate = await exec('baja/plate/plate.js');
        let GenericWell = await exec('baja/plate/well.js')
        let TransferFunction = await exec('baja/plate/transfer-functions.js')
        let Menu = await exec('flexigraph/menu.js');

        const drawCircleIcon = (xx, grid, ctx, mo, md, img) => {
            let buttonX = grid.X(xx);
            let buttonY = grid.Y(grid.ymax);

            let circleRadius = bsize / 2;
            let centerX = buttonX + bsize / 2;
            let centerY = buttonY + bsize / 2;

            ctx.fillStyle = 'lightCyan';

            if (mo) {
                ctx.fillStyle = 'cyan';
            }
            ctx.shadowBlur = 6;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';

            ctx.beginPath();
            ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
            ctx.fill();

            ctx.shadowBlur = 6;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
            ctx.save();
            ctx.beginPath();
            ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.clip();

            ctx.restore();

            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 0;
            ctx.stroke();

            if (img) {
                ctx.drawImage(img, centerX - circleRadius, centerY - circleRadius, circleRadius * 2, circleRadius * 2);
            }

        }
        const drawRoundedRectIcon = (xx, grid, ctx, mo, md, img) => {
            let buttonX = grid.X(xx);
            let buttonY = grid.Y(grid.ymax);

            let rectWidth = bsize;
            let rectHeight = bsize;
            let cornerRadius = 5;

            ctx.fillStyle = 'lightCyan';
            if (mo) {
                ctx.fillStyle = 'cyan';
            }
            ctx.shadowBlur = 6;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';

            ctx.beginPath();
            ctx.moveTo(buttonX + cornerRadius, buttonY);
            ctx.arcTo(buttonX + rectWidth, buttonY, buttonX + rectWidth, buttonY + rectHeight, cornerRadius);
            ctx.arcTo(buttonX + rectWidth, buttonY + rectHeight, buttonX, buttonY + rectHeight, cornerRadius);
            ctx.arcTo(buttonX, buttonY + rectHeight, buttonX, buttonY, cornerRadius);
            ctx.arcTo(buttonX, buttonY, buttonX + rectWidth, buttonY, cornerRadius);
            ctx.closePath();
            ctx.fill();

            ctx.save();
            ctx.clip();
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';

            if (img) {
                ctx.drawImage(img, buttonX, buttonY, rectWidth, rectHeight);
            }

            ctx.restore();

            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        }

        let zoomin = async () => {
            AnimateGrid.INTERUPT = true;

            plate_graph.plateTrack.grid.rescale();

            mousePriority = false;

            let xmax = plate_graph.plateTrack.grid.xmax;
            let xmin = plate_graph.plateTrack.grid.xmin;
            let ymax = plate_graph.plateTrack.grid.ymax;
            let ymin = plate_graph.plateTrack.grid.ymin;
            let xdf = Math.abs((xmax - xmin) / 10);
            let ydf = Math.abs((ymax - ymin) / 10);

            ymax -= ydf;
            ymin += ydf;
            xmax -= xdf;
            xmin += xdf;
            let ag = new AnimateGrid(plate_graph.plateTrack.grid);
            await ag.animateTo(xmin, xmax, ymin, ymax);
            plate_graph.plateTrack.grid.rescale();
        }

        let zoomout = async () => {
            AnimateGrid.INTERUPT = true;
            plate_graph.plateTrack.grid.rescale();
            smenu = null;
            mousePriority = false;

            let xmax = plate_graph.plateTrack.grid.xmax;
            let xmin = plate_graph.plateTrack.grid.xmin;
            let ymax = plate_graph.plateTrack.grid.ymax;
            let ymin = plate_graph.plateTrack.grid.ymin;
            let xdf = Math.abs((xmax - xmin) / 10);
            let ydf = Math.abs((ymax - ymin) / 10);

            ymax += ydf;
            ymin -= ydf;
            xmax += xdf;
            xmin -= xdf;
            let ag = new AnimateGrid(plate_graph.plateTrack.grid);
            await ag.animateTo(xmin, xmax, ymin, ymax);
            plate_graph.plateTrack.grid.rescale();
        }

        let zoomtofitplates = () => {
            AnimateGrid.INTERUPT = true;
            plate_graph.plateTrack.zoomtfit()
        }

        const lassoIcon = new Image();
        lassoIcon.src = '/assets/img/icons/png/lasso.svg';
        lassoIcon.onload = () => {
            console.log(" loaded ")
        }

        const bsize = 24

        const arrowImg = new Image();
        arrowImg.src = "assets/img/icons/png/left-arrow-48x48-4817844.png";
        arrowImgLoaded = false;

        arrowImg.onload = () => {
            arrowImgLoaded = true;
        };

        let buttons = [
            {
                x: 10, y: 0, label: 'Highlight', ionFunction: createIonFunction(async () => {
                    lassoPolygon = [];
                    let isDrawing = false;
                    let lasso = {
                        id: 'override-select-table',
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
                            plate_graph.plateTrack.lassoSelect(scPolygon, plate_graph.plateTrack.grid, x, y);
                            lassoPolygon = []
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
                    plate_graph.plateTrack.wb(lasso)
                }), icon: '/assets/img/icons/png/lasso.svg', draw: (grid, ctx, mo, md, img) => {

                    drawRoundedRectIcon(10, grid, ctx, mo, md, img)

                }

            },
            {
                x: 12, y: 0, label: 'Box zoom', ionFunction: createIonFunction(async () => {
                    plate_graph.plateTrack.wb(null)
                    console.log(" box zoomikng....")
                    let currentShape = null;
                    let Rectangle = await exec('flexigraph/shapes/rect.js')
                    let md = false;
                    let mouseDownListener = async (x, y) => {

                        currentShape = new Rectangle('test', plate_graph.plateTrack.grid.Xwc(x), plate_graph.plateTrack.grid.Ywc(y));
                        currentShape.visible = true;
                        md = true;
                    }
                    let mouseMoveListener = (x, y) => {
                        if (!md) {
                            currentShape = null;
                            return;
                        }
                        if (currentShape) {
                            currentShape.update(plate_graph.plateTrack.grid.Xwc(x), plate_graph.plateTrack.grid.Ywc(y))
                        }
                    }
                    let mouseUpListener = async (x, y) => {
                        if (currentShape) {
                            let sw = plate_graph.plateTrack.grid.screenWidth(currentShape.w);
                            let sh = plate_graph.plateTrack.grid.screenHeight(currentShape.h);
                            if (sw < 20 || sh < 20) {
                                currentShape = null;
                                plate_graph.plateTrack.wb(null)
                                return;
                            }

                            AnimateGrid.INTERUPT = false;
                            let ag = new AnimateGrid(plate_graph.plateTrack.grid);
                            await ag.animateTo((currentShape.x), currentShape.x + currentShape.w,
                                currentShape.y - currentShape.h, currentShape.y, 10)

                            setTimeout(async () => {

                                plate_graph.plateTrack.wb(null)

                            }, 1000)

                        }
                        currentShape = null;
                        md = false;
                    }
                    let t = {
                        id: 'override-box' + uuid(),
                        priority: true,
                        close: () => {
                            console.log("box done ")

                        },
                        mouseMoveListener: mouseMoveListener,
                        mouseUpListener: mouseUpListener,
                        mouseDownListener: mouseDownListener,
                        draw: (grid, ctx) => {
                            if (currentShape && currentShape.draw != null) {
                                currentShape.draw(grid, ctx)
                            }

                        },
                    }
                    plate_graph.plateTrack.wb(t)
                }), icon: '/assets/img/icons/png/box-zoom.svg', draw: (grid, ctx, mo, md, img) => {
                    drawRoundedRectIcon(12, grid, ctx, mo, md, img)

                }

            },

            {
                x: 14, y: 0, label: 'Bookmark', ionFunction: createIonFunction(async () => {

                    plate_graph.plateTrack.showBookmarks();

                }), icon: '/assets/img/icons/png/bookmark.svg', mouseOver: createIonFunction(() => {
                }), draw: (grid, ctx, mo, md, img) => {
                    drawRoundedRectIcon(14, grid, ctx, mo, md, img)
                }
            },
        ]

        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': 25,
                'grid': {
                    xmin: 0,
                    xmax: 30,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': buttons
            }
        }

        resolve(button_canvas)

    })
}
