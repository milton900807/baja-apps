function (platetrack, formula) {

    let color = 'rgba(30,30,100,0.4)';
    let cursorPos = 0;
    let text = ''
    return new Promise(async (resolve, reject) => {
        let gArrow = await exec('flexigraph/shapes/postit.js');

        let arrow;
        let hd = {

            startX: null,
            startY: null,
            currentX: null,
            currentY: null,
            isDrawing: true,

            id: 'override-arrow-draw',

            draw: (grid, ctx) => {
                if (arrow) {
                    console.log('debubg');
                    arrow.draw(platetrack.grid, ctx)
                }
            },
            drawArrow: (ctx, startX, startY, endX, endY, options = {}, graph) => {

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
                hd.isDrawing = true;
                hd.startX = x;
                hd.startY = y;
                hd.currentX = x;
                hd.currentY = y;

            },

            mouseMoveListener: (x, y) => {
                if (hd.isDrawing && arrow) {
                    arrow.x = (platetrack.grid.Xwc(x));
                    arrow.y = platetrack.grid.Ywc(y);
                }
                if (!arrow) {
                    arrow = new gArrow(platetrack.grid.Xwc(x), platetrack.grid.Ywc(y),
                        platetrack.grid.Xwc(x), platetrack.grid.Ywc(y), color);
                    arrow.w = platetrack.grid.worldWidth(120)
                    arrow.h = platetrack.grid.worldHeight(120)
                }
            },

            mouseUpListener: async (x, y) => {
                let ref = null;
                hd.isDrawing = false;
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
                            'label': ' Insert  ', 'color': 'black', action: (async () => {
                                console.log('debubg');
                                let activeContent = ref.getEditorText();
                                let Glyph = await exec('baja/draw/glyph.js');

                                arrow.comment = activeContent;

                                let g = new Glyph(arrow);
                                g.setText(activeContent)
                                platetrack.addGlyph(g);
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

            },

            close: () => {
            },
        };
        console.log('debubg');
        platetrack.wb(hd)
        hd.startX = null;
        hd.startY = null;
        hd.currentX = null;
        hd.currentY = null;
        resolve(hd)
    })

}
