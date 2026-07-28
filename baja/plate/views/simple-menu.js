function (pt, plate) {

    return new Promise(async (resolve, reject) => {
        let wells__ = plate.getSelectedWellsInOrder()
        let msub = [
            {
                label: 'Edit...',
                click: async (x, y) => {
                    smenu = null;
                    plate.showEditOptions(pt)

                },
                move: () => {
                },
            },
            {
                label: 'Expand \u2191',
                click: async (__x, __y) => {
                    plate.insertRow(0)
                },
                move: () => {
                },
            },
            {
                label: 'Expand \u2190',
                click: async (__x, __y) => {
                    plate.insertCol(0)
                },
                move: () => {
                },
            },
            {
                label: 'Expand \u2192',
                click: async (__x, __y) => {
                    plate.addColumn()

                },
                move: () => {
                },
            },
            {
                label: 'Expand \u2193',
                click: async (__x, __y) => {

                    plate.addRow();
                },
                move: () => {
                },
            }
        ]

        if (wells__ && wells__.length > 0) {
            let WellDisplay = await exec('baja/plate/views/well-display-factory')

            msub.push({
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

            msub.push(

                {
                    label: 'Insert column \u2192',
                    click: async (__x, __y) => {
                        const selected_column = plate.getSelectedWellsInOrder()
                        if (selected_column && selected_column.length > 0) {
                            const t = plate.getColIndex(selected_column[0])
                            plate.insertCol(t + 1)
                        }

                    },
                    move: () => {
                    },
                }, {
                label: 'Insert column \u2190',
                click: async (__x, __y) => {
                    const selected_column = plate.getSelectedWellsInOrder()
                    if (selected_column && selected_column.length > 0) {
                        const t = plate.getColIndex(selected_column[0])
                        plate.insertCol(t)
                    }

                },
                move: () => {
                },
            }

            )
        }
        let rw = plate.getSelectedRow();
        if (rw && rw.length > 0) {
            msub.push(
                {
                    label: 'Trim \u2191',
                    click: async (__x, __y) => {

                        let wells = plate.getSelectedWellsInTimeOrder();
                        if (wells && wells.length > 0) {
                            let id = plate.getWellIndicies(wells[0])
                            let colIndex = id.colIdx;
                            let rowIndex = id.rowIdx;
                            plate.removeRowsUp(rowIndex)
                        }

                    },
                    move: () => {
                    },
                },
                {
                    label: 'Trim \u2193',
                    click: async (__x, __y) => {

                        let wells = plate.getSelectedWellsInTimeOrder();
                        if (wells && wells.length > 0) {
                            let id = plate.getWellIndicies(wells[0])
                            let colIndex = id.colIdx;
                            let rowIndex = id.rowIdx;
                            plate.removeRowsDown(rowIndex)
                        }

                    },
                    move: () => {
                    },
                }
            )
        }
        if (plate.getSelectedColumn() != null && plate.getSelectedColumn().length > 0) {
            msub.unshift({
                label: 'Copy',
                click: async (x, y) => {
                    try {
                        let csv = '';
                        console.log('debubg');
                        for (let col = plate.grid.xmin; col < plate.grid.xmax; col++) {
                            for (let row = plate.grid.ymin; row < plate.grid.ymax; row++) {
                                if (plate.wells[col][row].select) {
                                    let value = plate.wells[col][row].value
                                    csv += value + '\t'
                                }
                            }
                            csv += '\n'
                        }
                        csv = csv.trim();
                        navigator.clipboard.writeText(csv).then(() => {
                            console.log("CSV copied to clipboard successfully!");
                        }).catch(err => {
                            console.error("Failed to copy to clipboard:", err);
                        });
                        clearMenu();
                    } catch (err) {
                        console.error('Failed to read from clipboard: ', err); pt.wb(null)
                    }
                },
                move: () => {
                },
            },

                {
                    label: 'Select \u2192',
                    click: async (__x, __y) => {

                        if (pt.selected_well) {
                            let id = plate.getWellIndicies(pt.selected_well)
                            let rowIndex = id.rowIdx;
                            let colIndex = id.colIdx
                            for (let selectColIndex = colIndex; selectColIndex < plate.wells.length; selectColIndex++) {
                                let rowWell = plate.wells[selectColIndex][rowIndex];
                                if (rowWell) {
                                    rowWell.select = true;
                                }
                            }

                            setTimeout(() => {
                                LJScript.add(plate.name, `select ${[colIndex, rowIndex]} right`)
                                plate.showSelectOptionsMenu(pt)
                            }, 1000)

                        }
                    },
                    move: () => {
                    },
                },
                {
                    label: 'Select \u2193',
                    click: async (__x, __y) => {

                        let wells = plate.getSelectedWellsInTimeOrder();
                        if (wells && wells.length > 0) {
                            let id = plate.getWellIndicies(wells[0])

                            let colIndex = id.colIdx;
                            let rowIndex = id.rowIdx;
                            for (let selectRowIndex = rowIndex; selectRowIndex < plate.wells[colIndex].length; selectRowIndex++) {
                                let colWell = plate.wells[colIndex][selectRowIndex];
                                if (colWell) {
                                    colWell.select = true;
                                }
                            }
                            LJScript.add(plate.name, `select [${colIndex}:${colIndex}][${rowIndex}:]`)
                            plate.showSelectOptionsMenu(pt)
                        }
                    },
                    move: () => {
                    },
                });

            msub.unshift(
                {
                    label: 'Sort rows on this column',
                    click: async (x, y) => {
                        smenu = null;
                        let c = plate.getSelectedColumn();
                        let ascending = true;
                        let columnIndex = plate.getColIndex(c[0][0])
                        const column = plate.wells[columnIndex];
                        const indexedValues = column.map((well, rowIndex) => ({ rowIndex, value: well.value }));
                        indexedValues.sort((a, b) => a.value - b.value);
                        const sortedWells = plate.wells.map(col => new Array(col.length));
                        plate.wells.forEach((col, colIndex) => {
                            indexedValues.forEach(({ rowIndex }, newRowIdx) => {
                                sortedWells[colIndex][newRowIdx] = col[rowIndex];
                            });
                        });
                        plate.wells = sortedWells;

                    },
                    move: () => {
                    },
                    bg: 'yellow',
                    fg: 'black'

                })

            msub.unshift(
                {
                    label: 'Sort column',
                    click: async (x, y) => {
                        smenu = null;
                        plate.showSortOptions(pt)
                    },
                    move: () => {
                    },
                    bg: 'yellow',
                    fg: 'black'

                })
            msub.unshift(
                {
                    label: 'Table from selected...',
                    click: async (x, y) => {
                        let va = await prompt("", ["Table"], { "Table": '' }, 300, 400)
                        let name = va['Table']
                        let interpreter = await exec('baja/engine/interpreter.js', pt)
                        interpreter.ref = this;
                        let fal = await interpreter.run('copy canvas');
                        interpreter.ref = pt
                        setTimeout(async () => {
                            let fal2 = await interpreter.run(`paste ${name}`);
                            setTimeout(async () => {
                                let fal2 = await interpreter.run(`zoomin ${name}`);

                            }, 1000)

                            pt.wb(null)

                        }, 1000)
                    },
                    move: () => {
                    },
                    bg: "yellow",
                    fg: "black"

                })

            msub.unshift(
                {
                    label: 'Split column',
                    click: async (x, y) => {

                        let v = [];
                        for (let i of values) {
                            v.push(i)
                        }

                        v = v.map(obj => obj.value);
                        let suggestiosn = plate.analyzeAndParse(v)

                        let selectP;
                        let selectPanel = createIonFunction(async (_panel) => {
                            selectP = _panel;
                        });

                        let tp = suggestiosn.analysis.topSpecialChars.map(item => item.char);
                        let up = suggestiosn.analysis.topUnits.map(item => item.unit);
                        let t = {
                            wid: 'card',
                            data: {
                                cards: [
                                    [
                                        {
                                            'title': 'Delimiter options',
                                            width: '100%',

                                            'body': `  `, 'component':
                                            {
                                                wid: 'selection-list',
                                                width: '100%',
                                                refCallback: selectPanel,
                                                data: {
                                                    listItems: tp,
                                                    button_function: createIonFunction(async (items) => {
                                                        let name = items[0]
                                                        for (let schar of suggestiosn.analysis.topSpecialChars) {
                                                            if (schar.char === name) {

                                                                const tx = plate.getColIndex(values[0]) + 1;
                                                                plate.insertCol(tx)
                                                                for (let w of values) {
                                                                    let row_index = plate.getRowIndex(w)
                                                                    let string_value = w.value + '';
                                                                    if (string_value != null && string_value.length > 0) {
                                                                        let new_values = string_value.split(schar.char)
                                                                        if (new_values != null && new_values.length > 0) {
                                                                            plate.setWellValue(tx, row_index, new_values[1])
                                                                            plate.setWellValue(tx - 1, row_index, new_values[0])
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    })

                                                }
                                            }
                                        },
                                        {
                                            'title': ' Numerical Units ',
                                            width: '100%',
                                            'body': `  `, 'component':
                                            {
                                                wid: 'selection-list',
                                                width: '100%',
                                                refCallback: selectPanel,
                                                data: {
                                                    listItems: up
                                                }
                                            }
                                        },
                                    ],
                                    [
                                    ]
                                ]
                            }
                        }
                        showModal(t, 500, 800)
                    },
                    move: () => {
                    }
                    ,
                    bg: 'yellow',
                    fg: 'black'
                })
        }

        let values = plate.getSelectedWellsInOrder();
        if (values.length > 1) {
            msub.unshift(
                {
                    label: 'Harmonize...',
                    click: async (x, y) => {
                        let selectP;
                        let selectPanel = createIonFunction(async (_panel) => {
                            selectP = _panel;
                        });
                        let options = [
                            'Find and replace',
                            'Sanitize to digits only',
                            'Remove non-alphanumeric characters',
                            'Apply regex replacement',
                            'Remove words with hyphens',
                            'Characters...'
                        ]

                        let t = {
                            wid: 'card',
                            data: {
                                cards: [
                                    [
                                        {
                                            'title': 'Replace functions',
                                            width: '100%',

                                            'body': `  `, 'component':
                                            {
                                                wid: 'selection-list',
                                                width: '100%',
                                                refCallback: selectPanel,
                                                data: {
                                                    listItems: options,
                                                    button_function: createIonFunction(async (items) => {
                                                        let name = items[0]
                                                        if (name === 'Find and replace') {

                                                            return setTimeout(async () => {

                                                                let va = await prompt("", ["Find", "Replace"], { "Find": '', "Replace": "" }, 300, 400)
                                                                let find = va['Find']
                                                                if (find != null && find.length > 0) {

                                                                    let replace = va['Replace']

                                                                    const tx = plate.getColIndex(values[0]);
                                                                    let count = 0;
                                                                    hideAllModal();
                                                                    clearMenu();

                                                                    for (let w of values) {
                                                                        let row_index = plate.getRowIndex(w)
                                                                        let string_value = w.value + '';
                                                                        if (string_value != null && string_value.length > 0) {
                                                                            if (string_value.indexOf(find) >= 0) {
                                                                                string_value = string_value.split(find).join(replace);
                                                                                plate.setWellValue(tx, row_index, string_value)
                                                                                count++;
                                                                            }
                                                                        }
                                                                    }
                                                                    pt.setMessage("Replaced " + count)
                                                                }
                                                            })
                                                        }
                                                        else if (name === 'Remove words with hyphens') {

                                                            function removeHyphenatedWords(text) {
                                                                return text
                                                                    .split(" ")
                                                                    .filter(word => !word.includes("-"))
                                                                    .join(" ");
                                                            }

                                                            const tx = plate.getColIndex(values[0]);
                                                            let count = 0;
                                                            hideAllModal();
                                                            clearMenu();

                                                            for (let w of values) {
                                                                let row_index = plate.getRowIndex(w)
                                                                let string_value = w.value + '';
                                                                if (string_value != null && string_value.length > 0) {
                                                                    string_value = removeHyphenatedWords(string_value)
                                                                    plate.setWellValue(tx, row_index, string_value)
                                                                    count++;
                                                                }
                                                            }
                                                            pt.setMessage("Replaced " + count)

                                                        }
                                                        else if (name === 'Apply regex replacement ') {

                                                            function replaceWithRegex(regex, replacement, original) {

                                                                if (!(regex instanceof RegExp)) {
                                                                    throw new Error('Invalid regular expression');
                                                                }

                                                                if (typeof replacement !== 'string') {
                                                                    throw new Error('Replacement must be a string');
                                                                }

                                                                if (typeof original !== 'string') {
                                                                    throw new Error('Original value must be a string');
                                                                }

                                                                return original.replace(regex, replacement);
                                                            }

                                                            hideAllModal();
                                                            return setTimeout(async () => {
                                                                let desc = {
                                                                    'wid': 'input-textarea-editor',
                                                                    'title': 'Enter regex...',
                                                                    'data': {
                                                                        'ionHookFunction': createIonFunction((w) => {
                                                                        }),
                                                                        'button-label': 'Run',
                                                                        'ionFunction': createIonFunction((description) => {

                                                                            description = description[0]
                                                                            let f = convertCommaDelimitedToArray(description)
                                                                            const tx = plate.getColIndex(values[0]);
                                                                            let count = 0;
                                                                            hideAllModal();
                                                                            clearMenu();

                                                                            for (let w of values) {
                                                                                let row_index = plate.getRowIndex(w)
                                                                                let string_value = w.value + '';
                                                                                if (string_value != null && string_value.length > 0) {
                                                                                    let nv = replaceWithRegex(f, string_value)
                                                                                    if (nv != null && nv != string_value) {
                                                                                        count++;
                                                                                        plate.setWellValue(tx, row_index, nv)
                                                                                    }
                                                                                }

                                                                            }
                                                                            pt.setMessage("Replaced " + count)
                                                                        })
                                                                    }
                                                                }
                                                                let card = {
                                                                    wid: 'card',
                                                                    data: {
                                                                        cards: [
                                                                            [
                                                                                {
                                                                                    'title': '',
                                                                                    width: '100%',
                                                                                    'body': `  `, 'component': desc
                                                                                }

                                                                            ]
                                                                        ]
                                                                    }
                                                                }
                                                                showModal(card, 500, 500)
                                                            }, 700)

                                                        } else if (name === 'Remove non-alphanumeric characters') {

                                                            function removeNonAlphanumeric(original) {
                                                                if (typeof original !== 'string') {
                                                                    throw new Error('Input must be a string');
                                                                }
                                                                return original.replace(/[^a-zA-Z0-9]/g, '');
                                                            }

                                                            function containsNonAlphanumeric(original) {

                                                                if (typeof original !== 'string') {
                                                                    throw new Error('Input must be a string');
                                                                }

                                                                return /[^a-zA-Z0-9]/.test(original);
                                                            }

                                                            const tx = plate.getColIndex(values[0]);
                                                            let count = 0;
                                                            hideAllModal();
                                                            clearMenu();

                                                            for (let w of values) {
                                                                let row_index = plate.getRowIndex(w)
                                                                let string_value = w.value + '';
                                                                if (string_value != null && string_value.length > 0 && containsNonAlphanumeric(string_value)) {
                                                                    let nv = removeNonAlphanumeric(string_value)
                                                                    if (nv != null && nv != string_value) {
                                                                        count++;
                                                                        plate.setWellValue(tx, row_index, nv)
                                                                    }
                                                                }

                                                            }
                                                            pt.setMessage("Updated " + count + ' values')
                                                        }
                                                        else
                                                            if (name === 'Remove words...') {
                                                                hideAllModal();
                                                                return setTimeout(async () => {
                                                                    let desc = {
                                                                        'wid': 'input-textarea-editor',
                                                                        'title': 'Enter comma delimited words to remove...',
                                                                        'data': {
                                                                            'ionHookFunction': createIonFunction((w) => {
                                                                            }),
                                                                            'button-label': 'Find+replace',
                                                                            'ionFunction': createIonFunction((description) => {

                                                                                description = description[0]
                                                                                let f = convertCommaDelimitedToArray(description)
                                                                                const tx = plate.getColIndex(values[0]);
                                                                                let count = 0;
                                                                                hideAllModal();
                                                                                clearMenu();

                                                                                for (let w of values) {
                                                                                    let row_index = plate.getRowIndex(w)
                                                                                    let string_value = w.value + '';
                                                                                    if (string_value != null && string_value.length > 0) {
                                                                                        let nv = removeWordsFromString(f, string_value)
                                                                                        if (nv != null && nv != string_value) {
                                                                                            count++;
                                                                                            plate.setWellValue(tx, row_index, nv)
                                                                                        }
                                                                                    }

                                                                                }
                                                                                pt.setMessage("Replaced " + count)
                                                                            })
                                                                        }
                                                                    }
                                                                    let card = {
                                                                        wid: 'card',
                                                                        data: {
                                                                            cards: [
                                                                                [
                                                                                    {
                                                                                        'title': '',
                                                                                        width: '100%',
                                                                                        'body': `  `, 'component': desc
                                                                                    }

                                                                                ]
                                                                            ]
                                                                        }
                                                                    }
                                                                    showModal(card, 500, 500)
                                                                }, 700)

                                                            } else if (name === 'Sanitize to digits only') {

                                                                function containsNonDigit(original) {
                                                                    if (typeof original !== 'string') {
                                                                        throw new Error('Input must be a string');
                                                                    }

                                                                    return /[^\d.]/.test(original);
                                                                }

                                                                function removeNonDigit(original) {
                                                                    if (typeof original !== 'string') {
                                                                        throw new Error('Input must be a string');
                                                                    }

                                                                    return original.replace(/[^\d.]/g, '').replace(/(\.)(?=.*\.)/g, '');
                                                                }

                                                                const tx = plate.getColIndex(values[0]);
                                                                let count = 0;
                                                                hideAllModal();
                                                                clearMenu();

                                                                for (let w of values) {
                                                                    let row_index = plate.getRowIndex(w)
                                                                    let string_value = w.value + '';
                                                                    if (string_value != null && string_value.length > 0 && containsNonDigit(string_value)) {
                                                                        let nv = removeNonDigit(string_value)
                                                                        if (nv != null && nv != string_value) {
                                                                            count++;
                                                                            plate.setWellValue(tx, row_index, nv)
                                                                        }
                                                                    }
                                                                }
                                                                LJScript.add(plate.name, 'sanitizetodigits')
                                                                pt.setMessage("Updated " + count + ' values')

                                                            }
                                                    })
                                                }
                                            }
                                        }],

                                ]
                            }
                        }
                        showModal(t, 500, 650)
                    },
                    move: () => {
                    },
                    bg: 'yellow',
                    fg: 'black'
                })
        }
        if (plate.isSingleRowSelected()) {
            msub.unshift({
                label: 'Delete selected row',
                click: async (x, y) => {
                    pushHistory(HM(this))
                    plate.removeFullySelectedRows()
                    pt.wb(null)
                },
                move: () => {
                },
                bg: 'yellow',
                fg: 'black'

            }
            )
        }
        if (plate.getSelectedColumn() != null && plate.getSelectedColumn().length > 0) {
            if (plate.getSelectedColumn().length === 1) {
                msub.push(
                    {
                        label: 'Move column',
                        click: async (x, y) => {

                            pt.setMessage(" Click on the new location for the column. ")

                            let move_col_x = -1;
                            let move_col_y = -1;

                            let mouseDownListener_sb = async (x, y) => {
                                let xw = pt.grid.Xwc(x);
                                let yw = pt.grid.Ywc(y);
                                let col = Math.floor(xw)
                                function moveColumn(wells, fromIndex, toIndex) {
                                    if (fromIndex === toIndex) return wells;
                                    const [movedColumn] = wells.splice(fromIndex, 1);
                                    wells.splice(toIndex, 0, movedColumn);
                                    return wells;
                                }
                                let c = plate.getSelectedColumn();
                                let column = plate.getColIndex(c[0][0])

                                plate.wells = moveColumn(plate.wells, column, col)
                                pt.wb(null)

                            };
                            let mouseMoveListener_sb = async (_x, _y) => {

                                move_col_x = _x;
                                move_col_y = _y;
                            };
                            let mouseUpListener_sb = async (x, y) => {
                            };
                            let t = {
                                id: 'move-column-edit',
                                mouseMoveListener: mouseMoveListener_sb,
                                mouseUpListener: mouseUpListener_sb,
                                mouseDownListener: mouseDownListener_sb,
                                init: () => {
                                },
                                close: () => {
                                },
                                priority: true,
                                draw: (grid, ctx) => {

                                    let width = plate.grid.screenWidth(1)
                                    let height = plate.grid.height;
                                    ctx.lineWidth = 1;
                                    ctx.shadowBlur = 2;
                                    ctx.shadowColor = 'black';
                                    ctx.fillStyle = 'RGBA(25,25,255,0.05)'
                                    ctx.strokeStyle = 'RGBA(25,25,255,0.05)'
                                    ctx.fillRect(move_col_x, move_col_y, width, height);
                                    ctx.fill();

                                },
                                menuManager: null,
                                smenu: null
                            }
                            if (pt && pt.wb)
                                pt.wb(t)
                            smenu = null;

                        },
                        move: () => {
                        },
                    })

            }
            msub.unshift({
                label: 'Delete column',
                click: async (x, y) => {
                    pushHistory(HM(this))
                    let selectedCol = plate.getSelectedColumn();
                    for (let x = 0; x < selectedCol.length; x++) {
                        if (selectedCol[x][0] && selectedCol[x][0].select) {
                            let c = plate.getColIndex(selectedCol[x][0])
                            plate.removeCol(c)
                        }
                    }
                    pt.wb(null)
                },
                move: () => {
                }
                ,
                bg: 'yellow',
                fg: 'black'

            })
            msub.unshift(
                {
                    label: 'Delete  values',
                    click: async (x, y) => {
                        try {

                            let selected_wells = plate.getSelectedWellsInOrder();
                            let confirm = await exec('baja/lib/confirm.js', 'Delete values for ' + selected_wells.length + ' cells?', async () => {
                                setTimeout(() => {
                                    pt.pushAnyPreviousHistory();

                                    for (let item of selected_wells) {
                                        item.setValue('')
                                    }
                                }, 100)
                            })
                            showModal(confirm)
                        } catch (err) {
                            console.error('Failed to read from clipboard: ', err); pt.wb(null)
                        }
                    },
                    move: () => {
                    }
                    ,
                    bg: 'yellow',
                    fg: 'black'

                });
            msub.unshift(
                {
                    label: 'Delete tags',
                    click: async (x, y) => {
                        try {
                            let selected_wells = plate.getSelectedWellsInOrder();
                            for (let s of selected_wells) {
                                s.group = {};

                            }
                            smenu = null;

                        } catch (err) {
                            console.error('Failed to read from clipboard: ', err); pt.wb(null)
                        }
                    },
                    move: () => {
                    }, bg: 'yellow',
                    fg: 'black'
                });
            msub.unshift(
                {
                    label: 'Deselect',
                    click: async (x, y) => {
                        try {
                            plate.deselectAll();
                        } catch (err) {
                            console.error('Failed to read from clipboard: ', err); pt.wb(null)
                        }
                    },
                    move: () => {
                    },
                    bg: 'yellow',
                    fg: 'black'
                }

            );
        }
        msub.push(
            {
                label: 'Tag',
                click: (x, y) => {
                    plate.goTag(null, pt);
                },
                move: () => {
                },
            });

        msub.push(
            {
                label: 'Copy table',
                click: (x, y) => {

                    const copytable = HM(this);
                    navigator.clipboard.writeText(copytable).then(() => {
                        console.log("Object copied to clipboard!");
                    }).catch(err => {
                        console.error("Failed to copy object to clipboard: ", err);
                    });
                    smenu = null;
                    plate.clk_drag(pt)
                },
                move: () => {
                },
            });

        msub.push(

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
            }
        )

        msub.push({
            label: 'Display preferences',
            click: (x, y) => {
                const names = [
                ]
                let targetObject = plate;
                smenu = null;

                Object.keys(targetObject).forEach(key => {
                    if (typeof targetObject[key] === 'boolean' && key.startsWith('attr__')) {

                        const label = key.replace(/^attr__/i, '').replace(/([A-Z])/g, ' $1').toLowerCase();

                        const formattedLabel = label.charAt(0).toUpperCase() + label.slice(1);
                        const actionLabel = targetObject[key] ? `Disable ${formattedLabel}` : `Enable ${formattedLabel}`;
                        names.push({ key, label: actionLabel });
                    }
                });

                let t = {
                    wid: 'selection-list',
                    data: {
                        single_selection: true,
                        show_button: false,
                        singleSelect: true,
                        listItems: names.map(item => item.label),
                        button_function: createIonFunction(async (items) => {
                            let selectedLabel = items[0];
                            let selectedItem = names.find(item => item.label === selectedLabel);

                            if (selectedItem) {
                                targetObject[selectedItem.key] = !targetObject[selectedItem.key];
                            }
                            hideAllModal();
                        })
                    }
                };
                showModal(t, 500, 600)
            }
        })

        msub.push(
            {
                label: 'more...',

                click: async (x, y) => {
                    const m = await plate.loadMenu(pt, 'baja/plate/views/big-menu', pt, plate)

                    plate.displayMenu(m, pt)
                },
                move: () => {
                },
            });

        msub.sort((a, b) => {
            const isYellowA = a.bg === 'yellow';
            const isYellowB = b.bg === 'yellow';
            if (isYellowA && !isYellowB) return -1;
            if (!isYellowA && isYellowB) return 1;
            return 0;
        });

        resolve(msub);
    })

}
