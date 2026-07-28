function (plate_graph) {
    return new Promise(async (resolve, reject) => {
        let AnimateGrid = await exec('flexigraph/animate-it.js')
        let Menu = await exec('flexigraph/menu.js');



        let graph = plate_graph.plateTrack.grid;



        const originalxmax = graph.getxmax();
        const originalymax = graph.getymax();
        const originalxmin = graph.getxmin();
        const originalymin = graph.getymin();



        const drawCircleIcon = (xx, grid, ctx, mo, md, img, highlighted = false) => {
            let buttonX = grid.X(xx);
            let buttonY = grid.Y(grid.ymax);

            let circleRadius = bsize / 2;
            let centerX = buttonX + bsize / 2;
            let centerY = buttonY + bsize / 2;

            ctx.fillStyle = 'white';

            if (mo || highlighted) {
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
        };

        const drawRoundedRectIcon = (
            xx,
            grid,
            ctx,
            mo,
            md,
            img,
            highlighted = false
        ) => {

            const buttonX = grid.X(xx);
            const buttonY = grid.Y(grid.ymax);

            // Smaller overall footprint
            const inset = 5;

            const rectWidth = bsize - inset;
            const rectHeight = bsize - inset;

            const x = buttonX + inset / 2;
            const y = buttonY + inset / 2;

            // Oval / pill look
            const radius = rectHeight / 2;

            const isActive = mo || highlighted;
            const isPressed = md;

            // ---------------------------------
            // Modern color palette
            // ---------------------------------
            const borderColor = isActive
                ? 'rgba(59,130,246,0.95)'
                : 'rgba(30,41,59,0.14)';

            const topFill = isActive
                ? 'rgba(239,246,255,1)'
                : 'rgba(255,255,255,1)';

            const bottomFill = isActive
                ? 'rgba(219,234,254,1)'
                : 'rgba(241,245,249,1)';

            const shadowColor = isPressed
                ? 'rgba(15,23,42,0.10)'
                : 'rgba(15,23,42,0.18)';

            // ---------------------------------
            // Rounded rect helper
            // ---------------------------------
            const roundedRect = (rx, ry, rw, rh, rr) => {

                ctx.beginPath();

                ctx.moveTo(rx + rr, ry);

                ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, rr);
                ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, rr);
                ctx.arcTo(rx, ry + rh, rx, ry, rr);
                ctx.arcTo(rx, ry, rx + rw, ry, rr);

                ctx.closePath();
            };

            ctx.save();

            // ---------------------------------
            // Shadow
            // ---------------------------------
            ctx.shadowBlur = isActive ? 12 : 7;
            ctx.shadowColor = shadowColor;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = isPressed ? 1 : 3;

            // ---------------------------------
            // Background gradient
            // ---------------------------------
            const grad = ctx.createLinearGradient(
                0,
                y,
                0,
                y + rectHeight
            );

            grad.addColorStop(0, topFill);
            grad.addColorStop(1, bottomFill);

            roundedRect(x, y, rectWidth, rectHeight, radius);

            ctx.fillStyle = grad;
            ctx.fill();

            // ---------------------------------
            // Border
            // ---------------------------------
            ctx.lineWidth = isActive ? 2 : 1.25;
            ctx.strokeStyle = borderColor;
            ctx.stroke();

            // ---------------------------------
            // Gloss highlight
            // ---------------------------------
            ctx.shadowBlur = 0;
            ctx.shadowColor = 'transparent';

            ctx.globalAlpha = 0.55;

            roundedRect(
                x + 1,
                y + 1,
                rectWidth - 2,
                (rectHeight / 2) - 1,
                radius
            );

            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.globalAlpha = 1;

            // ---------------------------------
            // Clip icon area
            // ---------------------------------
            roundedRect(x, y, rectWidth, rectHeight, radius);

            ctx.clip();

            // ---------------------------------
            // Draw icon large and centered
            // ---------------------------------
            if (img) {

                // minimal padding so icon fills the oval
                const padding = 3;

                ctx.drawImage(
                    img,
                    x + padding,
                    y + padding,
                    rectWidth - padding * 2,
                    rectHeight - padding * 2
                );
            }

            ctx.restore();
        };

        function setButtonHighlight(buttons, buttonToHighlight) {
            for (const btn of buttons) {
                btn.isHighlighted = (btn === buttonToHighlight);
            }
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
                x: 0, y: 0, label: 'Jump to previous spot', ionFunction: createIonFunction(async () => {
                    plate_graph.plateTrack.popGrid()
                }), icon: '/assets/img/icons/png/left2.png', draw: (grid, ctx, mo, md, img) => {
                    drawRoundedRectIcon(0, grid, ctx, mo, md, img)
                }, mouseOver: createIonFunction(() => {
                    plate_graph.plateTrack.setMessage("Jump to previous spot", 2)

                })

            },
            {
                x: 2, y: 0, label: 'navigate out of folder.', ionFunction: createIonFunction(async () => {

                    if (plate_graph.plateTrack.ptracks.length > 0) {
                        plate_graph.plateTrack.wb(null)
                        const pt = plate_graph.plateTrack;
                        plate_graph.plateTrack.popFolder();
                    }

                }), icon: '/assets/img/icons/png/left-arrow-48x48-4817844.png', draw: (grid, ctx, mo, md, img) => {

                    // if (plate_graph.plateTrack.ptracks.length > 0) {
                    drawRoundedRectIcon(2, grid, ctx, mo, md, img)
                    // }
                }, mouseOver: createIonFunction(() => {
                    plate_graph.plateTrack.setMessage("Navigate out of folder.", 2)

                })

            },
            {
                x: 4, y: 0, label: 'Select an object on the canvas', ionFunction: createIonFunction(async () => {
                    // plate_graph.plateTrack.wb(null)

                    const pt = plate_graph.plateTrack;
                    const m = [

                    ]
                    const vp = plate_graph.plateTrack.getTablesAndPlots();
                    for (let v of vp) {
                        let bg = 'navy'
                        let fg = 'white'
                        if (v.plateType) {

                        } else {
                            bg = 'black'
                        }

                        let tr = plate_graph.plateTrack.getTableByName(v.name)
                        if (tr && !tr.hidden) {
                            m.push({
                                label: `${v.name}`,
                                click: (xwc, ywc) => {
                                    setTimeout(() => {

                                        plate_graph.plateTrack.wb(null)
                                        plate_graph.plateTrack.zoomintoplate(v)
                                        plate_graph.plateTrack.setSelected(v);
                                        plate_graph.plateTrack.menu_vis = false;
                                    }, 100)
                                },
                                bg: bg,
                                fg: fg
                            }
                            )
                        }
                        if (!tr) {
                            tr = plate_graph.plateTrack.getPlotByName(v.name)
                            if (tr) {
                                m.push({
                                    label: `${v.name}`,
                                    click: (xwc, ywc) => {
                                        setTimeout(() => {

                                            plate_graph.plateTrack.wb(null)
                                            plate_graph.plateTrack.zoomintoplot(v)
                                            plate_graph.plateTrack.setSelected(v);
                                            plate_graph.plateTrack.menu_vis = false;
                                        }, 100)
                                    },
                                    bg: bg,
                                    fg: fg
                                }
                                )
                            }
                        }

                    }

                    let keys = Object.keys(plate_graph.plateTrack.bookmarks);
                    for (let key of keys) {
                        m.push({
                            label: `${key}`,
                            click: (xwc, ywc) => {
                                plate_graph.plateTrack.setMessage(key)
                                plate_graph.plateTrack.goToBookmark(plate_graph.plateTrack.bookmarks[key])
                            }
                        })
                    }


                    m.push({
                        label: 'New variable...',
                        click: async (x, y) => {
                            const va = await prompt("Name the variable", ["Name", "Value"], { "Name": generateNautName(), "Value": '' }, 300, 400);
                            const tablename = va['Name']
                            const value = va['Value']
                            let ltable = pt.getTableByName(tablename);
                            if (ltable != null) {
                                infoPrompt("Variable name already taken.")
                                return;
                            }
                            ltable = pt.newSimplePlate(tablename, 1, 1, null, 0);
                            ltable.displayNumberValues = false;
                            ltable.grid.xi = 0;
                            ltable.grid.yi = 0;
                            ltable.grid.width = pt.grid.worldWidth(100);
                            ltable.grid.height = pt.grid.worldHeight(100);
                            ltable.selectWellsByString('[0:][0:]');
                            const intoSelectedWells = ltable.getSelectedWellsInOrder();
                            intoSelectedWells[0].setValue(Number(value).toFixed(4));
                            ltable.deselectWells();

                            const graph = CurrentLayout.getStashed('graph')
                            graph.setMouseMode("msg:Click on canvas to drop variable")
                            const t = {
                                id: 'override-droptable',
                                mouseMoveListener: async (x, y) => { },
                                mouseUpListener: async (x, y) => {
                                    ltable.grid.xi = pt.grid.Xwc(x);
                                    ltable.grid.yi = pt.grid.Ywc(y) - ltable.grid.height;
                                    ltable.grid.width = pt.grid.worldWidth(300);
                                    ltable.grid.height = pt.grid.worldHeight(100);
                                    pt.wb(null)
                                },
                                mouseDownListener: async (x, y) => {
                                },
                                init: () => {
                                },
                                close: () => {
                                },
                                priority: true,
                                draw: (_grid, ctx) => {
                                },
                            };
                            pt.wb(t)



                        },

                        bg: 'yellow',
                        fg: 'black'

                    })


                    const pm = {
                        plateTrack: pt
                    }


                    let subset = [
                        {
                            label: 'Timeline',
                            click: async (x, y) => {
                                await exec('baja/draw/timeline', pm)
                                graph.setMessageCenter('Click and drag a box... ', 40)
                            }
                        },
                        {
                            label: 'Table',
                            click: async (x, y) => {
                                await exec('baja/draw/table-selection-list', pm)
                                graph.setMessageCenter('Click and drag a box... ', 40)
                            }
                        },
                        {
                            label: 'Postit Note',
                            click: async (x, y) => {
                                await exec('baja/draw/draw-postit.js', pm.plateTrack)
                                graph.setMessageCenter('Click on the spot you want to post a note... ', 40)
                            }
                        },
                        {
                            label: 'Simple Arrow',
                            click: async (x, y) => {
                                await exec('baja/draw/draw-arrow.js', pm.plateTrack)
                                graph.setMessageCenter('Click and drag the arrow... ', 40)
                            }
                        },
                        {
                            label: 'Line',
                            click: async (x, y) => {
                                await exec('baja/draw/draw-line-svg.js', pm.plateTrack)
                                graph.setMessageCenter('Click and drag the arrow... ', 40)
                            }
                        },
                        {
                            label: 'Morpholine',
                            click: async (x, y) => {
                                await exec('baja/draw/draw2d-molecule-svg.js', pm.plateTrack)
                                graph.setMessageCenter('Click and drag the arrow... ', 40)
                            }
                        },
                        {
                            label: 'Moledulear Editor',
                            click: async (x, y) => {
                                let button_canvas2 = await exec(
                                    'screen/controls/navigation-molecular-editor.js',
                                    graph
                                )
                                CurrentLayout.setComponent('selectedPanel', button_canvas2)
                            }
                        },
                        {
                            label: 'Notebook',
                            click: async (x, y) => {
                                await exec('baja/draw/draw-simple-note.js', pm.plateTrack)
                                graph.setMessageCenter('Click on the spot you want to post a note... ', 40)
                            }
                        },
                        {
                            label: 'Arrow Note (left)',
                            click: async (x, y) => {
                                await exec('baja/draw/draw-arrow-note.js', pm.plateTrack, 'left')
                                graph.setMessageCenter('Click on the spot you want to post a note... ', 40)
                            }
                        },
                        {
                            label: 'Arrow Note (right)',
                            click: async (x, y) => {
                                await exec('baja/draw/draw-arrow-note.js', pm.plateTrack, 'right')
                                graph.setMessageCenter('Click on the spot you want to post a note... ', 40)
                            }
                        },
                        {
                            label: 'Arrow Note (Up)',
                            click: async (x, y) => {
                                await exec('baja/draw/draw-arrow-note.js', pm.plateTrack, 'up')
                                graph.setMessageCenter('Click on the spot you want to post a note... ', 40)
                            }
                        },
                        {
                            label: 'Arrow Note (Down)',
                            click: async (x, y) => {
                                await exec('baja/draw/draw-arrow-note.js', pm.plateTrack, 'down')
                                graph.setMessageCenter('Click on the spot you want to post a note... ', 40)
                            }
                        },
                        {
                            label: 'Poster export window',
                            click: async (x, y) => {
                                pm.plateTrack.setMessage("Click and drag poster window", 2)
                                await exec('baja/draw/draw-border.js', pm.plateTrack)
                            }
                        },
                        {
                            label: 'Title',
                            click: async (x, y) => {
                                await exec('baja/draw/draw-rectangle', pm.plateTrack)
                            }
                        },
                        {
                            label: 'Textarea',
                            click: async (x, y) => {
                                await exec('baja/draw/text.js', pm.plateTrack, "SIMPLE_TEXT")
                            }
                        },
                        {
                            label: 'Folder',
                            click: async (x, y) => {
                                await exec('baja/draw/folder.js', pm.plateTrack)
                            }
                        }
                    ]






                    m.push({
                        label: 'Draw',
                        click: async (x, y) => {

                            pm.plateTrack.wb(null)
                            pm.plateTrack.setMenu(subset)

                        },

                        bg: 'yellow',
                        fg: 'black'

                    })

                    const cols = 2;
                    plate_graph.plateTrack.menu = new Menu(m, plate_graph.plateTrack.grid.Xwc(plate_graph.plateTrack.grid.xi + plate_graph.plateTrack.grid.width / 2 - 200), plate_graph.plateTrack.grid.Ywc(plate_graph.plateTrack.grid.yi + plate_graph.plateTrack.grid.height / 2 - 20 * m.length / 2), 'rgb(0, 87, 163)', 'white', cols)
                    plate_graph.plateTrack.menu.title = "Workbench objects: "
                    plate_graph.plateTrack.menu_vis = true;

                }), icon: '/assets/img/icons/png/menu-bar.svg', draw: (grid, ctx, mo, md, img) => {
                    drawRoundedRectIcon(4, grid, ctx, mo, md, img)
                }, mouseOver: createIonFunction(() => {
                    plate_graph.plateTrack.setMessage(" Zoom to an object on the canvas ", 2)

                })

            },
            {
                x: 6, y: 0, label: 'Zoom in', ionFunction: createIonFunction(() => {

                    plate_graph.plateTrack.wb(null)

                    zoomin();

                }), icon: await exec('icons/svg/zoomin')


                , mouseOver: createIonFunction(() => {
                    plate_graph.plateTrack.setMessage("Zoom in", 2)

                })

            },
            {
                x: 8, y: 0, label: 'Zoom out', ionFunction: createIonFunction(() => {
                    plate_graph.plateTrack.wb(null)

                    zoomout();

                }),

                icon: await exec('icons/svg/zoomout'), mouseOver: createIonFunction(() => {
                    plate_graph.plateTrack.setMessage("Zoom out", 2)

                })

            },

            {
                x: 10, y: 0, label: 'Lasso to select', ionFunction: createIonFunction(async () => {
                    lassoPolygon = [];
                    plate_graph.plateTrack.wb(null)

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

                }, mouseOver: createIonFunction(() => {
                    plate_graph.plateTrack.setMessage("Lasso  select ", 2)

                })

            },

            {
                x: 12, y: 0, label: 'Click and drag a box to zoom in', ionFunction: createIonFunction(async () => {

                    plate_graph.plateTrack.wb(null)

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
                            if (sw < 0 || sh < 0) {
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
                        id: 'override-box',
                        priority: true,
                        close: () => {

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
                    plate_graph.plateTrack.setMessage('Click and drag a box')

                }), icon: '/assets/img/icons/png/box-zoom.svg', draw: (grid, ctx, mo, md, img) => {
                    drawRoundedRectIcon(12, grid, ctx, mo, md, img)

                }, mouseOver: createIonFunction(() => {
                    plate_graph.plateTrack.setMessage("Drag box + zoom", 2)

                })

            },

            {
                x: 14, y: 0, label: 'Move Left', ionFunction: createIonFunction(async () => {
                    plate_graph.plateTrack.wb(null)

                    let l = (plate_graph.plateTrack.grid.xmax - plate_graph.plateTrack.grid.xmin) / 4;
                    let ly = (plate_graph.plateTrack.grid.ymax - plate_graph.plateTrack.grid.ymin) / 4;
                    let ag = new AnimateGrid(plate_graph.plateTrack.grid);
                    await ag.animateTo(plate_graph.plateTrack.grid.xmin - l, plate_graph.plateTrack.grid.xmax - l, plate_graph.plateTrack.grid.ymin, plate_graph.plateTrack.grid.ymax);
                    plate_graph.plateTrack.grid.rescale();
                }), icon: await exec('icons/svg/left'), mouseOver: createIonFunction(() => {

                    plate_graph.plateTrack.setMessage("Pan left", 2)

                }), draw: (grid, ctx, mo, md, img) => {
                    drawRoundedRectIcon(14, grid, ctx, mo, md, img)
                }
            },
            {
                x: 16, y: 0, label: 'Move Right', ionFunction: createIonFunction(async () => {
                    AnimateGrid.INTERUPT = true;
                    plate_graph.plateTrack.wb(null)

                    plate_graph.plateTrack.grid.rescale();
                    let ymax = plate_graph.plateTrack.grid.ymax;
                    let ymin = plate_graph.plateTrack.grid.ymin;
                    let ag = new AnimateGrid(plate_graph.plateTrack.grid);
                    let l = (plate_graph.plateTrack.grid.xmax - plate_graph.plateTrack.grid.xmin) / 4;
                    let nxmin = plate_graph.plateTrack.grid.xmin + l
                    let nxmax = plate_graph.plateTrack.grid.xmax + l;
                    await ag.animateTo(nxmin, nxmax, ymin, ymax);
                    plate_graph.plateTrack.grid.rescale();

                }), icon: await exec('icons/svg/right'), mouseOver: createIonFunction(() => {

                    plate_graph.plateTrack.setMessage("Pan right", 2)

                }), draw: (grid, ctx, mo, md, img) => {
                    drawRoundedRectIcon(16, grid, ctx, mo, md, img)
                }
            },
            {
                x: 18, y: 0, label: 'Move Up',
                ionFunction: createIonFunction(async () => {

                    AnimateGrid.INTERUPT = true;
                    plate_graph.plateTrack.wb(null);

                    const grid = plate_graph.plateTrack.grid;
                    grid.rescale();

                    const nxmin = grid.xmin;
                    const nxmax = grid.xmax;

                    const dy = (grid.ymax - grid.ymin) / 4;
                    const nymin = grid.ymin + dy;
                    const nymax = grid.ymax + dy;

                    const ag = new AnimateGrid(grid);
                    await ag.animateTo(nxmin, nxmax, nymin, nymax);

                    grid.rescale();
                }),
                icon: await exec('icons/svg/up'),
                mouseOver: createIonFunction(() => {

                    plate_graph.plateTrack.setMessage("Pan up", 2)

                }),
                draw: (grid, ctx, mo, md, img) => {
                    drawRoundedRectIcon(18, grid, ctx, mo, md, img);
                }
            },
            {
                x: 20, y: 0, label: 'Move Down',
                ionFunction: createIonFunction(async () => {

                    AnimateGrid.INTERUPT = true;
                    plate_graph.plateTrack.wb(null);

                    const grid = plate_graph.plateTrack.grid;
                    grid.rescale();

                    const nxmin = grid.xmin;
                    const nxmax = grid.xmax;

                    const dy = (grid.ymax - grid.ymin) / 4;
                    const nymin = grid.ymin - dy;
                    const nymax = grid.ymax - dy;

                    const ag = new AnimateGrid(grid);
                    await ag.animateTo(nxmin, nxmax, nymin, nymax);

                    grid.rescale();
                }),
                icon: await exec('icons/svg/down'),
                mouseOver: createIonFunction(() => {
                    plate_graph.plateTrack.setMessage("Pan down", 2)
                }),
                draw: (grid, ctx, mo, md, img) => {
                    drawRoundedRectIcon(20, grid, ctx, mo, md, img);
                }
            }
            ,
            {
                x: 22, y: 0, label: 'Bookmark spot', ionFunction: createIonFunction(async () => {

                    plate_graph.plateTrack.showBookmarks();

                }),
                icon: await exec('icons/svg/bookmark'),
                mouseOver: createIonFunction(() => {

                    plate_graph.plateTrack.setMessage("Bookmark screen", 2)

                }), draw: (grid, ctx, mo, md, img) => {
                    drawRoundedRectIcon(22, grid, ctx, mo, md, img)
                }
            },
            {
                x: 24, y: 0,
                label: 'Compute!',
                ionFunction: createIonFunction(async () => {
                    try {
                        plate_graph.plateTrack.wb(null);
                        await plate_graph.plateTrack.updateCalculations();
                        if (plate_graph.plateTrack.grid?.rescale) {
                            plate_graph.plateTrack.grid.rescale();
                        }
                        plate_graph.plateTrack.setMessage("✅ Computation complete!", 3);
                    } catch (err) {
                        console.error("Error during computation:", err);
                        if (typeof infoPrompt === "function") {
                            infoPrompt(`❌ Compute failed:\n${err.message || err}`, 500, 250);
                        }
                    }
                }),
                icon: '/assets/img/icons/png/yinyang.svg',
                mouseOver: createIonFunction(() => {
                    plate_graph.plateTrack.setMessage("Compute!", 2)
                }),
                draw: (grid, ctx, mo, md, img) => {
                    drawRoundedRectIcon(24, grid, ctx, mo, md, img);
                }
            },


            {
                x: 26, y: 0, label: 'expand up', ionFunction: createIonFunction(() => {
                    if (!graph) {
                        graph = CurrentLayout.getStashed('graph')
                    }


                    debugger;

                    let l = (graph.getymax() - graph.getymin()) / 8;
                    graph.setymax(graph.getymax() + l);
                    graph.setymin(graph.getymin() - l);
                    plate_graph.plateTrack.grid.rescale();

                }), icon: await exec('icons/svg/contractY'), mouseOver: createIonFunction(() => {
                })
            },
            {
                x: 28, y: 0, label: 'expand down', ionFunction: createIonFunction(() => {


                    if (!graph) {
                        graph = CurrentLayout.getStashed('graph')
                    }


                    let l = (graph.getymax() - graph.getymin()) / 8;

                    graph.setymax(graph.getymax() - l);
                    graph.setymin(graph.getymin() + l);
                    plate_graph.plateTrack.grid.rescale();

                }), icon: await exec('icons/svg/expandY'), mouseOver: createIonFunction(() => {
                })
            },

            {
                x: 30, y: 0, label: 'resize x', ionFunction: createIonFunction(() => {

                    if (!graph) {
                        graph = CurrentLayout.getStashed('graph')
                    }



                    let l = (graph.getxmax() - graph.getxmin()) / 10;
                    graph.setxmax(graph.getxmax() + l)
                    graph.setxmin(graph.getxmin() - l)

                    plate_graph.plateTrack.grid.rescale();

                }), icon: await exec('icons/svg/contract')
            },
            {
                x: 32, y: 0, label: 'expand down', ionFunction: createIonFunction(() => {
                    if (!graph) {
                        graph = CurrentLayout.getStashed('graph')
                    }



                    let l = (graph.getxmax() - graph.getxmin()) / 10;
                    graph.setxmax(graph.getxmax() - l)
                    graph.setxmin(graph.getxmin() + l)

                    plate_graph.plateTrack.grid.rescale();

                }), icon: await exec('icons/svg/expand')
            }


        ]

        let buttonsDemoInterval = null;
        let buttonsDemoIndex = 0;

        function setButtonHighlight(buttons, buttonToHighlight) {
            for (const btn of buttons) {
                btn.isHighlighted = (btn === buttonToHighlight);
            }
        }

        function runButtonMouseOver(btn, graph, bcanvas) {
            if (!btn) return;

            try {

                bcanvas.mouseover = btn;
                bcanvas.redraw();
            } catch (e) {
                console.error('Error running mouseOver for button', btn.label, e);
            }

            if (btn.label && graph && typeof graph.setMessage === 'function') {
                graph.setMessage(btn.label, 2);
            }
        }

        function requestCanvasRefresh(canvas) {
            if (!canvas) return;

            if (typeof canvas.refresh === 'function') {
                canvas.refresh();
            } else if (typeof canvas.redraw === 'function') {
                canvas.redraw();
            } else if (typeof canvas.invalidate === 'function') {
                canvas.invalidate();
            } else if (typeof canvas.requestDraw === 'function') {
                canvas.requestDraw();
            }
        }
        function startButtonsDemo(buttons, graph, bcanvas, intervalMs = 1500) {
            if (!Array.isArray(buttons) || buttons.length === 0) {
                console.warn('startButtonsDemo: no buttons to demo');
                return;
            }

            if (buttonsDemoInterval) {
                clearInterval(buttonsDemoInterval);
                buttonsDemoInterval = null;
            }

            buttonsDemoIndex = 0;
            const step = () => {
                const btn = buttons[buttonsDemoIndex];
                if (!btn) return;
                setButtonHighlight(buttons, btn);
                runButtonMouseOver(btn, graph, bcanvas);
                buttonsDemoIndex = (buttonsDemoIndex + 1) % buttons.length;
            };
            step();
            buttonsDemoInterval = setInterval(step, intervalMs);
        }

        function stopButtonsDemo() {
            if (buttonsDemoInterval) {
                clearInterval(buttonsDemoInterval);
                buttonsDemoInterval = null;
            }
        }

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
                'buttons': buttons,
                'tour': createIonFunction((bcanvas, buttons) => {

                })
            }
        }

        resolve(button_canvas)

    })
}
