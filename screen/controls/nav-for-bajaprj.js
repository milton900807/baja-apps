function (plate_graph, selectedPlate, selectedPoint) {
    return new Promise(async (resolve, reject) => {

        let AnimateGrid = await exec('flexigraph/animate-it.js')
        let Menu = await exec('flexigraph/menu.js');
        function calculateXCoordinate(date, startDate, endDate) {
            if (!(date instanceof Date) || !(startDate instanceof Date) || !(endDate instanceof Date)) {
                throw new Error("All arguments must be valid Date objects.");
            }
            const spanMs = endDate - startDate;
            if (spanMs === 0) {
                throw new Error("startDate and endDate must not be the same.");
            }
            const timeFromStartMs = date - startDate;
            const x = timeFromStartMs / (1000 * 60 * 60);
            return x;
        }

        const timeToX = (time, xMin, xMax, start, end) => {
            const totalCanvasRange = xMax - xMin;
            const totalTimeRange = end.getTime() - start.getTime();

            const clampedTime = Math.max(start.getTime(), Math.min(time.getTime(), end.getTime()));

            const normalizedTime = (clampedTime - start.getTime()) / totalTimeRange;

            const x = xMin + normalizedTime * totalCanvasRange;
            return x;
        }

        const drawRoundedRectIcon = (_name, xx, grid, ctx, mo, md, img) => {
            let buttonX = grid.X(xx);
            let buttonY = grid.Y(grid.ymax);

            let iconSize = bsize;
            let cornerRadius = 5;

            ctx.font = '14px sans-serif';
            const textPadding = 8;
            const textMetrics = ctx.measureText(_name);
            const textWidth = textMetrics.width;

            let rectWidth = iconSize + textPadding + textWidth;
            let rectHeight = iconSize;

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
                ctx.drawImage(img, buttonX, buttonY, iconSize, iconSize);
            }

            ctx.restore();

            ctx.fillStyle = 'black';
            ctx.textBaseline = 'middle';
            ctx.fillText(_name, buttonX + iconSize + textPadding, buttonY + iconSize / 2);

            ctx.shadowBlur = 0;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
        };

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

        }

        const bsize = 24

        let __name = '--'
        if (selectedPlate) {
            __name = selectedPlate.name;
        }
        let interpreter = await exec('baja/engine/interpreter.js', plate_graph.plateTrack)
        let timeline_interpreter = await exec('baja/engine/timeline-interpreter.js', plate_graph.plateTrack)

        if (selectedPlate && selectedPlate.getContextMenuItems) {
            const execCMD = async (str) => {
                let r = await timeline_interpreter.executeCommand(str)
                if (r && r.type === 'rgx') {

                    const d = new Date(r.datetime)

                    const pr = r.raw_prompt
                    let xvalue = calculateXCoordinate(d, selectedPlate.startDate, selectedPlate.endDate)
                    const icon = await getLJIcon(pr)
                    if (icon) {
                        selectedPlate.scatterData.points.push({
                            x: xvalue,
                            y: 0.1,
                            type: 'milestone',
                            name: `${pr}`,
                            color: 'red',
                            icon: icon
                        });

                    } else {

                        selectedPlate.scatterData.points.push({
                            x: xvalue,
                            y: 0.1,
                            type: 'milestone',
                            name: `${pr}`,
                            color: 'red'
                        });

                    }

                    function addOneDay(originalDate) {

                        const newDate = new Date(originalDate);

                        newDate.setDate(newDate.getDate() + 1);

                        return newDate;
                    }

                    function subtractOneDay(originalDate) {

                        const newDate = new Date(originalDate);

                        newDate.setDate(newDate.getDate() - 1);

                        return newDate;
                    }

                    let xsc = selectedPlate.grid.X(xvalue)

                    const d3 = addOneDay(d);
                    const d2 = subtractOneDay(d);
                    let xvalue_start = calculateXCoordinate(d2, selectedPlate.startDate, selectedPlate.endDate)
                    let xvalue_end = calculateXCoordinate(d3, selectedPlate.startDate, selectedPlate.endDate)
                    const pt = plate_graph.plateTrack;
                    const xstartsc = selectedPlate.grid.X(xvalue_start)
                    const xendsc = selectedPlate.grid.X(xvalue_end)

                    const screen_xm = pt.grid.Xwc(xstartsc);
                    const screen_xp = pt.grid.Xwc(xendsc);
                    let width = Math.abs(screen_xm - screen_xp);

                    let ypt = pt.grid.Ywc(selectedPlate.grid.Y(selectedPlate.grid.ymin))
                    let screen_y = (selectedPlate.grid.Y(0));
                    let screen_x = (selectedPlate.grid.X(xvalue));
                    let small_width = pt.grid.worldWidth(200);
                    let small_height = pt.grid.worldHeight(200 + pt.grid.yinset)
                    let rect_x = pt.grid.Xwc(screen_x) - small_width / 2;
                    let rect_y = pt.grid.Ywc(screen_y + pt.grid.yinset) - small_height / 2;
                    await pt.zoomto(rect_x, rect_y, small_width, small_height);

                }

            }

            if (selectedPlate.getSelectedWellsInOrder && selectedPlate.getSelectedWellsInOrder()) {
                let selected_wells = selectedPlate.getSelectedWellsInOrder();
                let tmc = ''
                if (selected_wells && selected_wells.length > 0) {
                    let wr = selectedPlate.getWellRange(selected_wells)
                    if (selectedPlate.formula[wr])
                        tmc = wr + ':=' + selectedPlate.formula[wr]
                } else if (selected_wells.length === 1) {
                    tmc = wr + ':' + selected_wells[0].value
                    panel.setText(tmc)
                }
                let m = await selectedPlate.getContextMenuItems(plate_graph.plateTrack);

                m.unshift({
                    label: 'Center',
                    click: async (x, y) => {
                        try {
                            plate_graph.plateTrack.center(selectedPlate)
                            plate_graph.plateTrack.wb(null)
                        } catch (err) {
                            console.error('Failed to read from clipboard: ', err); pt.wb(null)
                        }
                    }
                },
                    {
                        label: 'Remove',
                        click: async (x, y) => {
                            try {
                                plate_graph.plateTrack.removeGlyphs([selectedPlate])
                                plate_graph.plateTrack.wb(null)
                            } catch (err) {
                                console.error('Failed to read from clipboard: ', err); pt.wb(null)
                            }
                        },
                    },
                    {
                        label: 'Update calculations',
                        click: async (x, y) => {
                            try {
                                plate_graph.plateTrack._updatePlateCalculations__(selectedPlate)
                                plate_graph.plateTrack.wb(null)
                            } catch (err) {
                                console.error('Failed to read from clipboard: ', err); pt.wb(null)
                            }
                        },
                    })

                m = Menu.removeDuplicateLabels(m)
                let menu_title = `Menu`
                if (__name) {
                    menu_title = `${__name}`
                }

                let truncated_title = menu_title.length > 10
                    ? menu_title.slice(0, 10) + "..."
                    : menu_title;

                let panel = null;
                let select_display = createIonFunction((ref) => {
                    panel = ref;
                })

                plate_graph.plateTrack.set___selected_well_listener((well) => {
                    let selected_wells = Array.isArray(well) ? well : [well];
                    let wr = selectedPlate.getWellRange(selected_wells)
                    if (!panel)
                        return;

                    if (selected_wells.length === 1) {
                        if (selectedPlate.formula[wr]) {
                            const tmc = wr + ':=' + selectedPlate.formula[wr]
                            if (!panel.caretInWindow)
                                panel.setText(tmc)
                        }
                        else {

                            const tmc = wr + ':' + (well[0].value ?? '');
                            if (!panel.caretInWindow)
                                panel.setText(tmc);

                        }
                    } else if (selected_wells.length > 1) {
                        if (selectedPlate.formula[wr]) {
                            const tmc = wr + ':=' + selectedPlate.formula[wr];
                            if (!panel.caretInWindow)
                                panel.setText(tmc);
                        } else {
                            const values = well.map(w => w.value ?? '').join(',');
                            const tmc = wr + ':' + values;
                            if (!panel.caretInWindow)
                                panel.setText(tmc);
                        }

                    } else {
                        if (!panel.caretInWindow)
                            panel.setText('');
                    }
                })

                menu_title = truncated_title;
                if (selectedPlate && !selectedPoint) {
                    let menuItm = {
                        wid: 'menu',
                        refCallback: select_display,
                        data: {
                            text: tmc,
                            cmd: createIon(async (str, panel) => {
                                if (selectedPlate.type === 'timeline') {
                                    execCMD(str)
                                    return;
                                    function stringToDate(dateString) {

                                        const [year, month, day] = dateString.split('-').map(Number);
                                        return new Date(year, month - 1, day);
                                    }
                                    const startDate = stringToDate(r.start_date)
                                    let endDate = stringToDate(r.start_date);
                                    if (r.end_date) {
                                        endDate = stringToDate(r.end_date)
                                    }

                                    plate_graph.plateTrack.setMessage(startDate.toLocaleDateString())
                                    function getOnePercentRangeAroundCenter(gxmin, gxmax, centeredAround) {
                                        const totalRange = gxmax - gxmin;
                                        const onePercent = totalRange * 0.10;
                                        const lowerBound = centeredAround - onePercent / 2;
                                        const upperBound = centeredAround + onePercent / 2;
                                        return { lowerBound, upperBound };
                                    }
                                    if (startDate.getTime() === endDate.getTime()) {
                                        let xvalue = calculateXCoordinate(startDate, selectedPlate.startDate, selectedPlate.endDate)
                                        let xvalue_min = calculateXCoordinate(selectedPlate.startDate, selectedPlate.startDate, selectedPlate.endDate)
                                        let xvalue_max = calculateXCoordinate(selectedPlate.endDate, selectedPlate.startDate, selectedPlate.endDate)

                                        if (xvalue < xvalue_min || xvalue > xvalue_max) {
                                            plate_graph.plateTrack.setMessage(" Date " + startDate + " is outside of the current timeline.")
                                            return;
                                        }

                                        let range = getOnePercentRangeAroundCenter(xvalue_min, xvalue_max, xvalue)
                                        selectedPlate.grid.zoom(range.lowerBound, range.upperBound, 0, 1);

                                        let object_sent = (str)

                                        if (!object_sent || object_sent.length <= 0) {
                                            object_sent = str;
                                        }

                                        selectedPlate.scatterData.points.push({
                                            x: xvalue,
                                            y: 0.1,
                                            type: 'milestone',
                                            name: `${object_sent}`,
                                            color: 'red',
                                        });

                                    } else {

                                    }
                                } else {
                                    let fal1 = await interpreter.executeCommand(`${__name}:`);
                                    let fal = await interpreter.executeCommand(str);
                                    panel.setText('');
                                }

                                plate_graph.plateTrack.setMessage('Crunching the numbers...', 3)
                                setTimeout(() => {
                                    plate_graph.plateTrack.updateCalculations();
                                }, 100)
                            }),
                            menus: [

                                {
                                    'label': `${menu_title}`, 'items': m
                                },

                            ]
                        }
                    }
                    resolve(menuItm)
                } else {

                    const sp = await selectedPlate.getSelectionElementsMenu(selectedPoint, plate_graph.plateTrack);
                    const name = selectedPoint.name;
                    let menuItm = {
                        wid: 'menu',
                        data: {
                            cmd: createIon(async (str, panel) => {

                                execCMD(str);

                            }),
                            menus: [
                                {
                                    'label': `${menu_title}`, 'items': m
                                },
                                {
                                    'label': `${name}`, 'items': sp
                                },

                            ]
                        }
                    }
                    resolve(menuItm)
                }

            } else {
                let tmc = ''

                let m = await selectedPlate.getContextMenuItems(plate_graph.plateTrack);
                m = Menu.removeDuplicateLabels(m)
                let menu_title = `Menu`
                if (__name) {
                    menu_title = `${__name}`
                }

                let truncated_title = menu_title.length > 10
                    ? menu_title.slice(0, 10) + "..."
                    : menu_title;

                let panel = null;
                let select_display = createIonFunction((ref) => {
                    panel = ref;
                })

                menu_title = truncated_title;
                if (selectedPlate && !selectedPoint) {
                    let menuItm = {
                        wid: 'menu',
                        refCallback: select_display,
                        data: {
                            text: tmc,
                            cmd: createIon(async (str, panel) => {
                                if (selectedPlate.type === 'timeline') {
                                    execCMD(str)
                                } else {
                                    let fal1 = await interpreter.executeCommand(`${__name}:`);
                                    let fal = await interpreter.executeCommand(str);
                                    panel.setText('');
                                }
                            }),
                            menus: [

                                {
                                    'label': `${menu_title}`, 'items': m
                                },

                            ]
                        }
                    }

                    resolve(menuItm)

                } else {

                    let menu_title = `Menu`
                    if (__name) {
                        menu_title = `${__name}`
                    }

                    let truncated_title = menu_title.length > 10
                        ? menu_title.slice(0, 10) + "..."
                        : menu_title;
                    menu_title = truncated_title;

                    let m = await selectedPlate.getContextMenuItems(plate_graph.plateTrack);
                    m = Menu.removeDuplicateLabels(m)

                    const sp = await selectedPlate.getSelectionElementsMenu(selectedPoint, plate_graph.plateTrack);
                    const name = selectedPoint.name;
                    let menuItm = {
                        wid: 'menu',
                        data: {
                            cmd: createIon(async (str, panel) => {

                                execCMD(str);

                            }),
                            menus: [
                                {
                                    'label': `${menu_title}`, 'items': m
                                },
                                {
                                    'label': `${name}`, 'items': sp
                                },

                            ]
                        }
                    }
                    resolve(menuItm)
                }
            }
        }
        if (selectedPlate && !selectedPoint) {

            let menu_title = `Menu`
            if (__name) {
                menu_title = `${__name}`
            }

            let truncated_title = menu_title.length > 10
                ? menu_title.slice(0, 10) + "..."
                : menu_title;

            let panel = null;
            let select_display = createIonFunction((ref) => {
                panel = ref;
            })

            const pt = plate_graph.plateTrack;
            const platetrack = pt;

            let tmc = ''
            let m = [
                {
                    label: 'Center',
                    click: async (x, y) => {
                        try {
                            pt.center(selectedPlate)
                            pt.wb(null)
                        } catch (err) {
                            console.error('Failed to read from clipboard: ', err); pt.wb(null)
                        }
                    },
                },
                {
                    label: 'Remove',
                    click: async (x, y) => {
                        try {
                            pt.removeGlyphs([selectedPlate])
                            pt.wb(null)
                        } catch (err) {
                            console.error('Failed to read from clipboard: ', err); pt.wb(null)
                        }
                    },
                },
                {
                    label: 'Update calculations',
                    click: async (x, y) => {
                        try {
                            pt.center(selectedPlate)
                            pt.wb(null)
                        } catch (err) {
                            console.error('Failed to read from clipboard: ', err); pt.wb(null)
                        }
                    },
                },

                {
                    label: 'Edit Text',
                    click: async (x, y) => {
                        try {
                            let ref = null;
                            let e = {
                                height: '500px',
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
                                    fontSize: 18,
                                    automaticLayout: true,
                                    padding: {
                                        top: 20,
                                        bottom: 20,
                                        left: 30,
                                        right: 30
                                    }
                                },
                                objects: platetrack.root,
                                keybinding: {
                                    'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {

                                    })
                                },
                                code: ``,
                                buttons: [
                                    {
                                        'label': ' Save  ', 'color': 'black', action: (async () => {
                                            let activeContent = ref.getEditorText();

                                            if (selectedPlate && selectedPlate.txt) {
                                                selectedPlate.txt = (activeContent)
                                            }
                                            ref.hideEditor();
                                            platetrack.wb(null)
                                        }),
                                    },
                                    {
                                        'label': 'Close', 'color': 'red', 'action': (() => {
                                            ref.hideEditor()
                                            platetrack.wb(null)
                                        }),
                                    },
                                ]
                            }
                            ref = platetrack.showTextEditor(e);
                            pt.wb(null)
                        } catch (err) {
                            console.error('Failed to read from clipboard: ', err); pt.wb(null)
                        }
                    },
                },
                {
                    label: 'Move',
                    click: async (x, y) => {
                        try {
                            let hd = {
                                startX: null,
                                startY: null,
                                currentX: null,
                                currentY: null,
                                isDrawing: true,

                                id: 'override-arrow-draw',
                                draw: (grid, ctx) => {
                                },
                                keydown: (event) => {
                                },
                                mouseDownListener: async (x, y) => {
                                    if (hd.isDrawing) {
                                        hd.isDrawing = false;
                                        pt.wb(null)
                                        return;
                                    }

                                    hd.isDrawing = true;
                                    hd.startX = x;
                                    hd.startY = y;
                                    hd.currentX = x;
                                    hd.currentY = y;
                                },

                                mouseMoveListener: (x, y) => {
                                    if (hd.isDrawing && this.shape) {
                                        selectedPlate.x = (pt.grid.Xwc(x));
                                        selectedPlate.y = pt.grid.Ywc(y);
                                    }
                                },

                                mouseUpListener: async (x, y) => {
                                    let ref = null;
                                    hd.isDrawing = false;
                                    pt.wb(null)

                                },
                                close: () => {
                                },
                            };
                            pt.wb(hd)
                        } catch (err) {
                            console.error('Failed to read from clipboard: ', err); pt.wb(null)
                        }
                    },
                }
            ]
            let menuItm = {
                wid: 'menu',
                refCallback: select_display,
                data: {
                    text: tmc,
                    cmd: createIon(async (str, panel) => {
                        if (selectedPlate.type === 'timeline') {
                            execCMD(str)
                            return;
                        } else {
                            panel.setText('');
                        }
                    }),
                    menus: [
                        {
                            'label': `${menu_title}`, 'items': m
                        },
                    ]
                }
            }
            resolve(menuItm)
        }

        if (selectedPoint) {
            {
                let menu_title = `Menu`
                if (__name) {
                    menu_title = `${__name}`
                }

                let truncated_title = menu_title.length > 10
                    ? menu_title.slice(0, 10) + "..."
                    : menu_title;
                menu_title = truncated_title;

                let m = await selectedPlate.getContextMenuItems(plate_graph.plateTrack);
                m = Menu.removeDuplicateLabels(m)

                const sp = await selectedPlate.getSelectionElementsMenu(selectedPoint, plate_graph.plateTrack);
                const name = selectedPoint.name;
                let menuItm = {
                    wid: 'menu',
                    data: {
                        cmd: createIon(async (str, panel) => {

                            execCMD(str);

                        }),
                        menus: [
                            {
                                'label': `${menu_title}`, 'items': m
                            },
                            {
                                'label': `${name}`, 'items': sp
                            },

                        ]
                    }
                }
                resolve(menuItm)
            }
        }

        let mm = [

            {
                label: `Compute all tables`,
                click: (bajabio, pty) => {
                    pt.updateCalculations();
                },
                move: () => {
                }

            }

        ]

        let menuItm = {
            wid: 'menu',
            data: {
                menus: [
                    {
                        'label': `bajabio Project`, 'items': mm
                    },

                ]
            }

        }
        resolve(menuItm)

    })
}
