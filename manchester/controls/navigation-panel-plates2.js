function (plate_graph, selectedPlate, selectedPoint) {
    return new Promise(async (resolve, reject) => {
        const pt = plate_graph.plateTrack;
        // Live co-editing: a Share menu on every menubar this panel builds, whatever is
        // selected, so it is always one click away in Analytics.
        // Menus the hosting app hands over (Analytics: Build and Draw), shown ahead of Share.
        const appMenus = () => {
            try {
                const f = plate_graph.__appMenus;
                const list = typeof f === "function" ? f() : f;
                return Array.isArray(list) ? list : [];
            } catch (e) { return []; }
        };
        // The menubar shows ICONS, not spelled-out labels: every top-level menu becomes an
        // icon and its label survives as the tooltip. On a phone the bar is also split in
        // two, stacked: the app menus (File, Build, Draw, Share) on the first, the context
        // menus for the selected table or point and the tool buttons on the second. The
        // command input stays on the first bar only (a bar without `cmd` has none).
        const MOBILE_ICONS = { 'file': 'folder_open', 'build': 'bar_chart', 'draw': 'draw', 'share': 'share', 'main menu': 'menu' };
        const iconFor = (m) => {
            const l = ('' + (m.label || '')).trim().toLowerCase();
            if (MOBILE_ICONS[l]) return MOBILE_ICONS[l];
            if (m.__ctx === 'point') return 'place';
            if (m.__ctx === 'table') return 'table_chart';
            return 'more_horiz';
        };
        const finishMenubar = (menuItm) => {
            try {
                const mobile = (typeof isMobile === 'function') && isMobile();
                const data = menuItm && menuItm.data ? menuItm.data : null;
                const menus = data && Array.isArray(data.menus) ? data.menus : null;
                if (!menus || !menus.length) return menuItm;
                const APP = new Set(['file', 'build', 'draw', 'share', 'main menu']);
                const first = [], second = [];
                for (const m of menus) {
                    if (!m) continue;
                    const l = ('' + (m.label || '')).trim().toLowerCase();
                    // An items ARRAY makes it a menu, filled or not: Build's library is a live
                    // array that is still empty when the first menubar is built, and judged
                    // by length it came out as a text button reading "Build".
                    const hasItems = Array.isArray(m.items);
                    if (hasItems) {
                        const mm = Object.assign({}, m, { icon: m.icon || iconFor(m), tooltip: m.tooltip || m.label || '', color: m.color || '#ffffff' });
                        delete mm.label;
                        (APP.has(l) ? first : second).push(mm);
                    } else {
                        // leaf buttons (the selection tools) go on the second bar
                        second.push(m);
                    }
                }
                if (!mobile || !second.length) { data.menus = first.concat(second); return menuItm; }
                const bar1 = Object.assign({}, menuItm, { data: Object.assign({}, data, { menus: first }) });
                const d2 = Object.assign({}, data, { menus: second });
                delete d2.cmd; delete d2.placeholder; delete d2.text; delete d2.txtListener; delete d2.toolLookup;
                const bar2 = { wid: 'menu', data: d2 };
                return {
                    wid: 'card',
                    data: { cards: [[{ title: '', component: bar1 }, { title: '', component: bar2 }]] }
                };
            } catch (e) { return menuItm; }
        };
        // File: the main menu's items (New, Open, Import, Save as, ...), first on every
        // menubar so it sits left of Build the way it does in the editor. `items` is filled
        // further down; the arrow reads it when a menubar is built, so it is complete then.
        const fileMenu = () => (Array.isArray(items) && items.length) ? [{ label: 'File', items: items }] : [];
        const shareMenu = () => [{
            label: 'Share',
            items: [
                {
                    label: 'Shared documents…', ionfunction: createIonFunction(async () => {
                        await exec('baja/plate/collab/shared-documents.js', pt, CurrentLayout.getStashed('graph'), plate_graph)
                    })
                },
                {
                    label: 'Share for co-editing…', ionfunction: createIonFunction(async () => {
                        await exec('baja/plate/collab/share-for-coediting.js', pt, CurrentLayout.getStashed('graph'), plate_graph)
                    })
                },
                {
                    label: 'Copy co-editing link', ionfunction: createIonFunction(async () => {
                        const url = pt.__collabShareUrl;
                        if (!url) {
                            pt.setMessage('Share the document with someone first; the link is created then.', 1);
                            await exec('baja/plate/collab/share-for-coediting.js', pt, CurrentLayout.getStashed('graph'), plate_graph);
                            return;
                        }
                        try { await navigator.clipboard.writeText(url); pt.setMessage('Link copied: ' + url, 2); }
                        catch (e) { pt.setMessage(url, 1); }
                    })
                },
                {
                    label: 'Save shared document', ionfunction: createIonFunction(async () => {
                        if (!(pt.__collab && pt.__collabDoc)) { pt.setMessage('This document is not shared yet. Use Share for co-editing first.', 1); return; }
                        try { await pt.__collab.save(CurrentLayout.getStashed('graph')); }
                        catch (e) { pt.setMessage('Could not save the shared document: ' + (e && e.message ? e.message : e), 1); }
                    })
                },
                {
                    label: 'Who has access…', ionfunction: createIonFunction(async () => {
                        await exec('baja/plate/collab/share-for-coediting.js', pt, CurrentLayout.getStashed('graph'), plate_graph)
                    })
                }
            ]
        }];



        const pm = {
            plateTrack: plate_graph.plateTrack
        }
        let __lastNavTxt = '';   // the formula text the go-to menu was last shown for


        const MSGraph = await exec('lib/msgraph.js')

        // (a load of manchester/controls/bna-menu.js used to sit here: the module does not
        // exist, the request 404'd on every build of this panel, and its result was unused)

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


        const items = []
        if (!MSGraph.isLoggedIn()) {
            items.unshift({
                'label': 'Login', click: async () => {

                    login();

                }
            })
        } else {




            items.push({
                'label': 'New...', 'ionfunction': createIonFunction(async () => {
                    let confirm = await exec('baja/lib/confirm.js', 'Are you sure you want to delete all and start over?', async () => {
                        pm.plateTrack.reset('/app/cpd/baja-analytics');

                        // Rebuild the menubar from the REAL plate manager, not the local
                        // { plateTrack } stand-in: the Build and Draw menus hang off it
                        // (plate_graph.__appMenus) and vanished after New when the stand-in
                        // was handed over instead.
                        let button_canvas2 = await exec('manchester/controls/navigation-panel-plates2.js', plate_graph, null)
                        CurrentLayout.setComponent('selectedPanel', button_canvas2)
                    })
                    showModal(confirm)
                })
            })
            items.push({
                label: 'Open',
                click: async (xwc, ywc) => {

                    await openSaveScreen()
                }
            })



            items.push({
                label: 'Import...',
                click: async (xwc, ywc) => {

                    await importSaveScreen()
                }
            })



            items.push({
                'label': 'Copy All', 'ionfunction': createIonFunction(async () => {
                    const currentstate = await pm.plateTrack.capturePlateState();
                    try {
                        navigator.clipboard.writeText(currentstate).then(() => {
                            console.log("Object copied to clipboard!");
                            pm.plateTrack.setMessage(" Copied ")
                        }).catch(err => {
                            console.error("Failed to copy object to clipboard: ", err);
                        });
                        console.log('JSON plate state written to clipboard as plain text.');
                    } catch (err) {
                        console.error('Failed to write JSON plate state to clipboard:', err);
                    }

                })
            })



            items.push({
                label: 'Save as',
                click: async (xwc, ywc) => {

                    await saveAsSaveScreen()
                }
            })

        }
        items.push(
            {
                label: 'Publish', click: (async () => {
                    try {
                        setTimeout(async () => {
                            const plateTrack__ = pm.plateTrack;
                            let Plate = await exec('baja/plate/plate.js');
                            let attr_window = ''
                            let va = await prompt("Publish name: ", ["Name"], { "Name": attr_window }, 500, 300)
                            let HM = await exec('baja/history/HM')

                            let m = va['Name']
                            let plate = new Plate(m, 1, 1);
                            plate.plateType = 'package'
                            plate.completeNullValues();
                            let index = 0;

                            plate.setWellValue(0, index, m)
                            const stringData = compressbinaryData(compressString(HM(plateTrack__)))
                            plateTrack__.reset();
                            const rectWidth = plateTrack__.grid.worldWidth(200);
                            const rectHeight = plateTrack__.grid.worldHeight(100);

                            plate.wells[0][0].properties['package'] = stringData;
                            plate.setWellType(0, index, 'PACKAGE')
                            plate.grid.width = (rectWidth);
                            plate.grid.height = (rectHeight);
                            plate.grid.xi = (plateTrack__.grid.Xwc(plateTrack__.grid.width / 2) - rectWidth);
                            plate.grid.yi = plateTrack__.grid.Ywc(plateTrack__.grid.height / 2);
                            setTimeout(() => {
                                plateTrack__.root.push(plate);
                                pm.plateTrack.zoomouttoFit()
                                pm.plateTrack.zoomintoplate(plate)
                            }, 1000);

                        }, 100)
                    } catch (exception) { }

                })
            })



        items.push({
            'label': 'Product Assumptions', 'ionfunction': createIonFunction(async () => {
                const plate_graph = pm;
                const pt = pm.plateTrack;
                let sequenceTextEditor;
                let descHook = createIonFunction((p) => {
                    sequenceTextEditor = p;
                });
                const txt = 'create a rat cage for pharma safety studies that has video cameras and peizo floor for tracking gate and an accelermoter for tracking vibrations ';
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
                                                Write a paragraph that describes the project:
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
                                                        plate_graph.plateTrack.setMessage("Generating Assumptions...", 5)

                                                        let interval = null;
                                                        let em = new EngineMonitor((msg) => {
                                                            plate_graph.plateTrack.updateSprite(msg)
                                                        });
                                                        em.addProgressListener(async (v) => {
                                                            if (v >= 100) {
                                                            }
                                                        })
                                                        let content = sequenceTextEditor.getContent();
                                                        let model = await exec('py/openai/assumptions-product.py', em, content)

                                                        exec('baja/draw/data-model-to-tables-gpt', plate_graph.plateTrack, model).then(async r => {
                                                            plate_graph.plateTrack.setMessage(null)
                                                            plate_graph.plateTrack.setMessage("These are the Assumptions! You can edit/add these.", 1)
                                                            setTimeout(async () => {

                                                                // let t = plate_graph.plateTrack.getTableByName('Assumptions')
                                                                // let ts = t.toValueFormulaJSON()

                                                                plate_graph.plateTrack.updateCalculations();
                                                                plate_graph.plateTrack.killSprite()
                                                            }, 3000)
                                                            plate_graph.plateTrack.___formula_integrity_report = model;
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

            })
        })


        items.push(

            {
                label: 'Themes & Backgrounds', click: (async () => {
                    const scenes = await exec('baja/plate/plate-track-backgrounds')
                    const names = Object.keys(scenes).filter(name => name !== '');

                    names.push('Close')
                    let t = {
                        wid: 'selection-list',
                        data: {
                            single_selection: true,
                            show_button: false,
                            singleSelect: true,
                            listItems: names,
                            button_function: createIonFunction(async (items) => {
                                let selectedLabel = items[0];
                                pm.plateTrack.background_function = scenes[selectedLabel]
                                CurrentLayout.reset('mainPanel')
                                hideAllModal();

                            })
                        }
                    };

                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', t);

                })
            }
        )


        items.push(
            {
                label: 'Display Preferences', click: (async () => {

                    const names = [
                    ]
                    let targetObject = pm.plateTrack;

                    Object.keys(targetObject).forEach(key => {
                        if (typeof targetObject[key] === 'boolean' && key.startsWith('attr__')) {
                            const label = key.replace(/^attr__/i, '').replace(/([A-Z])/g, ' $1').toLowerCase();
                            const formattedLabel = label.charAt(0).toUpperCase() + label.slice(1);
                            const actionLabel = targetObject[key] ? `Disable ${formattedLabel}` : `Enable ${formattedLabel}`;
                            names.push({ key, label: actionLabel });
                        }
                    });

                    names.push({
                        "label": "Close", "click": () => {
                            CurrentLayout.reset('mainPanel')
                            hideAllModal();
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
                                CurrentLayout.reset('mainPanel')
                                hideAllModal();

                            })
                        }
                    };

                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', t);

                })
            })



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

            let m = await selectedPlate.getContextMenuItems(plate_graph.plateTrack);

            // plate_graph.plateTrack.setOptionsMenu(m)

            const execCMD = async (str) => {

                if (str.startsWith('=')) {
                }

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
                    if (selectedPlate.formula[wr]) {

                        selectedPlate.formula[wr]
                    }
                } else if (selected_wells.length === 1) {

                    tmc = selected_wells[0].value
                    panel.setText(tmc)
                }

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

                                if (selectedPlate.plateType) {
                                    plate_graph.plateTrack.removePlate(selectedPlate)

                                } else {
                                    plate_graph.plateTrack.removeGlyphs([selectedPlate])

                                }

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
                    // formula completions (tables, then each table's row labels after "[") from the start
                    try { ref.setCommands(plate_graph.plateTrack.getFormulaCompletions()); } catch (e) { }

                })

                plate_graph.plateTrack.set___selected_well_listener((well) => {
                    let selected_wells = Array.isArray(well) ? well : [well];
                    let wr = selectedPlate.getWellRange(selected_wells)
                    if (!panel)
                        return;
                    if (selected_wells.length === 1) {
                        if (selectedPlate.formula[wr]) {
                            const tmc = selectedPlate.formula[wr]
                            if (!panel.caretInWindow)
                                panel.setText('=' + tmc)
                        }
                        else {

                            const tmc = (well[0].value ?? '');
                            if (!panel.caretInWindow)
                                panel.setText(tmc);

                        }
                    } else if (selected_wells.length > 1) {
                        if (selectedPlate.formula[wr]) {
                            const tmc = selectedPlate.formula[wr];
                            if (!panel.caretInWindow)
                                panel.setText('=' + tmc)
                        } else {
                            const values = well.map(w => w.value ?? '').join(',');
                            const tmc = values;
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
                            txtListener: createIonFunction((txt) => {
                                // A formula in the field (=Table[Label]…): a menu that navigates to
                                // each table and row it references, one item per reference, shown
                                // when the field is clicked into or a reference is just completed
                                // (the text ends with "]"); typing on past it brings the completion
                                // menus below back.
                                try {
                                    const t = ('' + (txt || '')).trim();
                                    if (t.endsWith(']') && t !== __lastNavTxt) {
                                        const refs = [];
                                        const re = /([A-Za-z_][\w.-]*)\s*\[\s*([A-Za-z_]\w*)\s*\]/g;
                                        let mm;
                                        while ((mm = re.exec(t))) {
                                            const tb = pt.getTableByName(mm[1]);
                                            if (tb && !refs.some(r => r.table === mm[1] && r.label === mm[2])) refs.push({ table: mm[1], label: mm[2], tb });
                                        }
                                        if (refs.length) {
                                            __lastNavTxt = t;
                                            const goTo = async (r) => {
                                                try {
                                                    if (pt.__maximized && pt.exitMaximize) pt.exitMaximize();
                                                    try { pt.wb(null); } catch (e) { }
                                                    for (const pl of (pt.root || [])) { try { if (pl.deselectAll) pl.deselectAll(); } catch (e) { } }
                                                    pt.setSelected(r.tb);
                                                    // the row: every cell of it lit, the value cell current
                                                    const col0 = r.tb.wells[0] || [];
                                                    let row = -1;
                                                    for (let i = 1; i < col0.length; i++) if (col0[i] && ('' + col0[i].value).trim() === r.label) { row = i; break; }
                                                    if (row >= 0) {
                                                        for (let c = 0; c < r.tb.wells.length; c++) { const w = r.tb.wells[c] && r.tb.wells[c][row]; if (w) { try { w.selectIt(); } catch (e) { w.select = true; } } }
                                                        const v = r.tb.wells[1] && r.tb.wells[1][row];
                                                        if (v) pt.selected_well = v;
                                                    }
                                                    if (pt.zoomToFitTable) await pt.zoomToFitTable(r.tb); else await pt.zoomintoplate(r.tb);
                                                    pt.setMessage(row >= 0 ? (r.table + ' row ' + r.label) : (r.table + ': no row named ' + r.label), 2);
                                                } catch (e) { console.warn('go to reference', e); }
                                            };
                                            // The application's menu look: a navy title band, white body,
                                            // one column, navy text; placed under the toolbar, not centred
                                            // over the canvas in three columns as the generic showMenu does.
                                            const nav = refs.map(r => ({ label: r.table + '  \u203A  ' + r.label, click: () => { goTo(r); }, fg: '#0a2540' }));
                                            try {
                                                pt.grid.rescale();
                                                const m = new Menu(nav, pt.grid.Xwc(Math.max(12, pt.grid.width / 2 - 150)), pt.grid.Ywc(64), 'rgba(255,255,255,0.98)', '#0a2540', 1);
                                                m.title = refs.length === 1 ? 'Go to the referenced row' : 'Go to a referenced row';
                                                m.menu_width = 300;
                                                pt.menu = m; pt.menu_vis = true;
                                                try { pt.wb(null); } catch (e) { }
                                            } catch (e) { pt.showMenu(nav); }
                                            return;
                                        }
                                    }
                                } catch (e) { }
                                const triggers = ['>=', '<=', '!=', '&&', '||', '=', '>', '<', '[', ']', '(', ')'];
                                let currentword = txt;
                                let lastTriggerIndex = -1;
                                let lastTrigger = '';
                                if (txt.lastIndexOf('[') > 0) {
                                    const index = txt.lastIndexOf('[');
                                    let tableName = txt.slice(index + 1);
                                    let lastTriggerIndex = -1;
                                    for (const trigger of triggers) {
                                        const tIndex = txt.lastIndexOf(trigger, index);
                                        if (tIndex > lastTriggerIndex && tIndex < index) {
                                            lastTriggerIndex = tIndex;
                                        }
                                    }
                                    const start =
                                        lastTriggerIndex !== -1
                                            ? lastTriggerIndex + 1
                                            : index + 1;

                                    tableName = txt.slice(start, index).trim();
                                    let table = pt.getTableByName(tableName.trim());
                                    if (table !== null) {
                                        let columns = table.getColumnNames();
                                        let menuitems = []
                                        let commands = []
                                        for (let c of columns) {
                                            c = c.trim();
                                            commands.push(c)
                                            menuitems.push({
                                                'label': c, click: () => {
                                                    let insertion = tableName + '.' + c;
                                                    let newText = txt.slice(0, index) + insertion + txt.slice(index);
                                                    panel.setText(newText);
                                                }
                                            })

                                        }
                                        panel.setCommands(commands);
                                        pt.showMenu(menuitems)


                                    } else {



                                        let items = pt.getTablesAndTagNames();
                                        let filtered = items.filter(i =>
                                            i.toLowerCase().includes(currentword.toLowerCase())
                                        );
                                        let menuitems = []
                                        for (let f of filtered) {
                                            f = f.trim();
                                            menuitems.push({
                                                'label': f, click: () => {
                                                    panel.setText(txt.slice(0, index) + f + txt.slice(index));
                                                }
                                            })
                                        }


                                        pt.showMenu(menuitems)

                                    }

                                } else {



                                    for (const trigger of triggers) {
                                        const index = txt.lastIndexOf(trigger);
                                        if (index > lastTriggerIndex) {
                                            lastTriggerIndex = index;
                                            lastTrigger = trigger;
                                        }
                                    }

                                    if (lastTriggerIndex !== -1) {
                                        currentword = txt
                                            .slice(lastTriggerIndex + lastTrigger.length)
                                            .trim();
                                    }
                                    if (currentword.length <= 1) {
                                        return;
                                    }
                                    let items = pt.getTableNames();
                                    let filtered = items.filter(i =>
                                        i.toLowerCase().includes(currentword.toLowerCase())
                                    );
                                    let menuitems = []
                                    let commands = []
                                    for (let f of filtered) {
                                        f = f.trim();
                                        commands.push(f)
                                        menuitems.push({
                                            'label': f, click: () => {

                                                setTimeout(() => {


                                                    panel.setText(txt.slice(0, lastTriggerIndex + lastTrigger.length) + ' ' + f + ' ' + txt.slice(lastTriggerIndex + lastTrigger.length).trim());
                                                }, 3000)
                                            }
                                        })
                                    }
                                    panel.setCommands(commands);
                                    pt.showMenu(menuitems)
                                }
                            }),
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
                                    str = str.trim();

                                    if (str && str.startsWith('=')) {
                                        let wells = selectedPlate.getSelectedWellsInOrder();
                                        let range = selectedPlate.getWellRange(wells)
                                        const formulav = str.substring(1).trim();
                                        selectedPlate.formula[range] = str.substring(1).trim();
                                        let fal1 = await interpreter.executeCommand(`${__name}:`);
                                        let fal = await interpreter.executeCommand(range + '=' + formulav);
                                    } else {
                                        let wells = selectedPlate.getSelectedWellsInOrder();
                                        let range = selectedPlate.getWellRange(wells)
                                        if (selectedPlate.formula[range])
                                            delete selectedPlate.formula[range]
                                        for (let w of wells) {
                                            w.setValue(str)
                                        }
                                    }

                                    panel.setText('');
                                }
                                plate_graph.plateTrack.setMessage('Calculating…', 3)
                                setTimeout(() => {
                                    plate_graph.plateTrack.setMessage('Calculating…', 3)

                                    plate_graph.plateTrack.updateCalculations();
                                }, 100)
                            }),
                            menus: [
                                ...fileMenu(),
                                ...appMenus(),
                                ...shareMenu(),
                                {
                                    'label': `${menu_title}`, 'items': m, __ctx: 'table'
                                },
                            ]
                        }
                    }
                    resolve(finishMenubar(menuItm))
                } else {

                    let mbb = null;
                    const mb = createIon((mmb) => {
                        mbb = mmb;
                        mbb.setCommands(plate_graph.plateTrack.getFormulaCompletions());
                    });
                    const sp = await selectedPlate.getSelectionElementsMenu(selectedPoint, plate_graph.plateTrack);
                    const name = selectedPoint.name;

                    let menuItm = {
                        wid: 'menu',
                        refCallback: mb,     // loads the completions (it was built and never attached)
                        data: {
                            cmd: createIon(async (str, panel) => {
                                execCMD(str);
                            }),
                            menus: [
                                ...fileMenu(),
                                ...appMenus(),
                                ...shareMenu(),
                                {
                                    'label': `${menu_title}`, 'items': m, __ctx: 'table'
                                },
                                {
                                    'label': `${name}`, 'items': sp, __ctx: 'point'
                                },

                            ]
                        }
                    }
                    resolve(finishMenubar(menuItm))
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
                    // formula completions (tables, then each table's row labels after "[") from the start
                    try { ref.setCommands(plate_graph.plateTrack.getFormulaCompletions()); } catch (e) { }
                })

                menu_title = truncated_title;
                if (selectedPlate && !selectedPoint) {
                    let menuItm = {
                        wid: 'menu',
                        refCallback: select_display,
                        data: {
                            text: tmc,
                            menu_button_color: 'alert',
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
                                ...fileMenu(),
                                ...appMenus(),
                                ...shareMenu(),
                                {
                                    'label': `${menu_title}`, 'items': m, __ctx: 'table'
                                },

                            ]
                        }
                    }

                    resolve(finishMenubar(menuItm))

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

                    let mb = null;
                    const mmb = createIon((p) => {
                        mb = p;
                        mb.setCommands(plate_graph.plateTrack.getFormulaCompletions());
                    })

                    const sp = await selectedPlate.getSelectionElementsMenu(selectedPoint, plate_graph.plateTrack);
                    const name = selectedPoint.name;
                    let menuItm = {
                        wid: 'menu',
                        refCallback: mb,     // loads the completions (it was built and never attached)
                        data: {
                            cmd: createIon(async (str, panel) => {
                                execCMD(str);

                            }),
                            menus: [
                                ...fileMenu(),
                                ...appMenus(),
                                ...shareMenu(),
                                {
                                    'label': `${menu_title}`, 'items': m, __ctx: 'table'
                                },
                                {
                                    'label': `${name}`, 'items': sp, __ctx: 'point'
                                },

                            ]
                        }
                    }
                    resolve(finishMenubar(menuItm))
                }
            }
        }
        else if (selectedPlate && !selectedPoint) {

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
                // formula completions (tables, then each table's row labels after "[") from the start
                try { ref.setCommands(plate_graph.plateTrack.getFormulaCompletions()); } catch (e) { }
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
                    label: 'Run caclulations',
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

                        let txt = '';
                        if (selectedPlate && selectedPlate.txt) {
                            txt = selectedPlate.txt;
                        }

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
                                code: txt,
                                buttons: [
                                    {
                                        'label': ' Save  ', 'color': 'black', action: (async () => {
                                            let activeContent = ref.getEditorText();
                                            console.log(' -=== = = = === = = = ')
                                            if (selectedPlate && selectedPlate.txt && selectedPlate.setText) {
                                                selectedPlate.setText(activeContent);
                                                ref.hideEditor();
                                            } else {
                                                let Glyph = await exec('baja/draw/glyph.js');
                                                let g = new Glyph(arrow);
                                                g.setText(activeContent)
                                                platetrack.addGlyph(g);
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
                        ...fileMenu(),
                        ...appMenus(),
                        ...shareMenu(),
                        {
                            'label': `${menu_title}`, 'items': m, __ctx: 'table'
                        },
                    ]
                }
            }
            resolve(finishMenubar(menuItm))
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

                let mb = null;
                const mmb = createIon((p) => {
                    mb = p;
                    mb.setCommands(plate_graph.plateTrack.getDistinctPlateNamesAndGroupKeys());
                })

                const sp = await selectedPlate.getSelectionElementsMenu(selectedPoint, plate_graph.plateTrack);
                const name = selectedPoint.name;
                let menuItm = {
                    wid: 'menu',
                    refCallback: mb,     // loads its command list (it was built and never attached)
                    data: {
                        cmd: createIon(async (str, panel) => {

                            execCMD(str);

                        }),
                        menus: [
                            ...fileMenu(),
                            ...appMenus(),
                            ...shareMenu(),
                            {
                                'label': `${menu_title}`, 'items': m, __ctx: 'table'
                            },
                            {
                                'label': `${name}`, 'items': sp, __ctx: 'point'
                            },

                        ]
                    }
                }
                resolve(finishMenubar(menuItm))
            }
        }

        let user_prompt = '';

        let mm = items;


        if (!MSGraph.isLoggedIn()) {
            mm = [
                {
                    label: 'Draw',
                    click: () => {
                        const graph = plate_graph
                        const items = [
                            {
                                label: 'Timeline', click: (async () => {
                                    await exec('baja/draw/timeline', pm)
                                    graph.setMessageCenter('Click and drag a box... ', 40)

                                })
                            },
                            {
                                label: 'Table', click: (async () => {
                                    await exec('baja/draw/table-selection-list', pm)
                                    graph.setMessageCenter('Click and drag a box... ', 40)

                                })
                            },

                            {
                                label: 'Postit Note', click: (async () => {
                                    await exec('baja/draw/draw-postit.js', pm.plateTrack)

                                    graph.setMessageCenter('Click on the spot you want to post a note... ', 40)

                                })
                            },

                        ]
                        plate_graph.plateTrack.showMenu(items)

                    }
                },

                {
                    'label': 'Ops', click: () => {

                        plate_graph.plateTrack.showMenu(items)
                    }

                }

            ]

        }

        let panel = null;
        let select_display2 = createIonFunction((ref) => {
            panel = ref;
            panel.setCommands(plate_graph.plateTrack.getFormulaCompletions());
        })



        let saveAsSaveScreen = async () => {

            const genegraph_panel_layout = CurrentLayout.getStashed("mainPanel");
            const graph = CurrentLayout.getStashed("graph");
            await exec('manchester/io/save-as-obj-tp.js', graph, genegraph_panel_layout, '/app/cpd/baja-analytics')
        }
        let openSaveScreen = async () => {
            let g = CurrentLayout.getStashed('graph')
            // A plain folder browser over the canvas (the old card collapsed to nothing here).
            await exec('baja/plate/views/open-workbook.js', pt, g, plate_graph)
        }
        let importSaveScreen = async () => {
            let g = CurrentLayout.getStashed('graph')
            let v = await exec('baja/table/io/import-yakro', g)
            showModal(v)
        }


        let menuItm = {
            wid: 'menu',
            refCallback: select_display2,
            data: {
                cmd: createIon(async (str, panel) => {
                    pt.createPlateFromFormula(str)
                }),
                menus: [
                    ...fileMenu(),
                    ...appMenus(),
                    ...shareMenu(),
                    // "Main menu" was these same items; File carries them now. Kept only for
                    // a visitor who is not signed in, whose list is different.
                    ...(MSGraph.isLoggedIn() ? [] : [{ 'label': `Main menu`, 'items': mm }]),

                ],

                menu_button_color: 'accent'

            }
        }
        resolve(finishMenubar(menuItm))

    })
}
