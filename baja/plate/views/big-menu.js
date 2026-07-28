function (pt, plate) {

    return new Promise(async (resolve, reject) => {

        let wells__ = plate.getSelectedWellsInOrder()
        const Menu = await exec('flexigraph/menu')
        let Icon = await exec('flexigraph/shapes/icon.js')
        let WellDisplay = await exec('baja/plate/views/well-display-factory')
        let HM = await exec('baja/history/HM')
        const bsize = 20;
        let cursorPos = 0;
        let WellColorPallette = await exec('baja/plate/well-color-palette.js')
        let mouseX;
        console.debugger;

        let m = [

            {
                label: 'Table name: ' + plate.name,
                click: async (x, y) => {
                    let attr_window = ''
                    let va = await prompt("Table name: " + plate.name, ["Name"], { "Name": attr_window }, 500, 300)
                    let m = va['Name']
                    plate.name = m;
                    pt.updateworkbench(null)

                },
                move: () => {
                },
            },

            {
                label: 'Table Type: ' + plate.name,
                click: async (x, y) => {
                    let attr_window = ''
                    let va = await prompt("Table type: " + plate.plateType, ["Type"], { "Type": attr_window }, 500, 300)
                    let m = va['Type']
                    plate.plateType = m;
                },
                move: () => {
                },
            },

            {
                label: 'Assign header to top row',
                click: async (x, y) => {

                    const name = 'ColumnHeader'
                    plate.setColumnHeader(0)
                    for (let x = plate.grid.xmin; x < plate.grid.xmax; x++) {
                        let s = plate.wells[x][0]
                        s.setGroup(name);
                        if (name === 'ColumnHeader') {
                            let rindex = plate.getIndexOf(s)
                            plate.applyHeaderWellForColumn(rindex.colIdx, rindex.rowIdx)
                        } else if (name === 'Row_Header') {
                            let rindex = plate.getIndexOf(s)
                            plate.applyHeaderWellForRow(rindex.colIdx, rindex.rowIdx)
                        } else if (name === 'Row_Address') {
                            let rindex = plate.getIndexOf(s)
                            plate.applyAddressWellForRow(rindex.colIdx, rindex.rowIdx)
                        }
                        let rang = plate.findContiguousSelectedWells('[0:][0:0]')
                        LJScript.add(plate.name, `tag ${name} ${rang}`)
                        plate.deselectAll();
                        pt.wb(null)
                    }
                },
                move: () => {
                },
            },
            {

                label: 'Transpose',
                click: async () => {

                    pushHistory(HM(pt))

                    plate.wells = plate.transposeWells(plate.wells);
                    plate.grid.xmax = plate.wells.length;
                    plate.grid.ymax = plate.wells[0].length;
                    plate.grid.rescale();
                    LJScript.add(plate.name, 'transpose')

                    if (plate.rescaleDimensions) {
                        plate.rescaleDimensions(pt)
                    }

                    pt.zoomintoplate(plate)

                }
            },
            {
                label: 'Trim',
                click: (x, y) => {
                    pushHistory(HM(plate))

                    plate.removeEmptyRowsAndColumns()
                    plate.menu = null;

                },
                move: () => {
                },
            },
            {
                label: 'Insert Column | Row',
                click: (__x, __y) => {
                    plate.textActive = false;
                    pt.setMessage(" Click on table to view options... ")

                    let msub = [
                        {
                            label: 'Insert column here',
                            click: (x, y) => {

                                pushHistory(HM(plate))

                                let tx = Math.round(plate.grid.Xwc(smenu.x - plate.grid.xi * 2))

                                if (tx < 0) {
                                    tx = 1;
                                }
                                plate.insertColWithCopy(tx, pt)
                                pt.wb(null)
                                LJScript.add(plate.name, 'Insert column [' + tx + ']')

                            },
                            move: () => {
                            },
                        },
                        {
                            label: 'Insert row here',
                            click: (x, y) => {
                                pushHistory(HM(plate))

                                let ty = Math.floor(plate.grid.Ywc(pt.grid.Ywc(mouse_sc_y) - plate.grid.yi * 2))

                                console.log(" ty " + ty)
                                plate.insertRowWithCopyNoHightChange(ty, pt)
                                LJScript.add(plate.name, 'Insert row [' + ty + ']')
                            },
                            move: () => {
                            },

                        },

                        {
                            label: 'Append function column...',
                            click: async (__x, __y) => {
                                pushHistory(HM(plate))
                                let se = plate.getSelectedWellsInOrder()
                                await exec('baja/table/io/lj-fun-to-table.js', pt, plate, se)
                                LJScript.add(plate.name, 'Add data column')

                            },
                            move: () => {
                            },
                        },

                        {
                            label: 'Add top row',
                            click: (x, y) => {
                                pushHistory(HM(plate))

                                let tx = Math.round(plate.grid.Xwc(smenu.x - plate.grid.xi * 2))

                                if (tx < 0) {
                                    tx = 1;
                                }
                                LJScript.add(plate.name, 'Add top row')
                                plate.insertRow(0)
                                pt.wb(null)

                            },
                            move: () => {
                            },
                        },
                        {
                            label: 'Add column',
                            click: (x, y) => {
                                pushHistory(HM(plate))
                                let tx = plate.grid.xmax + 1;
                                plate.insertCol(tx)
                                smenu = null;
                            },
                            move: () => {
                            },
                        },
                        {
                            label: 'Trim',
                            click: (x, y) => {
                                pushHistory(HM(plate))

                                plate.removeEmptyRowsAndColumns()
                                plate.menu = null;

                            },
                            move: () => {
                            },
                        },

                    ]

                    pt.wb({
                        id: 'override-add-col-row',

                        mouseDownListener: async (x, y) => {
                            plate.textActive = false;

                            let mmx = pt.grid.Xwc(x);
                            let mmy = pt.grid.Ywc(y);
                            if (!plate.inside(pt.grid, mmx, mmy)) {
                                console.log(" not inside ")
                                pt.wb(null)
                                return;
                            }
                            if (smenu) {
                                let mmx = pt.grid.Xwc(x);
                                let mmy = pt.grid.Ywc(y);
                                if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                                    return;
                                }
                                else {
                                    clearMenu()
                                    pt.wb(null)
                                }
                            } else {
                                mouse_sc_y = y;
                                mouse_sc_x = x;
                                smenu = new Menu(msub, pt.grid.Xwc(x - 4), pt.grid.Ywc(y + 20), 'rgb(0, 87, 163)', 'white')
                            }
                        },
                        mouseMoveListener: (x, y) => {
                            plate.textActive = false;

                            let mmx = pt.grid.Xwc(x);
                            let mmy = pt.grid.Ywc(y);
                            pt.grid.rescale();
                            plate.grid.rescale();
                            if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                                smenu.mouseMove(pt.grid, mmx, mmy)
                            }

                        },
                        mouseUpListener: async (x, y) => {
                            plate.textActive = false;

                            let mmx = pt.grid.Xwc(x);
                            let mmy = pt.grid.Ywc(y);
                            if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                                await smenu.mouseUp(pt.grid, mmx, mmy)
                                clearMenu();
                            }
                        }
                        ,
                        close: () => {
                            clearMenu();
                        },
                        draw: (grid, ctx) => {
                            if (smenu) {
                                smenu.draw(ctx, grid)
                                plate.textActive = false;

                            }

                        },

                    })
                },
                move: () => {
                }
            },
            {
                label: 'Edit Column | Row',
                click: (__x, __y) => {

                    pt.wb(null)
                    clearMenu();

                    plate.createEditColMenu(pt, smenu)
                },
                move: () => {
                }
            },

            {

                label: 'Paste Tags',
                click: async (x, y) => {
                    try {

                        const text = await navigator.clipboard.readText();
                        let js = JSON.parse(text)
                        for (let a of js) {
                            let rows = plate.wells.length;
                            let cols = plate.wells[0].length;
                            for (let row = 0; row < rows; row++) {
                                for (let col = 0; col < cols; col++) {

                                    if (col.position === a.position && a.group != null) {
                                        col.appendGroups(a.getGroups())
                                    }

                                }
                            }
                        }

                    } catch (err) {
                        console.error('Failed to read from clipboard: ', err);
                    }
                }
            },

        ]

        if (plate.wells.length > 1) {
            m.push({
                label: 'Convert to column',
                click: (x, y) => {
                    plate.selectAll();
                    let w = plate.getSelectedWellsInOrder();
                    let newRow = [];
                    for (let r = 0; r < w.length; r++) {
                        newRow.push(w[r]);
                    }

                    const original_yi = plate.grid.yi;
                    const original_height = plate.grid.height;
                    plate.deselectAll();
                    plate.wells = [1]
                    plate.wells[0] = newRow;
                    plate.grid.xmax = 1;

                    plate.grid.ymax = w.length;
                    plate.grid.rescale();
                    pt.zoomintoplate(plate)
                    LJScript.add(plate.name, 'convert to column')

                },
                move: () => {
                },
            })
        }

        m.push({
            label: `Display Numbers: ${plate.attr__displayNumberValues}`,
            click: (__x, __y) => {

                plate.attr__displayNumberValues = !plate.attr__displayNumberValues

            },
            move: () => {
            }
        }

        )
        m.push({
            label: `Show Table Name: ${plate.attr__ShowTableName}`,
            click: (__x, __y) => {
                plate.attr__ShowTableName = !plate.attr__ShowTableName
            },
            move: () => {
            }
        }
        )

        if (plate.hasSelectedWells()) {

            let column = plate.getSelectedColumn()
            let rows = plate.getSelectedRow();
            if (column && (column.length > 0)) {

                m.push({
                    label: 'Delete column',
                    click: async (x, y) => {
                        pushHistory(HM(plate))
                        let wells = plate.getSelectedWellsInTimeOrder();
                        if (wells && wells.length > 0) {
                            let id = plate.getWellIndicies(wells[0])
                            let colIndex = id.colIdx;
                            for (let selectRowIndex = 0; selectRowIndex < plate.wells[colIndex].length; selectRowIndex++) {
                                let colWell = plate.wells[colIndex][selectRowIndex];
                                if (colWell) {
                                    colWell.select = true;
                                }
                            }
                            for (let x = 0; x < plate.wells.length; x++) {
                                if (plate.wells[x][0] && plate.wells[x][0].select)
                                    plate.removeCol(x)
                            }
                            pt.wb(null)
                        }
                    },
                    move: () => {
                    }
                    ,
                    bg: 'yellow',
                    fg: 'black'

                },

                    {
                        label: 'Address-to-column',
                        click: async (__x, __y) => {
                            let newColumnIndex = plate.wells.length;
                            let selectedWells = plate.getSelectedWellsInOrder()
                            for (let y = 0; y < plate.wells[0].length; y++) {
                                if (!plate.wells[newColumnIndex]) {
                                    plate.wells[newColumnIndex] = [];
                                }
                                let cc = selectedWells[y] || null;
                                plate.wells[newColumnIndex][y] = createDefaultWell()
                                plate.wells[newColumnIndex][y].setValue(cc.position)

                            }
                            plate.fitRowsAndColumns();
                            plate.deselectAll();
                            plate.clk_drag(pt);

                        },
                        move: () => {
                        }
                        ,
                        bg: 'yellow',
                        fg: 'black'

                    },

                );

            }

            if (rows && rows.length > 0) {
                if (plate.getSelectedRow()) {
                    m.push({
                        label: 'Delete row',
                        click: async (x, y) => {
                            pushHistory(HM(plate))
                            plate.removeFullySelectedRows()
                            plate.clk_drag(pt);

                        },
                        move: () => {
                        }
                        ,
                        bg: 'yellow',
                        fg: 'black'

                    })

                }

            }

            m.push({
                label: 'Edit selected',
                click: (__x, __y) => {
                    smenu = null;
                    plate.showEditOptions(pt)
                },
                move: () => {
                }
                ,
                bg: 'yellow',
                fg: 'black'

            }

            )
            m.push({
                label: 'Set Well Type',
                click: (__x, __y) => {
                    smenu = null;
                    const selection_list = Object.keys(WellDisplay)
                    selection_list.push('Default')
                    let selectionpanel = null;
                    const selectPanel = createIon((pa) => {
                        selectionpanel = pa;
                    })
                    let t = {
                        wid: 'card',
                        data: {
                            cards: [
                                [
                                    {
                                        'title': 'Set well type',
                                        width: '100%',
                                        'body': `  `, 'component':
                                        {
                                            wid: 'selection-list',
                                            width: '100%',
                                            refCallback: selectPanel,
                                            data: {
                                                listItems: selection_list,
                                                button_function: createIonFunction(async (items) => {
                                                    let name = items[0]
                                                    let wells = plate.getSelectedWellsInOrder();
                                                    if (name === 'Default') {
                                                        name = null;
                                                    }
                                                    for (let w of wells) {
                                                        w.setWellType(name);
                                                    }
                                                    hideAllModal();
                                                })
                                            }
                                        }
                                    },
                                ],
                            ]
                        }
                    }
                    showModal(t, 500, 500)

                },
                move: () => {
                }
                ,
                bg: 'yellow',
                fg: 'black'

            }

            )

            m.push({
                label: 'Hide borders',
                click: (__x, __y) => {
                    for (let x = 0; x < plate.wells.length; x++) {
                        for (let y = 0; y < plate.wells[x].length; y++) {
                            let well = plate.wells[x][y];
                            if (well) {
                                well.attr__showBorder = false;
                            }
                        }
                    }

                },
                move: () => {
                }
                ,
                bg: 'yellow',
                fg: 'black'

            }

            )
            m.push({
                label: 'Hide metadata',
                click: (__x, __y) => {
                    for (let x = 0; x < plate.wells.length; x++) {
                        for (let y = 0; y < plate.wells[x].length; y++) {
                            let well = plate.wells[x][y];
                            if (well) {
                                well.attr__showGroups = false;
                            }
                        }
                    }

                },
                move: () => {
                }
                ,
                bg: 'yellow',
                fg: 'black'

            }

            )
            m.push(
                {
                    label: 'Deselect cells',
                    click: async (x, y) => {
                        for (let x = 0; x < plate.wells.length; x++) {
                            for (let y = 0; y < plate.wells[x].length; y++) {
                                let well = plate.wells[x][y];
                                if (well) {
                                    well.select = false;
                                }
                            }
                        }

                    },
                    move: () => {
                    }
                    ,
                    bg: 'yellow',
                    fg: 'black'

                });

            if (plate.hasSelectedWells()) {
                m.push(
                    {
                        label: 'Delete selected contents',
                        click: async (x, y) => {
                            pushHistory(HM(plate))
                            let confirm = await exec('baja/lib/confirm.js', 'Delete selected contents?', async () => {
                                for (let x = 0; x < plate.wells.length; x++) {
                                    for (let y = 0; y < plate.wells[x].length; y++) {
                                        let well = plate.wells[x][y];
                                        if (well && well.select) {
                                            well.reset();
                                        }
                                    }
                                }
                                pt.wb(null)
                            })
                            showModal(confirm)

                        },
                        move: () => {
                        }
                        ,
                        bg: 'yellow',
                        fg: 'black'

                    });

            }
        }

        if (plate.grid.xmax > 40 || plate.grid.ymax > 40) {
            m.push(
                {
                    label: 'Search values...',
                    click: async (x, y) => {
                        plate.textActive = true;
                        textStyle = 'search'
                        cursorPos = 0;
                        plate.text = ''
                        plate.textBoxX = pt.grid.width - (pt.grid.width / 2 - plate.textBoxWidth / 2)
                        plate.textBoxY = pt.grid.height - pt.grid.height / 1.5;
                        pt.updateworkbench({
                            mouseDownListener: async (x, y) => {
                            },
                            mouseMoveListener: async (x, y) => {
                            },
                            mouseUpListener: async (x, y) => {
                                plate.clk_drag(pt)
                            }
                            ,
                            close: () => {
                                plate.textActive = false;
                                textStyle = null;
                                plate.text = ""
                            },
                            keydown: (event) => {
                                plate.textActive = true;
                                if (event.key === 'ArrowLeft') {
                                    console.log('Left arrow pressed');
                                    cursorPos -= 1;
                                } else if (event.key === 'ArrowRight') {
                                    console.log('Right arrow pressed');
                                    cursorPos += 1;
                                } else if (event.key === 'Backspace') {
                                    if (cursorPos >= 0) {
                                        plate.text = plate.text.slice(0, cursorPos - 1) + plate.text.slice(cursorPos);
                                        cursorPos -= 1;
                                    }
                                    if (cursorPos < 0) {
                                        cursorPos = 0;
                                        plate.text = ''
                                    }
                                    plate.highlightRows(plate.text);
                                }
                                else if (event.key === 'Enter') {
                                    plate.textActive = null;
                                    let value = plate.highlightWells(plate.text);
                                    plate.clk_drag(pt)
                                }
                                else if (event.key === 'Tab') {
                                }

                                else {
                                    if (/^[a-zA-Z0-9!.\-%$*&#@()\[\]{} :,\-]$/.test(event.key)) {
                                        plate.text = plate.text.slice(0, cursorPos) + event.key + plate.text.slice(cursorPos);
                                        plate.deselectWells();
                                        plate.highlightWells(plate.text);
                                        cursorPos += 1;

                                    } else {

                                    }
                                }
                            }
                            ,
                            draw: (grid, ctx) => {
                            },

                        })

                    },
                    move: () => {
                    },
                });

            m.push(
                {
                    label: 'Search & select row...',
                    click: async (x, y) => {
                        let mm = []

                        plate.searchAndSelectByValue(pt)

                    },
                    move: () => {
                    },
                });

            m.push(
                {
                    label: 'Select by tag...',
                    click: async (x, y) => {
                        smenu = null;

                        const butttons_ = [

                            {
                                'label': 'Select', "color": 'blue', action: async () => {
                                    let code = canvas.getEditorText();

                                    if (code.indexOf(',' > 0)) {
                                        const v = code.split(',');
                                        for (let i of v) {
                                            plate.selectWellsByTag(i)
                                        }
                                    } else
                                        plate.selectWellsByTag(code)
                                }
                            },
                            {
                                'label': 'Deselect', "color": 'blue', action: async () => {
                                    let code = canvas.getEditorText();

                                    if (code.indexOf(',' > 0)) {
                                        const v = code.split(',');
                                        for (let i of v) {
                                            plate.deselectByTag(i)
                                        }
                                    } else
                                        plate.deselectByTag(code)
                                }
                            },
                            {
                                'label': 'Close', 'color': 'black', "action": () => {
                                    ref.hideEditor();
                                }
                            }]

                        if (plate.column_headers && plate.column_headers.length > 0) {
                            butttons_.push({
                                'label': 'Select column header', "color": 'blue', action: async () => {

                                }
                            })
                        }

                        let ref = null;
                        let pm = CurrentLayout.getStashed('plate-track')
                        let canvas = CurrentLayout.getStashed('graph-canvas')
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
                            objects: pt.root,
                            keybinding: {
                                'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {
                                })
                            },
                            code: '',
                            buttons:
                                butttons_
                        }
                        t.objects = pt.root;
                        ref = pt.showTextEditor(t);

                    },
                    move: () => {
                    },
                });
        }

        if (plate.hasSelectedWells()) {

            m.push(
                {
                    label: 'Select inverse',
                    click: async (x, y) => {
                        plate.seelctInverse();
                        pt.wb(null)
                    },
                    move: () => {
                    },
                    bg: 'yellow',
                    fg: 'black'

                });

            m.push(
                {
                    label: 'Navigate selected...',
                    click: async (x, y) => {
                        let g = plate.getSelectedWellsInOrder();
                        plate.gotoWell(g[0].uid, pt)
                        pt.wb(null)
                    },
                    move: () => {
                    },
                    bg: 'yellow',
                    fg: 'black'

                });

            m.push(
                {
                    label: 'Paste into selected wells...',
                    click: async (x, y) => {
                        await exec('baja/table/io/paste-into-table.js', pt, plate)
                    },
                    move: () => {
                    },
                    bg: 'yellow',
                    fg: 'black'

                });

        } else {

        }

        m.push(
            {
                label: 'Clk+Drag selection',
                click: () => {
                    pt.selectedPlate = plate;
                    pt.wb(null)
                    setTimeout(() => {
                        plate.clk_drag(pt);
                    }, 1000)

                }
            })
        m.push(
            {
                label: 'Select Column(s)',
                click: () => {
                    let md = false;
                    let mouseDownListener = async (x, y) => {
                        md = true;
                        freezFrame = false;

                        let xw = pt.grid.Xwc(x);
                        let yw = pt.grid.Ywc(y);
                        let current_well = plate.getWell(xw, yw, pt);
                        if (current_well) {
                            plate.selectColumnAtRow(current_well.y, current_well.x)
                            await plate.showSelectOptionsMenu(pt)
                        }
                    };

                    let mouseMoveListener = (x, y) => {
                        if (md) {
                            freezFrame = false;

                            let xw = pt.grid.Xwc(x);
                            let yw = pt.grid.Ywc(y);
                            let current_well = plate.getWell(xw, yw, pt);
                            if (current_well) {
                                plate.selectColumnAtRow(current_well.y, current_well.x)
                            }
                        }
                    };

                    let mouseUpListener = (x, y) => {
                        pt.wb(null)
                        plate.createEditColMenu(pt)
                        md = false;
                    };

                    let t = {
                        id: 'override-select-column',
                        mouseMoveListener: mouseMoveListener,
                        mouseUpListener: mouseUpListener,
                        mouseDownListener: mouseDownListener,
                        draw: (grid, ctx) => {

                        },
                        menuManager: null,
                        smenu: null
                    }

                    pt.wb(t)

                }
            })

        m.push(
            {
                label: 'Select Rows',
                click: () => {
                    let md = false;
                    let mouseDownListener = async (x, y) => {

                        if (smenu) {
                            if (smenu && smenu.isIn(pt.grid, x, y)) {
                                return;
                            }
                            else
                                clearMenu()
                        }
                        freezFrame = false;
                        md = true;
                        let xw = pt.grid.Xwc(x);
                        let yw = pt.grid.Ywc(y);
                        let current_well = plate.getWell(xw, yw, pt);
                        if (current_well) {
                            plate.selectRowAtColumn(current_well.y, current_well.x)
                            await plate.showSelectOptionsMenu(pt);

                        }

                    };
                    let mouseMoveListener = (x, y) => {
                        if (md) {
                            freezFrame = false;
                            let xw = pt.grid.Xwc(x);
                            let yw = pt.grid.Ywc(y);
                            let current_well = plate.getWell(xw, yw, pt);
                            if (current_well) {
                                plate.selectRowAtColumn(current_well.y, current_well.x)
                            }
                        }
                    };

                    let mouseUpListener = () => {
                        md = false;
                    };

                    let t = {
                        id: 'select-cell-col-options-menu' + uuid(),
                        mouseMoveListener: mouseMoveListener,
                        mouseUpListener: mouseUpListener,
                        mouseDownListener: mouseDownListener,
                        draw: (grid, ctx) => {

                        },
                        menuManager: null,
                        smenu: null
                    }

                    pt.wb(t)

                }
            })
        m.push(
            {
                label: 'Select All',
                click: () => {
                    plate.selectWellsByString('[:][:]')
                    smenu = null;
                }
            })

        m.push(
            {
                label: 'Export All (XLSX)',

                click: async (x, y) => {
                    let WellColorPallette = await exec('baja/plate/well-color-palette.js')

                    let originalData = [];
                    const exportKeys = ['value', 'concentration', 'group', 'score', 'compoundId', 'idt', 'name'];

                    for (let x = 0; x < plate.wells.length; x++) {
                        let row = [];
                        for (let y = 0; y < plate.wells[x].length; y++) {
                            let well = plate.wells[x][y];
                            if (well) {
                                row.push(well);
                            } else {
                                row.push(null);
                            }
                        }
                        originalData.push(row);
                    }
                    let transposedData = originalData[0].map((_, colIndex) => originalData.map(row => row[colIndex]));
                    const workbook = new ExcelJS.Workbook();
                    let createSheetForAttribute = (attribute, attributeName) => {
                        const worksheet = workbook.addWorksheet(attributeName);
                        for (let row = 0; row < transposedData.length; row++) {
                            const excelRow = worksheet.getRow(row + 1);

                            for (let col = 0; col < transposedData[row].length; col++) {
                                let well = transposedData[row][col];

                                if (well) {

                                    let ccolor = well.group && well.group in WellColorPallette ? WellColorPallette[well.group] : 'rgba(220,220,220,0.3)';
                                    ccolor = convertToARGB(ccolor);

                                    let excelCell = excelRow.getCell(col + 1);
                                    excelCell.value = (well[attribute] !== undefined ? well[attribute] : '');

                                    excelCell.fill = {
                                        type: 'pattern',
                                        pattern: 'solid',
                                        fgColor: ccolor
                                    };
                                    excelCell.font = {
                                        color: { argb: '00FFFFFFFF' },
                                        bold: true
                                    };
                                    excelCell.border = {
                                        top: { style: 'thin' },
                                        left: { style: 'thin' },
                                        bottom: { style: 'thin' },
                                        right: { style: 'thin' }
                                    };
                                }
                            }

                            excelRow.commit();
                        }
                    }
                    exportKeys.forEach(attribute => {
                        console.log(" creating sheet for " + attribute)
                        createSheetForAttribute(attribute, attribute.charAt(0).toUpperCase() + attribute.slice(1));
                    });
                    workbook.xlsx.writeBuffer().then(function (buffer) {
                        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = `all_well_data.xlsx`;
                        link.click();

                    });

                    pt.wb(null)

                },
                move: () => {
                },

            });

        if (plate.hasSelectedWells()) {

        }
        m.push(

            {
                label: 'Save table (ljt)',
                click: async (x, y) => {
                    let gs = plate.toJSON();
                    await exec('baja/table/io/save-yakro-table-layout.js', gs, 'ljt')
                },
                move: () => {
                },

            },

        )
        m.push(

            {
                label: 'Publish table', click: async (x, y) => {
                    try {
                        setTimeout(async () => {

                            await exec('baja/table/io/publish-yakro-table.js', plate, '/')
                        }, 100)
                    } catch (exception) { }

                }
            },

        )

        m.push(
            {
                label: 'Save layout',
                click: async (x, y) => {
                    let gs = plate.generatePlateLayoutJSON();
                    await exec('baja/table/io/save-yakro-table-layout.js', gs)

                },
                move: () => {
                },

            });
        m.push(
            {
                label: 'Apply layout',
                click: async (x, y) => {
                    await exec('baja/table/io/open-yakro-table-layout', pt, plate)
                },
                move: () => {
                },

            });
        m.push(
            {
                label: 'Remove tags',
                click: async (x, y) => {
                    pushHistory(HM(plate))
                    let se = plate.getSelectedWellsInOrder();
                    if (se && se.length > 0) {
                        for (let s of se) {
                            s.clearGroups();
                        }
                    } else {

                        let confirm = await exec('baja/lib/confirm.js', 'Remove tags from the entire table?', async () => {
                            let rows = plate.wells.length;
                            let cols = plate.wells[0].length;
                            for (let row = 0; row < rows; row++) {
                                for (let col = 0; col < cols; col++) {
                                    let w = plate.wells[row][col]
                                    w.clearGroups();
                                }
                            }
                            showModal(confirm)
                        })
                    }
                    pt.wb(null)
                },
                move: () => {
                },

            }
        )

        m.push(
            {
                label: 'Delete table',
                click: async (x, y) => {
                    let confirm = await exec('baja/lib/confirm.js', 'Delete this?', async () => {
                        setTimeout(() => {
                            pushHistory(HM(plate))

                            pt.removePlate(plate)
                            pt.wb(null)

                        }, 1000)
                    })
                    showModal(confirm)
                },
                move: () => {
                },
            });

        if (plate.hasSelectedWells()) {
            m.unshift(
                {
                    label: 'Color...',
                    click: (__x, __y) => {
                        plate.showColorMenu(pt)

                    },
                    move: () => {
                    },
                })

            m.unshift(
                {
                    label: 'Clear values',
                    click: async (x, y) => {
                        pushHistory(HM(plate))
                        let se = plate.getSelectedWellsInOrder()
                        for (let i of se) {
                            i.setValue(null);
                        }
                        clearMenu();

                    },
                    move: () => {
                    },
                }
            );

            let areWells = false;
            const text = await navigator.clipboard.readText();
            try {

                let js = JSON.parse(text)
                for (let a of js) {
                    if (a.position) {
                        areWells = true;
                        break;
                    }
                }

                if (areWells) {

                    m.unshift(
                        {
                            label: 'Paste',
                            click: async (__x, __y) => {
                                pushHistory(HM(plate))
                                let se = plate.getSelectedWellsInOrder()
                                const text = await navigator.clipboard.readText();
                                let js = JSON.parse(text)
                                let se_len = js.length;
                                for (let i = 0; i < se_len; i++) {
                                    if (i < se.length) {
                                        se[i].copyWell(js[i])
                                    }

                                }
                                plate.deselectAll();
                                pt.wb(null)
                            },
                            move: () => {
                            },
                        })

                    m.unshift(
                        {
                            label: 'Paste as tag',
                            click: async (x, y) => {
                                try {
                                    const text = await navigator.clipboard.readText();
                                    let js = JSON.parse(text)
                                    for (let a of js) {
                                        let rows = plate.wells.length;
                                        let cols = plate.wells[0].length;
                                        for (let row = 0; row < rows; row++) {
                                            for (let col = 0; col < cols; col++) {

                                                let w = plate.wells[row][col]
                                                if (w.select && w.position.toLowerCase() === a.position.toLowerCase() && a.group != null) {
                                                    w.appendGroups(a.getGroups())
                                                }

                                            }
                                        }
                                    }
                                    pt.wb(null)

                                } catch (err) {
                                    console.error('Failed to read from clipboard: ', err); pt.wb(null)

                                }
                            },
                            move: () => {
                            },
                        });
                    m.unshift(
                        {
                            label: 'Paste layout',
                            click: async (__x, __y) => {
                                pushHistory(HM(plate))
                                let se = plate.getSelectedWellsInOrder()
                                const text = await navigator.clipboard.readText();
                                let js = JSON.parse(text)
                                let se_len = js.length;
                                for (let i = 0; i < se_len; i++) {
                                    if (i < se.length) {
                                        se[i].position = (js[i].value)
                                        se[i].group = (Object.assign({}, js[i].group))
                                        se[i].concentration = js[i].concentration
                                    }
                                }
                                plate.deselectAll();
                                pt.wb(null)
                            },
                            move: () => {
                            },
                        })
                    m.unshift(
                        {
                            label: 'Paste as address',
                            click: async (__x, __y) => {
                                pushHistory(HM(plate))
                                let se = plate.getSelectedWellsInOrder()
                                const text = await navigator.clipboard.readText();
                                let js = JSON.parse(text)
                                let se_len = js.length;
                                for (let i = 0; i < se_len; i++) {
                                    if (i < se.length) {
                                        se[i].position = (js[i].value)
                                    }

                                }
                                plate.deselectAll();
                                pt.wb(null)
                            },
                            move: () => {
                            }
                        })
                }
            } catch (exception) {

            }
            m.push({
                label: 'Tag',
                click: (__x, __y) => {
                    plate.goTag(null, pt);
                },
                move: () => {
                },
            })

            m.push({
                label: 'Set min cell aspect ratio',
                click: async (__x, __y) => {
                    let cell_width = pt.grid.screenWidth(plate.getWidth(pt)) / (plate.grid.xmax - plate.grid.xmin);
                    let cell_height = pt.grid.screenHeight(plate.getHeight(pt)) / (plate.grid.ymax - plate.grid.ymin);
                    let ratio = cell_width / cell_height;

                    let va = await prompt("Current aspect ratio " + ratio, ["Aspect ratio"], { "Aspect ratio": '' + plate.visible_cell_aspect_ratio_min }, 300, 400)
                    let ar = va['Aspect ratio']
                    if (ratio < plate.visible_cell_aspect_ratio_min) {
                        let confirm = await exec('baja/lib/confirm.js', 'Your setting is less than the current so the table will no longer be visible; OK?', async () => {
                            setTimeout(() => {
                                pt.pushAnyPreviousHistory();
                                plate.visible_cell_aspect_ratio_min = parseFloat(ar);
                            }, 100)
                        })
                        showModal(confirm)
                    }
                },
                move: () => {
                },
            })
            m.push({
                label: 'Set max cell aspect ratio',
                click: async (__x, __y) => {

                    let cell_width = pt.grid.screenWidth(plate.getWidth(pt)) / (plate.grid.xmax - plate.grid.xmin);
                    let cell_height = pt.grid.screenHeight(plate.getHeight(pt)) / (plate.grid.ymax - plate.grid.ymin);
                    let ratio = cell_width / cell_height;
                    let va = await prompt("Current Aspect ratio " + ratio, ["Aspect ratio"], { "Aspect ratio": '' + plate.visible_cell_aspect_ratio_max }, 300, 400)
                    let ar = va['Aspect ratio']
                    if (ratio > plate.visible_cell_aspect_ratio_max) {
                        let confirm = await exec('baja/lib/confirm.js', 'Your setting is less than the current so the table will no longer be visible; OK?', async () => {
                            setTimeout(() => {
                                pt.pushAnyPreviousHistory();
                                plate.visible_cell_aspect_ratio_max = parseFloat(ar);
                            }, 100)
                        })
                        showModal(confirm)
                    }

                },
                move: () => {
                },
            })

            m.push({
                label: 'Remove tag',
                click: async (__x, __y) => {
                    let se = plate.getSelectedWellsInOrder()

                    function getAllGroupKeys(wells) {
                        const allKeys = new Set();

                        wells.forEach(well => {
                            if (well.group) {
                                Object.keys(well.group).forEach(key => allKeys.add(key));
                            }
                        });

                        return Array.from(allKeys);
                    }

                    let mm = [
                    ]

                    let gkeys = getAllGroupKeys(se);

                    for (let o of gkeys) {
                        mm.push({
                            label: `${o}`,
                            click: async (x, y) => {
                                for (let s of se) {
                                    if (!s.removeGroup(o)) {
                                        s.removeGroup(o);
                                    }
                                }
                                pt.wb(null)
                            },
                            move: () => {
                            },
                        },
                        )
                    }
                    let menutest = {
                        id: 'select-group-menu',
                        init: (x, y) => {
                            let cols = Math.ceil(mm.length / 20);
                            smenu = new Menu(mm, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * mm.length / 2), 'rgb(0, 87, 163)', 'white', cols)

                        },
                        mouseDownListener: async (x, y) => {
                            if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {

                            } else {
                                smenu = null;
                            }
                        },
                        mouseMoveListener: (x, y) => {
                            let mmx = pt.grid.Xwc(x);
                            let mmy = pt.grid.Ywc(y);
                            pt.grid.rescale();
                            plate.grid.rescale();
                            if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                                smenu.mouseMove(pt.grid, mmx, mmy)
                            }

                        },
                        mouseUpListener: async (x, y) => {
                            let mmx = pt.grid.Xwc(x);
                            let mmy = pt.grid.Ywc(y);
                            if (smenu && smenu.isIn(pt.grid, mmx, mmy)) {
                                await smenu.mouseUp(pt.grid, mmx, mmy)
                            }
                        }
                        ,
                        close: () => {
                            clearMenu();
                        },
                        draw: (grid, ctx) => {
                            if (smenu) {
                                smenu.draw(ctx, grid)
                                plate.textActive = false;
                                plate.text = ''
                            }
                        },

                    }
                    menutest.draw.bind(plate)

                    setTimeout(() => {
                        menutest['id'] = uuid()
                        pt.wb(menutest)
                    }, 500)

                },
                move: () => {
                },
                bg: 'yellow',
                fg: 'black'

            })
            m.push({
                label: 'Set min cell aspect ratio',
                click: async (__x, __y) => {
                    let va = await prompt("", ["Aspect ratio"], { "Aspect ratio": '' + plate.visible_cell_aspect_ratio_min }, 300, 400)
                    let ar = va['Aspect ratio']
                    plate.visible_cell_aspect_ratio_min = parseFloat(ar);
                },
                move: () => {
                },
            })
            m.push({
                label: 'Set max cell aspect ratio',
                click: async (__x, __y) => {
                    let va = await prompt("", ["Aspect ratio"], { "Aspect ratio": '' + plate.visible_cell_aspect_ratio_max }, 300, 400)
                    let ar = va['Aspect ratio']
                    plate.visible_cell_aspect_ratio_max = parseFloat(ar);

                },
                move: () => {
                },
            })

            m.push({
                label: 'Calculations',
                click: async (__x, __y) => {
                    let se = plate.getSelectedWellsInOrder()
                    let mm = []
                    mm.push(
                        {
                            label: 'Tighten',
                            click: async (x, y) => {
                                function reduceStandardDeviation(well) {
                                    const values = well.flat().map(obj => obj.value);
                                    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
                                    const adjustedValues = values.map(val => mean + (val - mean) / 10);
                                    let index = 0;
                                    for (let col = 0; col < well.length; col++) {
                                        well[col].value = adjustedValues[index];
                                        index++;
                                    }
                                }
                                reduceStandardDeviation(se);
                                smenu = null;

                            },
                            move: () => { },
                        },
                        {
                            label: 'Loosen',
                            click: async (x, y) => {
                                function increaseStandardDeviation(well) {
                                    const values = well.flat().map(obj => obj.value);
                                    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
                                    const adjustedValues = values.map(val => mean + (val - mean) * 10);
                                    let index = 0;
                                    for (let col = 0; col < well.length; col++) {
                                        well[col].value = adjustedValues[index];
                                        index++;
                                    }
                                }
                                increaseStandardDeviation(se);
                                smenu = null;
                            },
                            move: () => { },
                        },
                        {
                            label: 'Log',
                            click: async (x, y) => {
                                se.forEach(obj => obj.value = Math.log(obj.value));
                                smenu = null;

                            },
                            move: () => { },
                        },
                        {
                            label: 'Exponent',
                            click: async (x, y) => {
                                se.forEach(obj => obj.value = Math.exp(obj.value));
                                smenu = null;

                            },
                            move: () => { },
                        },
                        {
                            label: 'Cast to Integer',
                            click: async (x, y) => {
                                se.forEach(obj => obj.value = Math.floor(obj.value));
                                smenu = null;

                            },
                            move: () => { },
                        },
                        {
                            label: 'Multiply by 100',
                            click: async (x, y) => {
                                se.forEach(obj => obj.value *= 100);
                                smenu = null;

                            },
                            move: () => { },
                        },
                        {
                            label: 'Divide by 100',
                            click: async (x, y) => {
                                se.forEach(obj => obj.value /= 100);
                                smenu = null;

                            },
                            move: () => { },
                        },
                        {
                            label: 'Randomize using Value as Weight',
                            click: async (x, y) => {
                                se.forEach(obj => obj.value = Math.random() * obj.value);
                                smenu = null;

                            },
                            move: () => { },
                        },
                        {
                            label: 'Absolute Value',
                            click: async (x, y) => {
                                se.forEach(obj => obj.value = Math.abs(obj.value));
                                smenu = null;

                            },
                            move: () => { },
                        },
                        {
                            label: 'Round Up',
                            click: async (x, y) => {
                                se.forEach(obj => obj.value = Math.ceil(obj.value));
                                smenu = null;
                            },
                            move: () => { },
                        },
                        {
                            label: 'Round Down',
                            click: async (x, y) => {
                                se.forEach(obj => obj.value = Math.floor(obj.value));
                                smenu = null;

                            },
                            move: () => { },
                        }, {
                        label: 'Increment up',
                        click: async (x, y) => {
                            se.forEach(obj => obj.value++)

                        },
                        move: () => { },
                    },
                        {
                            label: 'Increment down',
                            click: async (x, y) => {
                                se.forEach(obj => obj.value--)

                            },
                            move: () => { },
                        }
                    );

                    let cols = 1
                    smenu = new Menu(mm, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(0, 87, 163)', 'white', cols)

                },
                move: () => {
                },
            })

            m.unshift({
                label: 'Address-to-column',
                click: async (__x, __y) => {
                    let newColumnIndex = plate.wells.length;
                    let selectedWells = plate.getSelectedWellsInOrder()
                    for (let y = 0; y < plate.wells[0].length; y++) {
                        if (!plate.wells[newColumnIndex]) {
                            plate.wells[newColumnIndex] = [];
                        }
                        let cc = selectedWells[y] || null;
                        plate.wells[newColumnIndex][y] = createDefaultWell()
                        plate.wells[newColumnIndex][y].setValue(cc.position)

                    }
                    plate.fitRowsAndColumns();
                    plate.deselectAll();
                    plate.clk_drag(pt);

                },
                move: () => {
                }
                ,
                bg: 'yellow',
                fg: 'black'

            })

            m.unshift({
                label: 'Copy cells',
                click: async (__x, __y) => {
                    let se = plate.getSelectedWellsInOrder()
                    pt.setMessage("Copied")

                    plate.textActive = false;
                    plate.deselectAll();
                    navigator.clipboard.writeText(JSON.stringify(se)).then(() => {

                        console.log("Object copied to clipboard!");
                    }).catch(err => {
                        console.error("Failed to copy object to clipboard: ", err);
                    });

                    plate.deselectAll();

                },
                move: () => {
                },
            })

            m.unshift({

                label: 'Copy > new column',
                click: async (__x, __y) => {
                    let newColumnIndex = plate.wells.length;
                    let selectedWells = plate.getSelectedWellsInOrder()
                    for (let y = 0; y < plate.wells[0].length; y++) {
                        if (!plate.wells[newColumnIndex]) {
                            plate.wells[newColumnIndex] = [];
                        }
                        let cc = selectedWells[y] || null;
                        if (cc)
                            plate.wells[newColumnIndex][y] = cc.deepCopy();
                        else
                            plate.wells[newColumnIndex][y] = createDefaultWell()
                    }
                    plate.fitRowsAndColumns();
                    plate.deselectAll();
                    plate.clk_drag(pt);

                },
                move: () => {
                },
            })

            m.unshift({

                label: 'Delete table formula...',
                click: async (__x, __y) => {
                    plate.deselectAll();
                    plate.formula = {};
                },
                move: () => {
                },
            })
            m.unshift(
                {
                    label: 'Font',
                    click: async (__x, __y) => {
                        let m = [];
                        let msub = [];
                        const fontFamilies = [
                            'Helvetica',
                            'Arial',
                            'Courier New',
                            'Times New Roman',
                            'Monospace',

                            'Verdana',
                            'Tahoma',
                            'Trebuchet MS',
                            'Georgia',
                            'Garamond',
                            'Palatino Linotype',

                            'Segoe UI',
                            '-apple-system',
                            'Roboto',
                            'Ubuntu',
                            'Cantarell',
                            'Noto Sans',

                            'Consolas',
                            'Menlo',
                            'Source Code Pro',
                            'Fira Code',
                            'JetBrains Mono'
                        ];

                        for (const font of fontFamilies) {
                            msub.push({
                                label: font,
                                click: (__x, __y) => {
                                    plate.selectAll();
                                    const se = plate.getSelectedWellsInOrder();
                                    for (let w of se) {
                                        w.font = font;
                                    }
                                },
                                move: () => { }
                            });
                        }

                        pt.setMenu(msub)
                    }
                })

            m.unshift({
                label: 'Edit table formula',
                click: async (x, y) => {

                    let editorPanel;
                    const _selectPanel = (p) => {
                        editorPanel = p;
                    }

                    function dictToArray(dict) {
                        return Object.entries(dict).map(([key, value]) => `${key}=${value}`);
                    }
                    let tp = dictToArray(plate.formula)
                    function arrayToDoubleNewlineString(arr) {
                        return arr.join('\n\n');
                    }
                    let tps = arrayToDoubleNewlineString(tp)

                    let export_sequence = {
                        wid: 'card',
                        data: {
                            height: '800px',
                            cards: [
                                [
                                    {
                                        'title': 'Table formula. ',
                                        'width': '100%',
                                        'height': '500px',
                                        'component': {
                                            wid: 'text-editor',
                                            height: '450px',
                                            refCallback: createIonFunction(_selectPanel),
                                            data: {
                                                text: tps,
                                                height: "350px",
                                                showButton: false,
                                                editorOptions: { language: 'text', automaticLayout: true },
                                                keybinding: {
                                                    'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                    })
                                                },
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
                                                        label: 'Save', ionFunction: createIonFunction(async () => {

                                                            let val = editorPanel.getText();

                                                            function stringToDict(inputStr) {

                                                                try {
                                                                    const parsed = JSON.parse(inputStr);
                                                                    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                                                                        return parsed;
                                                                    }
                                                                } catch (e) {

                                                                }

                                                                const lines = inputStr.split(/\r?\n/).filter(line => line.trim() !== '');
                                                                const dict = {};

                                                                for (let line of lines) {
                                                                    const cleaned = line.trim();
                                                                    if (!cleaned) continue;
                                                                    const eq = cleaned.indexOf('=');
                                                                    if (eq > 0) {
                                                                        const key = cleaned.slice(0, eq).trim();
                                                                        const value = cleaned.slice(eq + 1).trim();
                                                                        dict[key] = value;
                                                                    }
                                                                }

                                                                return dict;
                                                            }

                                                            function normalizeFormulaKeys(formulaObj) {
                                                                const out = {};
                                                                for (const [rawKey, val] of Object.entries(formulaObj)) {

                                                                    const brackets = rawKey.match(/\[\d+:\d+\]/g);
                                                                    let keyOnly = rawKey;

                                                                    if (brackets && brackets.length >= 2) {
                                                                        keyOnly = `${brackets[0]}${brackets[1]}`;
                                                                    } else if (brackets && brackets.length === 1) {

                                                                        keyOnly = brackets[0];
                                                                    } else {

                                                                        keyOnly = rawKey.trim();
                                                                    }

                                                                    if (out.hasOwnProperty(keyOnly) && keyOnly !== rawKey) {
                                                                        console.warn(`normalizeFormulaKeys: key collision on ${keyOnly}, overwriting previous value.`);
                                                                    }

                                                                    out[keyOnly] = val;
                                                                }
                                                                return out;
                                                            }

                                                            let d = stringToDict(val);
                                                            d = normalizeFormulaKeys(d);
                                                            plate.formula = d;

                                                            hideAllModal();

                                                        })
                                                    },
                                                    {
                                                        label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                            hideAllModal();
                                                        })
                                                    }
                                                ]
                                            }
                                        }
                                    }
                                ]]
                        }
                    }

                    setTimeout(() => {
                        CurrentLayout.reset("mainPanel")
                        showModal(export_sequence, 600, 600)

                    }, 300)

                },
                move: () => {
                },
            },)

            m.unshift({
                label: 'Copy > new table',
                click: async (x, y) => {

                    let selectedRows = {};
                    for (let col = 0; col < plate.wells.length; col++) {
                        for (let row = 0; row < plate.wells[col].length; row++) {
                            if (plate.wells[col][row].select === true) {
                                selectedRows[row] = row;
                            }
                        }
                    }

                    showModal({
                        wid: "json",
                        data: JSON.stringify(selectedRows)
                    })

                    let keys = Object.keys(selectedRows)
                    let p = new Plate(plate.name + '__CPY', plate.wells.length, selectedRows.length);
                    for (let col = 0; col < plate.wells.length; col++) {
                        let prow = 0;
                        for (let k of keys) {
                            let row = selectedRows[k]
                            if (plate.wells[col][row].select)
                                p.wells[col][prow++] = plate.wells[col][row].deepCopy();

                        }

                    }
                    p.removeEmptyRowsAndColumns();

                    p.fitRowsAndColumns();
                    p.grid.width = plate.grid.width;
                    p.grid.height = 1;

                    pt.setPlate(p, plate.grid.xi, plate.grid.yi - 3);
                    pt.alignPlates();
                    pt.zoomtfit();
                    setTimeout(() => {

                        pt.zoomintoplate(p);
                    }, 1000)
                    pt.wb(null)
                },
                move: () => {
                },
            })
        }

        pt.showMenu(m)
        resolve();

    })
}
