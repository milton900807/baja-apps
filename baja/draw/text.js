function (platetrack, formula, type) {

    let cursorPos = 0;
    let text = ''

    let hd = {
        startX: null,
        startY: null,
        currentX: null,
        currentY: null,
        isDrawing: true,
        id: 'override-draw-text',

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
                if (/^[a-zA-Z0-9!.\-%$*&#@()\[\]{}]$/.test(event.key)) {
                    cursorPos += 1;
                } else {
                    console.log('----Non-alphanumeric key pressed: ' + event.key);
                }
            }
        },
        mouseDownListener: async (x, y) => {
            hd.startX = x;
            hd.startY = y;
            hd.currentX = x;
            hd.currentY = y;
        },

        mouseMoveListener: (x, y) => {
            hd.currentX = x;
            hd.currentY = y;
        },

        mouseUpListener: async (x, y) => {
            if (hd.isDrawing) {
                hd.isDrawing = false;
                platetrack.wb(null)
                let GenericWell = await exec('baja/plate/well')
                let Plate = await exec('baja/plate/plate.js');
                let AnimateGrid = await exec('flexigraph/animate-it.js')
                let ref = null;
                let e = {
                    height: '500px',
                    height: '200px',
                    x: hd.startX,
                    y: hd.startY + 200,
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
                            'label': ' Insert  ', 'color': 'black', action: (async () => {
                                let activeContent = ref.getEditorText();
                                if (activeContent.startsWith('=')) {
                                    formula = true;
                                }

                                if (formula && formula != 'SIMPLE_TEXT') {
                                    const rectWidth = hd.currentX - hd.startX;
                                    const rectHeight = hd.currentY - hd.startY
                                    activeContent = activeContent.substring(1)
                                    let v = await exec('baja/plate/ops/frun-object.js', activeContent.trim(), platetrack);

                                    showModal({
                                        wid: 'json',
                                        data: JSON.stringify(v)
                                    })

                                    let r = v['results']
                                    let t = v['tags']
                                    let plate = new Plate(generateNautName(), 1, r.length);
                                    plate.plateType = 'simple_text'

                                    plate.completeNullValues();
                                    plate.selectAll();
                                    let index = 0;
                                    plate.displayNumbers(false)

                                    let selected_wells = plate.getSelectedWellsInOrder();
                                    for (let io of r) {
                                        let i = io.value;
                                        if (selected_wells[index]) {
                                            if (!isNaN(i)) {
                                                selected_wells[index].setValue(parseFloat(i).toFixed(2))
                                            } else {
                                                selected_wells[index].setValue(i);
                                            }
                                            selected_wells[index].resetGroup(io.group)
                                            if (!selected_wells[index].properties) {
                                                selected_wells[index].properties = {}
                                            }

                                            selected_wells[index].attr__showBorder = false
                                            selected_wells[index].properties['refIDs'] = io.groupIds;
                                            selected_wells[index].skin_type = 'SIMPLE_TEXT';
                                        }
                                        index++;
                                        if (index >= selected_wells.length)
                                            break;
                                    }

                                    plate.grid.width = platetrack.grid.worldWidth(rectWidth);
                                    plate.grid.height = platetrack.grid.worldHeight(rectHeight);
                                    plate.grid.xi = platetrack.grid.Xwc(x - rectWidth);
                                    plate.grid.yi = platetrack.grid.Ywc(y);
                                    platetrack.root.push(plate)
                                } else {

                                    const rectWidth = hd.currentX - hd.startX;
                                    const rectHeight = hd.currentY - hd.startY
                                    let plate = new Plate(generateNautName(), 1, 1);
                                    plate.plateType = type
                                    plate.completeNullValues();
                                    let index = 0;
                                    plate.setWellValue(0, index, activeContent)
                                    plate.setWellType(0, index, type)
                                    plate.hideWellBorders();
                                    plate.wells[0][0].skin_type = 'SIMPLE_TEXT';

                                    function setAttrFalse(obj) {
                                        for (const key in obj) {
                                            if (obj.hasOwnProperty(key) && key.startsWith("attr__")) {
                                                obj[key] = false;
                                            }
                                        }
                                    }
                                    setAttrFalse(plate)
                                    plate.attr__displayMenuButtons = true;
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
                                ref.hideEditor();
                            }),
                        },
                    ]
                }
                ref = platetrack.showTextEditor(e);
            }
        },

        priority: true,

        close: () => {
        },
    };
    platetrack.wb(hd)
    hd.startX = null;
    hd.startY = null;
    hd.currentX = null;
    hd.currentY = null;

}
