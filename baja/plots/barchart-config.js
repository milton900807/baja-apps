function (pm, code) {

    const plotConfig = `x=\ny=\nx-label=\ny-label=\n`

    pm.plateTrack.wb(null)

    function splitTextIntoChunks(text) {

        const splitPattern = /^x=/gm;

        const chunks = text.split(splitPattern)
            .map(chunk => chunk.trim())
            .filter(chunk => chunk.length > 0);

        return chunks.map(chunk => 'x=' + chunk);
    }

    let ref;

    function linearRegression(allScatterData) {
        console.log('debubg');
        const points = allScatterData.points;

        if (points.length === 0) {
            throw new Error("The points array is empty.");
        }

        const x = points.map(point => point.x);
        const y = points.map(point => point.y);

        const n = points.length;

        const sumX = x.reduce((sum, xi) => sum + xi, 0);
        const sumY = y.reduce((sum, yi) => sum + yi, 0);
        const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
        const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
        const meanX = sumX / n;
        const meanY = sumY / n;

        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        const intercept = meanY - slope * meanX;

        const ssTotal = y.reduce((sum, yi) => sum + Math.pow(yi - meanY, 2), 0);
        const ssResidual = points.reduce(
            (sum, point) => sum + Math.pow(point.y - (slope * point.x + intercept), 2),
            0
        );
        const rSquared = 1 - ssResidual / ssTotal;

        return { slope, intercept, rSquared };
    }

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

    let parseInput = (inputString) => {
        const parsedObj = {};
        const lines = inputString.trim().split('\n');
        lines.forEach(line => {
            const [key, value] = line.split('=');
            if (key !== undefined && value !== undefined) {
                parsedObj[key.trim()] = value.trim();
            } else {
                console.warn(`Invalid line format: ${line}`);
            }
        });

        return parsedObj;
    }
    let buildMultiplePlots = async (code, mmx, mmy, mmw, mmh) => {

        let xMatches = splitTextIntoChunks(code.trim())
        if (xMatches.length <= 1) {

            let plot = await buildPlots(code, mmx, mmy, mmw, mmh);
            pm.plateTrack.resetState()
            pm.plateTrack.setPlot(plot);
            return;
        } else if (xMatches.length > 1) {
            let CompositePlot = await exec('flexigraph/composite-plot')
            let composite = new CompositePlot()
            for (let chunk of xMatches) {
                composite.addPlot(await buildPlots(chunk));
            }
            composite.w = mmw;
            composite.h = mmh;
            composite.x = mmx;
            composite.y = mmy;
            pm.plateTrack.resetState()
            pm.plateTrack.setPlot(composite);
            return;

        }

    };
    function analyzePoints(allScatterData) {
        const points = allScatterData.points;

        const xValues = points.map(point => parseFloat(point.x));
        const yValues = points.map(point => parseFloat(point.y));
        const areAllFloats = xValues.every(value => !isNaN(value)) && yValues.every(value => !isNaN(value));

        if (areAllFloats) {

            allScatterData.points = points.map(point => ({
                x: parseFloat(point.x),
                y: parseFloat(point.y)
            }));

            const xmin = Math.min(...xValues);
            const xmax = Math.max(...xValues);

            return { xmin, xmax };
        } else {
            const areAllStrings = points.every(point => typeof point.x === "string");
            if (areAllStrings) {

                const xmin = 0;
                const xmax = points.length;
                return { xmin, xmax, allScatterData };
            } else {
                const xmin = 0;
                const xmax = points.length;
                return { xmin, xmax, allScatterData };

            }
        }
    }

    let buildPlots = async (code, mmx, mmy, mmw, mmh) => {
        let allScatterData = {
            points: []
        };
        let Plot = await exec('flexigraph/plot')
        let p = new Plot(allScatterData)
        p.applyConfig(code, pm.plateTrack);
        p.x = mmx;
        p.y = mmy;
        p.w = mmw;
        p.h = mmh;

        p.config_script.plot = {
            lineColor: 'blue',
            pointColor: 'red',
            errorBarColor: 'gray',
            w: mmw,
            h: mmh,
            x: mmx,
            y: mmy,
            fitScaleToData: true
        };
        return p;

    }

    let cursorPos = 0;

    let hd = {
        startX: null,
        startY: null,
        currentX: null,
        currentY: null,
        isDrawing: true,

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
            if (hd.isDrawing) {
                hd.currentX = x;
                hd.currentY = y;
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
                            buildMultiplePlots(code, startx, starty, rectWidth, rectHeight);
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

        id: 'override-plot'
    };
    pm.plateTrack.wb(hd)
    hd.startX = null;
    hd.startY = null;
    hd.currentX = null;
    hd.currentY = null;

}
