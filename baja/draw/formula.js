function (platetrack) {

    console.log(" loading the formula trable interafdtion ")

    function parseCommaDelimitedString(str) {
        const result = [];
        let current = '';
        let depth = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if (char === '(' || char === '[') {
                depth++;
                current += char;
            } else if (char === ')' || char === ']') {
                depth--;
                current += char;
            } else if (char === ',' && depth === 0) {

                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        if (current.trim() !== '') {
            result.push(current.trim());
        }

        return result;
    }

    let hd = {
        startX: null,
        startY: null,
        currentX: null,
        currentY: null,
        isDrawing: true,

        id: 'override-draw-formula-table',

        draw: (grid, ctx) => {
            if (hd.startX !== null && hd.startY !== null) {
                const rectWidth = hd.currentX - hd.startX;
                const rectHeight = hd.currentY - hd.startY
                ctx.fillStyle = 'rgba(10,10,200,0.4)';
                ctx.fillRect(hd.startX, hd.startY, rectWidth, rectHeight);
            }
        },
        keydown: (event) => {
            if (event.key === 'Enter') {
                console.log('Enter key pressed');
            } else {
            }
        },
        mouseDownListener: async (x, y) => {
            hd.startX = x;
            hd.startY = y;
            hd.currentX = x;
            hd.currentY = y;
        },

        mouseMoveListener: (x, y) => {
            if (hd.isDrawing) {
                hd.currentX = x;
                hd.currentY = y;
            }
        },

        mouseUpListener: async (x, y) => {

            if (hd.isDrawing) {
                hd.isDrawing = false;
                let GenericWell = await exec('baja/plate/well')
                let Plate = await exec('baja/plate/plate.js');
                let AnimateGrid = await exec('flexigraph/animate-it.js')

                let ref = null;
                let e = {
                    height: '500px',
                    editorOptions: {
                        language: 'bajabio',
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
                            'label': ' Create table  ', 'color': 'black', action: (async () => {
                                let activeContent = ref.getEditorText();
                                const rectWidth = hd.currentX - hd.startX;
                                const rectHeight = hd.currentY - hd.startY
                                activeContent = activeContent.trim()
                                let columns = parseCommaDelimitedString(activeContent)
                                let dcol = []

                                if (columns.length > 0) {
                                    let maxy = 0;
                                    for (let c of columns) {
                                        console.log('debubg');
                                        let v = await exec('baja/plate/ops/frun-fun.js', c, platetrack);
                                        let rs = v['results']
                                        if (rs.length > maxy) {
                                            maxy = rs.length
                                        }
                                        dcol.push(v);
                                    }

                                    columnIndex = 0;
                                    let plate = new Plate(generateNautName(), columns.length, maxy);
                                    plate.plateType = 'data'
                                    plate.completeNullValues();
                                    let index = 0;
                                    for (let x of dcol) {
                                        let r = x['results']
                                        index = 0;

                                        for (let i of r) {
                                            plate.setWellValue(columnIndex, index, i)
                                            index++;
                                        }
                                        columnIndex++;
                                    }
                                    columnIndex = 0;
                                    for (let x of dcol) {
                                        let r = x['results']
                                        index = 0;

                                        for (let i of r) {
                                            plate.setWellType(columnIndex, index, i)
                                            index++;
                                        }
                                        columnIndex++;

                                    }
                                    plate.grid.width = platetrack.grid.worldWidth(rectWidth);
                                    plate.grid.height = platetrack.grid.worldHeight(rectHeight);
                                    plate.grid.xi = platetrack.grid.Xwc(x - rectWidth);
                                    plate.grid.yi = platetrack.grid.Ywc(y);
                                    platetrack.root.push(plate)

                                } else {
                                    console.log('debubg');
                                    let v = await exec('baja/plate/ops/frun-fun.js', activeContent.trim(), platetrack);
                                    let r = v['results']
                                    let t = v['tags']
                                    let plate = new Plate(generateNautName(), 1, r.length);
                                    plate.plateType = 'data'
                                    plate.completeNullValues();
                                    let index = 0;
                                    for (let i of r) {
                                        plate.setWellValue(0, index, i)
                                        index++;
                                    }
                                    index = 0;
                                    for (let i of t) {
                                        plate.setWellType(0, index, i)
                                        index++;
                                    }
                                    plate.grid.width = platetrack.grid.worldWidth(rectWidth);
                                    plate.grid.height = platetrack.grid.worldHeight(rectHeight);
                                    plate.grid.xi = platetrack.grid.Xwc(x - rectWidth);
                                    plate.grid.yi = platetrack.grid.Ywc(y);
                                    platetrack.root.push(plate)
                                }
                            }),
                        },
                        {
                            'label': 'Close', 'color': 'red', 'action': (() => {

                                if (platetrack.selectedPlate) {
                                    if (platetrack.selectedPlate.clk_drag) {
                                        platetrack.selectedPlate.clk_drag(platetrack)
                                    }
                                } else
                                    platetrack.wb(null)
                                ref.hideEditor();
                            }),
                        },
                    ]
                }
                console.log('debubg');
                ref = platetrack.showTextEditor(e);
            }
        },

        close: () => {
        },
    };
    platetrack.wb(hd)

}
