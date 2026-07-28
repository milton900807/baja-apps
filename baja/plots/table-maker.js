function (pm) {

    return new Promise(async (resolve, reject) => {
        let Plate = await exec('baja/plate/plate.js');

        let ch = new Plate(generateNautName(), 1, 1)
        pm.plateTrack.root.push(ch)

        const plotConfig = `x=\ny=\nx-label=\ny-label=\n`

        pm.plateTrack.wb(null)

        let ref;
        function generateColor(percent) {
            percent = Math.max(0, Math.min(100, percent));
            const red = Math.floor((100 - percent) * 255 / 100);
            const green = Math.floor(percent * 255 / 100);
            const color = '#' + componentToHex(red) + '00' + componentToHex(green);
            return color;
        }

        let new_plate_panel;
        let __nameHook___ = createIonFunction((ed) => {
            new_plate_panel = ed;
        });

        let editor;
        let innerComponentCallback__ = createIon((_panel) => {
            editor = _panel;
            if (editor) {
                editor.setContent('')
            }
        })

        let cursorPos = 0;

        let wellHeight = pm.plateTrack.grid.worldHeight(20)
        let wellWidth = pm.plateTrack.grid.worldWidth(120)

        let hd = {
            startX: null,
            startY: null,
            currentX: null,
            currentY: null,
            isDrawing: false,

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
                hd.isDrawing = true;
                hd.startX = x;
                hd.startY = y;
                hd.currentX = x;
                hd.currentY = y;

                ch.grid.xi = pm.plateTrack.grid.Xwc(x)
                ch.grid.yi = pm.plateTrack.grid.Ywc(y)
                ch.grid.width = pm.plateTrack.grid.worldWidth(10);
                ch.grid.height = pm.plateTrack.grid.worldHeight(10);
                ch.grid.rescale();
            },

            mouseMoveListener: (x, y) => {
                if (hd.isDrawing) {
                    hd.currentX = x;
                    hd.currentY = y;
                    ch.grid.width = Math.abs(pm.plateTrack.grid.worldWidth(hd.currentX - hd.startX));
                    ch.grid.height = Math.abs(pm.plateTrack.grid.worldHeight(hd.currentY - hd.startY));
                    ch.grid.yi = pm.plateTrack.grid.Ywc(y);

                    if (wellHeight < 0.01) {
                        wellHeight = 0.19;
                    }
                    if (wellWidth < 0.01) {
                        wellWidth = 0.19;
                    }

                    ch.grid.xmax = (ch.grid.width / wellWidth)
                    ch.grid.ymax = (ch.grid.height / wellHeight)

                    console.log(" y max " + ch.grid.ymax)

                    ch.grid.rescale();
                    ch.completeNullValues();
                }
            },
            mouseUpListener: async (x, y) => {
                if (hd.isDrawing) {
                    const startx = pm.plateTrack.grid.Xwc(hd.startX);
                    const starty = pm.plateTrack.grid.Ywc(hd.startY);
                    const rectWidth = pm.plateTrack.grid.worldWidth(hd.currentX - hd.startX);
                    const rectHeight = pm.plateTrack.grid.worldHeight(hd.currentY - hd.startY);
                    hd.isDrawing = false;
                    let t =
                    {
                        height: '200px',
                        x: hd.startX,
                        y: hd.startY + 200,
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
                            fontSize: 15,
                            automaticLayout: true,
                            padding: {
                                top: 20,
                                bottom: 20,
                                left: 30,
                                right: 30
                            }
                        },
                        objects: pm.plateTrack.root,
                        keybinding: {
                            'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {
                            })
                        },
                        code: plotConfig,
                        buttons: [{
                            'label': 'Create plot', "color": 'blue', action: async () => {
                                let code = ref.getEditorText();
                                pm.plateTrack.wb(null)
                                ref.hideEditor();
                            }
                        },
                        {
                            'label': 'Close', 'color': 'black', "action": () => {
                                ref.hideEditor();
                            }
                        }
                        ]
                    }
                    t.objects = pm.plateTrack.root;
                    pm.plateTrack.wb(null)
                    ref = pm.plateTrack.showTextEditor(t);
                }
            },
            close: () => {
            },

            id: 'override-table'
        };
        pm.plateTrack.wb(hd)
        hd.startX = null;
        hd.startY = null;
        hd.currentX = null;
        hd.currentY = null;
    })

}
