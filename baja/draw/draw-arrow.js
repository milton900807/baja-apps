function (platetrack, formula) {

    let color = 'rgba(30,30,100,0.4)';
    let cursorPos = 0;
    let text = ''

    let hd = {

        startX: null,
        startY: null,
        currentX: null,
        currentY: null,
        isDrawing: true,
        priority: true,

        id: 'override-arrow-draw',

        draw: (grid, ctx) => {
            if (hd.startX !== null && hd.startY !== null) {

                hd.drawArrow(ctx, hd.startX, hd.startY, hd.currentX, hd.currentY, {
                    color: color,
                    lineWidth: 15,
                    headSize: 25
                });

            }
        },
        drawArrow: (ctx, startX, startY, endX, endY, options = {}) => {
            const {
                color = "black",
                lineWidth = 2,
                headSize = 10
            } = options;

            const angle = Math.atan2(endY - startY, endX - startX);

            const headLengthX = headSize * Math.cos(angle);
            const headLengthY = headSize * Math.sin(angle);

            const lineEndX = endX - headLengthX;
            const lineEndY = endY - headLengthY;

            ctx.save();
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.fillStyle = color;
            ctx.lineWidth = lineWidth;

            ctx.moveTo(startX, startY);
            ctx.lineTo(lineEndX, lineEndY);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(endX, endY);
            ctx.lineTo(
                endX - headSize * Math.cos(angle - Math.PI / 6),
                endY - headSize * Math.sin(angle - Math.PI / 6)
            );
            ctx.lineTo(
                endX - headSize * Math.cos(angle + Math.PI / 6),
                endY - headSize * Math.sin(angle + Math.PI / 6)
            );
            ctx.lineTo(endX, endY);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
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
                                let Arrow = await exec('flexigraph/shapes/arrow.js');
                                let Glyph = await exec('baja/draw/glyph.js');

                                let arrow = new Arrow(platetrack.grid.Xwc(hd.startX), platetrack.grid.Ywc(hd.startY),
                                    platetrack.grid.Xwc(hd.currentX), platetrack.grid.Ywc(hd.currentY), color);
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
            }

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
}
