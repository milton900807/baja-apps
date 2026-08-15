function (plate_graph, fixAngleTo90) {
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
                x: 0, y: 0, label: 'History', ionFunction: createIonFunction(async () => {
                    plate_graph.plateTrack.popGrid()
                }), icon: '/assets/img/icons/png/left2.png', draw: (grid, ctx, mo, md, img) => {
                    drawRoundedRectIcon(0, grid, ctx, mo, md, img)
                }

            },
            {
                x: 2, y: 0, label: 'Exit folder', ionFunction: createIonFunction(async () => {
                    plate_graph.plateTrack.wb(null)
                    const pt = plate_graph.plateTrack;
                    pt.popFolder ();

                }), icon: '/assets/img/icons/png/left-arrow-48x48-4817844.png', draw: (grid, ctx, mo, md, img) => {
                    drawRoundedRectIcon(2, grid, ctx, mo, md, img)
                }

            },
            {
                x: 4, y: 0, label: 'Move canvas', ionFunction: createIonFunction(async () => {
                    plate_graph.plateTrack.wb(null)

                    const pt = plate_graph.plateTrack;
                    const m = [

                    ]
                    const vp = pt.getTablesAndPlots();
                    for (let v of vp) {
                        let bg = 'navy'
                        let fg = 'white'
                        if (v.plateType) {

                        } else {
                            bg = 'black'
                        }
                        m.push({
                            label: `${v.name}`,
                            click: (xwc, ywc) => {
                                setTimeout(() => {
                                    pt.zoomintoplate(v)
                                    pt.setSelected(v);
                                    pt.menu_vis = false;
                                }, 100)
                            },
                            bg: bg,
                            fg: fg
                        }
                        )
                    }
                    const cols = 1;
                    pt.menu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(0, 87, 163)', 'white', cols)
                    pt.menu.title = "Workbench objects: "
                    pt.menu_vis = true;

                }), icon: '/assets/img/icons/png/menu-bar.svg', draw: (grid, ctx, mo, md, img) => {
                    drawRoundedRectIcon(4, grid, ctx, mo, md, img)
                }

            },
            {
                x: 6, y: 0, label: 'expand up', ionFunction: createIonFunction(() => {
                    zoomin();

                }), icon: '/assets/img/icons/png/zoom-in.svg',
                draw: (grid, ctx, mo, md) => {

                    let buttonX = grid.X(6)
                    let buttonY = grid.Y(grid.ymax)
                    let circleRadius = (bsize) / 2;
                    let centerX = buttonX + bsize / 2;
                    let centerY = buttonY + bsize / 2;
                    ctx.fillStyle = 'lightCyan';
                    if (mo) {
                        ctx.fillStyle = 'cyan'
                    }
                    ctx.shadowBlur = 6;
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
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
                    let arrowLength = circleRadius / 2;
                    let padding = 5;

                    for (let i = 0; i < 4; i++) {
                        let angle = (i * Math.PI) / 2;

                    }

                    function drawArrowhead(x, y, angle) {
                        let size = 6;
                        ctx.beginPath();
                        ctx.moveTo(x, y);
                        ctx.lineTo(x - size * Math.cos(angle - Math.PI / 6), y - size * Math.sin(angle - Math.PI / 6));
                        ctx.lineTo(x - size * Math.cos(angle + Math.PI / 6), y - size * Math.sin(angle + Math.PI / 6));
                        ctx.lineTo(x, y);
                        ctx.fillStyle = 'black';
                        ctx.fill();
                    }

                    for (let i = 0; i < 4; i++) {
                        let angle = (i * Math.PI) / 2;

                        let arrowX = centerX + Math.cos(angle) * (circleRadius - padding / 2);
                        let arrowY = centerY + Math.sin(angle) * (circleRadius - padding / 2);
                        drawArrowhead(arrowX, arrowY, angle);

                        let inwardX = centerX + Math.cos(angle) * (circleRadius - arrowLength - padding * 2);
                        let inwardY = centerY + Math.sin(angle) * (circleRadius - arrowLength - padding * 2);
                        drawArrowhead(inwardX, inwardY, angle + Math.PI);
                    }

                }

            },
            {
                x: 8, y: 0, label: 'expand down', ionFunction: createIonFunction(() => {
                    zoomout();

                }), icon: '/assets/img/icons/png/zoom-out.svg', draw: (grid, ctx, mo, md) => {
                    let buttonX = grid.X(8)
                    let buttonY = grid.Y(grid.ymax)
                    let circleRadius = (bsize) / 2;
                    let centerX = buttonX + bsize / 2;
                    let centerY = buttonY + bsize / 2;
                    ctx.fillStyle = 'lightCyan';
                    if (mo) {
                        ctx.fillStyle = 'cyan'
                    }
                    ctx.shadowBlur = 6;
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
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
                    let arrowLength = circleRadius / 2;
                    let padding = 5;
                    for (let i = 0; i < 4; i++) {
                        let angle = (i * Math.PI) / 2;

                    }

                    function drawArrowhead(x, y, angle) {
                        let size = 6;
                        ctx.beginPath();
                        ctx.moveTo(x, y);
                        ctx.lineTo(x - size * Math.cos(angle - Math.PI / 6), y - size * Math.sin(angle - Math.PI / 6));
                        ctx.lineTo(x - size * Math.cos(angle + Math.PI / 6), y - size * Math.sin(angle + Math.PI / 6));
                        ctx.lineTo(x, y);
                        ctx.fillStyle = 'black';
                        ctx.fill();
                    }

                    for (let i = 0; i < 4; i++) {
                        let angle = (i * Math.PI) / 2;

                        let inwardX = centerX + Math.cos(angle) * (circleRadius - arrowLength - padding * 2);
                        let inwardY = centerY + Math.sin(angle) * (circleRadius - arrowLength - padding * 2);
                        drawArrowhead(inwardX, inwardY, angle + Math.PI);
                    }

                }
            },
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
                x: 12, y: 0, label: 'right angle', ionFunction: createIonFunction(() => {
                    fixAngleTo90 = !fixAngleTo90;

                }),
                icon: '/assets/img/icons/png/right-angle.svg',
                draw: (grid, ctx, mo, md) => {
                    let buttonX = grid.X(12);
                    let buttonY = grid.Y(grid.ymax);
                    let circleRadius = (bsize) / 2;
                    let centerX = buttonX + bsize / 2;
                    let centerY = buttonY + bsize / 2;

                    ctx.fillStyle = mo ? 'cyan' : 'lightCyan';
                    ctx.shadowBlur = 6;
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';

                    ctx.beginPath();
                    ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    const size = circleRadius / 2;
                    const lineWidth = 3;

                    ctx.save();
                    ctx.translate(centerX, centerY);
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = lineWidth;
                    ctx.beginPath();
                    ctx.moveTo(-size, 0);
                    ctx.lineTo(0, 0);
                    ctx.lineTo(0, size);
                    ctx.stroke();
                    ctx.restore();
                }
            },

            {
                x: 14, y: 0, label: 'Pinch', ionFunction: createIonFunction(async () => {

                    let va = await prompt("", ["Width"], { "Width": 10 }, 300, 300)
                    plate_graph.plateTrack.grid.xmax ( va )

                }), icon: '/assets/img/icons/png/yless.svg', draw: (grid, ctx, mo, md, img) => {
                    drawRoundedRectIcon(14, grid, ctx, mo, md, img)

                }
            },
            {
                x: 16, y: 0, label: 'Pinch', ionFunction: createIonFunction(async () => {
                    let va = await prompt("", ["Height"], { "Height": 10 }, 300, 300)
                    plate_graph.plateTrack.grid.xmax ( va )

                }), icon: '/assets/img/icons/png/ymore.svg', draw: (grid, ctx, mo, md, img) => {

                    drawRoundedRectIcon(16, grid, ctx, mo, md, img)

                }
            },

            {
                x: 18, y: 0, label: 'collapse x', ionFunction: createIonFunction(() => {

                    plate_graph.plateTrack.pinchX(-40)

                }), icon: '/assets/img/icons/png/zoom-out.svg', draw: (grid, ctx, mo, md) => {
                    let buttonX = grid.X(18);
                    let buttonY = grid.Y(grid.ymax);
                    let circleRadius = bsize / 2;
                    let centerX = buttonX + bsize / 2;
                    let centerY = buttonY + bsize / 2;
                    ctx.fillStyle = 'lightCyan';
                    if (mo) {
                        ctx.fillStyle = 'cyan';
                    }
                    ctx.shadowBlur = 6;
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 2;
                    let chevronSize = circleRadius / 3;
                    let chevronSpacing = chevronSize / 1.5;

                    function drawChevron(x, y, size, direction) {
                        ctx.beginPath();
                        let offset = size / 2;

                        if (direction === 'left') {
                            ctx.moveTo(x + offset, y - size);
                            ctx.lineTo(x, y);
                            ctx.lineTo(x + offset, y + size);
                        } else if (direction === 'right') {
                            ctx.moveTo(x - offset, y - size);
                            ctx.lineTo(x, y);
                            ctx.lineTo(x - offset, y + size);
                        }

                        ctx.stroke();
                    }
                    let chevronY = centerY;
                    let leftChevronX = centerX - chevronSpacing;
                    let rightChevronX = centerX + chevronSpacing;

                    drawChevron(leftChevronX, chevronY, chevronSize, 'right');
                    drawChevron(rightChevronX, chevronY, chevronSize, 'left');

                }
            },
            {
                x: 20, y: 0, label: 'collapse x', ionFunction: createIonFunction(() => {

                    plate_graph.plateTrack.pinchX(40)

                }), icon: '/assets/img/icons/png/zoom-out.svg', draw: (grid, ctx, mo, md) => {
                    let buttonX = grid.X(20);
                    let buttonY = grid.Y(grid.ymax);
                    let circleRadius = bsize / 2;
                    let centerX = buttonX + bsize / 2;
                    let centerY = buttonY + bsize / 2;
                    ctx.fillStyle = 'lightCyan';
                    if (mo) {
                        ctx.fillStyle = 'cyan';
                    }
                    ctx.shadowBlur = 6;
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, circleRadius, 0, 2 * Math.PI);
                    ctx.fill();
                    ctx.shadowBlur = 0;
                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    ctx.strokeStyle = 'black';
                    ctx.lineWidth = 2;
                    let chevronSize = circleRadius / 3;
                    let chevronSpacing = chevronSize / 1.5;

                    function drawChevron(x, y, size, direction) {
                        ctx.beginPath();
                        let offset = size / 2;

                        if (direction === 'left') {
                            ctx.moveTo(x + offset, y - size);
                            ctx.lineTo(x, y);
                            ctx.lineTo(x + offset, y + size);
                        } else if (direction === 'right') {
                            ctx.moveTo(x - offset, y - size);
                            ctx.lineTo(x, y);
                            ctx.lineTo(x - offset, y + size);
                        }

                        ctx.stroke();
                    }
                    let chevronY = centerY;
                    let leftChevronX = centerX + chevronSpacing * 2;
                    let rightChevronX = centerX - chevronSpacing * 2;
                    drawChevron(leftChevronX, chevronY, chevronSize, 'right');
                    drawChevron(rightChevronX, chevronY, chevronSize, 'left');
                }
            },

            {
                x: 22, y: 0, label: 'Left', ionFunction: createIonFunction(async () => {
                    let l = (plate_graph.plateTrack.grid.xmax - plate_graph.plateTrack.grid.xmin) / 4;
                    let ly = (plate_graph.plateTrack.grid.ymax - plate_graph.plateTrack.grid.ymin) / 4;
                    let ag = new AnimateGrid(plate_graph.plateTrack.grid);
                    await ag.animateTo(plate_graph.plateTrack.grid.xmin - l, plate_graph.plateTrack.grid.xmax - l, plate_graph.plateTrack.grid.ymin, plate_graph.plateTrack.grid.ymax);
                    plate_graph.plateTrack.grid.rescale();
                }), icon: '/assets/img/icons/png/left.svg', mouseOver: createIonFunction(() => {

                }), draw: (grid, ctx, mo, md, img) => {
                    drawRoundedRectIcon(22, grid, ctx, mo, md, img)
                }
            },
            {
                x: 24, y: 0, label: 'Right', ionFunction: createIonFunction(async () => {
                    AnimateGrid.INTERUPT = true;
                    plate_graph.plateTrack.grid.rescale();
                    let ymax = plate_graph.plateTrack.grid.ymax;
                    let ymin = plate_graph.plateTrack.grid.ymin;
                    let ag = new AnimateGrid(plate_graph.plateTrack.grid);
                    let l = (plate_graph.plateTrack.grid.xmax - plate_graph.plateTrack.grid.xmin) / 4;
                    let nxmin = plate_graph.plateTrack.grid.xmin + l
                    let nxmax = plate_graph.plateTrack.grid.xmax + l;
                    await ag.animateTo(nxmin, nxmax, ymin, ymax);
                    plate_graph.plateTrack.grid.rescale();

                }), icon: '/assets/img/icons/png/right.svg', mouseOver: createIonFunction(() => {

                }), draw: (grid, ctx, mo, md, img) => {

                    drawRoundedRectIcon(24, grid, ctx, mo, md, img)

                }
            },
            {
                x: 26, y: 0, label: 'Bookmark', ionFunction: createIonFunction(async () => {

                    plate_graph.plateTrack.showBookmarks();

                }), icon: '/assets/img/icons/png/bookmark.svg', mouseOver: createIonFunction(() => {
                }), draw: (grid, ctx, mo, md, img) => {
                    drawRoundedRectIcon(26, grid, ctx, mo, md, img)
                }
            },
            {
                x: 28, y: 0, label: 'Bookmark', ionFunction: createIonFunction(async () => {

                    plate_graph.plateTrack.showYinYang();

                }), icon: '/assets/img/icons/png/yak.svg', mouseOver: createIonFunction(() => {
                }), draw: (grid, ctx, mo, md, img) => {
                    drawRoundedRectIcon(28, grid, ctx, mo, md, img)
                }
            },
            {
                x: 30, y: 0, label: 'Help', "ionFunction": createIonFunction(async () => {
                    setTimeout(() => {

                        let list = [
                            {
                                label: 'calculate and plot ddCt', click: async () => {
                                    hideAllModal();
                                    setTimeout(() => {

                                        let you = showModal({
                                            wid: 'youtube',
                                            data: {

                                                url: 'https://www.youtube.com/watch?v=NUNyTfNIkcs&feature=youtu.be'
                                            }
                                        }, 700, 500)
                                    }, 1000)

                                }
                            },
                            {
                                label: 'Plot IC50', click: async () => {
                                    hideAllModal();
                                    setTimeout(() => {

                                        let you = showModal({
                                            wid: 'youtube',
                                            data: {

                                                url: 'https://www.youtube.com/watch?v=mjLEn-6IVgk'
                                            }
                                        }, 700, 500)
                                    }, 1000)

                                }
                            },
                            {
                                label: 'Plot using table/cell coordinates', click: async () => {
                                    hideAllModal();
                                    setTimeout(() => {

                                        let you = showModal({
                                            wid: 'youtube',
                                            data: {

                                                url: 'https://www.youtube .com/watch?v=BQxqe4auvvA'
                                            }
                                        }, 700, 500)
                                    }, 1000)

                                }
                            }

                        ]

                        let names = list.map(obj => obj.label);

                        let t = {
                            wid: 'selection-list',
                            data: {
                                single_selection: true,
                                show_button: false,
                                singleSelect: true,
                                listItems: names,
                                button_function: createIonFunction(async (items) => {

                                    let name = items[0]
                                    for (let l of list) {
                                        if (l.label === name) {
                                            l.click()
                                        }
                                    }

                                })
                            }
                        }
                        showModal(t, 500, 500)

                    }, 500)

                }), icon: '/assets/img/icons/png/question.svg', mouseOver: createIonFunction(() => {
                }), draw: (grid, ctx, mo, md, img) => {
                    drawRoundedRectIcon(30, grid, ctx, mo, md, img)
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
                    xmax: 35,
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
