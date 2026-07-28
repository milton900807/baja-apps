function (pt, sp) {






    const singleValueMenuItem = (label, calc, formulaFn) => ({
        label,

        click: async () => {

            const plateTrack = pt;

            const se = sp.getSelectedWellsInOrder();

            if (!se || se.length === 0) {
                smenu = null;
                return;
            }

            const vals = se
                .map(o => Number(o.value))
                .filter(v => !Number.isNaN(v));

            if (vals.length === 0) {
                smenu = null;
                return;
            }

            // --------------------------------------------
            // build selected range metadata
            // --------------------------------------------

            const selectedMeta = se
                .map(well => sp.getWellIndicies(well))
                .filter(idx =>
                    idx &&
                    Number.isInteger(idx.colIdx) &&
                    Number.isInteger(idx.rowIdx)
                );

            if (selectedMeta.length === 0) {
                smenu = null;
                return;
            }

            const minCol = Math.min(...selectedMeta.map(idx => idx.colIdx));
            const maxCol = Math.max(...selectedMeta.map(idx => idx.colIdx));
            const minRow = Math.min(...selectedMeta.map(idx => idx.rowIdx));
            const maxRow = Math.max(...selectedMeta.map(idx => idx.rowIdx));

            const range = `[${minCol}:${maxCol}][${minRow}:${maxRow}]`;

            const sourceRef = `${sp.name}${range}`;

            // --------------------------------------------
            // dynamic formula generation
            // --------------------------------------------

            const formula = formulaFn
                ? formulaFn(sourceRef)
                : `${label.toLowerCase().replace(/\s+/g, "_")}(${sourceRef})`;

            // --------------------------------------------
            // helper: create output table
            // --------------------------------------------

            const createSingleWellValueTable = (label, value, formula = null) => {

                const fromSelectedWells = sp.getSelectedWellsInOrder();

                let y = pt.grid.Y(pt.grid.yi);

                if (fromSelectedWells.length > 0) {
                    const colrow = sp.getWellIndicies(fromSelectedWells[0]);
                    y = sp.grid.Y(colrow.rowIdx);
                }

                const safeName = label
                    .replace(/[^\w]+/g, "_")
                    .replace(/^_+|_+$/g, "")
                    .toLowerCase();

                const tablename = `${safeName}`;

                const graph = CurrentLayout.getStashed('graph');

                graph.setMouseMode("msg:Click on canvas to drop the table");

                const t = {
                    id: 'override-droptable',

                    mouseMoveListener: async (x, y) => {
                    },

                    mouseUpListener: async (x, y) => {

                        let ltable = plateTrack.getTableByName(tablename);

                        if (!ltable || ltable.length === 0) {

                            ltable = plateTrack.newSimplePlate(
                                tablename,
                                1,
                                1,
                                sp,
                                y
                            );

                            ltable.displayNumberValues = false;
                        }

                        ltable.grid.xi = pt.grid.Xwc(x);
                        ltable.grid.yi = pt.grid.Ywc(y) - ltable.grid.height;

                        ltable.grid.width = pt.grid.worldWidth(300);
                        ltable.grid.height = pt.grid.worldHeight(100);

                        // --------------------------------
                        // assign formula dynamically
                        // --------------------------------

                        ltable.formula['[0:0][0:0]'] =
                            formula ? formula : value;

                        ltable.selectWellsByString('[0:][0:]');

                        const intoSelectedWells =
                            ltable.getSelectedWellsInOrder();

                        intoSelectedWells[0].setValue(
                            Number(value).toFixed(4)
                        );

                        intoSelectedWells[0].skin_type =
                            'SIMPLE_TEXT';

                        ltable.deselectWells();
                        pt.wb(null);
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

                pt.wb(t);
            };

            setTimeout(async () => {

                const va = await prompt(
                    `New table name`,
                    ["Name"],
                    { "Name": "" },
                    300,
                    300
                );

                let vaname = va['Name'];

                if (
                    !va ||
                    va["Name"] === undefined ||
                    va["Name"] === null
                ) {
                    vaname = 'untitled';
                }

                sp.wellannotations[range] = {
                    type: 'calculated',
                    label: '',
                    comment: 'Calc → ' + vaname,
                    visible: true,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
                };

                const result =
                    await calc(vals, se);

                if (!Number.isNaN(result)) {

                    createSingleWellValueTable(
                        vaname,
                        result,
                        formula
                    );
                }

            }, 300);
        }
    })








    const createCopyMenu = async () => {


        const FOLDER_ICON = '📁';

        const MENU_COLORS = [
            { bg: 'rgb(255, 244, 179)', fg: 'rgb(32, 28, 0)' },
            { bg: 'rgb(220, 240, 255)', fg: 'rgb(0, 42, 79)' },
            { bg: 'rgb(232, 255, 220)', fg: 'rgb(18, 72, 0)' },
            { bg: 'rgb(255, 225, 235)', fg: 'rgb(104, 0, 39)' },
            { bg: 'rgb(238, 229, 255)', fg: 'rgb(52, 21, 110)' },
            { bg: 'rgb(255, 238, 214)', fg: 'rgb(92, 50, 0)' },
            { bg: 'rgb(216, 255, 249)', fg: 'rgb(0, 76, 68)' },
            { bg: 'rgb(245, 230, 210)', fg: 'rgb(74, 44, 16)' },
            { bg: 'rgb(230, 255, 245)', fg: 'rgb(0, 75, 52)' },
            { bg: 'rgb(255, 230, 210)', fg: 'rgb(92, 37, 0)' },
            { bg: 'rgb(230, 238, 255)', fg: 'rgb(24, 47, 105)' },
            { bg: 'rgb(255, 248, 220)', fg: 'rgb(80, 65, 0)' },
        ];

        let __menuColorCounter = 0;

        const normalizeMenuLabel = (label) => String(label ?? '');

        const functionLooksLikeSubmenu = (fn) => {
            if (typeof fn !== 'function') return false;
            const src = Function.prototype.toString.call(fn);
            return /\b(setMenu|showMenu|showWindowMenu|new\s+Menu|createConnectMenu)\b/.test(src);
        };

        const hasSubmenu = (item) => {
            if (!item || typeof item !== 'object') return false;
            const label = normalizeMenuLabel(item.label);
            return Array.isArray(item.children) ||
                Array.isArray(item.submenu) ||
                Array.isArray(item.items) ||
                Array.isArray(item.menu) ||
                item.opensSubmenu === true ||
                /\.\.\.$/.test(label.trim()) ||
                functionLooksLikeSubmenu(item.click);
        };

        const orderFoldersFirst = (items) => {
            if (!Array.isArray(items)) return items;

            return [...items].sort((a, b) => {
                const aFolder = hasSubmenu(a) ? 0 : 1;
                const bFolder = hasSubmenu(b) ? 0 : 1;
                return aFolder - bFolder;
            });
        };

        const decorateMenuItems = (items, depth = 0) => {
            if (!Array.isArray(items)) return items;

            return orderFoldersFirst(items).map((item) => {
                if (!item || typeof item !== 'object') return item;

                const color = MENU_COLORS[__menuColorCounter++ % MENU_COLORS.length];
                const folder = hasSubmenu(item);
                const label = normalizeMenuLabel(item.label);
                const cleanLabel = label.startsWith(FOLDER_ICON)
                    ? label.slice(FOLDER_ICON.length).trimStart()
                    : label;

                const next = {
                    ...item,
                    label: folder ? `${FOLDER_ICON} ${cleanLabel}` : cleanLabel,

                    // Force every item to use its own color. Do not preserve old yellow/black values.
                    bg: color.bg,
                    fg: color.fg,

                    // A few menu renderers use alternate field names; keep these in sync.
                    background: color.bg,
                    foreground: color.fg,
                    textColor: color.fg,
                    color: color.fg,
                    style: {
                        ...(item.style || {}),
                        background: color.bg,
                        backgroundColor: color.bg,
                        color: color.fg,
                    },
                };

                if (Array.isArray(next.children)) next.children = decorateMenuItems(next.children, depth + 1);
                if (Array.isArray(next.items)) next.items = decorateMenuItems(next.items, depth + 1);
                if (Array.isArray(next.menu)) next.menu = decorateMenuItems(next.menu, depth + 1);
                if (Array.isArray(next.submenu)) next.submenu = decorateMenuItems(next.submenu, depth + 1);

                return next;
            });
        };

        const decorateMenuLike = (menuLike) => {
            if (Array.isArray(menuLike)) return decorateMenuItems(menuLike);
            if (!menuLike || typeof menuLike !== 'object') return menuLike;

            // Best-effort support for Menu instances. Different menu classes store their rows
            // under different property names, so update every likely array slot.
            for (const key of ['items', 'menu', 'm', 'data', 'options', 'children']) {
                if (Array.isArray(menuLike[key])) {
                    menuLike[key] = decorateMenuItems(menuLike[key]);
                }
            }
            return menuLike;
        };

        const setDecoratedMenu = (items) => {
            pt.setMenu(decorateMenuLike(items));
        };

        const makeDecoratedMenu = (items, x, y, bg = 'rgb(205, 255, 155)', fg = 'black', cols = 1) => {
            return new Menu(
                decorateMenuItems(items),
                x,
                y,
                bg,
                fg,
                cols
            );
        };



        const Menu = await exec('flexigraph/menu')
        const __rawSetMenu = pt.setMenu ? pt.setMenu.bind(pt) : null;
        if (__rawSetMenu && !pt.__decoratedSetMenuInstalled) {
            pt.setMenu = (menuLike) => __rawSetMenu(decorateMenuLike(menuLike));
            pt.__decoratedSetMenuInstalled = true;
        }
        const TransparentPlate = await exec('baja/plate/plate-transparent')
        let WellDisplay = await exec('baja/plate/views/well-display-factory')
        let HM = await exec('baja/history/HM')
        let MGrid = await exec('flexigraph/grid.js')
        const se = sp.getSelectedWellsInOrder();
        if (!sp) throw new Error("createCopyMenu(sp, pt): missing 'sp'");



        function getRowsWithMultipleColumns(cells) {
            const rowMap = new Map();

            for (const c of cells) {
                if (!rowMap.has(c.y)) rowMap.set(c.y, new Set());
                rowMap.get(c.y).add(c.x);
            }

            return [...rowMap.entries()]
                .filter(([_, cols]) => cols.size >= 2)
                .map(([y]) => y);
        }

        function hasMultipleRowsWithMultipleColumns(cells) {
            const rowMap = new Map();

            // Group columns by row
            for (const c of cells) {
                if (!rowMap.has(c.y)) {
                    rowMap.set(c.y, new Set());
                }
                rowMap.get(c.y).add(c.x);
            }

            // Count how many rows have 2+ columns
            let qualifyingRows = 0;

            for (const colSet of rowMap.values()) {
                if (colSet.size >= 2) {
                    qualifyingRows++;
                    if (qualifyingRows > 1) {
                        return true; // early exit
                    }
                }
            }

            return false;
        }



        if (sp.menu_options) {
            let menuObject = __decompress(sp.menu_options);
            let selectedPlate = sp;

            function deserializeObject(jsonString, context = { selectedPlate, pt }) {
                return JSON.parse(jsonString, (key, value) => {
                    if (
                        typeof value === 'string' &&
                        (value.startsWith('async') || value.startsWith('function') || value.includes('=>'))
                    ) {
                        try {
                            const contextKeys = Object.keys(context);
                            const contextValues = Object.values(context);
                            const fn = new Function(...contextKeys, `return (${value});`);
                            return fn(...contextValues);
                        } catch (e) {
                            console.error('Failed to deserialize function:', e);
                            return value;
                        }
                    }
                    return value;
                });
            }

            try {
                menuObject = deserializeObject(menuObject);
            } catch (_) { }

            const restoreFunctions = (arrayOfObjects, pt, msub) => {
                return arrayOfObjects.map(item => {
                    const newItem = { ...item };
                    let cfunction = null;

                    if (newItem._opp) {
                        try { cfunction = eval(newItem._opp); } catch (_) { cfunction = null; }
                    }
                    if (cfunction) {
                        newItem.click = cfunction;
                    } else if (typeof newItem.click === 'string') {
                        try {
                            const fn = eval('(' + newItem.click + ')');
                            newItem.click = function (x, y) {
                                if (cfunction) cfunction(x, y);
                                return fn.call(sp, x, y, pt, msub);
                            };
                        } catch (e) {
                            console.error('Failed to restore click function for', newItem.label, e);
                        }
                    }
                    return newItem;
                });
            };

            const built = restoreFunctions(menuObject, pt, menuObject);

            return decorateMenuItems(built);
        }

        const cond = [];
        const noncond = [];

        const wells__ = sp.getSelectedWellsInOrder();
        const values = wells__;
        const hasSel = values && values.length > 0;
        const oneSel = values && values.length === 1;
        const rowSel = sp.getSelectedRow && sp.getSelectedRow();
        const colSel = sp.getSelectedColumn && sp.getSelectedColumn();
        const hasCol = colSel && colSel.length > 0;

        if (colSel) {

        }

        if (sp.plateType) {
            let TableOps = await exec('baja/table/table-ops')
            let context_specific = await TableOps.load(pt, sp)
            cond.push({
                label: sp.plateType,
                click: async () => {
                    pt.setMenu(context_specific)
                },
                bg: 'yellow', fg: 'black'
            })
        }
        cond.push({
            label: 'Table',
            click: async () => {
                let cond = []




                cond.push({
                    label: 'Table type',
                    click: async () => {
                        const va = await prompt("Type", ["Type"], { "Type": sp.plateType }, 300, 300);
                        const m = va['Type'];
                        if (m != null) { sp.plateType = m; sp.updatePlateType(); }
                    },
                    bg: 'yellow', fg: 'black'
                },

                    {
                        label: 'Font ',
                        click: (__x, __y) => {
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
                                        sp.selectAll();
                                        const se = sp.getSelectedWellsInOrder();
                                        for (let w of se) {
                                            w.font = font;
                                            console.log(" font " + font)
                                        }
                                    },
                                    move: () => { }
                                });
                            }
                            pt.setMenu(msub)
                        }
                    },
                )

                cond.push({
                    label: 'Change name: ' + sp.name,
                    click: async () => {
                        const va = await prompt("Table name: " + sp.name, ["Name"], { "Name": '' }, 500, 300);
                        const m = va['Name'];
                        sp.name = m;
                        pt.updateworkbench(null);
                    }
                })

                cond.push({
                    label: 'Remove empty rows or columns',
                    click: (x, y) => {
                        pushHistory(HM(sp))
                        sp.removeEmptyRowsAndColumns()

                    },
                    move: () => {
                    },
                    bg: 'yellow', fg: 'black'

                }
                )
                cond.push({
                    label: 'Remove low information columns',
                    click: (x, y) => {
                        pushHistory(HM(sp))
                        sp.removeLowInformationColumns()

                    },
                    move: () => {
                    },
                    bg: 'yellow', fg: 'black'

                }
                )

                cond.push(
                    {
                        label: 'Display table structure',
                        click: async (x, y) => {

                            showModal({
                                wid: 'json',
                                data: JSON.stringify(sp.toValueFormulaJSON())
                            })

                        },
                        bg: 'yellow', fg: 'black'
                    })
                if (sp.getSelectedWellsInOrder() != null && sp.getSelectedWellsInOrder().length > 0) {

                    cond.push(
                        {
                            label: 'Take selected into new table',
                            click: async (x, y) => {


                                let welldimensions = sp.getSelectedWellsInOrder();


                                const splitRowsArrayInHalf = (arr) => {
                                    const uniqueCols = arr;
                                    const midColIndex = Math.floor(uniqueCols.length / 2);
                                    const firstHalf = uniqueCols.slice(0, midColIndex);
                                    const secondHalf = uniqueCols.slice(midColIndex);
                                    return [firstHalf, secondHalf];

                                };



                                const [firstHalf, secondHalf] = splitRowsArrayInHalf(welldimensions);
                                let m = await exec('baja/plate/views/big-menu-for-plates-table-from-selected', pt, sp)
                                pt.setMenu(m)

                            },
                            bg: 'yellow', fg: 'black'
                        })

                }

                cond.push(
                    {
                        label: 'Suggest operations',
                        click: (_x, _y) => {
                            setTimeout(async () => {
                                const t = sp;
                                setTimeout(async () => {
                                    let plate_type = await exec('py/openai/analytics/get-plate-type.py', t.toValueFormulaJSON(), ['data', 'Dose-response', 'ribogreen', 'QPCR-Analysis'])
                                    if (plate_type?.selection?.chosen) {
                                        t.setType(plate_type.selection.chosen)
                                        t.addActionGlyph(pt, 'Options for ' + plate_type.selection.chosen, async (pt, selectedPlate) => {
                                            let TableOps = await exec('baja/table/table-ops')
                                            let m = await TableOps.load(pt, selectedPlate)
                                            setTimeout(async () => {
                                                let Menu = await exec('flexigraph/menu.js');
                                                const smenu = new Menu(m, pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200), pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2), 'rgb(0, 87, 163)', 'white', 2)
                                                pt.setMenu(smenu)
                                            }, 1000)
                                        })
                                    }
                                }, 200)
                            }, 500);
                        }
                    },
                )
                cond.push(
                    {
                        label: 'Show annotations',
                        click: (_x, _y) => {
                            setTimeout(async () => {
                                const t = sp;
                                sp.showAnnotations(sp.Attr__showAnnotations ? false : true);
                            }, 500);
                        },
                        fg: 'blue',
                        bg: 'white'
                    },

                )

                cond.push(
                    {
                        label: 'Join...',
                        click: async (x, y) => {
                            let showOptions = () => {
                                let plate = sp;
                                let m = [

                                    {
                                        label: `Join into ${sp.name}`,
                                        click: async (x, y) => {

                                            const ttname = pt.getTableNames();
                                            const tname = []
                                            for (let t of ttname) {
                                                if (t != plate.name) {
                                                    tname.push(t)
                                                }
                                            }

                                            let selectionpanel = null;
                                            const selectPanel = createIon((pa) => {
                                                selectionpanel = pa;
                                            })

                                            let choose_Table = {
                                                wid: 'card',
                                                componentRef: 'bottomPanel',
                                                data: {
                                                    height: '800px',
                                                    cards: [
                                                        [
                                                            {
                                                                'title': 'Join data from which table:',
                                                                width: '100%',
                                                                'body': ` `, 'component':
                                                                {
                                                                    wid: 'selection-list',
                                                                    width: '100%',
                                                                    refCallback: selectPanel,
                                                                    data: {
                                                                        listItems: tname,
                                                                        button_function: createIonFunction(async (items) => {
                                                                            let name = items[0]
                                                                            setTimeout(() => {

                                                                                const truncateName = (n) =>
                                                                                    typeof n === 'string' ? n.slice(0, 4) : n;

                                                                                const m3 = [
                                                                                    {
                                                                                        label: `${truncateName(sp.name)}:Value == ${truncateName(name)}:Address `, click: async (x, y) => {
                                                                                            await exec('baja/plate/data/join', pt, pt.getTableByName(name), plate)
                                                                                        },
                                                                                        move: () => {
                                                                                        },
                                                                                    },
                                                                                    {
                                                                                        label: `${truncateName(name)}:Value == ${truncateName(sp.name)}:Address `, click: async (x, y) => {
                                                                                            const plate2 = pt.getTableByName(name);
                                                                                            await exec('baja/plate/data/join', pt, plate, plate2)
                                                                                        },
                                                                                        move: () => {
                                                                                        },
                                                                                    }

                                                                                ]
                                                                                pt.setMenu(m3)

                                                                            }, 10)

                                                                            CurrentLayout.reset('mainPanel')

                                                                        })
                                                                    }
                                                                }
                                                            },
                                                            {
                                                                label: 'Close', ionFunction: createIonFunction(() => {
                                                                    hideAllModal();
                                                                    CurrentLayout.reset('mainPanel')

                                                                })
                                                            },

                                                        ]]
                                                }
                                            }

                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', choose_Table);

                                            let m2 = [
                                                {
                                                    label: `${sp.name} Value == Address `,
                                                    click: async (x, y) => {

                                                        pushHistory(HM(plate))
                                                        let selectionpanel = null;
                                                        const selectPanel = createIon((pa) => {
                                                            selectionpanel = pa;
                                                        })
                                                        const ttname = pt.getTableNames();
                                                        const tname = []
                                                        for (let t of ttname) {
                                                            if (t != plate.name) {
                                                                tname.push(t)
                                                            }
                                                        }
                                                        let zoom_to = {
                                                            wid: 'card',
                                                            componentRef: 'bottomPanel',
                                                            data: {
                                                                height: '800px',
                                                                cards: [
                                                                    [
                                                                        {
                                                                            'title': 'Choose the table with a column address to join with plate.',
                                                                            width: '100%',

                                                                            'body': ` `, 'component':
                                                                            {
                                                                                wid: 'selection-list',
                                                                                width: '100%',
                                                                                refCallback: selectPanel,
                                                                                data: {
                                                                                    listItems: tname,
                                                                                    button_function: createIonFunction(async (items) => {
                                                                                        let name = items[0]
                                                                                        await exec('baja/plate/data/join', pt, pt.getTableByName(name), plate)

                                                                                    })
                                                                                }
                                                                            }
                                                                        },
                                                                        {
                                                                            label: 'Close', ionFunction: createIonFunction(() => {
                                                                                hideAllModal();
                                                                                CurrentLayout.reset('mainPanel')

                                                                            })
                                                                        },

                                                                    ]]
                                                            }
                                                        }

                                                        CurrentLayout.clearComponent('mainPanel')
                                                        CurrentLayout.setComponent('mainPanel', zoom_to);

                                                    },
                                                    move: () => {
                                                    },
                                                },
                                                {
                                                    label: 'Value = Value',
                                                    click: async (x, y) => {
                                                    },
                                                    move: () => {
                                                    },
                                                }]

                                            pt.setMenu(m2)
                                        }
                                    }

                                ]
                                pt.setMenu(m)
                            }

                            showOptions();

                        },
                        move: () => {
                        },
                        bg: 'yellow', fg: 'black'

                    }
                )

                if (sp.getSelectedColumn() != null && sp.getSelectedColumn().length > 0) {

                    cond.push(
                        {
                            label: 'Crop (keep selected)',
                            click: async (x, y) => {
                                sp.cropUnselectedColumns();
                                pt.setMenu(m)
                            },
                            bg: 'yellow', fg: 'black'
                        })

                }

                pt.setMenu(cond)

            },
            bg: 'yellow', fg: 'black'

        })

        if (hasSel) {
            cond.push(
                {
                    label: 'Insert \u2192',
                    click: async () => {
                        const selected_column = sp.getSelectedWellsInOrder();
                        if (selected_column && selected_column.length > 0) {
                            const t = sp.getColIndex(selected_column[0]);
                            sp.insertCol(t + 1);
                        }
                    },
                },
                {
                    label: 'Insert \u2190',
                    click: async () => {
                        const selected_column = sp.getSelectedWellsInOrder();
                        if (selected_column && selected_column.length > 0) {
                            const t = sp.getColIndex(selected_column[0]);
                            sp.insertCol(t);
                        }
                    },
                },
                {
                    label: 'Insert \u2191',
                    click: async () => {

                        const selected_cells = sp.getSelectedWellsInTimeOrder();
                        if (selected_cells && selected_cells.length > 0) {
                            pushHistory(HM(sp))
                            const currentRow = sp.getRowIndex(selected_cells[0]);
                            sp.deselectAll();
                            sp.insertRow(currentRow);
                        }

                    },
                },
                {
                    label: 'Insert \u2193',
                    click: async () => {
                        const selected_cells = sp.getSelectedWellsInTimeOrder();
                        if (selected_cells && selected_cells.length > 0) {
                            pushHistory(HM(sp))
                            const currentRow = sp.getRowIndex(selected_cells[0]);
                            sp.deselectAll();
                            sp.insertRow(currentRow + 1);
                        }
                    },
                },

                {
                    label: 'Sort',
                    click: async () => {

                        const cond = []
                        cond.push(
                            {
                                label: 'Rows',
                                click: async () => {
                                    const cond2 = []
                                    cond2.push(
                                        {
                                            label: 'Assending',
                                            click: async () => {

                                                pushHistory(HM(sp))

                                                const www = sp.getSelectedWellsInOrder();
                                                if (!www || www.length <= 0) {
                                                    infoPrompt("Select a cell in a column to sort.")
                                                }
                                                const column = sp.getColumnIndex(www[0])
                                                sp.sortRowsByColumn(column, 1, true)
                                            },
                                        },
                                        {
                                            label: 'Descending',
                                            click: async () => {
                                                pushHistory(HM(sp))

                                                const www = sp.getSelectedWellsInOrder();
                                                if (!www || www.length <= 0) {
                                                    infoPrompt("Select a cell in a column to sort.")
                                                }
                                                const column = sp.getColumnIndex(www[0])
                                                sp.sortRowsByColumn(column, 1, false)

                                            },
                                        },
                                    );
                                    pt.setMenu(cond2)
                                },
                            },

                        );

                        pt.setMenu(cond)
                    },
                    bg: 'yellow', fg: 'black'
                }

            );

        }

        if (rowSel && rowSel.length > 0) {
            cond.push(
                {
                    label: 'Trim \u2191',
                    click: async () => {
                        const wells = sp.getSelectedWellsInTimeOrder();
                        if (wells && wells.length > 0) {
                            const id = sp.getWellIndicies(wells[0]);
                            sp.removeRowsUp(id.rowIdx);
                        }
                    },
                },
                {
                    label: 'Trim \u2193',
                    click: async () => {
                        const wells = sp.getSelectedWellsInTimeOrder();
                        if (wells && wells.length > 0) {
                            const id = sp.getWellIndicies(wells[0]);
                            sp.removeRowsDown(id.rowIdx);
                        }
                    },
                },
            );
        }

        if (hasCol) {
            cond.push(

                {
                    label: 'Copy',
                    click: async () => {
                        try {
                            let csv = '';
                            for (let col = sp.grid.xmin; col < sp.grid.xmax; col++) {
                                for (let row = sp.grid.ymin; row < sp.grid.ymax; row++) {
                                    if (sp.wells[col][row].select) {
                                        const value = sp.wells[col][row].value;
                                        csv += value + '\t';
                                    }
                                }
                                csv += '\n';
                            }
                            csv = csv.trim();
                            await navigator.clipboard.writeText(csv);
                            clearMenu();
                        } catch (err) {
                            console.error('Failed to copy to clipboard: ', err);
                            pt.wb(null);
                        }
                    },
                },

                {
                    label: 'Select \u2192',
                    click: async () => {
                        if (pt.selected_well) {
                            const id = sp.getWellIndicies(pt.selected_well);
                            const rowIndex = id.rowIdx;
                            const colIndex = id.colIdx;
                            for (let c = colIndex; c < sp.wells.length; c++) {
                                const rowWell = sp.wells[c][rowIndex];
                                if (rowWell) rowWell.select = true;
                            }
                            setTimeout(() => {
                                LJScript.add(sp.name, `select ${[colIndex, rowIndex]} right`);
                                sp.showSelectOptionsMenu(pt);
                            }, 1000);
                        }
                    },
                },

                {
                    label: 'Select \u2193',
                    click: async () => {
                        const wells = sp.getSelectedWellsInTimeOrder();
                        if (wells && wells.length > 0) {
                            const id = sp.getWellIndicies(wells[0]);
                            const colIndex = id.colIdx;
                            const rowIndex = id.rowIdx;
                            for (let r = rowIndex; r < sp.wells[colIndex].length; r++) {
                                const colWell = sp.wells[colIndex][r];
                                if (colWell) colWell.select = true;
                            }
                            LJScript.add(sp.name, `select [${colIndex}:${colIndex}][${rowIndex}:]`);
                            sp.showSelectOptionsMenu(pt);
                        }
                    },
                },

            );

            if (sp.grid.ymax > 4) {
                cond.push({
                    label: 'Sort column',
                    click: async () => { sp.showSortOptions(pt); },
                    bg: 'yellow', fg: 'black'
                });
            }

            if (sp.getSelectedColumn().length === 1) {
                cond.push({
                    label: 'Move column',
                    click: async () => {

                        const graph = CurrentLayout.getStashed('graph')
                        graph.setMouseMode("msg: Click where you want to move the column")
                        let move_col_x = -1, move_col_y = -1;
                        const mouseDownListener_sb = async (x, y) => {
                            pushHistory(HM(sp))
                            const xw = pt.grid.Xwc(x);
                            let col = Math.floor(sp.grid.Xwc(xw - sp.grid.xi * 2))
                            function moveColumn(wells, fromIndex, toIndex) {
                                if (fromIndex === toIndex) return wells;
                                const [movedColumn] = wells.splice(fromIndex, 1);
                                wells.splice(toIndex, 0, movedColumn);
                                return wells;
                            }
                            const c = sp.getSelectedColumn();
                            const from = sp.getColumnIndex(c[0][0]);
                            sp.wells = moveColumn(sp.wells, from, col + 1);
                            sp.deselectAll();
                            pt.wb(null);
                        };

                        const t = {
                            id: 'move-column-edit',
                            mouseMoveListener: async (x, y) => { move_col_x = x; move_col_y = y; },
                            mouseUpListener: async () => { },
                            mouseDownListener: mouseDownListener_sb,
                            init: () => { },
                            close: () => { },
                            priority: true,
                            draw: (_grid, ctx) => {
                                const width = pt.grid.screenWidth(sp.grid.width / sp.getColumns());
                                const height = sp.grid.height;
                                ctx.lineWidth = 1;
                                ctx.shadowBlur = 2;
                                ctx.shadowColor = 'black';
                                ctx.fillStyle = 'RGBA(252,25,25,0.15)';
                                ctx.fillRect(move_col_x, move_col_y, width, height);
                                ctx.fill();
                            },
                            menuManager: null,
                            smenu: null
                        };
                        if (pt && pt.wb) pt.wb(t);
                        smenu = null;
                    }, bg: 'yellow', fg: 'black'

                },
                    {
                        label: 'Split column',
                        click: async () => {
                            let v = values.map(o => o.value);
                            const suggestiosn = sp.analyzeAndParse(v);
                            let selectP;
                            const selectPanel = createIonFunction(async (_panel) => { selectP = _panel; });
                            const tp = suggestiosn.analysis.topSpecialChars.map(item => item.char);

                            const card = {
                                wid: 'card',
                                data: {
                                    cards: [[
                                        {
                                            'title': 'Delimiter options',
                                            width: '100%',
                                            'body': `  `,
                                            'component': {
                                                wid: 'selection-list',
                                                width: '100%',
                                                refCallback: selectPanel,
                                                data: {
                                                    listItems: tp,
                                                    button_function: createIonFunction(async (items) => {
                                                        const name = items[0];
                                                        for (let schar of suggestiosn.analysis.topSpecialChars) {
                                                            if (schar.char === name) {
                                                                const tx = sp.getColIndex(values[0]) + 1;
                                                                sp.insertCol(tx);
                                                                for (let w of values) {
                                                                    const row_index = sp.getRowIndex(w);
                                                                    const str = (w.value + '');
                                                                    if (str) {
                                                                        const parts = str.split(schar.char);
                                                                        if (parts && parts.length > 0) {
                                                                            sp.setWellValue(tx, row_index, parts[1]);
                                                                            sp.setWellValue(tx - 1, row_index, parts[0]);
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    })
                                                }
                                            }
                                        }
                                    ]]
                                }
                            };
                            showModal(card, 500, 800);
                        },
                        bg: 'yellow', fg: 'black'
                    }

                );
            }

            cond.push({
                label: 'Delete column',
                click: async () => {
                    pushHistory(HM(sp));
                    const selectedCol = sp.getSelectedColumn();
                    for (let x = 0; x < selectedCol.length; x++) {
                        if (selectedCol[x][0] && selectedCol[x][0].select) {
                            const c = sp.getColIndex(selectedCol[x][0]);
                            sp.removeCol(c);
                        }
                    }
                    pt.wb(null);
                },
                bg: 'yellow', fg: 'black'
            });
        }

        if (oneSel && values[0] && values[0].obj) {
            cond.push({
                label: 'View link',
                click: async () => {
                    showModal({ wid: 'youtube', data: { url: `${values[0].obj}` } }, 700, 500);
                },
                bg: 'yellow', fg: 'black'
            });
        }

        if (sp.name.toLowerCase() === 'assumptions') {
            cond.push({
                label: '⚙️Data⚙️',
                click: async () => {
                    let sequenceTextEditor;
                    let descHook = createIonFunction((p) => {
                        sequenceTextEditor = p;
                    });
                    const txt = 'Add variables for 1) travel expecting 7 international trips and 2) monthly gpu costs with azure';
                    let initalText = true;
                    setTimeout(() => {
                        let i = 0;
                        let currentText = '';

                        const interval = setInterval(() => {

                            currentText += txt[i];
                            if (!initalText) {
                                sequenceTextEditor.setContent('');
                                clearInterval(interval)
                                return;
                            }
                            sequenceTextEditor.setContent(currentText);
                            i++;

                            if (i >= txt.length) {
                                clearInterval(interval);
                            }
                        }, 10);
                    }, 150);

                    let sequence_input = {
                        wid: 'card',
                        "height": "300px",
                        data: {
                            "style.padding-top": '1px',
                            "style.border": '1px',
                            "style.height": "200px",
                            cards: [
                                [
                                    {
                                        'width': '100%',
                                        'component': {
                                            wid: 'html',
                                            data: `

                                                <H4>
  <font color="navy">

                                                Write a paragraph that describes items you would like to add/edit:
                                                </font> </h4>
                                                `
                                        }

                                    },
                                    {
                                        'width': '100%',
                                        'component': {
                                            wid: 'text-editor',
                                            refCallback: descHook,
                                            data: {
                                                height: "600px",
                                                showButton: false,
                                                editorOptions: {
                                                    value: '',
                                                    language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                    suggestOnTriggerCharacters: false,
                                                    quickSuggestions: false,
                                                    parameterHints: { enabled: false },
                                                    minimap: { enabled: false },
                                                    fontFamily: "Courier New, monospace",
                                                    placeholder: "",
                                                    cursorStyle: "block"
                                                },
                                                onDidFocusEditorWidget: createIon(() => {
                                                    if (initalText)
                                                        sequenceTextEditor.setContent("")
                                                    initalText = false;
                                                }),

                                                keybinding: {
                                                    'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                    })
                                                },
                                            }
                                        }
                                    },
                                    {
                                        'width': '100%',
                                        'component': {
                                            wid: 'html',
                                            data: '<hr>'
                                        }
                                    },
                                    {
                                        'component': {
                                            wid: 'mt-button', data: {
                                                buttons: [
                                                    {
                                                        label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                            hideAllModal();
                                                            CurrentLayout.reset('mainPanel')

                                                        })
                                                    },
                                                    {
                                                        label: 'Build', ionFunction: createIonFunction(async () => {
                                                            hideAllModal();
                                                            CurrentLayout.reset('mainPanel')
                                                            pt.setMessage("Generating Assumptions...", 5)
                                                            let em = new EngineMonitor((msg) => {
                                                                pt.updateSprite(msg)
                                                            });
                                                            em.addProgressListener(async (v) => {
                                                                if (v >= 100) {
                                                                }
                                                            })
                                                            let current_assumptions = sp.toValueFormulaJSON();
                                                            let content = sequenceTextEditor.getContent();

                                                            let model = await exec('py/openai/assumptions.py', em, getUser(), content)
                                                            let r = await exec('baja/draw/data-model-to-tables-gpt', pt, model, 'append')
                                                            pt.setMessage(null)
                                                            pt.setMessage("These are the Assumptions! You can edit/add these.", 1)
                                                            setTimeout(async () => {
                                                                pt.updateCalculations();
                                                                pt.killSprite()

                                                            })
                                                        })
                                                    }

                                                ]

                                            }
                                        }
                                    }
                                ]]
                        }
                    }
                    CurrentLayout.setComponent('mainPanel', sequence_input)

                },
                bg: 'navy', fg: 'yellow'

            })
        }

        if (sp.name.toLowerCase().indexOf('assumptions') >= 0 && sp.getSelectedWellsInOrder().length === 1) {
            let selected_well = sp.getSelectedWellsInOrder()[0]

            cond.push(
                {
                    label: '⚙️Formula⚙️',
                    click: async () => {

                        let m = [

                            {
                                label: 'Formula from specific table',
                                click: async () => {
                                    let w = [selected_well]

                                    selected_well.selectIt();

                                    const runConnect = async (plate) => {

                                        if (plate.uid === sp.uid) {
                                            inforPrompt("This means you want to generate a formula from the same table...")
                                        }

                                        if (w && w.length === 1) {
                                            pt.updateSprite("...")
                                            let ls = [
                                            ]
                                            ls.push(plate.toValueFormulaJSON())
                                            let g = sp.name + ' '
                                            let ks = Object.keys(selected_well.group)
                                            for (let k of ks) {
                                                k = k.trim();
                                                if (k.toLowerCase() != 'value')
                                                    g += (k) + ' '
                                            }
                                            let em = new EngineMonitor((msg) => {
                                            });
                                            em.addProgressListener(async (v) => {
                                                if (v >= 100) {
                                                }
                                            })
                                            let model = await exec('py/openai/suggest-formula-no-gpt.py', em, ls, g)
                                            pt.killSprite();
                                            let bm = []
                                            for (let key of model.suggestions) {
                                                bm.push({
                                                    label: `${key.explanation}`,
                                                    click: (xwc, ywc) => {
                                                        let range = sp.getWellRange([selected_well])
                                                        sp.formula[range] = key.formula

                                                    }
                                                })
                                            }
                                            let graph = CurrentLayout.getStashed('graph')
                                            graph.showWindowMenu(bm, 10, 10, 400)
                                        }
                                    }

                                    const mouseDownListener_sb = async (x, y) => {
                                        let plate = pt.getPlate(pt.grid.Xwc(x), pt.grid.Ywc(y))
                                        if (plate) {
                                            await runConnect(plate)
                                            if (pt.___suspend_select) {
                                                pt.___suspend_select = false;
                                                pt.wb(null)
                                            }
                                        }
                                    };

                                    let move_col_x = 0;
                                    let move_col_y = 0;
                                    const t = {
                                        id: 'override-select_table',
                                        mouseMoveListener: async (x, y) => { move_col_x = x; move_col_y = y; },
                                        mouseUpListener: async () => {
                                        },
                                        mouseDownListener: mouseDownListener_sb,
                                        init: () => {
                                            pt.___suspend_select = true;
                                        },
                                        close: () => {
                                            pt.___suspend_select = false;
                                        },
                                        priority: true,
                                        draw: (_grid, ctx) => {
                                            const width = 30;
                                            const height = 30;
                                            const radius = Math.min(width, height) / 2;
                                            const centerX = move_col_x - width / 2;
                                            const centerY = move_col_y + height / 2;

                                            ctx.lineWidth = 2;
                                            ctx.shadowBlur = 4;
                                            ctx.shadowColor = 'black';
                                            ctx.strokeStyle = 'rgba(25, 25, 255, 0.7)';
                                            ctx.beginPath();
                                            ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                                            ctx.stroke();
                                            ctx.fillStyle = 'rgba(25, 25, 255, 0.1)';
                                            ctx.fill();
                                            ctx.shadowBlur = 0

                                            const text = "click on a table";
                                            ctx.font = "12pt Arial";
                                            ctx.fillStyle = "rgba(0, 0, 0, 0.9)";
                                            ctx.textAlign = "center";
                                            ctx.textBaseline = "top";

                                            ctx.fillText(text, centerX, centerY - 2 * radius + 3);

                                        },
                                    };
                                    pt.wb(t)

                                },
                                bg: 'navy', fg: 'yellow'

                            },
                            {
                                label: 'Formula from all tables',
                                click: async () => {
                                    let w = sp.getSelectedWellsInOrder();
                                    if (w && w.length === 1) {
                                        pt.updateSprite("...")
                                        let ls = [
                                        ]
                                        for (let p of pt.root) {
                                            ls.push(p.toValueFormulaJSON())
                                        }
                                        let sw = sp.getSelectedWellsInOrder();
                                        let g = sp.name + ' '
                                        for (const s of sw) {
                                            let ks = Object.keys(s.group)
                                            for (let k of ks) {
                                                k = k.trim();
                                                if (k.toLowerCase() != 'value')
                                                    g += (k) + ' '
                                            }
                                        }
                                        let em = new EngineMonitor((msg) => {
                                        });
                                        em.addProgressListener(async (v) => {
                                            if (v >= 100) {
                                            }
                                        })
                                        let model = await exec('py/openai/suggest-formula.py', em, ls, g)
                                        showModal({
                                            wid: 'json',
                                            data: JSON.stringify(model)
                                        })
                                        pt.killSprite();
                                        let bm = []

                                        for (let key of model.suggestions) {
                                            bm.push({
                                                label: `${key.explanation}`,
                                                click: (xwc, ywc) => {
                                                    let range = sp.getWellRange(sp.getSelectedWellsInOrder())
                                                    sp.formula[range] = key.formula

                                                }
                                            })
                                        }
                                        let graph = CurrentLayout.getStashed('graph')
                                        graph.showWindowMenu(bm, 10, 10, 400)
                                    }

                                },
                                bg: 'navy', fg: 'yellow'

                            }
                        ]
                        const cols = 1;
                        const smenu2 = new Menu(
                            m,
                            pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200),
                            pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2),
                            'rgb(205, 255, 155)',
                            'black',
                            cols
                        );
                        pt.setMenu(smenu2);
                    },
                    bg: 'navy', fg: 'yellow'
                }
            )
        }

        if (hasSel) {

            const splitRowsArrayInHalf = (arr) => {
                const getVal = (x) => (x && typeof x === "object" && "value" in x) ? x.value : x;
                const isFloat = (v) => typeof v === "number" && Number.isFinite(v);
                const isString = (v) => typeof v === "string";

                const uniqueCols = arr;
                const mid = Math.floor(uniqueCols.length / 2);
                let firstHalf = uniqueCols.slice(0, mid);
                let secondHalf = uniqueCols.slice(mid);

                const firstAllFloat = firstHalf.length > 0 && firstHalf.every(x => isFloat(getVal(x)));
                const firstAllString = firstHalf.length > 0 && firstHalf.every(x => isString(getVal(x)));
                const secondAllFloat = secondHalf.length > 0 && secondHalf.every(x => isFloat(getVal(x)));
                const secondAllString = secondHalf.length > 0 && secondHalf.every(x => isString(getVal(x)));

                if (firstAllFloat && secondAllString) {

                    const tmp = firstHalf; firstHalf = secondHalf; secondHalf = tmp;
                }

                else if (firstAllFloat && !secondAllFloat) {
                    const tmp = firstHalf; firstHalf = secondHalf; secondHalf = tmp;
                }

                return [firstHalf, secondHalf];
            };

            function canPlotBarFromSelection(wells) {
                if (!Array.isArray(wells) || wells.length === 0) return false;

                const getVal = w => (w && typeof w === "object" && "value" in w) ? w.value : w;
                const getErr = w => (w && typeof w === "object") ? w.stdDev : undefined;

                const toFiniteNum = v => {
                    if (typeof v === "number" && Number.isFinite(v)) return v;
                    if (typeof v === "string") {
                        const s = v.trim().replace(/,/g, "");
                        const n = Number(s);
                        if (Number.isFinite(n)) return n;
                    }
                    return null;
                };
                const errOk = v => v == null || (toFiniteNum(v) !== null && toFiniteNum(v) >= 0);
                const [firstHalf, secondHalf] = splitRowsArrayInHalf(wells);
                const countValid = arr => {
                    let c = 0;
                    for (const w of arr) {
                        if (!w) continue;
                        const n = toFiniteNum(getVal(w));
                        if (n !== null && errOk(getErr(w))) c++;
                    }
                    return c;
                };
                const validFirst = countValid(firstHalf);
                const validSecond = countValid(secondHalf);

                if (validFirst > 0 || validSecond > 0) return true;

                const pairCount = Math.min(firstHalf.length, secondHalf.length);
                for (let i = 0; i < pairCount; i++) {
                    const a = firstHalf[i], b = secondHalf[i];
                    const an = a ? toFiniteNum(getVal(a)) : null;
                    const bn = b ? toFiniteNum(getVal(b)) : null;
                    if (an !== null && bn !== null && errOk(getErr(a)) && errOk(getErr(b))) {
                        return true;
                    }
                }

                return false;
            }

            let welldimensions = sp.getSelectedWellsInOrder();
            if (canPlotBarFromSelection(welldimensions)) {
            }



            cond.push(

                {
                    label: 'Tag',
                    click: async () => {
                        let m = [

                            {
                                label: "New...",
                                click: async (x, y) => {
                                    let panel;

                                    const __nameHook = createIonFunction((hook) => {
                                        panel = hook;
                                    })

                                    function generateRandomRGBAColor() {
                                        const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
                                        const randomFloat = (min, max) => (Math.random() * (max - min) + min).toFixed(2);

                                        const red = randomInt(0, 255);
                                        const green = randomInt(0, 255);
                                        const blue = randomInt(0, 255);
                                        const alpha = randomFloat(0.2, 0.8);

                                        return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
                                    }
                                    let color = generateRandomRGBAColor()
                                    let name;

                                    showModal(
                                        {
                                            wid: 'card',
                                            data: {
                                                padding: "10px",
                                                cards: [
                                                    [

                                                        {
                                                            'title': ' ', 'body': `
                                            `                   ,
                                                            'width': '90%',
                                                            'component':
                                                            {
                                                                'wid': 'color-chooser',
                                                                'width': '100%',
                                                                "data": {
                                                                    "color": color,
                                                                    "selectionListener": createIonFunction((_color) => {
                                                                        if (_color.startsWith('#')) {
                                                                            color = _color;
                                                                        } else {
                                                                            let c = _color['rgb']

                                                                            color = `rgb(${c['r']},${c['g']},${c['b']})`

                                                                        }
                                                                    })
                                                                }
                                                            }
                                                        },
                                                        {
                                                            'title': ' ', 'body': `
                                                        `,
                                                            'width': '90%',
                                                            'component':
                                                            {
                                                                wid: 'input-param-items',
                                                                refCallback: __nameHook,
                                                                data: {
                                                                    'input_labels': ['Group'],
                                                                    default_values: { 'Group': name },
                                                                }
                                                            }
                                                        },
                                                        {
                                                            'title': null, 'body': `
                                                        `   ,
                                                            'width': '100%',
                                                            'component':
                                                            {
                                                                wid: 'button',
                                                                data: [
                                                                    {
                                                                        'label': 'Apply', ionfunction: createIonFunction(async () => {
                                                                            let name = panel.get('Group')
                                                                            if (name === undefined || name === null || name.length <= 0) {
                                                                                name = generateNautName();
                                                                            }

                                                                            const selected = sp.getSelectedWellsInOrder();
                                                                            for (let s of selected) {
                                                                                s.setGroup(name);
                                                                            }
                                                                            let rang = sp.findContiguousSelectedWells(selected)
                                                                            LJScript.add(sp.name, `tag ${name} ${rang}`)
                                                                            setTimeout(() => {
                                                                                hideAllModal();
                                                                            }, 500);
                                                                        }), disableAfterClick: false
                                                                    },
                                                                    {
                                                                        'label': 'Close', ionfunction: createIonFunction(async () => {
                                                                            hideAllModal();
                                                                        }), disableAfterClick: false
                                                                    },
                                                                ]
                                                            }
                                                        },

                                                    ]]
                                            }
                                        }, 500, 450

                                    )

                                },
                                move: () => {
                                },
                                bg: 'black',
                                fg: 'yellow'

                            },
                            {
                                label: 'Delete tags',
                                click: async () => {
                                    try {
                                        const selected_wells = sp.getSelectedWellsInOrder();
                                        for (let s of selected_wells) s.group = {};
                                        smenu = null;
                                    } catch (err) {
                                        console.error('Delete tags failed: ', err);
                                        pt.wb(null);
                                    }
                                },
                                bg: 'yellow', fg: 'black'
                            },
                            {
                                label: 'Column Header',
                                click: async () => {
                                    const name = 'ColumnHeader';
                                    for (let i of values) {
                                        const column = sp.getColIndex(i);
                                        const s = sp.wells[column][0];
                                        s.setGroup(name);
                                        const rindex = sp.getIndexOf(s);
                                        sp.applyHeaderWellForColumn(rindex.colIdx, rindex.rowIdx);
                                        const rang = sp.findContiguousSelectedWells(`[${column}:][0:0]`);
                                        LJScript.add(sp.name, `tag ${name} ${rang}`);
                                    }
                                    sp.deselectAll();
                                    pt.wb(null);
                                },
                                bg: 'yellow', fg: 'black'
                            },
                            {
                                label: 'Row Header',
                                click: async () => {
                                    const name = 'RowHeader';
                                    for (let i of values) {
                                        const r = sp.getIndexOf(i);
                                        sp.applyHeaderWellForRow(r.colIdx, r.rowIdx);
                                    }
                                    sp.deselectAll();
                                    pt.wb(null);
                                },
                                bg: 'yellow', fg: 'black'
                            },

                        ]
                        const cols = 1;
                        const smenu2 = new Menu(
                            m,
                            pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200),
                            pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2),
                            'rgb(205, 255, 155)',
                            'black',
                            cols
                        );
                        pt.setMenu(smenu2);

                    },
                    bg: 'yellow', fg: 'black'
                },

                {
                    label: 'Color...',
                    click: () => { sp.showColorMenu(pt); },
                    bg: 'yellow', fg: 'black'
                },

                {
                    label: 'Data...',
                    click: async () => {
                        let m = [
                            { label: 'Edit...', click: async () => { smenu = null; sp.showEditOptions(pt); } },
                            {
                                label: 'Aggregate...',
                                click: async () => { sp.showAggregateOptions(pt); },
                                bg: 'yellow', fg: 'black'
                            },

                            {
                                label: 'Data Type',
                                click: () => {
                                    smenu = null;
                                    const selection_list = Object.keys(WellDisplay);
                                    selection_list.unshift('(AI) Suggest')
                                    selection_list.push('Default');
                                    let selectionpanel = null;
                                    const selectPanel = createIon((pa) => { selectionpanel = pa; });
                                    const t = {
                                        wid: 'card',
                                        data: {
                                            cards: [[
                                                {
                                                    'title': 'Set well type',
                                                    width: '100%',
                                                    'body': `  `,
                                                    'component': {
                                                        wid: 'selection-list',
                                                        width: '100%',
                                                        refCallback: selectPanel,
                                                        data: {
                                                            listItems: selection_list,
                                                            button_function: createIonFunction(async (items) => {
                                                                let name = items[0];

                                                                if (name.toLowerCase() === '(ai) suggest') {

                                                                    pt.setMessage("Experimental Suggest", 5)

                                                                    hideAllModal();

                                                                    const se = sp.getSelectedWellsInOrder();
                                                                    let items = []
                                                                    for (let w of se) {
                                                                        items.push({
                                                                            id: w.uid,
                                                                            value: w.value,
                                                                            fields: Object.keys(w.group),
                                                                            wtype: ''
                                                                        })
                                                                    }
                                                                    let paint_wells = await exec('py/openai/paint-wells.py', items, Object.keys(WellDisplay).filter(k => !k.startsWith("Input_")))
                                                                    pt.killSprite();
                                                                    pt.applyAssignmentWellTypes(paint_wells)
                                                                } else {
                                                                    const se = sp.getSelectedWellsInOrder();
                                                                    if (name === 'Default') name = null;
                                                                    for (let w of se) w.setWellType(name);
                                                                }
                                                                hideAllModal();
                                                            })
                                                        }
                                                    }
                                                }
                                            ]]
                                        }
                                    };
                                    showModal(t, 500, 500);
                                },
                                bg: 'yellow', fg: 'black'
                            },



                            {
                                label: 'Copy',
                                click: () => {
                                    const copytable = HM(sp);
                                    navigator.clipboard.writeText(copytable)
                                        .then(() => console.log("Object copied to clipboard!"))
                                        .catch(err => console.error("Failed to copy object to clipboard: ", err));
                                    smenu = null;
                                    sp.clk_drag(pt);
                                },
                            }, {
                                label: 'View',
                                click: () => {
                                    const copytable = HM(sp);
                                    let pf = sp.toValueFormulaJSON()
                                    showModal({
                                        wid: 'json',
                                        data: JSON.stringify(pf)
                                    })
                                },
                            },
                            {
                                label: 'Add URL link',
                                click: async () => {
                                    const va = await prompt("Link: " + sp.name, ["URL"], { "URL": '' }, 500, 300);
                                    const m = va['URL'];
                                    const se = sp.getSelectedWellsInOrder();
                                    for (let w of se) { w.obj = m; }
                                },
                                bg: 'yellow', fg: 'black'
                            },

                            {

                                label: 'Average...',
                                click: async () => { sp.showAverageOptions(pt, wells__); },
                                bg: 'yellow', fg: 'black'
                            },
                            {
                                label: 'Sum...',
                                click: async () => {
                                    smenu = null;
                                    const t = wells__.every(well => well.value !== null && !isNaN(well.value));
                                    if (t) {
                                        const interpreter = await exec('baja/engine/interpreter.js', pt);
                                        interpreter.ref = sp;
                                        await interpreter.run('sum into ' + uniqueString(sp.name + '_sum', pt.getTableNames()));
                                        if (pt) pt.zoomtolastplate();
                                        pt.wb(null);
                                    } else {
                                        pt.setMessage(" Non-numeric values found ");
                                    }
                                },
                                bg: 'yellow', fg: 'black'
                            },
                            {
                                label: 'Harmonize...',
                                click: async () => {
                                    let selectP;
                                    const selectPanel = createIonFunction(async (_panel) => { selectP = _panel; });
                                    const options = [
                                        'Find and replace',
                                        'Sanitize to digits only',
                                        'Find mid-range value',
                                        'Remove non-alphanumeric characters',
                                        'Apply regex replacement',
                                        'Remove words with hyphens',
                                    ];
                                    const t = {
                                        wid: 'card',
                                        data: {
                                            cards: [[
                                                {
                                                    'title': 'Replace functions',
                                                    width: '100%',
                                                    'body': `  `,
                                                    'component': {
                                                        wid: 'selection-list',
                                                        width: '100%',
                                                        refCallback: selectPanel,
                                                        data: {
                                                            listItems: options,
                                                            button_function: createIonFunction(async (items) => {
                                                                const name = items[0];

                                                                if (name === 'Find and replace') {
                                                                    setTimeout(async () => {
                                                                        const va = await prompt("", ["Find", "Replace"], { "Find": '', "Replace": "" }, 300, 400);
                                                                        const find = va['Find'];
                                                                        if (find) {
                                                                            const replace = va['Replace'];
                                                                            const tx = sp.getColIndex(values[0]);
                                                                            let count = 0;
                                                                            hideAllModal(); clearMenu();
                                                                            for (let w of values) {
                                                                                const row_index = sp.getRowIndex(w);
                                                                                let str = (w.value + '');
                                                                                if (str && str.indexOf(find) >= 0) {
                                                                                    str = str.split(find).join(replace);
                                                                                    sp.setWellValue(tx, row_index, str);
                                                                                    count++;
                                                                                }
                                                                            }
                                                                            pt.setMessage("Replaced " + count);
                                                                        }
                                                                    });
                                                                } else if (name === 'Find mid-range value') {
                                                                    function midpoint(rangeStr) {
                                                                        const normalized = rangeStr.replace(/[–—−]/g, '-');
                                                                        const re = /([\$€£]?)(\d+(?:\.\d+)?)([a-zA-Z%]*)\s*-\s*([\$€£]?)(\d+(?:\.\d+)?)([a-zA-Z%]*)/;
                                                                        const m = normalized.match(re);
                                                                        if (!m) throw new Error("Invalid range");
                                                                        const [, p1, n1, s1, p2, n2, s2] = m;
                                                                        if (p1 !== p2 || s1 !== s2) throw new Error("Mismatched units");
                                                                        return (parseFloat(n1) + parseFloat(n2)) / 2;
                                                                    }
                                                                    const tx = sp.getColIndex(values[0]);
                                                                    for (let w of values) {
                                                                        const row_index = sp.getRowIndex(w);
                                                                        let str = (w.value + '');
                                                                        if (str) {
                                                                            try {
                                                                                const m = midpoint(str);
                                                                                sp.setWellValue(tx, row_index, m);
                                                                            } catch (_) { }
                                                                        }
                                                                    }
                                                                } else if (name === 'Remove words with hyphens') {
                                                                    function removeHyphenated(text) {
                                                                        return text.split(" ").filter(word => !word.includes("-")).join(" ");
                                                                    }
                                                                    const tx = sp.getColIndex(values[0]);
                                                                    let count = 0;
                                                                    hideAllModal(); clearMenu();
                                                                    for (let w of values) {
                                                                        const row_index = sp.getRowIndex(w);
                                                                        let str = (w.value + '');
                                                                        if (str) {
                                                                            str = removeHyphenated(str);
                                                                            sp.setWellValue(tx, row_index, str);
                                                                            count++;
                                                                        }
                                                                    }
                                                                    pt.setMessage("Replaced " + count);
                                                                } else if (name === 'Remove non-alphanumeric characters') {
                                                                    function stripNonAlphaNum(s) { return s.replace(/[^a-zA-Z0-9]/g, ''); }
                                                                    function hasNonAlphaNum(s) { return /[^a-zA-Z0-9]/.test(s); }
                                                                    const tx = sp.getColIndex(values[0]);
                                                                    let count = 0;
                                                                    hideAllModal(); clearMenu();
                                                                    for (let w of values) {
                                                                        const row_index = sp.getRowIndex(w);
                                                                        const s = (w.value + '');
                                                                        if (s && hasNonAlphaNum(s)) {
                                                                            const nv = stripNonAlphaNum(s);
                                                                            if (nv !== s) { count++; sp.setWellValue(tx, row_index, nv); }
                                                                        }
                                                                    }
                                                                    pt.setMessage("Updated " + count + ' values');
                                                                } else if (name === 'Sanitize to digits only') {
                                                                    function containsNonDigit(s) { return /[^\d.]/.test(s); }
                                                                    function removeNonDigit(s) { return s.replace(/[^\d.]/g, '').replace(/(\.)(?=.*\.)/g, ''); }
                                                                    const tx = sp.getColIndex(values[0]);
                                                                    let count = 0;
                                                                    hideAllModal(); clearMenu();
                                                                    for (let w of values) {
                                                                        const row_index = sp.getRowIndex(w);
                                                                        const s = (w.value + '');
                                                                        if (s && containsNonDigit(s)) {
                                                                            const nv = removeNonDigit(s);
                                                                            if (nv !== s) { count++; sp.setWellValue(tx, row_index, nv); }
                                                                        }
                                                                    }
                                                                    LJScript.add(sp.name, 'sanitizetodigits');
                                                                    pt.setMessage("Updated " + count + ' values');
                                                                } else if (name === 'Apply regex replacement') {

                                                                    pt.setMessage("Add your regex UI here.");
                                                                }
                                                            })
                                                        }
                                                    }
                                                }
                                            ]]
                                        }
                                    };
                                    showModal(t, 500, 650);
                                },
                                bg: 'yellow', fg: 'black'
                            },

                            {
                                label: 'Copy range',
                                click: async () => { },
                                bg: 'yellow', fg: 'black'
                            },
                            {
                                label: 'Delete  values',
                                click: async () => {
                                    try {
                                        const selected_wells = sp.getSelectedWellsInOrder();
                                        const confirm = await exec('baja/lib/confirm.js',
                                            'Delete values for ' + selected_wells.length + ' cells?',
                                            async () => {
                                                setTimeout(() => {
                                                    pt.pushAnyPreviousHistory();
                                                    for (let item of selected_wells) item.setValue('');
                                                    sp.__dirty = true;
                                                }, 100);
                                            }
                                        );
                                        showModal(confirm);
                                    } catch (err) {
                                        console.error('Delete values failed: ', err);
                                        pt.wb(null);
                                    }
                                },
                                bg: 'yellow', fg: 'black'
                            },
                            {
                                label: 'Quick Calcs',
                                click: async () => {
                                    const mm = [
                                        {
                                            label: 'Tighten',
                                            click: async () => {
                                                const vals = se.flat().map(o => o.value);
                                                const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
                                                let i = 0;
                                                for (let k = 0; k < se.length; k++) {
                                                    se[k].value = mean + (se[k].value - mean) / 10;
                                                }
                                                smenu = null;
                                            }
                                        },
                                        {
                                            label: 'Loosen',
                                            click: async () => {
                                                const vals = se.flat().map(o => o.value);
                                                const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
                                                let i = 0;
                                                for (let k = 0; k < se.length; k++) {
                                                    se[k].value = mean + (se[k].value - mean) * 10;
                                                }
                                                smenu = null;
                                            }
                                        },
                                        { label: 'Log', click: async () => { se.forEach(o => o.value = Math.log(o.value)); smenu = null; } },
                                        { label: 'Exponent', click: async () => { se.forEach(o => o.value = Math.exp(o.value)); smenu = null; } },
                                        { label: 'Cast to Integer', click: async () => { se.forEach(o => o.value = Math.floor(o.value)); smenu = null; } },
                                        { label: 'Multiply by 100', click: async () => { se.forEach(o => o.value *= 100); smenu = null; } },
                                        { label: 'Divide by 100', click: async () => { se.forEach(o => o.value /= 100); smenu = null; } },
                                        { label: 'Randomize using Value as Weight', click: async () => { se.forEach(o => o.value = Math.random() * o.value); smenu = null; } },
                                        { label: 'Absolute Value', click: async () => { se.forEach(o => o.value = Math.abs(o.value)); smenu = null; } },
                                        { label: 'Round Up', click: async () => { se.forEach(o => o.value = Math.ceil(o.value)); smenu = null; } },
                                        { label: 'Round Down', click: async () => { se.forEach(o => o.value = Math.floor(o.value)); smenu = null; } },
                                        { label: 'Increment up', click: async () => { se.forEach(o => o.value++); } },
                                        { label: 'Increment down', click: async () => { se.forEach(o => o.value--); } },
                                    ];

                                    const cols = 3;
                                    const smenuLocal = new Menu(
                                        mm,
                                        pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200),
                                        pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * mm.length / 2),
                                        'rgb(205, 255, 155)',
                                        'black',
                                        cols
                                    );
                                    pt.setMenu(smenuLocal);
                                },
                                bg: 'yellow', fg: 'black'
                            },
                        ]
                        const cols = 3;

                        const smenu2 = new Menu(
                            m,
                            pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200),
                            pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2),
                            'rgb(205, 255, 155)',
                            'black',
                            cols
                        );
                        pt.setMenu(smenu2);

                    },
                    bg: 'yellow', fg: 'black'
                },


                {
                    label: 'Formula',
                    click: async () => {
                        let m = [




                            {
                                label: 'Create formula', click: async () => {

                                    let selectedWells = sp.getSelectedWellsInOrder();

                                    const mm = [
                                        singleValueMenuItem(
                                            'Mean',
                                            vals => vals.reduce((s, v) => s + v, 0) / vals.length,
                                            ref => `average(${ref})`
                                        ),

                                        singleValueMenuItem(
                                            'Geometric Mean',
                                            vals => Math.pow(vals.reduce((s, v) => s * v, 1), 1 / vals.length),
                                            ref => `geomean(${ref})`
                                        ),

                                        singleValueMenuItem(
                                            'Min',
                                            vals => Math.min(...vals),
                                            ref => `min(${ref})`
                                        ),

                                        singleValueMenuItem(
                                            'Max',
                                            vals => Math.max(...vals),
                                            ref => `max(${ref})`
                                        ),

                                        singleValueMenuItem(
                                            'Sum',
                                            vals => vals.reduce((s, v) => s + v, 0),
                                            ref => `sum(${ref})`
                                        ),

                                        singleValueMenuItem(
                                            'Standard Deviation',
                                            vals => {
                                                const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
                                                return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
                                            },
                                            ref => `stdev(${ref})`
                                        ),

                                        singleValueMenuItem(
                                            'Log Mean',
                                            vals => {
                                                const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
                                                return Math.log(mean);
                                            },
                                            ref => `ln(average(${ref}))`
                                        ),

                                        singleValueMenuItem(
                                            'Square Root Mean',
                                            vals => {
                                                const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
                                                return Math.sqrt(mean);
                                            },
                                            ref => `sqrt(average(${ref}))`
                                        ),

                                        singleValueMenuItem(
                                            'Random 0–1',
                                            () => Math.random(),
                                            () => `random()`
                                        ),

                                        singleValueMenuItem(
                                            'Log10 Mean',
                                            vals => {
                                                const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
                                                return mean > 0 ? Math.log10(mean) : null;
                                            },
                                            ref => `log10(average(${ref}))`
                                        ),

                                        singleValueMenuItem(
                                            'Log2 Mean',
                                            vals => {
                                                const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
                                                return mean > 0 ? Math.log2(mean) : null;
                                            },
                                            ref => `log2(average(${ref}))`
                                        ),

                                        singleValueMenuItem(
                                            'Mean of ln(values)',
                                            vals => {
                                                const positive = vals.filter(v => v > 0);
                                                if (!positive.length) return null;
                                                return positive.reduce((s, v) => s + Math.log(v), 0) / positive.length;
                                            },
                                            ref => `average(ln(${ref}))`
                                        ),

                                        singleValueMenuItem(
                                            'Mean of log10(values)',
                                            vals => {
                                                const positive = vals.filter(v => v > 0);
                                                if (!positive.length) return null;
                                                return positive.reduce((s, v) => s + Math.log10(v), 0) / positive.length;
                                            },
                                            ref => `average(log10(${ref}))`
                                        ),

                                        singleValueMenuItem(
                                            'Mean of log2(values)',
                                            vals => {
                                                const positive = vals.filter(v => v > 0);
                                                if (!positive.length) return null;
                                                return positive.reduce((s, v) => s + Math.log2(v), 0) / positive.length;
                                            },
                                            ref => `average(log2(${ref}))`
                                        ),

                                        singleValueMenuItem(
                                            'Geometric Mean via ln',
                                            vals => {
                                                const positive = vals.filter(v => v > 0);
                                                if (!positive.length) return null;
                                                return Math.exp(
                                                    positive.reduce((s, v) => s + Math.log(v), 0) / positive.length
                                                );
                                            },
                                            ref => `exp(average(ln(${ref})))`
                                        ),

                                        singleValueMenuItem(
                                            'Log Fold Change max/min',
                                            vals => {
                                                const positive = vals.filter(v => v > 0);
                                                if (positive.length < 2) return null;
                                                return Math.log(Math.max(...positive) / Math.min(...positive));
                                            },
                                            ref => `ln(max(${ref}) / min(${ref}))`
                                        ),

                                        singleValueMenuItem(
                                            'Log2 Fold Change max/min',
                                            vals => {
                                                const positive = vals.filter(v => v > 0);
                                                if (positive.length < 2) return null;
                                                return Math.log2(Math.max(...positive) / Math.min(...positive));
                                            },
                                            ref => `log2(max(${ref}) / min(${ref}))`
                                        ),
                                    ];
                                    const cols = 3;
                                    const smenuLocal = new Menu(
                                        mm,
                                        pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200),
                                        pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * mm.length / 2),
                                        'rgb(205, 255, 155)',
                                        'black',
                                        cols
                                    );

                                    pt.setMenu(smenuLocal);


                                },
                                bg: 'yellow', fg: 'black'
                            },

                            {
                                label: 'Label...', click: async () => {


                                    let selected_wells = sp.getSelectedWellsInOrder();
                                    let tmc = ''
                                    if (selected_wells && selected_wells.length > 0) {
                                        let wr = sp.getWellRange(selected_wells)
                                        if (sp.formula[wr]) {
                                            selectedPlate.formula[wr]
                                        }
                                    }

                                    let sx = pt.grid.X(selected_wells[0].x);
                                    let sy = pt.grid.Y(selected_wells[0].y);



                                }
                            },

                            {
                                label: 'Clear formulas on this table', click: async () => {
                                    const confirm = await exec('baja/lib/confirm.js',
                                        'Are you sure you want to remove all formulas from this table? ',
                                        async () => {
                                            setTimeout(() => {
                                                pushHistory(HM(sp))
                                                sp.clearAllFormulas()

                                            }, 100);
                                        }
                                    );
                                    showModal(confirm);
                                }
                            },



                            {
                                label: 'Edit table formula', click: async () => {
                                    function formToPlainText(form) {
                                        const lines = [];
                                        for (const [key, value] of Object.entries(form || {})) {
                                            const v = (typeof value === "object" && value !== null)
                                                ? JSON.stringify(value)
                                                : String(value);
                                            lines.push(`${key}: ${v}`);
                                        }
                                        return lines.join("\n");
                                    }
                                    function parsePlainTextForm(text, popupWidth = 500, popupHeight = 300) {
                                        const result = {};
                                        const errors = [];
                                        const lines = text.split(/\r?\n/);

                                        const rangeKeyRegex = /^\s*(\[[^\]]+\]\s*\[[^\]]+\])\s*:\s*(.+)$/;

                                        function looseParse(valueStr) {
                                            const s = valueStr.trim();

                                            if (/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(s)) {
                                                const num = Number(s);
                                                if (!Number.isNaN(num)) return num;
                                            }

                                            if (/^(true|false|null)$/i.test(s)) {
                                                try { return JSON.parse(s.toLowerCase()); } catch { }
                                            }

                                            if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
                                                try { return JSON.parse(s); } catch { }
                                            }

                                            return valueStr;
                                        }

                                        function splitKeyValueSmart(line) {
                                            let inSingle = false, inDouble = false;
                                            let sq = 0, cq = 0, pq = 0;
                                            for (let i = 0; i < line.length; i++) {
                                                const ch = line[i];
                                                const prev = i > 0 ? line[i - 1] : "";

                                                if (!inDouble && ch === "'" && prev !== "\\") inSingle = !inSingle;
                                                else if (!inSingle && ch === '"' && prev !== "\\") inDouble = !inDouble;
                                                else if (!inSingle && !inDouble) {
                                                    if (ch === "[") sq++;
                                                    else if (ch === "]" && sq > 0) sq--;
                                                    else if (ch === "{") cq++;
                                                    else if (ch === "}" && cq > 0) cq--;
                                                    else if (ch === "(") pq++;
                                                    else if (ch === ")" && pq > 0) pq--;
                                                    else if (ch === ":" && sq === 0 && cq === 0 && pq === 0) {
                                                        return [line.slice(0, i), line.slice(i + 1)];
                                                    }
                                                }
                                            }
                                            return null;
                                        }

                                        lines.forEach((line, idx) => {
                                            const lineNum = idx + 1;
                                            const original = line;
                                            const trimmed = line.trim();

                                            if (!trimmed || trimmed.startsWith("#")) return;

                                            const m = trimmed.match(rangeKeyRegex);
                                            if (m) {
                                                const key = m[1].replace(/\s+/g, "");
                                                const valueStr = m[2];
                                                result[key] = looseParse(valueStr);
                                                return;
                                            }

                                            const kv = splitKeyValueSmart(trimmed);
                                            if (!kv) {
                                                errors.push(`Line ${lineNum}: Missing ':' separator or colon only appears inside brackets/quotes → '${original}'`);
                                                return;
                                            }

                                            const key = kv[0].trim();
                                            const valueStr = kv[1].trim();
                                            if (!key) {
                                                errors.push(`Line ${lineNum}: Empty key`);
                                                return;
                                            }
                                            if (valueStr === "") {
                                                errors.push(`Line ${lineNum}: Empty value for key '${key}'`);
                                                return;
                                            }

                                            result[key] = looseParse(valueStr);
                                        });

                                        const hasInfoPrompt = typeof infoPrompt === "function";
                                        if (errors.length > 0) {
                                            const message =
                                                `⚠️ Parsing Errors (${errors.length})\n\n` +
                                                errors.join("\n") +
                                                `\n\nTip: Range-keys must look like [x1:x2][y1:y2]: value`;
                                            if (hasInfoPrompt) infoPrompt(message, popupWidth, popupHeight);
                                            else console.warn("infoPrompt not found; fallback to console.\n" + message);
                                        } else {
                                            const ok =
                                                "✅ Parsing completed successfully!\n\n" +
                                                "All key–value pairs were parsed without errors.";
                                            if (hasInfoPrompt) infoPrompt(ok, popupWidth, popupHeight);
                                            else console.log(ok);
                                        }

                                        return { result, errors };
                                    }

                                    let form = sp.getFormula();

                                    const txt = formToPlainText(form);

                                    let sequenceTextEditor;
                                    let descHook = createIonFunction((p) => {
                                        sequenceTextEditor = p;
                                        sequenceTextEditor.setValue(txt);

                                    });

                                    let initalText = true;
                                    setTimeout(() => {
                                        let i = 0;
                                        let currentText = '';

                                        const interval = setInterval(() => {

                                            currentText += txt[i];
                                            if (!initalText) {
                                                sequenceTextEditor.setContent('');
                                                clearInterval(interval)
                                                return;
                                            }
                                            sequenceTextEditor.setContent(currentText);
                                            i++;

                                            if (i >= txt.length) {
                                                clearInterval(interval);
                                            }
                                        }, 10);
                                    }, 250);
                                    let sequence_input = {
                                        wid: 'card',
                                        "height": "300px",
                                        data: {
                                            "style.padding-top": '1px',
                                            "style.border": '1px',
                                            "style.height": "200px",
                                            cards: [
                                                [
                                                    {
                                                        'width': '100%',
                                                        'component': {
                                                            wid: 'html',
                                                            data: `

                                                <H4><font color="navy">
                                                Formula in table ${sp.name}
                                                </font> </h4>
                                                `
                                                        }

                                                    },
                                                    {
                                                        'width': '100%',
                                                        'component': {
                                                            wid: 'text-editor',
                                                            refCallback: descHook,
                                                            data: {
                                                                height: "600px",
                                                                showButton: false,
                                                                editorOptions: {
                                                                    value: '',
                                                                    language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                                    suggestOnTriggerCharacters: false,
                                                                    quickSuggestions: false,
                                                                    parameterHints: { enabled: false },
                                                                    minimap: { enabled: false },
                                                                    fontFamily: "Courier New, monospace",
                                                                    placeholder: "",
                                                                    cursorStyle: "block"
                                                                },
                                                                onDidFocusEditorWidget: createIon(() => {
                                                                }),

                                                                keybinding: {
                                                                    'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                                    })
                                                                },
                                                            }
                                                        }
                                                    },
                                                    {
                                                        'width': '100%',
                                                        'component': {
                                                            wid: 'html',
                                                            data: '<hr>'
                                                        }
                                                    },
                                                    {
                                                        'component': {
                                                            wid: 'mt-button', data: {
                                                                buttons: [
                                                                    {
                                                                        label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                            hideAllModal();
                                                                            CurrentLayout.reset('mainPanel')

                                                                        })
                                                                    },
                                                                    {
                                                                        label: 'Save', ionFunction: createIonFunction(async () => {
                                                                            hideAllModal();
                                                                            CurrentLayout.reset('mainPanel')
                                                                            let content = sequenceTextEditor.getContent();
                                                                            const formula = parsePlainTextForm(content)
                                                                            sp.formula = formula.result;

                                                                        })
                                                                    },

                                                                ]

                                                            }
                                                        }
                                                    }
                                                ]]
                                        }
                                    }
                                    CurrentLayout.setComponent('mainPanel', sequence_input)

                                }
                            },
                            {
                                label: 'Edit selection formula', click: async () => {
                                    smenu = null; sp.showLJScript(pt);
                                }
                            },
                            {
                                label: 'Delete', click: async () => {

                                    (async () => {
                                        try {
                                            const wf = sp.getWellRange(values);
                                            if (wf && pt.getFormulaForWell(sp.name + wf) != null) {
                                                return {
                                                    label: 'Remove formula',
                                                    click: async () => {
                                                        if (pt.formulas[sp.name + wf]) delete pt.formulas[sp.name + wf];
                                                        smenu = null;
                                                    },
                                                    bg: 'yellow', fg: 'black'
                                                };
                                            }
                                        } catch (_) { }
                                        return null;
                                    })()
                                }
                            }

                        ]




                        if (sp.getSelectedWellsInOrder().length === 1) {
                            m.push({
                                label: 'New variable...', click: async () => {
                                    const va = await prompt("Name the variable", ["Name"], { "Name": generateNautName() }, 300, 400);
                                    const tablename = va['Name']
                                    let ltable = pt.getTableByName(tablename);
                                    if (ltable != null) {
                                        infoPrompt("Variable name already taken.")
                                        return;
                                    }


                                    let value = sp.getSelectedWellsInOrder()[0].getValue()

                                    ltable = pt.newSimplePlate(tablename, 1, 1, sp, 0);
                                    ltable.displayNumberValues = false;

                                    ltable.grid.xi = -1000;
                                    ltable.grid.yi = -1000;
                                    ltable.grid.width = pt.grid.worldWidth(100);
                                    ltable.grid.height = pt.grid.worldHeight(100);
                                    ltable.selectWellsByString('[0:][0:]');
                                    const intoSelectedWells = ltable.getSelectedWellsInOrder();
                                    intoSelectedWells[0].setValue(Number(value).toFixed(4));
                                    ltable.deselectWells();

                                }
                            },
                            )
                        }





                        m.push(
                            {
                                label: 'Edit table formulas', click: async () => {
                                    function formToPlainText(form) {
                                        const lines = [];
                                        for (const [key, value] of Object.entries(form || {})) {
                                            const v = (typeof value === "object" && value !== null)
                                                ? JSON.stringify(value)
                                                : String(value);
                                            lines.push(`${key}: ${v}`);
                                        }
                                        return lines.join("\n");
                                    }
                                    function parsePlainTextForm(text, popupWidth = 500, popupHeight = 300) {
                                        const result = {};
                                        const errors = [];
                                        const lines = text.split(/\r?\n/);

                                        const rangeKeyRegex = /^\s*(\[[^\]]+\]\s*\[[^\]]+\])\s*:\s*(.+)$/;

                                        function looseParse(valueStr) {
                                            const s = valueStr.trim();

                                            if (/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(s)) {
                                                const num = Number(s);
                                                if (!Number.isNaN(num)) return num;
                                            }

                                            if (/^(true|false|null)$/i.test(s)) {
                                                try { return JSON.parse(s.toLowerCase()); } catch { }
                                            }

                                            if ((s.startsWith("{") && s.endsWith("}")) || (s.startsWith("[") && s.endsWith("]"))) {
                                                try { return JSON.parse(s); } catch { }
                                            }

                                            return valueStr;
                                        }

                                        function splitKeyValueSmart(line) {
                                            let inSingle = false, inDouble = false;
                                            let sq = 0, cq = 0, pq = 0;
                                            for (let i = 0; i < line.length; i++) {
                                                const ch = line[i];
                                                const prev = i > 0 ? line[i - 1] : "";

                                                if (!inDouble && ch === "'" && prev !== "\\") inSingle = !inSingle;
                                                else if (!inSingle && ch === '"' && prev !== "\\") inDouble = !inDouble;
                                                else if (!inSingle && !inDouble) {
                                                    if (ch === "[") sq++;
                                                    else if (ch === "]" && sq > 0) sq--;
                                                    else if (ch === "{") cq++;
                                                    else if (ch === "}" && cq > 0) cq--;
                                                    else if (ch === "(") pq++;
                                                    else if (ch === ")" && pq > 0) pq--;
                                                    else if (ch === ":" && sq === 0 && cq === 0 && pq === 0) {
                                                        return [line.slice(0, i), line.slice(i + 1)];
                                                    }
                                                }
                                            }
                                            return null;
                                        }

                                        lines.forEach((line, idx) => {
                                            const lineNum = idx + 1;
                                            const original = line;
                                            const trimmed = line.trim();

                                            if (!trimmed || trimmed.startsWith("#")) return;

                                            const m = trimmed.match(rangeKeyRegex);
                                            if (m) {
                                                const key = m[1].replace(/\s+/g, "");
                                                const valueStr = m[2];
                                                result[key] = looseParse(valueStr);
                                                return;
                                            }

                                            const kv = splitKeyValueSmart(trimmed);
                                            if (!kv) {
                                                errors.push(`Line ${lineNum}: Missing ':' separator or colon only appears inside brackets/quotes → '${original}'`);
                                                return;
                                            }

                                            const key = kv[0].trim();
                                            const valueStr = kv[1].trim();
                                            if (!key) {
                                                errors.push(`Line ${lineNum}: Empty key`);
                                                return;
                                            }
                                            if (valueStr === "") {
                                                errors.push(`Line ${lineNum}: Empty value for key '${key}'`);
                                                return;
                                            }

                                            result[key] = looseParse(valueStr);
                                        });

                                        const hasInfoPrompt = typeof infoPrompt === "function";
                                        if (errors.length > 0) {
                                            const message =
                                                `⚠️ Parsing Errors (${errors.length})\n\n` +
                                                errors.join("\n") +
                                                `\n\nTip: Range-keys must look like [x1:x2][y1:y2]: value`;
                                            if (hasInfoPrompt) infoPrompt(message, popupWidth, popupHeight);
                                            else console.warn("infoPrompt not found; fallback to console.\n" + message);
                                        } else {
                                            const ok =
                                                "✅ Parsing completed successfully!\n\n" +
                                                "All key–value pairs were parsed without errors.";
                                            if (hasInfoPrompt) infoPrompt(ok, popupWidth, popupHeight);
                                            else console.log(ok);
                                        }

                                        return { result, errors };
                                    }

                                    let form = sp.getFormula();

                                    const txt = formToPlainText(form);

                                    let sequenceTextEditor;
                                    let descHook = createIonFunction((p) => {
                                        sequenceTextEditor = p;
                                        sequenceTextEditor.setValue(txt);

                                    });

                                    let initalText = true;
                                    setTimeout(() => {
                                        let i = 0;
                                        let currentText = '';

                                        const interval = setInterval(() => {

                                            currentText += txt[i];
                                            if (!initalText) {
                                                sequenceTextEditor.setContent('');
                                                clearInterval(interval)
                                                return;
                                            }
                                            sequenceTextEditor.setContent(currentText);
                                            i++;

                                            if (i >= txt.length) {
                                                clearInterval(interval);
                                            }
                                        }, 10);
                                    }, 250);
                                    let sequence_input = {
                                        wid: 'card',
                                        "height": "300px",
                                        data: {
                                            "style.padding-top": '1px',
                                            "style.border": '1px',
                                            "style.height": "200px",
                                            cards: [
                                                [
                                                    {
                                                        'width': '100%',
                                                        'component': {
                                                            wid: 'html',
                                                            data: `

                                                <H4><font color="navy">
                                                Formula in table ${sp.name}
                                                </font> </h4>
                                                `
                                                        }

                                                    },
                                                    {
                                                        'width': '100%',
                                                        'component': {
                                                            wid: 'text-editor',
                                                            refCallback: descHook,
                                                            data: {
                                                                height: "600px",
                                                                showButton: false,
                                                                editorOptions: {
                                                                    value: '',
                                                                    language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                                    suggestOnTriggerCharacters: false,
                                                                    quickSuggestions: false,
                                                                    parameterHints: { enabled: false },
                                                                    minimap: { enabled: false },
                                                                    fontFamily: "Courier New, monospace",
                                                                    placeholder: "",
                                                                    cursorStyle: "block"
                                                                },
                                                                onDidFocusEditorWidget: createIon(() => {
                                                                }),

                                                                keybinding: {
                                                                    'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                                    })
                                                                },
                                                            }
                                                        }
                                                    },
                                                    {
                                                        'width': '100%',
                                                        'component': {
                                                            wid: 'html',
                                                            data: '<hr>'
                                                        }
                                                    },
                                                    {
                                                        'component': {
                                                            wid: 'mt-button', data: {
                                                                buttons: [
                                                                    {
                                                                        label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                            hideAllModal();
                                                                            CurrentLayout.reset('mainPanel')

                                                                        })
                                                                    },
                                                                    {
                                                                        label: 'Save', ionFunction: createIonFunction(async () => {
                                                                            hideAllModal();
                                                                            CurrentLayout.reset('mainPanel')
                                                                            let content = sequenceTextEditor.getContent();
                                                                            const formula = parsePlainTextForm(content)
                                                                            sp.formula = formula.result;

                                                                        })
                                                                    },

                                                                ]

                                                            }
                                                        }
                                                    }
                                                ]]
                                        }
                                    }
                                    CurrentLayout.setComponent('mainPanel', sequence_input)

                                }
                            },
                            {
                                label: 'Suggest...',
                                click: async (x, y) => {

                                    const testaction = async (pt, sp) => {
                                        {
                                            let m = []
                                            m.push({
                                                label: '⚙️ (Experimental) Suggest ⚙️',
                                                click: async () => {

                                                    let ls = [
                                                    ]
                                                    for (let p of pt.root) {
                                                        ls.push(p.toValueFormulaJSON())
                                                    }
                                                    let model = await exec('py/openai/assumptions-to-budget-models.py', ls)
                                                    showModal({
                                                        wid: 'json',
                                                        data: JSON.stringify(model)
                                                    })

                                                    function generateModelMenu(model, sp) {
                                                        let bm = [];
                                                        if (!model || !model.next_models) return bm;
                                                        for (let nextModel of model.next_models) {
                                                            let explanation = `${nextModel.label} — ${nextModel.description}`;

                                                            let formulaText = nextModel.formal ? nextModel.formal.join("; ") : "";
                                                            bm.push({
                                                                label: explanation,
                                                                click: async (xwc, ywc) => {
                                                                    await exec('baja/draw/data-model-to-tables-gpt', pt, nextModel)
                                                                }
                                                            });
                                                        }

                                                        return bm;
                                                    }
                                                    let bm = generateModelMenu(model, sp)
                                                    let graph = CurrentLayout.getStashed('graph')

                                                    graph.showWindowMenu(bm, 10, 10, 400)

                                                }
                                            });
                                            m.push({
                                                label: '⚙️ Financial models ⚙️',
                                                click: async () => {

                                                    setTimeout(async () => {
                                                        let ls = [
                                                        ]
                                                        for (let p of pt.root) {
                                                            ls.push(p.toValueFormulaJSON())
                                                        }
                                                        let g = CurrentLayout.getStashed('graph')
                                                        if (g)
                                                            g.touchMe();
                                                        pt.layoutCompactTetris();
                                                        pt.setMessage("Timeline...", 5)

                                                        let t = pt.getTableByName('Assumptions')
                                                        pt.setMessage('Fin Models', 5)
                                                        let ts = (t.toValueFormulaJSON())
                                                        let pnl = await exec('py/openai/assumptions-to-financial-models.py', [ts])

                                                        if (pnl.next_models) {
                                                            for (let nm of pnl.next_models) {
                                                                let rrr = await exec('baja/draw/data-model-to-tables-gpt', pt, nm);
                                                            }
                                                        }

                                                        pt.killSprite();
                                                        pt.zoomouttoFit();
                                                        pt.layoutCompactTetris();
                                                        pt.updateCalculations();
                                                        pt.separatePlatesOverTime({
                                                            spacing: 0,
                                                            durationMs: 5_000,
                                                            iterationsPerFrame: 8,
                                                            explodeFrac: 0.13,
                                                            explodeStep: 1,
                                                            wanderStep: 0.5,
                                                            jitterReseedRate: 0.25,
                                                            keepStrictCenter: true
                                                        });

                                                    }, 400)

                                                }
                                            });

                                            m.push({
                                                label: '⚙️ PnL ⚙️',
                                                click: async () => {

                                                    setTimeout(async () => {
                                                        let ls = [
                                                        ]
                                                        for (let p of pt.root) {
                                                            ls.push(p.toValueFormulaJSON())
                                                        }
                                                        let g = CurrentLayout.getStashed('graph')
                                                        if (g)
                                                            g.touchMe();
                                                        pt.layoutCompactTetris();
                                                        pt.setMessage("Timeline...", 5)

                                                        let t = pt.getTableByName('Assumptions')
                                                        pt.setMessage('PnL', 5)
                                                        let ts = (t.toValueFormulaJSON())
                                                        let pnl = await exec('py/openai/pnl.py', "create a pnl model using these assumptions", ts)
                                                        let rrr = await exec('baja/draw/data-model-to-tables-gpt', pt, pnl);
                                                        pt.killSprite();
                                                        pt.zoomouttoFit();
                                                        pt.layoutCompactTetris();
                                                        pt.updateCalculations();
                                                        pt.separatePlatesOverTime({
                                                            spacing: 0,
                                                            durationMs: 5_000,
                                                            iterationsPerFrame: 8,
                                                            explodeFrac: 0.13,
                                                            explodeStep: 1,
                                                            wanderStep: 0.5,
                                                            jitterReseedRate: 0.25,
                                                            keepStrictCenter: true
                                                        });
                                                        setTimeout(async () => {
                                                            ls = [
                                                            ]
                                                            for (let p of pt.root) {
                                                                ls.push(p.toValueUID())
                                                            }
                                                            let model4 = await exec('py/openai/find-waterfall-plot-wells.py', getUser(), ls)
                                                            const plotFactory = await exec('flexigraph/plot.js', MGrid);
                                                            const MPlot = (await plotFactory) || plotFactory;

                                                            const getWellsFromJSON = (root, data) => {
                                                                const wellsList = Array.isArray(data?.wells) ? data.wells : [];
                                                                if (!Array.isArray(root) || !root.length) return [];
                                                                const plateMap = new Map();
                                                                for (const plate of root) {
                                                                    const name = plate?.name || plate?.plate || plate?.id;
                                                                    if (name) plateMap.set(String(name), plate);
                                                                }
                                                                const out = [];
                                                                for (const w of wellsList) {
                                                                    const plateName = w?.plate;
                                                                    const plate = plateMap.get(plateName);
                                                                    if (!plate || !Array.isArray(plate.wells)) continue;

                                                                    const col = Number(w?.x) - 1;
                                                                    const row = Number(w?.y) - 1;

                                                                    if (row > 0) {

                                                                        if (!Number.isFinite(col) || !Number.isFinite(row)) continue;

                                                                        const colArr = plate.wells[col];
                                                                        if (!Array.isArray(colArr)) continue;

                                                                        const well = colArr[row];

                                                                        const rightColArr = plate.wells[col + 1][row];
                                                                        const right = Array.isArray(rightColArr) ? rightColArr[row] : null;

                                                                        if (well) {
                                                                            out.push(well);
                                                                            out.push(rightColArr);
                                                                        }
                                                                    }
                                                                }

                                                                return out;
                                                            }

                                                            let wells = getWellsFromJSON(pm.plateTrack.root, model4)
                                                            for (let w of wells) {
                                                                w.selectIt();
                                                            }
                                                            const points = MPlot.buildWaterfallFromGroups(wells)
                                                            pt.deselectAll();
                                                            const scatterData = { points };
                                                            const plot = new MPlot(scatterData, MGrid);
                                                            plot.type = 'waterfall';
                                                            const maxX = Math.max(...scatterData.points.map(p => p.x));
                                                            const maxY = Math.max(...scatterData.points.map(p => p.y));
                                                            plot.grid.setxmax(maxX);
                                                            plot.grid.setymax(maxY);
                                                            plot.errorBarColor = 'gray';
                                                            plot.fitScaleToData = false;
                                                            plot.grid.setxmin(0); plot.name = 'Income Statement – Waterfall';
                                                            plot.x_axis_label = '';
                                                            plot.y_axis_label = 'USD';
                                                            plot.setWidth(pt.grid.worldWidth(300))
                                                            plot.setHeight(pt.grid.worldHeight(250))
                                                            pt.zoomouttoFit();
                                                            pt.killSprite();
                                                            setTimeout(() => {
                                                                pt.setMessage("This is not a complete model but a good start...", 1)
                                                                pt.addNextAvailableX(plot);
                                                                setTimeout(() => {
                                                                    pm.plateTrack.layoutCompactTetris();
                                                                    setTimeout(() => {
                                                                        pt.setMessage("Green arrows are input contros. NOTE: Not all are used... ", 1)
                                                                        setTimeout(() => {
                                                                            pm.plateTrack.setMessage("Green arrows are input contros. NOTE: Not all are used... ", 1)
                                                                        }, 10000)

                                                                    }, 4000)

                                                                }, 1000)

                                                            }, 1000)

                                                        }, 200)

                                                    }, 400)

                                                }
                                            });

                                            m.push({
                                                label: `Remove note`,
                                                click: () => {

                                                    sp.actionGlyph = null;

                                                }
                                            });

                                            const cols = 1;
                                            const smenu2 = new Menu(
                                                m,
                                                pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200),
                                                pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2),
                                                'rgb(205, 255, 155)',
                                                'black',
                                                cols
                                            );

                                            pt.setMenu(smenu2);
                                        }
                                    }
                                    sp.addActionGlyph(pt, 'Click here for options...', testaction)
                                },
                                move: () => {
                                },
                            });

                        const sww = sp.getSelectedWellsInOrder();
                        if (sww && sww.length === 1) {
                            m.push(
                                {
                                    label: 'Suggest formula for selected', click: async () => {

                                        const confirm = await exec('baja/lib/confirm.js',
                                            'This will generate formula based on the current data.  Continue?',
                                            async () => {
                                                setTimeout(async () => {

                                                    pt.updateSprite("...")
                                                    let ls = [
                                                    ]
                                                    for (let p of pt.root) {
                                                        ls.push(p.toValueFormulaJSON())
                                                    }

                                                    let sw = sp.getSelectedWellsInOrder();
                                                    let g = sp.name + ' '
                                                    for (const s of sw) {
                                                        let ks = Object.keys(s.group)
                                                        for (let k of ks) {
                                                            k = k.trim();
                                                            if (k.toLowerCase() != 'value')
                                                                g += (k) + ' '
                                                        }
                                                    }

                                                    let em = new EngineMonitor((msg) => {
                                                    });
                                                    em.addProgressListener(async (v) => {
                                                        if (v >= 100) {
                                                        }
                                                    })
                                                    let model = await exec('py/openai/suggest-formula.py', em, ls, g)

                                                    pt.killSprite();
                                                    let bm = []

                                                    for (let key of model.suggestions) {
                                                        bm.push({
                                                            label: `${key.explanation}`,
                                                            click: (xwc, ywc) => {
                                                                let range = sp.getWellRange(sp.getSelectedWellsInOrder())
                                                                sp.formula[range] = key.formula

                                                            }
                                                        })
                                                    }
                                                    let graph = CurrentLayout.getStashed('graph')
                                                    graph.showWindowMenu(bm, 10, 10, 400)

                                                }, 100);
                                            }
                                        );
                                        showModal(confirm);

                                    }, bg: 'yellow', fg: 'black'
                                }
                            )
                            m.push({
                                label: 'Formula builder', click: async () => {
                                    try {
                                        let tree = await exec('baja/table/template-tables', pt)
                                        const cleanTree = (tree) => {
                                            if (!Array.isArray(tree)) return [];

                                            return tree
                                                .filter(node => node !== null && node !== 'null' && typeof node === 'object')
                                                .map(node => {
                                                    if (Array.isArray(node.children)) {
                                                        node.children = cleanTree(node.children);
                                                    }
                                                    return node;
                                                })
                                                .filter(node => {

                                                    return !(Array.isArray(node.children) && node.children.length === 0);
                                                });
                                        };
                                        let treeStack = []

                                        const renderTree = (nodeList, panelName = 'mainPanel') => {
                                            nodeList = nodeList.filter(node => node !== null)
                                            if (!Array.isArray(nodeList) || nodeList.length === 0) return;
                                            let localNodeList = [...nodeList];
                                            if (treeStack.length > 0) {
                                                localNodeList.push(
                                                    {
                                                        'label': 'Back...',
                                                        click: () => {
                                                            if (treeStack.length > 0) {
                                                                setTimeout(async () => {
                                                                    tree = treeStack.pop();
                                                                    renderTree(tree, panelName);
                                                                    return;
                                                                }, 200)
                                                            }
                                                        }
                                                    })
                                            }
                                            localNodeList.push(
                                                {
                                                    'label': 'Close',
                                                    click: async () => {
                                                        CurrentLayout.reset(panelName);
                                                    }
                                                })
                                            const buildDesc = (items) => {
                                                let descl = {}
                                                for (let i of items) {
                                                    if (i && i.desc) {
                                                        descl[i.label] = i.desc
                                                    }
                                                }
                                                return descl;
                                            }
                                            localNodeList = cleanTree(localNodeList)

                                            let component = {
                                                wid: 'selection-list',
                                                data: {
                                                    single_selection: true,
                                                    show_button: false,
                                                    singleSelect: true,
                                                    contentItems: buildDesc(localNodeList),
                                                    listItems: localNodeList.map(item => item.label),
                                                    button_function: createIonFunction(async (items) => {
                                                        let selectedLabel = items[0];
                                                        let selectedItem = localNodeList.find(item => item.label === selectedLabel);

                                                        if (selectedItem.click) {
                                                            selectedItem.click(async (plate_load) => {
                                                                if (plate_load) {
                                                                    pt.updateSprite("...")
                                                                    let ls = [
                                                                    ]

                                                                    ls.push(plate_load.toValueFormulaJSON())
                                                                    let sw = sp.getSelectedWellsInOrder();
                                                                    let g = sp.name + ' '
                                                                    for (const s of sw) {
                                                                        let ks = Object.keys(s.group)
                                                                        for (let k of ks) {
                                                                            k = k.trim();
                                                                            if (k.toLowerCase() != 'value')
                                                                                g += (k) + ' '
                                                                        }
                                                                    }
                                                                    let em = new EngineMonitor((msg) => {
                                                                    });
                                                                    em.addProgressListener(async (v) => {
                                                                        if (v >= 100) {
                                                                        }
                                                                    })
                                                                    let model = await exec('py/openai/suggest-formula.py', em, ls, g)

                                                                    pt.killSprite();
                                                                    let bm = []

                                                                    for (let key of model.suggestions) {
                                                                        bm.push({
                                                                            label: `${key.explanation}`,
                                                                            click: (xwc, ywc) => {
                                                                                let range = sp.getWellRange(sp.getSelectedWellsInOrder())
                                                                                sp.formula[range] = key.formula

                                                                                pt.zoomToSelectedWells(sp)

                                                                            }
                                                                        })
                                                                    }
                                                                    let graph = CurrentLayout.getStashed('graph')
                                                                    graph.showWindowMenu(bm, 10, 10, 400)

                                                                }
                                                            });
                                                        }
                                                        CurrentLayout.reset(panelName);
                                                        if (selectedItem.children && selectedItem.children.length > 0) {
                                                            treeStack.push(nodeList);
                                                            tree = selectedItem.children.filter(node => node !== null)
                                                            tree = cleanTree(tree);
                                                            renderTree(tree, panelName);
                                                        } else {
                                                        }
                                                    })
                                                }
                                            };
                                            CurrentLayout.clearComponent(panelName);
                                            CurrentLayout.setComponent(panelName, component);
                                        }

                                        setTimeout(async () => {
                                            tree = cleanTree(tree);
                                            renderTree(tree)
                                        }, 1000)
                                    } catch (exception) { }

                                }, bg: 'yellow', fg: 'black'
                            })
                        }
                        m = decorateMenuItems(m)
                        const cols = 2;
                        const smenu2 = new Menu(
                            m,
                            pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200),
                            pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * m.length / 2),
                            'rgb(205, 255, 155)',
                            'black',
                            cols
                        );
                        pt.setMenu(smenu2);

                    },
                    bg: 'yellow', fg: 'black'
                },

                {
                    label: 'Calculations',
                    click: async () => {

                        let selectedWells = sp.getSelectedWellsInOrder();



                        let calculation_type = [
                            {
                                label: 'Harmonize...',
                                click: async () => {
                                    let selectP;
                                    const selectPanel = createIonFunction(async (_panel) => { selectP = _panel; });
                                    const options = [
                                        'Find and replace',
                                        'Sanitize to digits only',
                                        'Find mid-range value',
                                        'Remove non-alphanumeric characters',
                                        'Apply regex replacement',
                                        'Remove words with hyphens',
                                    ];
                                    const t = {
                                        wid: 'card',
                                        data: {
                                            cards: [[
                                                {
                                                    'title': 'Replace functions',
                                                    width: '100%',
                                                    'body': `  `,
                                                    'component': {
                                                        wid: 'selection-list',
                                                        width: '100%',
                                                        refCallback: selectPanel,
                                                        data: {
                                                            listItems: options,
                                                            button_function: createIonFunction(async (items) => {
                                                                const name = items[0];

                                                                if (name === 'Find and replace') {
                                                                    setTimeout(async () => {
                                                                        const va = await prompt("", ["Find", "Replace"], { "Find": '', "Replace": "" }, 300, 400);
                                                                        const find = va['Find'];
                                                                        if (find) {
                                                                            const replace = va['Replace'];
                                                                            const tx = sp.getColIndex(values[0]);
                                                                            let count = 0;
                                                                            hideAllModal(); clearMenu();
                                                                            for (let w of values) {
                                                                                const row_index = sp.getRowIndex(w);
                                                                                let str = (w.value + '');
                                                                                if (str && str.indexOf(find) >= 0) {
                                                                                    str = str.split(find).join(replace);
                                                                                    sp.setWellValue(tx, row_index, str);
                                                                                    count++;
                                                                                }
                                                                            }
                                                                            pt.setMessage("Replaced " + count);
                                                                        }
                                                                    });
                                                                } else if (name === 'Find mid-range value') {
                                                                    function midpoint(rangeStr) {
                                                                        const normalized = rangeStr.replace(/[–—−]/g, '-');
                                                                        const re = /([\$€£]?)(\d+(?:\.\d+)?)([a-zA-Z%]*)\s*-\s*([\$€£]?)(\d+(?:\.\d+)?)([a-zA-Z%]*)/;
                                                                        const m = normalized.match(re);
                                                                        if (!m) throw new Error("Invalid range");
                                                                        const [, p1, n1, s1, p2, n2, s2] = m;
                                                                        if (p1 !== p2 || s1 !== s2) throw new Error("Mismatched units");
                                                                        return (parseFloat(n1) + parseFloat(n2)) / 2;
                                                                    }
                                                                    const tx = sp.getColIndex(values[0]);
                                                                    for (let w of values) {
                                                                        const row_index = sp.getRowIndex(w);
                                                                        let str = (w.value + '');
                                                                        if (str) {
                                                                            try {
                                                                                const m = midpoint(str);
                                                                                sp.setWellValue(tx, row_index, m);
                                                                            } catch (_) { }
                                                                        }
                                                                    }
                                                                } else if (name === 'Remove words with hyphens') {
                                                                    function removeHyphenated(text) {
                                                                        return text.split(" ").filter(word => !word.includes("-")).join(" ");
                                                                    }
                                                                    const tx = sp.getColIndex(values[0]);
                                                                    let count = 0;
                                                                    hideAllModal(); clearMenu();
                                                                    for (let w of values) {
                                                                        const row_index = sp.getRowIndex(w);
                                                                        let str = (w.value + '');
                                                                        if (str) {
                                                                            str = removeHyphenated(str);
                                                                            sp.setWellValue(tx, row_index, str);
                                                                            count++;
                                                                        }
                                                                    }
                                                                    pt.setMessage("Replaced " + count);
                                                                } else if (name === 'Remove non-alphanumeric characters') {
                                                                    function stripNonAlphaNum(s) { return s.replace(/[^a-zA-Z0-9]/g, ''); }
                                                                    function hasNonAlphaNum(s) { return /[^a-zA-Z0-9]/.test(s); }
                                                                    const tx = sp.getColIndex(values[0]);
                                                                    let count = 0;
                                                                    hideAllModal(); clearMenu();
                                                                    for (let w of values) {
                                                                        const row_index = sp.getRowIndex(w);
                                                                        const s = (w.value + '');
                                                                        if (s && hasNonAlphaNum(s)) {
                                                                            const nv = stripNonAlphaNum(s);
                                                                            if (nv !== s) { count++; sp.setWellValue(tx, row_index, nv); }
                                                                        }
                                                                    }
                                                                    pt.setMessage("Updated " + count + ' values');
                                                                } else if (name === 'Sanitize to digits only') {
                                                                    function containsNonDigit(s) { return /[^\d.]/.test(s); }
                                                                    function removeNonDigit(s) { return s.replace(/[^\d.]/g, '').replace(/(\.)(?=.*\.)/g, ''); }
                                                                    const tx = sp.getColIndex(values[0]);
                                                                    let count = 0;
                                                                    hideAllModal(); clearMenu();
                                                                    for (let w of values) {
                                                                        const row_index = sp.getRowIndex(w);
                                                                        const s = (w.value + '');
                                                                        if (s && containsNonDigit(s)) {
                                                                            const nv = removeNonDigit(s);
                                                                            if (nv !== s) { count++; sp.setWellValue(tx, row_index, nv); }
                                                                        }
                                                                    }
                                                                    LJScript.add(sp.name, 'sanitizetodigits');
                                                                    pt.setMessage("Updated " + count + ' values');
                                                                } else if (name === 'Apply regex replacement') {

                                                                    pt.setMessage("Add your regex UI here.");
                                                                }
                                                            })
                                                        }
                                                    }
                                                }
                                            ]]
                                        }
                                    };
                                    showModal(t, 500, 650);
                                },
                                bg: 'yellow', fg: 'black'
                            },

                            {
                                label: 'In place',
                                click: async () => {
                                    const se = sp.getSelectedWellsInOrder();
                                    const withHistory = (mutate) => {
                                        pushHistory(HM(sp));
                                        mutate();
                                        smenu = null;
                                    };
                                    const promptNumber = async (title, def = "") => {
                                        const va = await prompt(title, ["Value"], { "Value": def }, 300, 400);
                                        return parseFloat(va["Value"]);
                                    };
                                    const mm = [
                                        {
                                            label: 'Tighten',
                                            click: async () => {
                                                const vals = se.flat().map(o => o.value);
                                                const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
                                                let i = 0;
                                                for (let k = 0; k < se.length; k++) {
                                                    se[k].value = mean + (se[k].value - mean) / 10;
                                                }
                                                smenu = null;
                                            }
                                        },
                                        {
                                            label: 'Loosen',
                                            click: async () => {
                                                const vals = se.flat().map(o => o.value);
                                                const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
                                                let i = 0;
                                                for (let k = 0; k < se.length; k++) {
                                                    se[k].value = mean + (se[k].value - mean) * 10;
                                                }
                                                smenu = null;
                                            }
                                        },
                                        { label: 'Log', click: async () => withHistory(() => se.forEach(o => o.value = Math.log(o.value))) },
                                        { label: 'Exponent', click: async () => withHistory(() => se.forEach(o => o.value = Math.exp(o.value))) },
                                        { label: 'Cast to Integer', click: async () => withHistory(() => se.forEach(o => o.value = Math.floor(o.value))) },
                                        { label: 'Multiply by 100', click: async () => withHistory(() => se.forEach(o => o.value *= 100)) },
                                        { label: 'Divide by 100', click: async () => withHistory(() => se.forEach(o => o.value /= 100)) },
                                        { label: 'Randomize using Value as Weight', click: async () => withHistory(() => se.forEach(o => o.value = Math.random() * o.value)) },
                                        { label: 'Absolute Value', click: async () => withHistory(() => se.forEach(o => o.value = Math.abs(o.value))) },
                                        { label: 'Round Up', click: async () => withHistory(() => se.forEach(o => o.value = Math.ceil(o.value))) },
                                        { label: 'Round Down', click: async () => withHistory(() => se.forEach(o => o.value = Math.floor(o.value))) },
                                        { label: 'Increment Up', click: async () => withHistory(() => se.forEach(o => o.value++)) },
                                        { label: 'Increment Down', click: async () => withHistory(() => se.forEach(o => o.value--)) },

                                        {
                                            label: 'Mean (Set All to Mean)', click: async () => {
                                                const mean = se.reduce((a, b) => a + b.value, 0) / se.length;
                                                withHistory(() => se.forEach(o => o.value = mean));
                                            }
                                        },

                                        {
                                            label: 'Geometric Mean (Set All to GM)', click: async () => {
                                                const gm = Math.pow(se.reduce((a, b) => a * b.value, 1), 1 / se.length);
                                                withHistory(() => se.forEach(o => o.value = gm));
                                            }
                                        },

                                        {
                                            label: 'Normalize (Divide by Mean)', click: async () => {
                                                const mean = se.reduce((a, b) => a + b.value, 0) / se.length;
                                                withHistory(() => se.forEach(o => o.value /= mean));
                                            }
                                        },

                                        {
                                            label: 'Z-Score Normalize', click: async () => {
                                                const mean = se.reduce((a, b) => a + b.value, 0) / se.length;
                                                const sd = Math.sqrt(se.reduce((a, b) => a + (b.value - mean) ** 2, 0) / se.length);
                                                withHistory(() => se.forEach(o => o.value = (o.value - mean) / sd));
                                            }
                                        },

                                        {
                                            label: 'Min-Max Normalize (0–1)', click: async () => {
                                                const min = Math.min(...se.map(o => o.value));
                                                const max = Math.max(...se.map(o => o.value));
                                                withHistory(() => se.forEach(o => o.value = (o.value - min) / (max - min)));
                                            }
                                        },

                                        { label: 'Square', click: async () => withHistory(() => se.forEach(o => o.value = o.value ** 2)) },
                                        { label: 'Square Root', click: async () => withHistory(() => se.forEach(o => o.value = Math.sqrt(o.value))) },
                                        { label: 'Cube', click: async () => withHistory(() => se.forEach(o => o.value = o.value ** 3)) },
                                        { label: 'Cube Root', click: async () => withHistory(() => se.forEach(o => o.value = Math.cbrt(o.value))) },

                                        { label: 'Reciprocal (1/x)', click: async () => withHistory(() => se.forEach(o => o.value = 1 / o.value)) },
                                        { label: 'Negate (x → -x)', click: async () => withHistory(() => se.forEach(o => o.value = -o.value)) },

                                        {
                                            label: 'Add Constant (Prompt)', click: async () => {
                                                const n = await promptNumber("Enter constant to add", "");
                                                if (!isNaN(n)) withHistory(() => se.forEach(o => o.value += n)); else smenu = null;
                                            }
                                        },

                                        {
                                            label: 'Multiply by Constant (Prompt)', click: async () => {
                                                const n = await promptNumber("Enter constant to multiply", "");
                                                if (!isNaN(n)) withHistory(() => se.forEach(o => o.value *= n)); else smenu = null;
                                            }
                                        },

                                        {
                                            label: 'Clamp to Range (Prompt)', click: async () => {
                                                const min = await promptNumber("Enter minimum value", "");
                                                const max = await promptNumber("Enter maximum value", "");
                                                if (!isNaN(min) && !isNaN(max)) {
                                                    withHistory(() => se.forEach(o => o.value = Math.min(max, Math.max(min, o.value))));
                                                } else smenu = null;
                                            }
                                        },

                                        { label: 'Random (0–1)', click: async () => withHistory(() => se.forEach(o => o.value = Math.random())) },

                                        {
                                            label: 'Random (Gaussian)', click: async () => {
                                                const randn = () => {
                                                    let u = 0, v = 0;
                                                    while (u === 0) u = Math.random();
                                                    while (v === 0) v = Math.random();
                                                    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
                                                };
                                                withHistory(() => se.forEach(o => o.value = randn()));
                                            }
                                        },

                                        {
                                            label: 'Shuffle Values', click: async () => {
                                                const vals = se.map(o => o.value);
                                                for (let i = vals.length - 1; i > 0; i--) {
                                                    const j = Math.floor(Math.random() * (i + 1));
                                                    [vals[i], vals[j]] = [vals[j], vals[i]];
                                                }
                                                withHistory(() => se.forEach((o, i) => o.value = vals[i]));
                                            }
                                        },

                                        {
                                            label: 'Set to Rank Order', click: async () => {
                                                const sorted = [...se].sort((a, b) => a.value - b.value);
                                                withHistory(() => sorted.forEach((o, i) => o.value = i + 1));
                                            }
                                        },
                                    ]

                                    const cols = 3;
                                    const smenuLocal = new Menu(
                                        mm,
                                        pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200),
                                        pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * mm.length / 2),
                                        'rgb(205, 255, 155)',
                                        'black',
                                        cols
                                    );
                                    pt.setMenu(smenuLocal);
                                }
                            },
                            {
                                label: 'Calc → Value',
                                click: async () => {

                                    const plateTrack = pt;
                                    const singleValueMenuItem = (label, calc) => ({
                                        label,
                                        click: async () => {
                                            const se = sp.getSelectedWellsInOrder();
                                            if (!se || se.length === 0) {
                                                smenu = null;
                                                return;
                                            }
                                            const vals = se.map(o => Number(o.value)).filter(v => !Number.isNaN(v));
                                            if (vals.length === 0) {
                                                smenu = null;
                                                return;
                                            }
                                            let purchase_please = {
                                                wid: 'card',
                                                data: {
                                                    height: '100px',
                                                    width: '400px',
                                                    cards: [
                                                        [
                                                            {
                                                                'title': 'Place value into... ', 'body': ``
                                                                ,
                                                                'width': '90%',
                                                                'component':
                                                                {
                                                                    wid: 'radio-buttons',

                                                                    data:
                                                                    {
                                                                        description: "Put value into...",
                                                                        type: "Options",
                                                                        unchecked: true,
                                                                        button_size: 130,
                                                                        buttons: [
                                                                            {
                                                                                label: 'New table',
                                                                                description: '',
                                                                                ionfunction: createIonFunction(
                                                                                    async () => {

                                                                                        hideAllModal();
                                                                                        setTimeout(async () => {
                                                                                            const va = await prompt(
                                                                                                `New table name`,
                                                                                                ["Name"],
                                                                                                { "Name": "" },
                                                                                                300,
                                                                                                300
                                                                                            );




                                                                                            let vaname = va['Name']
                                                                                            if (!va || va["Name"] === undefined || va["Name"] === null) {
                                                                                                vaname = 'untitled'
                                                                                            }


                                                                                            const getSelectedRangeString = () => {
                                                                                                const selectedMeta = selectedWells
                                                                                                    .map(well => sp.getWellIndicies(well))
                                                                                                    .filter(idx =>
                                                                                                        idx &&
                                                                                                        Number.isInteger(idx.colIdx) &&
                                                                                                        Number.isInteger(idx.rowIdx)
                                                                                                    );

                                                                                                const minCol = Math.min(...selectedMeta.map(idx => idx.colIdx));
                                                                                                const maxCol = Math.max(...selectedMeta.map(idx => idx.colIdx));
                                                                                                const minRow = Math.min(...selectedMeta.map(idx => idx.rowIdx));
                                                                                                const maxRow = Math.max(...selectedMeta.map(idx => idx.rowIdx));
                                                                                                return `[${minCol}:${maxCol}][${minRow}:${maxRow}]`;
                                                                                            };
                                                                                            const range = getSelectedRangeString();


                                                                                            sp.wellannotations[range] = {
                                                                                                type: 'calculated',
                                                                                                label: '',
                                                                                                comment: 'Calc → ' + vaname,
                                                                                                visible: true,
                                                                                                createdAt: Date.now(),
                                                                                                updatedAt: Date.now()
                                                                                            };




                                                                                            const formula = 'average(' + sp.name + range + ')';


                                                                                            const result = await calc(vals, se);
                                                                                            if (!Number.isNaN(result)) {
                                                                                                createSingleWellValueTable(vaname, result, formula);
                                                                                            }
                                                                                        }, 300)
                                                                                    }
                                                                                )
                                                                            },
                                                                            {
                                                                                label: 'Existing cell',
                                                                                description: '',
                                                                                ionfunction: createIonFunction(
                                                                                    async () => {


                                                                                        hideAllModal();
                                                                                        pt.deselectAll();
                                                                                        pt.wb(null)


                                                                                        const graph = CurrentLayout.getStashed('graph')
                                                                                        graph.setMouseMode("msg:Click on a cell")



                                                                                        const sel = pt.___selected_well_listener;
                                                                                        pt.set___selected_well_listener(async (cells) => {
                                                                                            const result = await calc(vals, se);
                                                                                            if (!Number.isNaN(result)) {
                                                                                                for (let c of cells) {
                                                                                                    if (c.select)
                                                                                                        c.setValue(result, false)
                                                                                                }
                                                                                            }
                                                                                            pt.set___selected_well_listener(sel)
                                                                                            pt.wb(null)


                                                                                        })
                                                                                    }
                                                                                )
                                                                            },
                                                                        ]

                                                                    }

                                                                }
                                                            },

                                                            // {

                                                            //     'component': {
                                                            //         wid: 'mt-button', data: {
                                                            //             buttons: [
                                                            //                 {
                                                            //                     label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                            //                         hideAllModal();
                                                            //                     })
                                                            //                 },
                                                            //                 {
                                                            //                     label: 'Apply', ionFunction: createIonFunction(async () => {
                                                            //                         hideAllModal();
                                                            //                     })
                                                            //                 },
                                                            //             ]
                                                            //         }
                                                            //     }
                                                            // }


                                                        ]
                                                    ]
                                                }
                                            }
                                            showModal(purchase_please, 300, 400)




                                            smenu = null;
                                        }
                                    });

                                    const createSingleWellValueTable = (label, value, formula = null) => {
                                        const fromSelectedWells = sp.getSelectedWellsInOrder();

                                        let y = pt.grid.Y(pt.grid.yi);
                                        if (fromSelectedWells.length > 0) {
                                            const colrow = sp.getWellIndicies(fromSelectedWells[0]);
                                            y = sp.grid.Y(colrow.rowIdx);
                                        }

                                        const safeName = label
                                            .replace(/[^\w]+/g, "_")
                                            .replace(/^_+|_+$/g, "")
                                            .toLowerCase();

                                        const tablename = `${safeName}`;
                                        const graph = CurrentLayout.getStashed('graph')
                                        graph.setMouseMode("msg:Click on canvas to drop the table")
                                        const t = {
                                            id: 'override-droptable',
                                            mouseMoveListener: async (x, y) => { },
                                            mouseUpListener: async (x, y) => {
                                                let ltable = plateTrack.getTableByName(tablename);
                                                if (!ltable || ltable.length === 0) {
                                                    ltable = plateTrack.newSimplePlate(tablename, 1, 1, sp, y);
                                                    ltable.displayNumberValues = false;
                                                }
                                                ltable.grid.xi = pt.grid.Xwc(x);
                                                ltable.grid.yi = pt.grid.Ywc(y) - ltable.grid.height;
                                                ltable.grid.width = pt.grid.worldWidth(300);
                                                ltable.grid.height = pt.grid.worldHeight(100);

                                                ltable.formula['[0:0][0:0]'] = formula ? formula : value;


                                                ltable.selectWellsByString('[0:][0:]');
                                                const intoSelectedWells = ltable.getSelectedWellsInOrder();
                                                intoSelectedWells[0].setValue(Number(value).toFixed(4));
                                                intoSelectedWells[0].skin_type = 'SIMPLE_TEXT';
                                                ltable.deselectWells();
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
                                    };
                                    const mm = [
                                        singleValueMenuItem('Mean', vals =>
                                            vals.reduce((s, v) => s + v, 0) / vals.length
                                        ),

                                        singleValueMenuItem('Geometric Mean', vals =>
                                            Math.pow(vals.reduce((s, v) => s * v, 1), 1 / vals.length)
                                        ),

                                        singleValueMenuItem('Min', vals =>
                                            Math.min(...vals)
                                        ),

                                        singleValueMenuItem('Max', vals =>
                                            Math.max(...vals)
                                        ),

                                        singleValueMenuItem('Sum', vals =>
                                            vals.reduce((s, v) => s + v, 0)
                                        ),

                                        singleValueMenuItem('Standard Deviation', vals => {
                                            const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
                                            return Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);
                                        }),

                                        singleValueMenuItem('Log Mean', vals => {
                                            const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
                                            return Math.log(mean);
                                        }),

                                        singleValueMenuItem('Square Root Mean', vals => {
                                            const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
                                            return Math.sqrt(mean);
                                        }),

                                        singleValueMenuItem('Random 0–1', () =>
                                            Math.random()
                                        ),
                                        singleValueMenuItem('Log10 Mean', vals => {
                                            const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
                                            return mean > 0 ? Math.log10(mean) : null;
                                        }),

                                        singleValueMenuItem('Log2 Mean', vals => {
                                            const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
                                            return mean > 0 ? Math.log2(mean) : null;
                                        }),

                                        singleValueMenuItem('Mean of ln(values)', vals => {
                                            const positive = vals.filter(v => v > 0);
                                            if (!positive.length) return null;
                                            return positive.reduce((s, v) => s + Math.log(v), 0) / positive.length;
                                        }),

                                        singleValueMenuItem('Mean of log10(values)', vals => {
                                            const positive = vals.filter(v => v > 0);
                                            if (!positive.length) return null;
                                            return positive.reduce((s, v) => s + Math.log10(v), 0) / positive.length;
                                        }),

                                        singleValueMenuItem('Mean of log2(values)', vals => {
                                            const positive = vals.filter(v => v > 0);
                                            if (!positive.length) return null;
                                            return positive.reduce((s, v) => s + Math.log2(v), 0) / positive.length;
                                        }),

                                        singleValueMenuItem('Geometric Mean via ln', vals => {
                                            const positive = vals.filter(v => v > 0);
                                            if (!positive.length) return null;
                                            return Math.exp(
                                                positive.reduce((s, v) => s + Math.log(v), 0) / positive.length
                                            );
                                        }),

                                        singleValueMenuItem('Log Fold Change max/min', vals => {
                                            const positive = vals.filter(v => v > 0);
                                            if (positive.length < 2) return null;
                                            return Math.log(Math.max(...positive) / Math.min(...positive));
                                        }),

                                        singleValueMenuItem('Log2 Fold Change max/min', vals => {
                                            const positive = vals.filter(v => v > 0);
                                            if (positive.length < 2) return null;
                                            return Math.log2(Math.max(...positive) / Math.min(...positive));
                                        }),
                                    ];






                                    const cols = 3;
                                    const smenuLocal = new Menu(
                                        mm,
                                        pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200),
                                        pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * mm.length / 2),
                                        'rgb(205, 255, 155)',
                                        'black',
                                        cols
                                    );
                                    pt.setMenu(smenuLocal);
                                }
                            },

                            {
                                label: 'Calc row(i)  →  New Column',
                                click: async () => {

                                    const se = sp.getSelectedWellsInOrder();
                                    if (!se || se.length === 0) {
                                        smenu = null;
                                        return;
                                    }

                                    const selectedMeta = se
                                        .map(well => ({ well, idx: sp.getWellIndicies(well) }))
                                        .filter(item =>
                                            item.idx &&
                                            Number.isInteger(item.idx.colIdx) &&
                                            Number.isInteger(item.idx.rowIdx)
                                        );

                                    if (selectedMeta.length === 0) {
                                        smenu = null;
                                        return;
                                    }

                                    const rowsMap = new Map();

                                    for (const item of selectedMeta) {
                                        const rowIdx = item.idx.rowIdx;
                                        if (!rowsMap.has(rowIdx)) rowsMap.set(rowIdx, []);
                                        rowsMap.get(rowIdx).push(item);
                                    }

                                    if (rowsMap.size === 0) {
                                        smenu = null;
                                        return;
                                    }

                                    const safeWrite = (targetWell, value) => {
                                        if (!targetWell) return;

                                        targetWell.value =
                                            value === undefined || value === null || Number.isNaN(value)
                                                ? ''
                                                : value;
                                    };

                                    const numericValuesForRow = (rowItems) =>
                                        rowItems
                                            .sort((a, b) => a.idx.colIdx - b.idx.colIdx)
                                            .map(({ well }) => parseFloat(well.value))
                                            .filter(v => !Number.isNaN(v));

                                    const calcMean = (vals) =>
                                        vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;

                                    const calcSum = (vals) =>
                                        vals.length ? vals.reduce((a, b) => a + b, 0) : NaN;

                                    const calcMin = (vals) =>
                                        vals.length ? Math.min(...vals) : NaN;

                                    const calcMax = (vals) =>
                                        vals.length ? Math.max(...vals) : NaN;

                                    const calcMedian = (vals) => {
                                        if (!vals.length) return NaN;

                                        const sorted = [...vals].sort((a, b) => a - b);
                                        const mid = Math.floor(sorted.length / 2);

                                        return sorted.length % 2 === 0
                                            ? (sorted[mid - 1] + sorted[mid]) / 2
                                            : sorted[mid];
                                    };

                                    const calcVariance = (vals) => {
                                        if (vals.length < 2) return NaN;

                                        const mean = calcMean(vals);
                                        return vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
                                    };

                                    const calcSd = (vals) => {
                                        const variance = calcVariance(vals);
                                        return Number.isNaN(variance) ? NaN : Math.sqrt(variance);
                                    };

                                    const calcRange = (vals) =>
                                        vals.length ? calcMax(vals) - calcMin(vals) : NaN;

                                    const calcGeometricMean = (vals) => {
                                        if (!vals.length) return NaN;
                                        if (vals.some(v => v <= 0)) return NaN;

                                        return Math.pow(
                                            vals.reduce((a, b) => a * b, 1),
                                            1 / vals.length
                                        );
                                    };

                                    const calcCoeffVar = (vals) => {
                                        if (vals.length < 2) return NaN;

                                        const mean = calcMean(vals);
                                        const sd = calcSd(vals);

                                        if (mean === 0 || Number.isNaN(mean) || Number.isNaN(sd)) return NaN;

                                        return sd / mean;
                                    };

                                    const getMaxColumnCountPerRow = () => {
                                        let max = 0;

                                        for (const rowItems of rowsMap.values()) {
                                            const cols = new Set(rowItems.map(item => item.idx.colIdx));
                                            max = Math.max(max, cols.size);
                                        }

                                        return max;
                                    };

                                    const hasMultiColumnRows = getMaxColumnCountPerRow() >= 2;

                                    const getOrCreateInsertedColumn = () => {
                                        pushHistory(HM(sp));

                                        const insertAt =
                                            Math.max(...selectedMeta.map(({ idx }) => idx.colIdx)) + 1;

                                        sp.insertCol(insertAt);

                                        return sp.wells[insertAt] || [];
                                    };

                                    const addDerivedColumnBySingleValue = (rowFn) => {
                                        const destColumn = getOrCreateInsertedColumn();

                                        for (const [rowIdx, rowItems] of rowsMap.entries()) {
                                            const vals = numericValuesForRow(rowItems);

                                            if (vals.length < 1) {
                                                safeWrite(destColumn[rowIdx], '');
                                                continue;
                                            }

                                            const result = rowFn(vals[0], vals, rowItems, rowIdx);
                                            safeWrite(destColumn[rowIdx], result);
                                        }

                                        smenu = null;
                                    };

                                    const addDerivedColumnByMultiValue = (rowFn) => {
                                        const destColumn = getOrCreateInsertedColumn();

                                        for (const [rowIdx, rowItems] of rowsMap.entries()) {
                                            const vals = numericValuesForRow(rowItems);

                                            if (vals.length < 2) {
                                                safeWrite(destColumn[rowIdx], '');
                                                continue;
                                            }

                                            const result = rowFn(vals, rowItems, rowIdx);
                                            safeWrite(destColumn[rowIdx], result);
                                        }

                                        smenu = null;
                                    };

                                    const singleValueOps = [
                                        {
                                            label: 'Log Value (ln)',
                                            click: async () => addDerivedColumnBySingleValue(v =>
                                                v > 0 ? Math.log(v) : null
                                            )
                                        },
                                        {
                                            label: 'Log10 Value',
                                            click: async () => addDerivedColumnBySingleValue(v =>
                                                v > 0 ? Math.log10(v) : null
                                            )
                                        },
                                        {
                                            label: 'Log2 Value',
                                            click: async () => addDerivedColumnBySingleValue(v =>
                                                v > 0 ? Math.log2(v) : null
                                            )
                                        },
                                        {
                                            label: 'Square',
                                            click: async () => addDerivedColumnBySingleValue(v =>
                                                v ** 2
                                            )
                                        },
                                        {
                                            label: 'Square Root',
                                            click: async () => addDerivedColumnBySingleValue(v =>
                                                v >= 0 ? Math.sqrt(v) : null
                                            )
                                        }
                                    ];

                                    const multiColumnOps = [
                                        { label: 'Mean', click: async () => addDerivedColumnByMultiValue(vals => calcMean(vals)) },
                                        { label: 'Median', click: async () => addDerivedColumnByMultiValue(vals => calcMedian(vals)) },
                                        { label: 'Sum', click: async () => addDerivedColumnByMultiValue(vals => calcSum(vals)) },
                                        { label: 'Minimum', click: async () => addDerivedColumnByMultiValue(vals => calcMin(vals)) },
                                        { label: 'Maximum', click: async () => addDerivedColumnByMultiValue(vals => calcMax(vals)) },
                                        { label: 'Range', click: async () => addDerivedColumnByMultiValue(vals => calcRange(vals)) },
                                        { label: 'Variance', click: async () => addDerivedColumnByMultiValue(vals => calcVariance(vals)) },
                                        { label: 'Standard Deviation', click: async () => addDerivedColumnByMultiValue(vals => calcSd(vals)) },
                                        { label: 'Geometric Mean', click: async () => addDerivedColumnByMultiValue(vals => calcGeometricMean(vals)) },
                                        { label: 'Coefficient of Variation', click: async () => addDerivedColumnByMultiValue(vals => calcCoeffVar(vals)) },

                                        {
                                            label: 'Log Mean (ln)',
                                            click: async () => addDerivedColumnByMultiValue(vals => {
                                                const mean = calcMean(vals);
                                                return mean > 0 ? Math.log(mean) : null;
                                            })
                                        },
                                        {
                                            label: 'Log10 Mean',
                                            click: async () => addDerivedColumnByMultiValue(vals => {
                                                const mean = calcMean(vals);
                                                return mean > 0 ? Math.log10(mean) : null;
                                            })
                                        },
                                        {
                                            label: 'Log2 Mean',
                                            click: async () => addDerivedColumnByMultiValue(vals => {
                                                const mean = calcMean(vals);
                                                return mean > 0 ? Math.log2(mean) : null;
                                            })
                                        },
                                        {
                                            label: 'Mean of ln(values)',
                                            click: async () => addDerivedColumnByMultiValue(vals => {
                                                const positive = vals.filter(v => v > 0);
                                                if (!positive.length) return null;

                                                return positive.reduce((s, v) => s + Math.log(v), 0) / positive.length;
                                            })
                                        },
                                        {
                                            label: 'Mean of log10(values)',
                                            click: async () => addDerivedColumnByMultiValue(vals => {
                                                const positive = vals.filter(v => v > 0);
                                                if (!positive.length) return null;

                                                return positive.reduce((s, v) => s + Math.log10(v), 0) / positive.length;
                                            })
                                        },
                                        {
                                            label: 'Mean of log2(values)',
                                            click: async () => addDerivedColumnByMultiValue(vals => {
                                                const positive = vals.filter(v => v > 0);
                                                if (!positive.length) return null;

                                                return positive.reduce((s, v) => s + Math.log2(v), 0) / positive.length;
                                            })
                                        },
                                        {
                                            label: 'Geometric Mean (ln)',
                                            click: async () => addDerivedColumnByMultiValue(vals => {
                                                const positive = vals.filter(v => v > 0);
                                                if (!positive.length) return null;

                                                return Math.exp(
                                                    positive.reduce((s, v) => s + Math.log(v), 0) / positive.length
                                                );
                                            })
                                        },
                                        {
                                            label: 'Log Fold Change (max/min)',
                                            click: async () => addDerivedColumnByMultiValue(vals => {
                                                const positive = vals.filter(v => v > 0);
                                                if (positive.length < 2) return null;

                                                return Math.log(Math.max(...positive) / Math.min(...positive));
                                            })
                                        },
                                        {
                                            label: 'Log2 Fold Change (max/min)',
                                            click: async () => addDerivedColumnByMultiValue(vals => {
                                                const positive = vals.filter(v => v > 0);
                                                if (positive.length < 2) return null;

                                                return Math.log2(Math.max(...positive) / Math.min(...positive));
                                            })
                                        }
                                    ];

                                    function hasLeftRightColumns(cells) {
                                        if (!Array.isArray(cells) || cells.length < 2) return false;

                                        const uniqueX = new Set(cells.map(c => c.x));
                                        if (uniqueX.size < 2) return false;

                                        const map = new Map();
                                        cells.forEach(c => map.set(`${c.x},${c.y}`, c));

                                        return cells.some(c =>
                                            map.has(`${c.x - 1},${c.y}`) ||
                                            map.has(`${c.x + 1},${c.y}`)
                                        );
                                    }

                                    async function applyColumnRowOperation(op) {
                                        addDerivedColumnByMultiValue(vals => {
                                            if (vals.length < 2) return null;

                                            return vals.slice(1).reduce((acc, v) => {
                                                switch (op) {
                                                    case 'subtract':
                                                        return acc - v;
                                                    case 'add':
                                                        return acc + v;
                                                    case 'multiply':
                                                        return acc * v;
                                                    case 'divide':
                                                        return v === 0 ? null : acc / v;
                                                    default:
                                                        return acc;
                                                }
                                            }, vals[0]);
                                        });
                                    }

                                    let mm = hasMultiColumnRows
                                        ? [...multiColumnOps]
                                        : [...singleValueOps];

                                    if (hasLeftRightColumns(se)) {
                                        mm.push(
                                            { label: 'col i - col ii', click: async () => applyColumnRowOperation('subtract') },
                                            { label: 'col i + col ii', click: async () => applyColumnRowOperation('add') },
                                            { label: 'col i / col ii', click: async () => applyColumnRowOperation('divide') },
                                            { label: 'col i * col ii', click: async () => applyColumnRowOperation('multiply') }
                                        );
                                    }

                                    const smenuLocal = new Menu(
                                        mm,
                                        pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200),
                                        pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * mm.length / 2),
                                        'rgb(205, 255, 155)',
                                        'black',
                                        2
                                    );

                                    pt.setMenu(smenuLocal);
                                }
                            },
                            {
                                label: 'Calc row(i)  →  Next column',
                                click: async () => {


                                    infoPrompt(" Warning:  You are about to overwrite data.")



                                    const se = sp.getSelectedWellsInOrder();
                                    if (!se || se.length === 0) {
                                        smenu = null;
                                        return;
                                    }

                                    const selectedMeta = se
                                        .map(well => ({ well, idx: sp.getWellIndicies(well) }))
                                        .filter(item =>
                                            item.idx &&
                                            Number.isInteger(item.idx.colIdx) &&
                                            Number.isInteger(item.idx.rowIdx)
                                        );

                                    if (selectedMeta.length === 0) {
                                        smenu = null;
                                        return;
                                    }

                                    const rowsMap = new Map();
                                    for (const item of selectedMeta) {
                                        const rowIdx = item.idx.rowIdx;
                                        if (!rowsMap.has(rowIdx)) rowsMap.set(rowIdx, []);
                                        rowsMap.get(rowIdx).push(item);
                                    }

                                    if (rowsMap.size === 0) {
                                        smenu = null;
                                        return;
                                    }

                                    const lastSelectedColIdx = Math.max(...selectedMeta.map(({ idx }) => idx.colIdx));
                                    const nextColIdx = lastSelectedColIdx + 1;

                                    const safeWrite = (targetWell, value) => {
                                        if (!targetWell) return;

                                        targetWell.value =
                                            value === undefined || value === null || Number.isNaN(value)
                                                ? ''
                                                : value;
                                    };

                                    const getOrCreateNextColumn = () => {
                                        pushHistory(HM(sp));

                                        // plate structure is sp.wells[column][row]
                                        // use the existing next column if present
                                        if (sp.wells[nextColIdx]) {
                                            return sp.wells[nextColIdx];
                                        }

                                        // otherwise create that column
                                        sp.insertCol(nextColIdx);

                                        return sp.wells[nextColIdx] || [];
                                    };

                                    const numericValuesForRow = (rowItems) =>
                                        rowItems
                                            .sort((a, b) => a.idx.colIdx - b.idx.colIdx)
                                            .map(({ well }) => parseFloat(well.value))
                                            .filter(v => !Number.isNaN(v));

                                    const getMaxColumnCountPerRow = () => {
                                        let max = 0;

                                        for (const rowItems of rowsMap.values()) {
                                            const cols = new Set(rowItems.map(item => item.idx.colIdx));
                                            max = Math.max(max, cols.size);
                                        }

                                        return max;
                                    };

                                    const hasMultiColumnRows = getMaxColumnCountPerRow() >= 2;

                                    const calcMean = vals =>
                                        vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;

                                    const calcSum = vals =>
                                        vals.length ? vals.reduce((a, b) => a + b, 0) : NaN;

                                    const calcMin = vals =>
                                        vals.length ? Math.min(...vals) : NaN;

                                    const calcMax = vals =>
                                        vals.length ? Math.max(...vals) : NaN;

                                    const calcRange = vals =>
                                        vals.length ? calcMax(vals) - calcMin(vals) : NaN;

                                    const calcMedian = vals => {
                                        if (!vals.length) return NaN;

                                        const sorted = [...vals].sort((a, b) => a - b);
                                        const mid = Math.floor(sorted.length / 2);

                                        return sorted.length % 2 === 0
                                            ? (sorted[mid - 1] + sorted[mid]) / 2
                                            : sorted[mid];
                                    };

                                    const calcVariance = vals => {
                                        if (vals.length < 2) return NaN;

                                        const mean = calcMean(vals);
                                        return vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
                                    };

                                    const calcSd = vals => {
                                        const variance = calcVariance(vals);
                                        return Number.isNaN(variance) ? NaN : Math.sqrt(variance);
                                    };

                                    const calcGeometricMean = vals => {
                                        if (!vals.length) return NaN;
                                        if (vals.some(v => v <= 0)) return NaN;

                                        return Math.pow(
                                            vals.reduce((a, b) => a * b, 1),
                                            1 / vals.length
                                        );
                                    };

                                    const calcCoeffVar = vals => {
                                        if (vals.length < 2) return NaN;

                                        const mean = calcMean(vals);
                                        const sd = calcSd(vals);

                                        if (mean === 0 || Number.isNaN(mean) || Number.isNaN(sd)) return NaN;

                                        return sd / mean;
                                    };

                                    const addNextColumnBySingleValue = rowFn => {
                                        const destColumn = getOrCreateNextColumn();

                                        for (const [rowIdx, rowItems] of rowsMap.entries()) {
                                            const vals = numericValuesForRow(rowItems);

                                            if (vals.length < 1) {
                                                safeWrite(destColumn[rowIdx], '');
                                                continue;
                                            }

                                            safeWrite(
                                                destColumn[rowIdx],
                                                rowFn(vals[0], vals, rowItems, rowIdx)
                                            );
                                        }

                                        smenu = null;
                                    };

                                    const addNextColumnByMultiValue = rowFn => {
                                        const destColumn = getOrCreateNextColumn();

                                        for (const [rowIdx, rowItems] of rowsMap.entries()) {
                                            const vals = numericValuesForRow(rowItems);

                                            if (vals.length < 2) {
                                                safeWrite(destColumn[rowIdx], '');
                                                continue;
                                            }

                                            safeWrite(
                                                destColumn[rowIdx],
                                                rowFn(vals, rowItems, rowIdx)
                                            );
                                        }

                                        smenu = null;
                                    };

                                    const addNextColumnByArray = rowFn => {
                                        const destColumn = getOrCreateNextColumn();

                                        for (const [rowIdx, rowItems] of rowsMap.entries()) {
                                            const vals = numericValuesForRow(rowItems);

                                            if (vals.length < 1) {
                                                safeWrite(destColumn[rowIdx], '');
                                                continue;
                                            }

                                            const results = rowFn(vals, rowItems, rowIdx);

                                            safeWrite(
                                                destColumn[rowIdx],
                                                Array.isArray(results) ? results.join(', ') : results ?? ''
                                            );
                                        }

                                        smenu = null;
                                    };

                                    async function insertValuePerSelectedRowNextToLastColumn() {
                                        const destColumn = getOrCreateNextColumn();
                                        const selectedRows = [...rowsMap.keys()].sort((a, b) => a - b);

                                        for (const rowIdx of selectedRows) {
                                            const va = await prompt(
                                                `Value for row ${rowIdx}`,
                                                ["Value"],
                                                { "Value": "" },
                                                300,
                                                300
                                            );

                                            if (!va || va["Value"] === undefined || va["Value"] === null) continue;

                                            safeWrite(destColumn[rowIdx], va["Value"]);
                                        }

                                        smenu = null;
                                    }

                                    async function insertPastedValuesNextToLastColumn() {
                                        const va = await prompt(
                                            "Values",
                                            ["Values"],
                                            { "Values": "" },
                                            400,
                                            300
                                        );

                                        if (!va || va["Values"] === undefined || va["Values"] === null) return;

                                        const values = String(va["Values"])
                                            .split(/[\n,\t]+/)
                                            .map(v => v.trim())
                                            .filter(v => v !== "");

                                        if (values.length === 0) return;

                                        const destColumn = getOrCreateNextColumn();
                                        const selectedRows = [...rowsMap.keys()].sort((a, b) => a - b);

                                        selectedRows.forEach((rowIdx, i) => {
                                            safeWrite(destColumn[rowIdx], values[i] ?? "");
                                        });

                                        smenu = null;
                                    }

                                    function transformRowValues(vals, operand, op) {
                                        return vals.map(v => {
                                            const num = Number(v);
                                            if (!Number.isFinite(num)) return v;

                                            switch (op) {
                                                case "subtract": return num - operand;
                                                case "add": return num + operand;
                                                case "divide": return operand === 0 ? null : num / operand;
                                                case "multiply": return num * operand;
                                                default: return v;
                                            }
                                        });
                                    }

                                    async function applyScalarRowOperation(op) {
                                        const va = await prompt(
                                            "Value",
                                            ["Value"],
                                            { "Value": '' },
                                            300,
                                            300
                                        );

                                        if (!va || va["Value"] === undefined || va["Value"] === null) return;

                                        const operand = Number(va["Value"]);

                                        if (!Number.isFinite(operand)) {
                                            alert("Please enter a valid numeric value.");
                                            return;
                                        }

                                        if (op === "divide" && operand === 0) {
                                            alert("Division by zero is not allowed.");
                                            return;
                                        }

                                        addNextColumnByArray(vals =>
                                            transformRowValues(vals, operand, op)
                                        );
                                    }

                                    async function applyColumnRowOperation(op) {
                                        addNextColumnByMultiValue(vals => {
                                            if (!vals || vals.length < 2) return null;

                                            return vals.slice(1).reduce((acc, v) => {
                                                switch (op) {
                                                    case "subtract": return acc - v;
                                                    case "add": return acc + v;
                                                    case "divide": return v === 0 ? null : acc / v;
                                                    case "multiply": return acc * v;
                                                    default: return acc;
                                                }
                                            }, vals[0]);
                                        });
                                    }

                                    function hasLeftRightColumns(cells) {
                                        if (!Array.isArray(cells) || cells.length < 2) return false;

                                        const uniqueX = new Set(cells.map(c => c.x));
                                        if (uniqueX.size < 2) return false;

                                        const map = new Map();
                                        cells.forEach(c => {
                                            map.set(`${c.x},${c.y}`, c);
                                        });

                                        return cells.some(c =>
                                            map.has(`${c.x - 1},${c.y}`) ||
                                            map.has(`${c.x + 1},${c.y}`)
                                        );
                                    }

                                    const baseOps = [
                                        {
                                            label: 'Insert pasted values → next column',
                                            click: async () => insertPastedValuesNextToLastColumn()
                                        },
                                        {
                                            label: 'Insert value per row → next column',
                                            click: async () => insertValuePerSelectedRowNextToLastColumn()
                                        }
                                    ];

                                    const singleValueOps = [
                                        {
                                            label: 'Log Value (ln)',
                                            click: async () => addNextColumnBySingleValue(v =>
                                                v > 0 ? Math.log(v) : null
                                            )
                                        },
                                        {
                                            label: 'Log10 Value',
                                            click: async () => addNextColumnBySingleValue(v =>
                                                v > 0 ? Math.log10(v) : null
                                            )
                                        },
                                        {
                                            label: 'Log2 Value',
                                            click: async () => addNextColumnBySingleValue(v =>
                                                v > 0 ? Math.log2(v) : null
                                            )
                                        },
                                        {
                                            label: 'Square Value',
                                            click: async () => addNextColumnBySingleValue(v => v ** 2)
                                        },
                                        {
                                            label: 'Square Root Value',
                                            click: async () => addNextColumnBySingleValue(v =>
                                                v >= 0 ? Math.sqrt(v) : null
                                            )
                                        }
                                    ];

                                    const multiColumnOps = [
                                        { label: 'Mean', click: async () => addNextColumnByMultiValue(vals => calcMean(vals)) },
                                        { label: 'Median', click: async () => addNextColumnByMultiValue(vals => calcMedian(vals)) },
                                        { label: 'Sum', click: async () => addNextColumnByMultiValue(vals => calcSum(vals)) },
                                        { label: 'Minimum', click: async () => addNextColumnByMultiValue(vals => calcMin(vals)) },
                                        { label: 'Maximum', click: async () => addNextColumnByMultiValue(vals => calcMax(vals)) },
                                        { label: 'Range', click: async () => addNextColumnByMultiValue(vals => calcRange(vals)) },
                                        { label: 'Variance', click: async () => addNextColumnByMultiValue(vals => calcVariance(vals)) },
                                        { label: 'Standard Deviation', click: async () => addNextColumnByMultiValue(vals => calcSd(vals)) },
                                        { label: 'Geometric Mean', click: async () => addNextColumnByMultiValue(vals => calcGeometricMean(vals)) },
                                        { label: 'Coefficient of Variation', click: async () => addNextColumnByMultiValue(vals => calcCoeffVar(vals)) },

                                        {
                                            label: 'Log Mean (ln)',
                                            click: async () => addNextColumnByMultiValue(vals => {
                                                const mean = calcMean(vals);
                                                return mean > 0 ? Math.log(mean) : null;
                                            })
                                        },
                                        {
                                            label: 'Log10 Mean',
                                            click: async () => addNextColumnByMultiValue(vals => {
                                                const mean = calcMean(vals);
                                                return mean > 0 ? Math.log10(mean) : null;
                                            })
                                        },
                                        {
                                            label: 'Log2 Mean',
                                            click: async () => addNextColumnByMultiValue(vals => {
                                                const mean = calcMean(vals);
                                                return mean > 0 ? Math.log2(mean) : null;
                                            })
                                        },
                                        {
                                            label: 'Mean of ln(values)',
                                            click: async () => addNextColumnByMultiValue(vals => {
                                                const positive = vals.filter(v => v > 0);
                                                if (!positive.length) return null;

                                                return positive.reduce((s, v) => s + Math.log(v), 0) / positive.length;
                                            })
                                        },
                                        {
                                            label: 'Mean of log10(values)',
                                            click: async () => addNextColumnByMultiValue(vals => {
                                                const positive = vals.filter(v => v > 0);
                                                if (!positive.length) return null;

                                                return positive.reduce((s, v) => s + Math.log10(v), 0) / positive.length;
                                            })
                                        },
                                        {
                                            label: 'Mean of log2(values)',
                                            click: async () => addNextColumnByMultiValue(vals => {
                                                const positive = vals.filter(v => v > 0);
                                                if (!positive.length) return null;

                                                return positive.reduce((s, v) => s + Math.log2(v), 0) / positive.length;
                                            })
                                        },
                                        {
                                            label: 'Geometric Mean (ln)',
                                            click: async () => addNextColumnByMultiValue(vals => {
                                                const positive = vals.filter(v => v > 0);
                                                if (!positive.length) return null;

                                                return Math.exp(
                                                    positive.reduce((s, v) => s + Math.log(v), 0) / positive.length
                                                );
                                            })
                                        },
                                        {
                                            label: 'Log Fold Change (max/min)',
                                            click: async () => addNextColumnByMultiValue(vals => {
                                                const positive = vals.filter(v => v > 0);
                                                if (positive.length < 2) return null;

                                                return Math.log(Math.max(...positive) / Math.min(...positive));
                                            })
                                        },
                                        {
                                            label: 'Log2 Fold Change (max/min)',
                                            click: async () => addNextColumnByMultiValue(vals => {
                                                const positive = vals.filter(v => v > 0);
                                                if (positive.length < 2) return null;

                                                return Math.log2(Math.max(...positive) / Math.min(...positive));
                                            })
                                        }
                                    ];

                                    const scalarOps = [
                                        { label: 'row i - {value}', click: async () => applyScalarRowOperation("subtract") },
                                        { label: 'row i + {value}', click: async () => applyScalarRowOperation("add") },
                                        { label: 'row i / {value}', click: async () => applyScalarRowOperation("divide") },
                                        { label: 'row i * {value}', click: async () => applyScalarRowOperation("multiply") }
                                    ];

                                    const mm = [
                                        ...baseOps,
                                        ...(hasMultiColumnRows ? multiColumnOps : singleValueOps),
                                        ...scalarOps
                                    ];

                                    if (hasLeftRightColumns(se)) {
                                        mm.push(
                                            { label: 'column i - column ii', click: async () => applyColumnRowOperation("subtract") },
                                            { label: 'column i + column ii', click: async () => applyColumnRowOperation("add") },
                                            { label: 'column i / column ii', click: async () => applyColumnRowOperation("divide") },
                                            { label: 'column i * column ii', click: async () => applyColumnRowOperation("multiply") }
                                        );
                                    }

                                    const smenuLocal = new Menu(
                                        mm,
                                        pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 200),
                                        pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * mm.length / 2),
                                        'rgb(205, 255, 155)',
                                        'black',
                                        2
                                    );

                                    pt.setMenu(smenuLocal);
                                }
                            }



                        ]

                        pt.setMenu(calculation_type)



                    },
                    bg: 'yellow', fg: 'black'
                }, {
                label: 'Annotations',
                click: async () => {
                    const selectedWells = sp.getSelectedWellsInOrder();
                    if (!selectedWells || selectedWells.length === 0) {
                        pt.setMessage?.("Select one or more wells first.");
                        smenu = null;
                        return;
                    }

                    sp.wellannotations = sp.wellannotations || {};

                    const getSelectedRangeString = () => {
                        const selectedMeta = selectedWells
                            .map(well => sp.getWellIndicies(well))
                            .filter(idx =>
                                idx &&
                                Number.isInteger(idx.colIdx) &&
                                Number.isInteger(idx.rowIdx)
                            );

                        const minCol = Math.min(...selectedMeta.map(idx => idx.colIdx));
                        const maxCol = Math.max(...selectedMeta.map(idx => idx.colIdx));
                        const minRow = Math.min(...selectedMeta.map(idx => idx.rowIdx));
                        const maxRow = Math.max(...selectedMeta.map(idx => idx.rowIdx));
                        return `[${minCol}:${maxCol}][${minRow}:${maxRow}]`;
                    };
                    const range = getSelectedRangeString();
                    const setAnnotation = async (type) => {
                        const existing = sp.wellannotations[range] || {};
                        const va = await prompt(
                            "Well annotation",
                            ["Comment"],
                            {
                                "Comment": existing.comment || ""
                            },
                            360,
                            420
                        );
                        if (!va) return;
                        pushHistory?.(HM(sp));
                        sp.wellannotations[range] = {
                            type,
                            label: '',
                            comment: va["Comment"] || "",
                            visible: true,
                            createdAt: existing.createdAt || Date.now(),
                            updatedAt: Date.now()
                        };

                        pt.setMessage?.(`Annotated ${range}`);
                        smenu = null;
                    };

                    const clearAnnotation = async () => {
                        pushHistory?.(HM(sp));

                        delete sp.wellannotations[range];

                        pt.setMessage?.(`Cleared annotation for ${range}`);
                        smenu = null;
                    };

                    const toggleAnnotationVisibility = async () => {
                        sp.showAnnotations(sp.Attr__showAnnotations ? false : true);
                        smenu = null;
                    };

                    const annotationMenu = [
                        {
                            label: 'Add label/comment',
                            click: async () => setAnnotation('comment')
                        },
                        {
                            label: 'Add warning note',
                            click: async () => setAnnotation('warning')
                        },
                        {
                            label: 'Add info note',
                            click: async () => setAnnotation('info')
                        },
                        {
                            label: 'Add question note',
                            click: async () => setAnnotation('question')
                        },
                        {
                            label: 'Show/hide annotation',
                            click: async () => toggleAnnotationVisibility()
                        },
                        {
                            label: 'Clear annotation',
                            click: async () => clearAnnotation()
                        }
                    ];

                    const smenuLocal = new Menu(
                        annotationMenu,
                        pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - 180),
                        pt.grid.Ywc(pt.grid.yi + pt.grid.height / 2 - 20 * annotationMenu.length / 2),
                        'rgb(255, 235, 170)',
                        'black',
                        2
                    );

                    pt.setMenu(smenuLocal);
                },
                bg: 'rgb(251, 255, 0)',
                fg: 'black'
            },

            )

            async function createPlotFromPayload(payload, pt) {
                const scatterData = payload.scatterData;
                let MPlot = await exec("flexigraph/plot.js");
                const plot = new MPlot(scatterData);
                plot.errorBarColor = "gray";
                plot.fitScaleToData = false;
                plot.type = payload.type || "scatter";
                plot.name = payload.plotOption || generateNautName();
                plot.x_axis_label = payload.xGroup || "";
                plot.y_axis_label = payload.yGroup || "";
                plot.margin = {
                    top: 10,
                    right: 20,
                    bottom: 45,
                    left: 55
                };
                if (plot.grid.setInset) {
                    plot.grid.setInset(55, 45);
                }
                const xs = scatterData.points.map(p => Number(p.x)).filter(Number.isFinite);
                const ys = scatterData.points.map(p => Number(p.y)).filter(Number.isFinite);
                const minX = xs.length ? Math.min(...xs) : 0;
                const maxX = xs.length ? Math.max(...xs) : 1;
                const minY = ys.length ? Math.min(...ys) : 0;
                const maxY = ys.length ? Math.max(...ys) : 1;
                plot.grid.setxmin(Math.min(0, minX));
                plot.grid.setymin(Math.min(0, minY));
                plot.grid.setxmax(maxX * 1.05 || 1);
                plot.grid.setymax(maxY * 1.05 || 1);

                plot.setWidth(pt.grid.worldWidth(400));
                plot.setHeight(pt.grid.worldHeight(260));

                plot.grid.rescale();

                setTimeout(async () => {
                    const graph = CurrentLayout.getStashed('graph')
                    pt.m_plots.push(plot)
                    let m = await exec('baja/plate/views/move-plot.js', pt, plot)
                    pt.wb({
                        id: 'plot-move',
                        priority: true,
                        mouseMoveListener: m.mouseMoveListener,
                        mouseUpListener: m.mouseUpListener,
                        mouseDownListener: m.mouseDownListener,
                        draw: m.draw,
                        menuManager: m.menuManager
                    })

                }, 299);
                return plot;
            }



            // give labels room


            if (sp.getSelectedWellsInOrder().length > 1)
                cond.push(
                    {
                        label: 'Plot',


                        click: async (x, y) => {



                            let em = new EngineMonitor((msg) => {
                                console.log(msg)
                            });
                            em.addProgressListener(async (v) => {
                            })


                            const options = await exec('py/plot/options.py', em, welldimensions)


                            const plot_menu = []
                            for (let o of options) {
                                plot_menu.push({
                                    label: o,
                                    click: async (x, y) => {
                                        let values = await exec('py/plot/plot.py', em, welldimensions, o)
                                        await createPlotFromPayload(values, pt)
                                    }
                                })
                            }
                            plot_menu.push(
                                {
                                    label: 'Bar chart',
                                    click: async (x, y) => {
                                        const [firstHalf, secondHalf] = splitRowsArrayInHalf(welldimensions);
                                        const points = firstHalf.map((well, index) => {
                                            return {
                                                x: well.value,
                                                xuid: well.uid,
                                                y: secondHalf[index] ? secondHalf[index].value : null,
                                                yuid: secondHalf[index] ? secondHalf[index].uid : null,
                                                stdDev: secondHalf[index] ? secondHalf[index].stdDev : null
                                            };
                                        });
                                        let scatterData = {
                                            points: points
                                        }
                                        let MPlot = await exec("flexigraph/plot.js");
                                        const plot = new MPlot(scatterData)

                                        plot.errorBarColor = 'gray';
                                        plot.fitScaleToData = false;
                                        plot.type = 'barchart'
                                        plot.name = generateNautName();
                                        const maxX = Math.max(...scatterData.points.map(p => p.x));
                                        const maxY = Math.max(...scatterData.points.map(p => p.y));
                                        plot.grid.setxmax(maxX);
                                        plot.grid.setymax(maxY);
                                        plot.grid.setxmin(0);
                                        plot.setWidth(pt.grid.worldWidth(400))
                                        plot.setHeight(pt.grid.worldHeight(200))
                                        plot.grid.rescale();
                                        setTimeout(() => {
                                            pt.moveOneToVacant(plot)
                                            pt.zoomtoFit();
                                        }, 299)
                                    },
                                    bg: 'yellow',
                                    fg: 'black'
                                }
                            )

                            pt.setMenu(plot_menu)

                        }, bg: 'yellow',
                        fg: 'black'

                    })

            if (sp.isSingleRowSelected && sp.isSingleRowSelected()) {
                cond.push({
                    label: 'Delete selected row',
                    click: async () => {
                        pushHistory(HM(sp));
                        sp.removeFullySelectedRows();
                        pt.wb(null);
                    },
                    bg: 'yellow', fg: 'black'
                });
            }

        }

        const filteredCond = cond.filter(Boolean);

        noncond.push(
            { label: 'Expand \u2191', click: async () => { sp.deselectAll(); sp.insertRow(0); } },
            { label: 'Expand \u2190', click: async () => { sp.deselectAll(); sp.insertCol(0); } },
            { label: 'Expand \u2192', click: async () => { sp.deselectAll(); sp.addColumn(); } },
            { label: 'Expand \u2193', click: async () => { sp.deselectAll(); sp.addRow(); } },
            {
                label: '...',
                click: (_x, _y) => {
                    setTimeout(async () => {
                        const m = await sp.createConnectMenu('baja/plate/views/big-menu', pt, sp);
                        sp.showMenu(pt, m);
                    }, 500);
                }
            }
        );
        const combined = [...filteredCond, ...noncond];
        return decorateMenuItems(combined);
        function groupByBg(items) {
            const order = ['navy', 'yellow', 'black', 'orange', 'navy', null, undefined];
            const idx = (c) => {
                if (c == null) return order.length - 1;
                const i = order.indexOf(c);
                return i === -1 ? order.length - 2 : i;
            };
            return items
                .map((it, i) => ({ it, i }))
                .sort((a, b) => {
                    const ca = idx(a.it.bg);
                    const cb = idx(b.it.bg);
                    if (ca !== cb) return ca - cb;
                    return a.i - b.i;
                })
                .map(x => x.it);
        }
    };
    return createCopyMenu;
}
