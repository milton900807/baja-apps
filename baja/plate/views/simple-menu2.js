function (pt, plate) {

    return new Promise(async (resolve, reject) => {

        console.log('debubg');

        const Menu = await exec('flexigraph/menu')
        let Icon = await exec('flexigraph/shapes/icon.js')
        let WellDisplay = await exec('baja/plate/views/well-display-factory')
        let HM = await exec('baja/history/HM')
        const bsize = 20;
        let cursorPos = 0;
        let WellColorPallette = await exec('baja/plate/well-color-palette.js')
        let mouseX;
        let mouseY;

        let ref;
        let interval_id;
        let smenu;
        let current_well = null;
        let pausing = false;

        function convertToARGB(color) {
            let r, g, b, a = 255;
            if (color.startsWith('#')) {

                if (color.length === 4) {

                    r = parseInt(color[1] + color[1], 16);
                    g = parseInt(color[2] + color[2], 16);
                    b = parseInt(color[3] + color[3], 16);
                } else if (color.length === 7) {

                    r = parseInt(color.substring(1, 3), 16);
                    g = parseInt(color.substring(3, 5), 16);
                    b = parseInt(color.substring(5, 7), 16);
                }
            } else if (color.startsWith('rgb')) {

                const rgba = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d*\.?\d+))?\)/);
                if (rgba) {
                    r = parseInt(rgba[1], 10);
                    g = parseInt(rgba[2], 10);
                    b = parseInt(rgba[3], 10);
                    if (rgba[4] !== undefined) {
                        a = Math.round(parseFloat(rgba[4]) * 255);
                    }
                }
            }
            const alphaHex = ('0' + a.toString(16)).slice(-2).toUpperCase();
            const redHex = ('0' + r.toString(16)).slice(-2).toUpperCase();
            const greenHex = ('0' + g.toString(16)).slice(-2).toUpperCase();
            const blueHex = ('0' + b.toString(16)).slice(-2).toUpperCase();
            return { argb: `${alphaHex}${redHex}${greenHex}${blueHex}` };
        }

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
                label: 'Expand \u2191',
                click: async (__x, __y) => {
                    pushHistory(HM(plate))
                    plate.insertRowWithCopyNoHightChange(0, pt);
                },
                move: () => {
                },
            },
            {
                label: 'Expand \u2190',
                click: async (__x, __y) => {
                    pushHistory(HM(plate))
                    plate.insertColWithCopy(0, pt);
                },
                move: () => {
                },
            },
            {
                label: 'Expand \u2192',
                click: async (__x, __y) => {
                    pushHistory(HM(plate))
                    plate.insertColWithCopy(plate.wells.length, pt)
                },
                move: () => {
                },
            },
            {
                label: 'Expand \u2193',
                click: async (__x, __y) => {
                    pushHistory(HM(plate))
                    plate.insertRowWithCopyNoHightChange(plate.wells[0].length, pt);

                },
                move: () => {
                },
            },
            {
                label: 'Insert Column | Row',
                click: (__x, __y) => {
                    plate.textActive = false;
                    pt.setMessage(" Click on table to view options... ")
                    plate.setMenu(pt, null)
                    let msub = [
                        {
                            label: 'Insert column here',
                            click: (x, y) => {

                                pushHistory(HM(plate))

                                let tx = plate.getXIndex(Math.round(plate.grid.Xwc(smenu.x - plate.grid.xi * 2)))

                                if (tx < 0) {
                                    tx = 1;
                                }
                                plate.insertColWithCopy(tx, pt)
                                pt.wb(null)
                                LJScript.add(plate.name, 'Insert column [' + tx + ']')
                                plate.closeMenu();

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
                                plate.closeMenu();

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
                                plate.closeMenu();

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
                                plate.closeMenu();

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
                                plate.closeMenu();

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
                                plate.closeMenu();

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
        ]

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

                    {
                        label: 'Copy > New table',
                        click: async (x, y) => {

                            let selectedRows = {};
                            for (let col = 0; col < plate.wells.length; col++) {
                                for (let row = 0; row < plate.wells[col].length; row++) {
                                    if (plate.wells[col][row].select === true) {
                                        selectedRows[row] = row;
                                    }
                                }
                            }

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
                            p.deselectWells();

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
                        }
                        ,
                        bg: 'yellow',
                        fg: 'black'

                    });

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
                label: 'Edit_selected',
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
                                                    console.log('debubg');
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
                    pt.setSelected(plate);
                    pt.wb(null)
                    plate.clk_drag(pt)
                    plate.setMenu(pt, null)
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

                            plate.selectColumnAtRow(current_well.yindex, current_well.xindex)
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
                                plate.selectColumnAtRow(current_well.yindex, current_well.xindex)
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
                            plate.selectRowAtColumn(current_well.yindex, current_well.xindex)
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
                                plate.selectRowAtColumn(current_well.yindex, current_well.xindex)
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
            } catch (exception) {

            }
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
        resolve(m)

    })

}
