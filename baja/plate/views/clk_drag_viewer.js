function (pt, p) {

    return new Promise(async (resolve, reject) => {

        let freezFrame = false;
        let __pt__
        let click_and_drag = false;
        let MGrid = await exec('flexigraph/grid.js');
        let GenericWell = await exec('baja/plate/well.js')
        const Menu = await exec('flexigraph/menu')
        let Icon = await exec('flexigraph/shapes/icon.js')
        const TransparentPlate = await exec('baja/plate/plate-transparent')
        let WellDisplay = await exec('baja/plate/views/well-display-factory')
        const bsize = 20;
        let cursorPos = 0;
        let textStyle;
        let singleSelect = false;
        const TableOps = await exec('baja/table/table-ops');

        let smenu;

        let md = false;

        if (!pt) {
            return;
        }
        __pt__ = pt;
        if (pt.wbid != null && pt.wbid.startsWith('override')) {
            return;
        }
        p.textBoxX = null;
        p.___drawfish = false;
        p.textActive = false;
        click_and_drag = false;
        let startIndex = null;
        let currentSelected = [];
        let cursorIndex = null;
        p.textActive = false;
        freezFrame = true;
        let tid = null;
        let ref;

        let swe = p.getSelectedWellsInOrder();
        if (swe && swe.length > 0) {
            pt.selected_well = swe[0];
        } else {
        }

        let mouseDownListener = async (x, y) => {
            let w = p.getSelectedWellsInOrder();

            let xw = pt.grid.Xwc(x);
            let yw = pt.grid.Ywc(y);
            if (ref) {
                ref.hideEditor();
            }
            if (smenu) {
                if (!smenu.isIn(pt.grid, xw, yw)) {
                    smenu = null;
                }
                return;
            }
            if (p.menu) {
                return;
            }
            let b = p.button_set;
            let tw = ((pt.grid.worldWidth(30 * b.length)))
            let init = pt.grid.X(p.grid.xi + p.grid.width - tw);
            if (init < 0) {
                init = pt.grid.Xwc(0)
            }
            let index = 0;

            if (w && w.length > 0) {
                pt.selected_well = w[0]
            }
            if (p.attr__RowAddRemoveButtons) {
                if (p.isInsideBottomButtons(pt.grid, x, y)) {
                    const bu = p.isInsideBottomButtons(pt.grid, x, y)
                    bu.action(null, null, x, y, pt);

                }
            }
            const mmx = pt.grid.Xwc(x);
            const mmy = pt.grid.Ywc(y);

            md = true;
            let current_well = p.getWell(xw, yw);
            click_and_drag = true;
            if (w && w.length === 1 && w[0] === current_well) {
                pt.selected_well = w;
                singleSelect = true;

                return;
            } else if (w && w.length === 0 && !current_well) {

                singleSelect = false;
                return;
            } else if (w && w.length === 1 && w[0] != current_well) {
                current_well = w[0]
                singleSelect = true;
            }
            else {
                singleSelect = false;
            }
            if (current_well) {
                if (current_well.select) {
                    current_well.deselectIt()
                    currentSelected = currentSelected.filter(function (item) {
                        return item.w !== current_well;
                    });
                    return;
                } else {
                    startIndex = p.getWellRowIndex(current_well);
                    current_well.selectIt();

                    if (current_well && current_well.obj) {
                        if (current_well.obj && isYouTubeVideo(current_well.obj)) {
                            let you = {
                                wid: 'youtube',
                                data: {

                                    url: current_well.obj
                                }
                            }
                            let main_layout = {
                                wid: 'card',
                                height: '100%',
                                componentRef: 'mainPanel',
                                data: {
                                    cards: [
                                        [
                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Return', ionFunction: createIonFunction(() => {
                                                                    CurrentLayout.reset('mainPanel')
                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            },

                                            {
                                                'width': '100%',
                                                'height': '100vh',
                                                'component': you
                                            },
                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Close', ionFunction: createIonFunction(() => {
                                                                    CurrentLayout.reset('mainPanel')
                                                                })
                                                            }
                                                        ]
                                                    }
                                                }
                                            }

                                        ]

                                    ]
                                }
                            }

                            CurrentLayout.clearComponent('mainPanel')
                            CurrentLayout.setComponent('mainPanel', main_layout);
                        }
                    }
                    md = false;
                    currentSelected.push({
                        w: current_well,
                        row: startIndex.rowIndex,
                        col: startIndex.colIndex
                    });
                }
            }

        };

        let mouseMoveListener = async (x, y) => {
            p.resizeable = false;
            mouseX = x;
            mouseY = y;
            p.___drawfish = true;
            const mmx = pt.grid.Xwc(x);
            const mmy = pt.grid.Ywc(y);
            if (p.plateType !== '__viewer' || pt.mode === 'viewer') {
                if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                    smenu.mouseMove(pt.grid, mmx, mmy)
                    return;
                }
                let index = 0;
                let b = p.button_set;
                let tw = ((pt.grid.worldWidth(30 * b.length)))
                let init = pt.grid.X(p.grid.xi + p.grid.width - tw);
                if (init < 0) {
                    init = pt.grid.Xwc(0)

                }
                for (let button of b) {
                    let buttonX = init + index * bsize;
                    let buttonY = pt.grid.Y(p.grid.yi + p.getHeight() + pt.grid.worldHeight(p.margin.top));
                    if (buttonY < 0) {
                        buttonY = 10;
                    }
                    index++;
                    let bbw = bsize;
                    if (
                        x >= buttonX &&
                        x <= buttonX + bbw &&
                        y >= buttonY &&
                        y <= buttonY + button.height
                    ) {
                        p.highlightbutton = button.name;
                        p.___drawfish = false;

                        return await button.highlight(buttonX, buttonY, x, y, pt);

                    }
                }

            }

            if (md && startIndex != null) {
                if (tid) {
                    clearInterval(tid)
                }
                freezFrame = false;
                let xw = pt.grid.Xwc(x);
                let yw = pt.grid.Ywc(y);
                let current_well = p.getWell(xw, yw);
                if (current_well) {
                    let currentIndex = p.getWellRowIndex(current_well);
                    if (currentIndex) {
                        cursorIndex = currentIndex;

                        for (let row = startIndex.rowIndex; row <= currentIndex.rowIndex; row++) {
                            for (let col = startIndex.colIndex; col <= currentIndex.colIndex; col++) {
                                if (p.wells[col] && p.wells[col][row]) {
                                    if (!currentSelected.some(cs => cs.row === row && cs.col === col)) {
                                        currentSelected.push({
                                            w: p.wells[col][row],
                                            row: row,
                                            col: col
                                        });
                                        p.wells[col][row].selectIt();
                                    }
                                }
                            }
                        }

                        currentSelected = currentSelected.filter(selected => {
                            const isWithinBounds =
                                selected.row >= startIndex.rowIndex &&
                                selected.row <= currentIndex.rowIndex &&
                                selected.col >= startIndex.colIndex &&
                                selected.col <= currentIndex.colIndex;

                            if (!isWithinBounds) {
                                selected.w.deselectIt();
                            }

                            return isWithinBounds;
                        });
                    }
                }

            } else {
                if (p.textActive) {
                    let mmx = pt.grid.Xwc(x);
                    let mmy = pt.grid.Ywc(y);
                    if (!p.inside(pt.grid, mmx, mmy, true)) {
                        p.highlightbutton = null;
                        p.textActive = false;
                        return;
                    }
                } else {
                    p.___drawfish = true;
                    if (!pt.selected_well) {
                        let sl = p.getSelectedWellsInOrder();
                        if (sl && sl.length > 0) {
                            pt.selected_well = sl[0]
                        } else {
                            p.textBoxX = null;
                        }
                    }
                }
                if (!smenu && p.inResize(x, y, pt)) {
                    p.textActive = false;
                }
                else if (!smenu && p.onRightEdge(x, y, pt)) {
                    p.resizeable = true;
                }
            }
        }
        let mouseUpListener = (x, y) => {
            let mmx = pt.grid.Xwc(x);
            let mmy = pt.grid.Ywc(y);
            if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                smenu.mouseUp(pt.grid, mmx, mmy)
                md = false;
                return;
            }
            if (smenu) {
                return;
            }
            md = false;
            startIndex = null;
        };

        let t = {
            id: 'click_and_drag',
            mouseMoveListener: mouseMoveListener,
            mouseUpListener: mouseUpListener,
            mouseDownListener: mouseDownListener,

            init: () => {
                p.clk_and_drag_open = true;
            },
            close: () => {
                clearMenu();
                p.textActive = false;
                p.clk_and_drag_open = false;
            },
            priority: true,
            draw: (grid, ctx) => {

                ctx.font = "24px Arial";
                freezFrame = true;

                if (startIndex) {
                    if (startIndex != null && cursorIndex != null) {
                        const text = " " + Math.abs(cursorIndex.colIndex - startIndex.colIndex + 1) + " X " + Math.abs(cursorIndex.rowIndex - startIndex.rowIndex + 1)
                        const textX = grid.X(p.grid.X(cursorIndex.colIndex));
                        const textY = grid.Y(p.grid.Y(cursorIndex.rowIndex));

                        const textWidth = ctx.measureText(text).width;
                        const textHeight = 20;

                        const padding = 8;
                        const cornerRadius = 10;
                        const rectX = textX - padding;
                        const rectY = textY - textHeight - padding;
                        const rectWidth = textWidth + 2 * padding;
                        const rectHeight = textHeight + 2 * padding;

                        ctx.shadowBlur = 10;
                        ctx.shadowColor = "rgba(0, 0, 0, 0.5)";

                        ctx.shadowBlur = 0;
                        ctx.fillStyle = "black";
                        ctx.fillText(text, textX, textY);
                    }
                }
                if (smenu) {
                    ctx.fillStyle = 'rgba(255,255,255,0.63)'
                    ctx.fillRect(pt.grid.xi, pt.grid.yi, pt.grid.width, pt.grid.height)

                    smenu.draw(ctx, grid)
                    p.textActive = false;

                }

            },
            menuManager: null,
            smenu: null
        }
        if (pt && pt.wb)
            pt.wb(t)

        return resolve()
    });
}
