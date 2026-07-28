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
        let mouseY;

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
        ]

        let column = plate.getSelectedColumn()
        let rows = plate.getSelectedRow();
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
                                    excelCell.value = well.value;

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

            m.push(
                {
                    label: 'Export Selected (XSLX)',
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
                                    if (well && well.select) {
                                        let ccolor = well.group && well.group in WellColorPallette ? WellColorPallette[well.group] : 'rgba(220,220,220,0.3)';
                                        ccolor = convertToARGB(ccolor);
                                        let excelCell = excelRow.getCell(col + 1);
                                        excelCell.value = well.value;
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

                            createSheetForAttribute(attribute, attribute.charAt(0).toUpperCase() + attribute.slice(1));
                        });
                        workbook.xlsx.writeBuffer().then(function (buffer) {
                            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                            const link = document.createElement('a');
                            link.href = URL.createObjectURL(blob);
                            link.download = `${plate.name}_raw.xlsx`;
                            link.click();
                        });
                        pt.wb(null)
                    },
                    move: () => {
                    },
                });
            m.push(
                {
                    label: 'Color selected cells...',
                    click: (__x, __y) => {
                        plate.showColorMenu(pt)

                    },
                    move: () => {
                    },
                })

            m.push(
                {
                    label: 'Clear selected cell values',
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

            m.push({
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

        }

        m.push({
            label: 'More...',
            click: async (__x, __y) => {
                await exec('baja/plate/views/big-menu', pt, plate)
            },
            move: () => {
            },
        })

        resolve(m)

    })
}
