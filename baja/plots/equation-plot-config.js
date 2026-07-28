function (pm) {

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

    let __objs = []
    __objs.push({
        name: 'standard_curve'
    })
    for (let r of pm.plateTrack.root) {
        __objs.push(JSON.parse(JSON.stringify(r)))
    }

    let c1 = {
        wid: 'card',
        data: {
            cards: [
                [

                    {
                        'width': '100%',
                        'component':
                        {
                            wid: 'text-editor',
                            refCallback: innerComponentCallback__,
                            componentRef: 'bottomPanel',
                            data: {
                                height: '500px',
                                code: ` --
                                `,
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
                                objects: __objs,
                                keybinding: {
                                    'Ctrl+Enter': createIonFunction((content, lineNumber, selectionLines, col) => {

                                    })
                                },
                            }
                        }
                    },
                    {
                        'title': null, 'body': ``,
                        'width': '100%',
                        'component':
                        {
                            wid: 'button',
                            componentRef: 'bottomPanel2',
                            data: [
                                {
                                    'label': 'Close', ionfunction: createIonFunction(() => {
                                        CurrentLayout.reset("mainPanel")
                                    }), disableAfterClick: false
                                }, {
                                    'label': 'Create plot', ionfunction: createIonFunction(async () => {
                                        debuggerl

                                        let allScatterData = {
                                            points: []
                                        };

                                        let Barchart = await exec('flexigraph/plot')
                                        let name = new_plate_panel.get('Name')
                                        let code = editor.getContent();
                                        let cdic = parseInput(code);
                                        let xvalues_expression = cdic['x']
                                        let yvalues_expression = cdic['y']

                                        let xvalues = await exec('baja/plate/ops/frun-fun', xvalues_expression, pm.plateTrack);
                                        let yvalues = await exec('baja/plate/ops/frun-fun', yvalues_expression, pm.plateTrack);
                                        let pt = []
                                        let i = 0;
                                        for (let xv of xvalues.results) {
                                            let yv = yvalues.results[i++]
                                            allScatterData.points.push({
                                                x: xv,
                                                y: yv,
                                                name: `${yv}`,
                                                color: 'black'
                                            })
                                        }
                                        showModal({
                                            wid: 'json',
                                            data: JSON.stringify(allScatterData.points)
                                        })
                                        let xposition = 1
                                        let percent = 0.2;
                                        let plot = new Barchart(allScatterData)
                                        plot.x_axis_label = ''
                                        plot.y_axis_label = ''

                                        plot.lineColor = 'blue';
                                        plot.pointColor = 'red';
                                        plot.errorBarColor = 'gray';
                                        plot.w = 1;
                                        plot.h = 1;
                                        plot.x = 1;
                                        plot.y = 1;
                                        plot.fitScaleToData = true;
                                        plot.name = name;
                                        plot.type = 'barchart'
                                        pm.plateTrack.resetState()
                                        pm.plateTrack.setPlot(plot);
                                        setTimeout(() => {
                                            CurrentLayout.reset('mainPanel')

                                        }, 100)
                                    }), disableAfterClick: false
                                }

                            ]
                        }
                    },
                ]]
        }
    }

    let plateName = {
        wid: 'card',
        data: {
            'style.padding-left': '5px',
            'style.padding-top': '1px',
            cards: [
                [
                    {
                        'width': '85%',
                        'body': ``,
                        'component':
                        {
                            wid: 'input-param-items',
                            refCallback: __nameHook___,
                            data: {
                                'input_labels': ['Name'],
                            }
                        },

                    },
                    {
                        'width': '85%',
                        'body': ``,
                        'component': c1
                    }
                ],

            ]
        }
    }
    CurrentLayout.clearComponent('mainPanel')
    CurrentLayout.setComponent('mainPanel', plateName);

}
