function () {

    return new Promise(async (resolve, reject) => {

        function formatTime(x, xMin, xMax, start, end) {

            const totalCanvasRange = xMax - xMin;
            const totalTimeRange = end.getTime() - start.getTime();

            const normalizedX = (x - xMin) / totalCanvasRange;

            const date = new Date(start.getTime() + normalizedX * totalTimeRange);
            return date;
        }
        function timeToX(time, xMin, xMax, start, end) {
            const totalCanvasRange = xMax - xMin;
            const totalTimeRange = end.getTime() - start.getTime();

            const clampedTime = Math.max(start.getTime(), Math.min(time.getTime(), end.getTime()));

            const normalizedTime = (clampedTime - start.getTime()) / totalTimeRange;

            const x = xMin + normalizedTime * totalCanvasRange;
            return x;
        }

        let t = {
            'milestone': (pt, plot, point) => {
                let m = []
                if (pt.mode && pt.mode === 'viewer') {
                    m = [

                        {
                            label: `Color`,
                            click: async (scx, scy) => {
                                pt.clearMenu()

                                let __color = point.color

                                let sequence_input = {
                                    wid: 'card',
                                    "height": "500px",
                                    data: {
                                        "style.padding-top": '1px',
                                        "style.border": '1px',
                                        "style.height": "500px",
                                        cards: [
                                            [
                                                {

                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'card',
                                                        data: {
                                                            cards: [
                                                                [

                                                                    {
                                                                        'width': '100%',
                                                                        'height': "100px",
                                                                        "style.padding-top": '4px',
                                                                        "style.border": '1px',
                                                                        'component':
                                                                        {
                                                                            'wid': 'color-chooser',
                                                                            'width': '100%',

                                                                            "data": {
                                                                                "selectionListener": createIonFunction((_color) => {
                                                                                    __color = _color;
                                                                                })
                                                                            }
                                                                        }
                                                                    },
                                                                ],
                                                            ]
                                                        }
                                                    }
                                                },
                                                {
                                                    'component': {
                                                        wid: 'mt-button', data: {
                                                            buttons: [
                                                                {
                                                                    label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                        hideAllModal();
                                                                        point.color = __color;
                                                                        pt.clearMenu()

                                                                        CurrentLayout.clearComponent('mainPanel')
                                                                        CurrentLayout.reset('mainPanel');

                                                                    })
                                                                },
                                                                {
                                                                    label: 'Close', ionFunction: createIonFunction(async () => {
                                                                        pt.clearMenu()

                                                                        CurrentLayout.clearComponent('mainPanel')
                                                                        CurrentLayout.reset('mainPanel');
                                                                    })
                                                                }
                                                            ]
                                                        }
                                                    }
                                                }
                                            ]]
                                    }
                                }
                                CurrentLayout.clearComponent('mainPanel')
                                CurrentLayout.setComponent('mainPanel', sequence_input);
                            },

                            move: () => {
                            }
                        }

                    ]

                    let descHook = createIonFunction(() => {

                    })

                    m.push(
                        {
                            label: `Abstract`,
                            click: async (scx, scy) => {
                                if (point.abstract) {

                                    let abstract_display = {
                                        wid: 'card',
                                        "height": "500px",
                                        data: {
                                            "style.padding-top": '1px',
                                            "style.border": '1px',
                                            "style.height": "500px",
                                            cards: [
                                                [
                                                    {
                                                        'width': '100%',
                                                        'component': {
                                                            wid: 'html',
                                                            data: `

                                                <H4>
                                              <font color="navy">
                                                              ${point.name}
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
                                                                text: (point.abstract + '\n\n\nAuthors: ' + point.journal + '\n\nAffiliations: ' + point.affiliations + '\n\n\nJournal: ' + point.authors),
                                                                editorOptions: {
                                                                    language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                                    suggestOnTriggerCharacters: false,
                                                                    quickSuggestions: false,
                                                                    parameterHints: { enabled: false },
                                                                    minimap: { enabled: false },
                                                                    fontFamily: "Courier New, monospace",
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
                                                                            pt.setMenu(null)
                                                                            CurrentLayout.reset('mainPanel')

                                                                        })
                                                                    },

                                                                ]

                                                            }
                                                        }
                                                    }
                                                ]]
                                        }
                                    }
                                    CurrentLayout.setComponent('mainPanel', abstract_display)
                                } else {
                                    pt.setMessage("Loading abstract")
                                    let rf = await exec('py/extract/abstract_from_doi.py', point.doi);
                                    infoPrompt(point.name + ':\n' + rf['abstract'], 800, 600)
                                    pt.clearMenu()
                                }
                            },

                            move: () => {
                            }
                        })
                    if (point.authors) {
                        m.push(
                            {
                                label: `Authors`,
                                click: async (scx, scy) => {

                                    infoPrompt(point.authors)
                                    pt.clearMenu()

                                },

                                move: () => {
                                }
                            })
                    }

                } else {

                    m = [
                        {
                            label: `Title`,
                            click: async (scx, scy) => {
                                pt.setMessage(point.name)
                                pt.clearMenu()

                            },

                            move: () => {
                            }
                        }, {
                            label: `Copy`,
                            click: async (scx, scy) => {

                            },

                            move: () => {
                            }
                        },

                        {
                            label: 'Move X&Y',
                            click: async (scx, scy) => {

                                let mvPoints = []
                                for (let point of plot.scatterData.points) {
                                    if (point.isSelected) {
                                        mvPoints.push(point);
                                        point.isHilighted = true;
                                    }
                                }
                                let t = {
                                    id: 'move-points',
                                    mouseMoveListener: null,
                                    mouseUpListener: null,
                                    mouseDownListener: null,
                                    draw: null,
                                    menuManager: null,
                                    priority: true
                                };

                                let dragStartX = 0;
                                let dragStartY = 0;
                                let dragging = false;
                                let kill = false;

                                t.draw = (grid, ctx) => {
                                    for (let p of mvPoints) {
                                        p.point.highlight = true;
                                        p.point.isSelected = true;
                                    }
                                };

                                t.close = () => {
                                };

                                t.mouseDownListener = (x, y) => {
                                    dragStartX = x;
                                    dragStartY = y;
                                    dragging = true;
                                    if (kill) {
                                        pt.wb(null)
                                    }
                                };

                                t.mouseMoveListener = (x, y) => {
                                    if (!dragging)
                                        return;
                                    let dx = x - dragStartX;
                                    let dy = y - dragStartY;
                                    for (let p of mvPoints) {
                                        p.point.highlight = true;
                                        p.point.isSelected = true;

                                        p.point.x += p.grid.worldWidth(dx);
                                        if (p.point.startX != null) {
                                            p.point.startX += p.grid.worldWidth(dx);
                                        }
                                        if (p.point.startY != null) {
                                            p.point.startY += p.grid.worldHeight(dy);
                                        }
                                        p.point.y -= p.grid.worldHeight(dy);
                                        p.point.scy -= (dy);
                                    }
                                    dragStartX = x;
                                    dragStartY = y;
                                };

                                t.mouseUpListener = async (x, y) => {
                                    if (dragging) {
                                        kill = true;
                                    }
                                    dragging = false;
                                };

                                setTimeout(() => {
                                    pt.wb(t);

                                    pt.setMessage(" Click and drag to move the selected points...")
                                    pt.menu = null;
                                    pt.menu_vis = false;
                                }, 200)

                            }
                        },

                        {
                            label: `Move vertical`,
                            click: async (scx, scy) => {
                                let mvPoints = [];
                                point.isSelected = true;
                                mvPoints.push(point);

                                pt.setMessage(" Click and drag on the point you want to move ")

                                let t = {
                                    id: 'move-points',
                                    mouseMoveListener: null,
                                    mouseUpListener: null,
                                    mouseDownListener: null,
                                    draw: null,
                                    menuManager: null,
                                };

                                let dragStartX = 0;
                                let dragStartY = 0;
                                let dragging = false;

                                t.draw = (grid, ctx) => {
                                };

                                t.close = () => {
                                };

                                t.mouseDownListener = (x, y) => {
                                    let mmx = plot.grid.Xwc(x + plot.grid.xi * 2);
                                    let mmy = plot.grid.Ywc(y + plot.grid.yi * 2);
                                    dragStartX = mmx;
                                    dragStartY = mmy;
                                    dragging = true;
                                };

                                t.mouseMoveListener = (x, y) => {

                                    if (dragging) {
                                        let mmx = plot.grid.Xwc(x + plot.grid.xi * 2);
                                        let mmy = plot.grid.Ywc(y + plot.grid.yi * 2);
                                        let dx = mmx - dragStartX;
                                        let dy = mmy - dragStartY;
                                        point.y += dy;
                                        if (point.startY != null) {
                                            point.startY += dy;
                                        }

                                        dragStartX = mmx;
                                        dragStartY = mmy;
                                        pt.grid.rescale();
                                        plot.grid.rescale();
                                    }
                                };

                                t.mouseUpListener = async (x, y) => {
                                    dragging = false;
                                    pt.setMessage(" Set.")
                                    pt.wb(null)
                                };
                                setTimeout(() => {
                                    pt.wb(t);
                                }, 1000);

                            },
                            move: () => {
                            }
                        },

                        {
                            label: `Delete`,
                            click: async (scx, scy) => {
                                let confirm = await exec('baja/lib/confirm.js', 'Remove?', async () => {
                                    plot.removePoint(point)
                                })
                                showModal(confirm)
                                pt.clearMenu()

                            },

                            move: () => {
                            }
                        },
                        {
                            label: `Change time`,
                            click: async (scx, scy) => {
                                let start_date = null;
                                let startTimePanel = null;
                                const startPanel = createIonFunction((hook) => {
                                    startTimePanel = hook;
                                });

                                function formatTime(x, xMin, xMax, start, end) {

                                    const totalCanvasRange = xMax - xMin;
                                    const totalTimeRange = end.getTime() - start.getTime();

                                    const normalizedX = (x - xMin) / totalCanvasRange;

                                    const date = new Date(start.getTime() + normalizedX * totalTimeRange);
                                    return date;
                                }
                                start_date = formatTime(point.x, plot.grid.xmin, plot.grid.xmax, plot.startDate, plot.endDate)

                                let main_layout = {
                                    wid: 'card',
                                    height: '100%',
                                    componentRef: 'mainPanel',
                                    data: {
                                        cards: [
                                            [
                                                {
                                                    'width': '100%',
                                                    'height': '100vh',
                                                    'component': {
                                                        wid: 'html',
                                                        data: `<hr>  New date/time... `
                                                    }
                                                },
                                                {
                                                    'width': '100%',
                                                    'height': '100vh',
                                                    'component': {
                                                        wid: 'calendar-chooser',
                                                        refCallback: startPanel,
                                                        data: {
                                                            date: start_date,
                                                            select: createIonFunction((_date) => {
                                                                start_date = _date;
                                                            })
                                                        }
                                                    }
                                                },

                                                {
                                                    'title': '',
                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'mt-button', data: {
                                                            buttons: [
                                                                {
                                                                    label: 'Yes', ionFunction: createIonFunction(async () => {

                                                                        function timeToX(time, xMin, xMax, start, end) {
                                                                            const totalCanvasRange = xMax - xMin;
                                                                            const totalTimeRange = end.getTime() - start.getTime();

                                                                            const clampedTime = Math.max(start.getTime(), Math.min(time.getTime(), end.getTime()));

                                                                            const normalizedTime = (clampedTime - start.getTime()) / totalTimeRange;

                                                                            const x = xMin + normalizedTime * totalCanvasRange;
                                                                            return x;
                                                                        }

                                                                        let start = new Date(startTimePanel.getValue());
                                                                        point.x = timeToX(start, plot.grid.xmin, plot.grid.xmax, plot.startDate, plot.endDate)
                                                                        point.xsc = null;

                                                                        hideAllModal();
                                                                        setTimeout(() => {
                                                                            CurrentLayout.reset('mainPanel')
                                                                        }, 300)

                                                                    })
                                                                },
                                                                {
                                                                    label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                        hideAllModal();
                                                                        setTimeout(() => {
                                                                            CurrentLayout.reset('mainPanel')
                                                                        }, 300)

                                                                    })
                                                                }
                                                            ]
                                                        }
                                                    }
                                                }

                                            ]]
                                    }
                                }
                                setTimeout(() => {
                                    CurrentLayout.clearComponent('mainPanel')
                                    CurrentLayout.setComponent('mainPanel', main_layout);

                                }, 400)
                            }
                        },
                        {
                            label: `Color`,
                            click: async (scx, scy) => {
                                pt.clearMenu()

                                let __color = point.color

                                let sequence_input = {
                                    wid: 'card',
                                    "height": "500px",
                                    data: {
                                        "style.padding-top": '1px',
                                        "style.border": '1px',
                                        "style.height": "500px",
                                        cards: [
                                            [
                                                {

                                                    'width': '100%',
                                                    'component': {
                                                        wid: 'card',
                                                        data: {
                                                            cards: [
                                                                [

                                                                    {
                                                                        'width': '100%',
                                                                        'height': "100px",
                                                                        "style.padding-top": '4px',
                                                                        "style.border": '1px',
                                                                        'component':
                                                                        {
                                                                            'wid': 'color-chooser',
                                                                            'width': '100%',

                                                                            "data": {
                                                                                "selectionListener": createIonFunction((_color) => {
                                                                                    __color = _color;
                                                                                })
                                                                            }
                                                                        }
                                                                    },
                                                                ],
                                                            ]
                                                        }
                                                    }
                                                },
                                                {
                                                    'component': {
                                                        wid: 'mt-button', data: {
                                                            buttons: [
                                                                {
                                                                    label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                        hideAllModal();
                                                                        point.color = __color;
                                                                        pt.clearMenu()

                                                                        CurrentLayout.clearComponent('mainPanel')
                                                                        CurrentLayout.reset('mainPanel');

                                                                    })
                                                                },
                                                                {
                                                                    label: 'Close', ionFunction: createIonFunction(async () => {
                                                                        pt.clearMenu()

                                                                        CurrentLayout.clearComponent('mainPanel')
                                                                        CurrentLayout.reset('mainPanel');
                                                                    })
                                                                }
                                                            ]
                                                        }
                                                    }
                                                }
                                            ]]
                                    }
                                }
                                CurrentLayout.clearComponent('mainPanel')
                                CurrentLayout.setComponent('mainPanel', sequence_input);
                            },

                            move: () => {
                            }
                        }

                    ]

                    if (point.url) {
                        m.push(

                            {
                                label: 'Link',
                                click: async (scx, scy) => {
                                    const newWindow = window.open(point.url, '_blank');

                                }
                            }

                        )
                    }

                    if (point.abstract) {
                        let descHook = createIonFunction(() => {

                        })
                        m.push(
                            {
                                label: `Abstract`,
                                click: async (scx, scy) => {
                                    if (point.abstract) {

                                        let abstract_display = {
                                            wid: 'card',
                                            "height": "500px",
                                            data: {
                                                "style.padding-top": '1px',
                                                "style.border": '1px',
                                                "style.height": "500px",
                                                cards: [
                                                    [
                                                        {
                                                            'width': '100%',
                                                            'component': {
                                                                wid: 'html',
                                                                data: `

                                                <H4>
                                              <font color="navy">
                                                              ${point.name}
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
                                                                    text: (point.abstract + '\n\n\nAuthors: ' + point.journal + '\n\nAffiliations: ' + point.affiliations + '\n\n\nJournal: ' + point.authors),
                                                                    editorOptions: {
                                                                        language: 'text', automaticLayout: true, fontSize: 24, lineNumbers: "off",
                                                                        suggestOnTriggerCharacters: false,
                                                                        quickSuggestions: false,
                                                                        parameterHints: { enabled: false },
                                                                        minimap: { enabled: false },
                                                                        fontFamily: "Courier New, monospace",
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
                                                                            label: 'Build', ionFunction: createIonFunction(async () => {
                                                                                pm.plateTrack.setMessage("AI mode...", 5)

                                                                                hideAllModal();
                                                                                CurrentLayout.reset('mainPanel')

                                                                                let interval = null;
                                                                                let em = new EngineMonitor((msg) => {
                                                                                    pm.plateTrack.updateSprite(msg)
                                                                                });
                                                                                em.addProgressListener(async (v) => {
                                                                                    if (v >= 100) {
                                                                                    }
                                                                                })
                                                                                let content = sequenceTextEditor.getContent();
                                                                                user_prompt = content;
                                                                                pm.plateTrack.setMessage("Building model", 5)
                                                                                let model = await exec('py/openai/timeline.py', em, content)
                                                                                pm.plateTrack.killSprite()
                                                                                let MPlot = await exec('flexigraph/plot.js')
                                                                                const plot = new MPlot({ points: model.intervals });
                                                                                plot.startDate = new Date(model.window.start);
                                                                                plot.endDate = new Date(model.window.end);
                                                                                const xMin = Math.min(...model.intervals.map(p => p.startX));
                                                                                const xMax = Math.max(...model.intervals.map(p => p.x));
                                                                                plot.grid.zoom(xMin, xMax, 0, 1);
                                                                                plot.w = 800;
                                                                                plot.h = 300;
                                                                                plot.type = 'timeline'
                                                                                plot.name = 'test-timeline';
                                                                                plot.x_axis_label = "Time (Years)";
                                                                                plot.y_axis_label = "Sample Metric";
                                                                                plot.fitScaleToData = false;
                                                                                plot.grid.rescale();
                                                                                pm.plateTrack.setPlotCenter(plot)

                                                                            })
                                                                        }

                                                                    ]

                                                                }
                                                            }
                                                        }
                                                    ]]
                                            }
                                        }
                                        CurrentLayout.setComponent('mainPanel', abstract_display)
                                    } else {
                                        pt.setMessage("Loading abstract")
                                        let rf = await exec('py/extract/abstract_from_doi.py', point.doi);
                                        infoPrompt(point.name + ':\n' + rf['abstract'], 800, 600)
                                        pt.clearMenu()
                                    }
                                },

                                move: () => {
                                }
                            })
                        if (point.authors) {
                            m.push(
                                {
                                    label: `Authors`,
                                    click: async (scx, scy) => {

                                        infoPrompt(point.authors)
                                        pt.clearMenu()

                                    },

                                    move: () => {
                                    }
                                })
                        }
                    }
                }
                return m;

            },
            'interval': (pt, plot, point, scx__, scy__) => {

                point.isSelected = true;
                point.highlight = true;

                let m = [

                    {
                        label: `Edit text`,
                        click: async (scx, scy) => {

                            let va = await prompt("Edit ", ["Edit"], { "Edit": "" + point.name }, 700, 300)
                            let m = va['Edit']
                            if (m != null) {
                                point.name = m;
                            }
                            pt.clearMenu()

                        },

                        move: () => {
                        }
                    },
                    {
                        label: `Copy`,
                        click: async (scx, scy) => {
                            let HM = await exec('baja/history/HM')
                            const htm = HM(point)
                            try {
                                navigator.clipboard.writeText(htm).then(() => {
                                    console.log("Object copied to clipboard!");
                                    pt.setMessage(" Copied Time Interval")
                                }).catch(err => {
                                    console.error("Failed to copy object to clipboard: ", err);
                                });
                                console.log('JSON plate state written to clipboard as plain text.');
                            } catch (err) {
                                console.error('Failed to write JSON plate state to clipboard:', err);
                            }

                        },
                    },
                    {
                        label: `Move to back`,
                        click: async (scx, scy) => {
                            function movePointToTop(plot, point) {
                                const points = plot.scatterData.points;
                                const index = points.indexOf(point);
                                if (index === -1) return;

                                points.splice(index, 1);

                                points.unshift(point);

                                plot.scatterData.points = points;
                            }
                            movePointToTop(plot, point)

                        },
                    },
                    {
                        label: `Move to front`,
                        click: async (scx, scy) => {

                            function movePointToBottom(plot, point) {
                                const points = plot.scatterData.points;
                                const index = points.indexOf(point);
                                if (index === -1) return;

                                points.splice(index, 1);

                                points.push(point);

                                plot.scatterData.points = points;

                            }
                            movePointToBottom(plot, point)
                        },
                    },

                    {
                        label: 'Move X&Y',
                        click: async (scx, scy) => {
                            let mvPoints = [];
                            mvPoints.push(point);

                            point.isHilighted = true;
                            point.isSelected = true;

                            pt.setMessage(" Click and drag on the point you want to move ")

                            let t = {
                                id: 'move-points',
                                mouseMoveListener: null,
                                mouseUpListener: null,
                                mouseDownListener: null,
                                draw: null,
                                menuManager: null,
                            };

                            let dragStartX = 0;
                            let dragStartY = 0;
                            let dragging = false;

                            t.draw = (grid, ctx) => {
                            };

                            t.close = () => {
                            };

                            t.mouseDownListener = (x, y) => {
                                let mmx = plot.grid.Xwc(x + plot.grid.xi * 2);
                                let mmy = plot.grid.Ywc(y + plot.grid.yi * 2);
                                dragStartX = mmx;
                                dragStartY = mmy;
                                dragging = true;
                            };

                            t.mouseMoveListener = (x, y) => {

                                if (dragging) {
                                    let mmx = plot.grid.Xwc(x + plot.grid.xi * 2);
                                    let mmy = plot.grid.Ywc(y + plot.grid.yi * 2);
                                    let dx = mmx - dragStartX;
                                    let dy = mmy - dragStartY;
                                    point.y += dy;
                                    point.x += dx;

                                    point.highlight = true;
                                    point.isSelected = true;

                                    if (point.startY != null) {
                                        point.startY += dy;
                                    }

                                    point.startX += dx;
                                    dragStartX = mmx;
                                    dragStartY = mmy;
                                    pt.grid.rescale();
                                    plot.grid.rescale();
                                }
                            };

                            t.mouseUpListener = async (x, y) => {
                                dragging = false;
                                pt.setMessage(" Set.")
                                pt.wb(null)
                            };
                            setTimeout(() => {
                                pt.wb(t);
                            }, 100);

                        },
                    },
                    {
                        label: `Move vertical`,
                        click: async (scx, scy) => {
                            let mvPoints = [];
                            point.isSelected = true;
                            mvPoints.push(point);

                            pt.setMessage(" Click and drag on the point you want to move ")

                            let t = {
                                id: 'move-points',
                                mouseMoveListener: null,
                                mouseUpListener: null,
                                mouseDownListener: null,
                                draw: null,
                                menuManager: null,
                            };

                            let dragStartX = 0;
                            let dragStartY = 0;
                            let dragging = false;

                            t.draw = (grid, ctx) => {
                            };

                            t.close = () => {
                            };

                            t.mouseDownListener = (x, y) => {
                                let mmx = plot.grid.Xwc(x + plot.grid.xi * 2);
                                let mmy = plot.grid.Ywc(y + plot.grid.yi * 2);
                                dragStartX = mmx;
                                dragStartY = mmy;
                                dragging = true;
                            };

                            t.mouseMoveListener = (x, y) => {

                                if (dragging) {
                                    let mmx = plot.grid.Xwc(x + plot.grid.xi * 2);
                                    let mmy = plot.grid.Ywc(y + plot.grid.yi * 2);
                                    let dx = mmx - dragStartX;
                                    let dy = mmy - dragStartY;
                                    point.y += dy;

                                    if (point.startY != null) {
                                        point.startY += dy;
                                    }

                                    dragStartX = mmx;
                                    dragStartY = mmy;
                                    pt.grid.rescale();
                                    plot.grid.rescale();
                                }
                            };

                            t.mouseUpListener = async (x, y) => {
                                dragging = false;
                                pt.setMessage(" Set.")
                                pt.wb(null)
                            };
                            setTimeout(() => {
                                pt.wb(t);
                            }, 100);

                        },
                        move: () => {
                        }
                    },

                    {
                        label: `Delete`,
                        click: async (scx, scy) => {
                            let confirm = await exec('baja/lib/confirm.js', 'Remove?', async () => {
                                plot.removePoint(point)
                            })
                            showModal(confirm)
                            pt.clearMenu()

                        },

                        move: () => {
                        }
                    },

                    {
                        label: `Select Theme`,
                        click: async (scx, scy) => {
                            const THEMES = ["classic-light",
                                "midnight-dark",
                                "ocean-breeze",
                                "solar-flare",
                                "neon-grid",
                                "autumn-fields",
                                "cyberpunk-pink",
                                "forest-mist",
                                "slate-tech",
                                "vintage-paper"
                            ];
                            const themeKeys = (THEMES);
                            const current = point.themeKey || "classic-light";

                            const pretty = (s) =>
                                s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

                            const items = themeKeys.map((key) => {
                                const t = THEMES[key];
                                const handleColor = t?.colors?.handle || "#888";
                                const checked = (key === current) ? "✓ " : "";

                                const dot = "●";

                                return {
                                    label: `${checked}${pretty(key)}  ${dot}`,
                                    color: handleColor,
                                    click: async () => {
                                        try {
                                            point.themeKey = (key);
                                        } catch (e) {
                                            console.warn("Theme apply error:", e);
                                        }
                                    }
                                };
                            });

                            items.push({ label: "—", disabled: true });
                            items.push({
                                label: "Random Theme",
                                click: async () => {
                                    const k = themeKeys[Math.floor(Math.random() * themeKeys.length)];
                                    try {
                                        plot.selectTheme(k);
                                        pt.setMenu && pt.setMenu(null);
                                        pt.requestRedraw && pt.requestRedraw();
                                    } catch (e) {
                                        console.warn("Random theme apply error:", e);
                                    }
                                }
                            });

                            const itemHeight = 20;
                            const menuWidth = 280;
                            const menuX = pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - menuWidth / 2);
                            const menuY = pt.grid.Ywc(
                                pt.grid.yi + pt.grid.height / 2 - (itemHeight * items.length) / 2
                            );

                            const bg = 'rgba(255,255,255,0.95)';
                            const fg = 'navy';
                            const border = 2;

                            pt.menu = null;
                            setTimeout(async () => {
                                let Menu = await exec('flexigraph/menu')

                                const smenu = new Menu(items, menuX, menuY, bg, fg, border);
                                pt.setMenu(smenu);
                            }, 2000)
                        }
                    },
                    {
                        label: `Connect`,
                        click: async (scx, scy) => {
                            pt.clearMenu()
                            pt.setMessage("Select connecting line")
                            if (!point.connections) {
                                point.connections = []
                            }
                            let t = {
                                id: 'select-point',
                                mouseMoveListener: null,
                                mouseUpListener: null,
                                mouseDownListener: null,
                                draw: null,
                                menuManager: null,
                            };

                            t.draw = (grid, ctx) => {
                            };

                            t.close = () => {

                            };
                            t.mouseDownListener = (x, y) => {

                                const createConnection = async (xstart, ystart, xend, yend, point, to) => {
                                    let va = await prompt("Describe the connection", ["Connection comment"], { "Connection comment": "" }, 850, 350)
                                    let m = va['Connection comment']
                                    plot.scatterData.points.push({
                                        name: m,
                                        type: 'lanechange',
                                        startX: xstart,
                                        startY: ystart,
                                        x: xend,
                                        y: yend,
                                        txt: m
                                    })
                                }

                                let start_mmx = plot.grid.Xwc(scx__ - plot.grid.xi * 2);
                                let start_mmy = plot.grid.Ywc(scy__ - plot.grid.yi * 2);
                                let mmx = plot.grid.Xwc(x - plot.grid.xi * 2);
                                let mmy = plot.grid.Ywc(y - plot.grid.yi * 2);
                                plot.scatterData.points.forEach(__point => {
                                    if (__point.isInside) {
                                        if (__point.isInside(x, y)) {
                                            createConnection(start_mmx, start_mmy, mmx, mmy, point, __point)
                                        }
                                    }
                                    else
                                        if (pt && __point && __point.startX) {
                                            let pxstart = plot.grid.X(__point.startX)
                                            let pxend = plot.grid.X(__point.x)
                                            if (pxstart - 5 <= scx && pxend + 5 >= scx) {
                                            }
                                            const px = plot.grid.X(__point.x);
                                            let py = plot.grid.Y(__point.y)
                                            if (__point.scy) {
                                                py = __point.scy
                                            }
                                            const dx = Math.abs(scx - px);
                                            const xThreshold = 7;
                                            const dy = Math.abs(scy - py);
                                            const yThreshold = 7;
                                            if (dx < xThreshold && dy < yThreshold) {
                                                createConnection(point, __point)
                                            }
                                            const spx = plot.grid.X(__point.startX);
                                            const dx2 = Math.abs(scx - spx);
                                            if (dx2 < xThreshold && dy < yThreshold) {
                                                createConnection(point, __point)
                                            }
                                        } else if (pt && __point) {
                                            const px = plot.grid.X(__point.x);
                                            const dx = Math.abs(scx - px);
                                            let py = plot.grid.Y(__point.y);
                                            if (__point.scy) {
                                                py = __point.scy;
                                            }
                                            const dy = Math.abs(scy - py);
                                            const xThreshold = 7;
                                            const yThreshold = 7;
                                            if (dx < xThreshold && dy < yThreshold) {
                                                createConnection(point, __point)
                                            }
                                        }
                                });

                            };

                            t.mouseMoveListener = (x, y) => {
                            };
                            t.mouseUpListener = async (x, y) => {
                                pt.setMessage(" Set.")
                                pt.wb(null)
                            };
                            setTimeout(() => {
                                pt.wb(t);
                            }, 100);
                        },
                        move: () => {
                        }
                    },
                    {
                        label: 'Set Start Time',
                        click: async (scx, scy) => {
                            let va = await prompt("e.g. 2 hours ago, Tomorrow this time", ["Time"], { "Time": "" }, 300, 400)
                            let m = va['Time']
                            if (m != null) {

                                let sdate = formatTime(point.startX, plot.grid.xmin, plot.grid.xmax, plot.startDate, plot.endDate)
                                let model = await exec('py/openai/adjust-start-time.py', m, sdate)
                                showModal({
                                    wid: 'json',
                                    data: JSON.stringify(model)
                                })

                                if (model && model.datetime) {
                                    let d = new Date(model.datetime)
                                    const __xw = timeToX(
                                        d,
                                        plot.grid.xmin,
                                        plot.grid.xmax,
                                        plot.startDate,
                                        plot.endDate
                                    );
                                    point.startX = __xw
                                } else {
                                    infoPrompt(" I could not determine the time from your text. ")
                                }

                            }
                        }
                    },
                    {
                        label: 'Set Time length',
                        click: async (scx, scy) => {
                            let va = await prompt("Describe the time.  e.g. 2 hours, 1 day", ["Time"], { "Time": "" }, 300, 350)
                            let m = va['Time']
                            if (m != null) {

                                let sdate = formatTime(point.startX, plot.grid.xmin, plot.grid.xmax, plot.startDate, plot.endDate)
                                let model = await exec('py/openai/get-time-range.py', m, sdate)

                                if (model && model.datetime) {
                                    console.log('debubg');
                                    let d = new Date(model.datetime)
                                    const __xw = timeToX(
                                        d,
                                        plot.grid.xmin,
                                        plot.grid.xmax,
                                        plot.startDate,
                                        plot.endDate
                                    );
                                    point.x = __xw
                                } else {
                                    infoPrompt(" I could not determine the time from your text. ")
                                }

                            }
                        }
                    }

                ]
                return m;

            },
            'lanechange': (pt, plot, point, scx__, scy__) => {

                point.isSelected = true;
                point.highlight = true;

                let m = [

                    {
                        label: `Edit text`,
                        click: async (scx, scy) => {

                            let va = await prompt("Edit ", ["Edit"], { "Edit": "" + point.name }, 700, 300)
                            let m = va['Edit']
                            if (m != null) {
                                point.name = m;
                            }
                            pt.clearMenu()

                        },

                        move: () => {
                        }
                    },
                    {
                        label: `Copy`,
                        click: async (scx, scy) => {
                            let HM = await exec('baja/history/HM')
                            const htm = HM(point)
                            try {
                                navigator.clipboard.writeText(htm).then(() => {
                                    console.log("Object copied to clipboard!");
                                    pt.setMessage(" Copied Time Interval")
                                }).catch(err => {
                                    console.error("Failed to copy object to clipboard: ", err);
                                });
                                console.log('JSON plate state written to clipboard as plain text.');
                            } catch (err) {
                                console.error('Failed to write JSON plate state to clipboard:', err);
                            }

                        },
                    },
                    {
                        label: `Move to back`,
                        click: async (scx, scy) => {
                            function movePointToTop(plot, point) {
                                const points = plot.scatterData.points;
                                const index = points.indexOf(point);
                                if (index === -1) return;

                                points.splice(index, 1);

                                points.unshift(point);

                                plot.scatterData.points = points;
                            }
                            movePointToTop(plot, point)

                        },
                    },
                    {
                        label: `Move to front`,
                        click: async (scx, scy) => {

                            function movePointToBottom(plot, point) {
                                const points = plot.scatterData.points;
                                const index = points.indexOf(point);
                                if (index === -1) return;

                                points.splice(index, 1);

                                points.push(point);

                                plot.scatterData.points = points;

                            }
                            movePointToBottom(plot, point)
                        },
                    },

                    {
                        label: 'Move X&Y',
                        click: async (scx, scy) => {
                            let mvPoints = [];
                            mvPoints.push(point);

                            point.isHilighted = true;
                            point.isSelected = true;

                            pt.setMessage(" Click and drag on the point you want to move ")

                            let t = {
                                id: 'move-points',
                                mouseMoveListener: null,
                                mouseUpListener: null,
                                mouseDownListener: null,
                                draw: null,
                                menuManager: null,
                            };

                            let dragStartX = 0;
                            let dragStartY = 0;
                            let dragging = false;

                            t.draw = (grid, ctx) => {
                            };

                            t.close = () => {
                            };

                            t.mouseDownListener = (x, y) => {
                                let mmx = plot.grid.Xwc(x + plot.grid.xi * 2);
                                let mmy = plot.grid.Ywc(y + plot.grid.yi * 2);
                                dragStartX = mmx;
                                dragStartY = mmy;
                                dragging = true;
                            };

                            t.mouseMoveListener = (x, y) => {

                                if (dragging) {
                                    let mmx = plot.grid.Xwc(x + plot.grid.xi * 2);
                                    let mmy = plot.grid.Ywc(y + plot.grid.yi * 2);
                                    let dx = mmx - dragStartX;
                                    let dy = mmy - dragStartY;
                                    point.y += dy;
                                    point.x += dx;

                                    point.highlight = true;
                                    point.isSelected = true;

                                    if (point.startY != null) {
                                        point.startY += dy;
                                    }

                                    point.startX += dx;
                                    dragStartX = mmx;
                                    dragStartY = mmy;
                                    pt.grid.rescale();
                                    plot.grid.rescale();
                                }
                            };

                            t.mouseUpListener = async (x, y) => {
                                dragging = false;
                                pt.setMessage(" Set.")
                                pt.wb(null)
                            };
                            setTimeout(() => {
                                pt.wb(t);
                            }, 100);

                        },
                    },
                    {
                        label: `Move vertical`,
                        click: async (scx, scy) => {
                            let mvPoints = [];
                            point.isSelected = true;
                            mvPoints.push(point);

                            pt.setMessage(" Click and drag on the point you want to move ")

                            let t = {
                                id: 'move-points',
                                mouseMoveListener: null,
                                mouseUpListener: null,
                                mouseDownListener: null,
                                draw: null,
                                menuManager: null,
                            };

                            let dragStartX = 0;
                            let dragStartY = 0;
                            let dragging = false;

                            t.draw = (grid, ctx) => {
                            };

                            t.close = () => {
                            };

                            t.mouseDownListener = (x, y) => {
                                let mmx = plot.grid.Xwc(x + plot.grid.xi * 2);
                                let mmy = plot.grid.Ywc(y + plot.grid.yi * 2);
                                dragStartX = mmx;
                                dragStartY = mmy;
                                dragging = true;
                            };

                            t.mouseMoveListener = (x, y) => {

                                if (dragging) {
                                    let mmx = plot.grid.Xwc(x + plot.grid.xi * 2);
                                    let mmy = plot.grid.Ywc(y + plot.grid.yi * 2);
                                    let dx = mmx - dragStartX;
                                    let dy = mmy - dragStartY;
                                    point.y += dy;

                                    if (point.startY != null) {
                                        point.startY += dy;
                                    }

                                    dragStartX = mmx;
                                    dragStartY = mmy;
                                    pt.grid.rescale();
                                    plot.grid.rescale();
                                }
                            };

                            t.mouseUpListener = async (x, y) => {
                                dragging = false;
                                pt.setMessage(" Set.")
                                pt.wb(null)
                            };
                            setTimeout(() => {
                                pt.wb(t);
                            }, 100);

                        },
                        move: () => {
                        }
                    },

                    {
                        label: `Delete`,
                        click: async (scx, scy) => {
                            let confirm = await exec('baja/lib/confirm.js', 'Remove?', async () => {
                                plot.removePoint(point)
                            })
                            showModal(confirm)
                            pt.clearMenu()

                        },

                        move: () => {
                        }
                    },

                    {
                        label: `Select Theme`,
                        click: async (scx, scy) => {
                            const THEMES = ["classic-light",
                                "midnight-dark",
                                "ocean-breeze",
                                "solar-flare",
                                "neon-grid",
                                "autumn-fields",
                                "cyberpunk-pink",
                                "forest-mist",
                                "slate-tech",
                                "vintage-paper"
                            ];
                            const themeKeys = (THEMES);
                            const current = point.themeKey || "classic-light";

                            const pretty = (s) =>
                                s.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

                            const items = themeKeys.map((key) => {
                                const t = THEMES[key];
                                const handleColor = t?.colors?.handle || "#888";
                                const checked = (key === current) ? "✓ " : "";

                                const dot = "●";

                                return {
                                    label: `${checked}${pretty(key)}  ${dot}`,
                                    color: handleColor,
                                    click: async () => {
                                        try {
                                            point.themeKey = (key);
                                        } catch (e) {
                                            console.warn("Theme apply error:", e);
                                        }
                                    }
                                };
                            });

                            items.push({ label: "—", disabled: true });
                            items.push({
                                label: "Random Theme",
                                click: async () => {
                                    const k = themeKeys[Math.floor(Math.random() * themeKeys.length)];
                                    try {
                                        if (typeof this.setTheme === "function") {
                                            this.setTheme(k);
                                        } else if (typeof this.selectTheme === "function") {
                                            this.selectTheme(k);
                                        }
                                        pt.setMenu && pt.setMenu(null);
                                        pt.requestRedraw && pt.requestRedraw();
                                    } catch (e) {
                                        console.warn("Random theme apply error:", e);
                                    }
                                }
                            });

                            const itemHeight = 20;
                            const menuWidth = 280;
                            const menuX = pt.grid.Xwc(pt.grid.xi + pt.grid.width / 2 - menuWidth / 2);
                            const menuY = pt.grid.Ywc(
                                pt.grid.yi + pt.grid.height / 2 - (itemHeight * items.length) / 2
                            );

                            const bg = 'rgba(255,255,255,0.95)';
                            const fg = 'navy';
                            const border = 2;

                            pt.menu = null;
                            setTimeout(async () => {
                                let Menu = await exec('flexigraph/menu')

                                const smenu = new Menu(items, menuX, menuY, bg, fg, border);
                                pt.setMenu(smenu);
                            }, 2000)
                        }
                    },
                    {
                        label: `Connect`,
                        click: async (scx, scy) => {
                            pt.clearMenu()
                            pt.setMessage("Select connecting line")
                            if (!point.connections) {
                                point.connections = []
                            }
                            let t = {
                                id: 'select-point',
                                mouseMoveListener: null,
                                mouseUpListener: null,
                                mouseDownListener: null,
                                draw: null,
                                menuManager: null,
                            };

                            t.draw = (grid, ctx) => {
                            };

                            t.close = () => {

                            };
                            t.mouseDownListener = (x, y) => {

                                const createConnection = async (xstart, ystart, xend, yend, point, to) => {
                                    let va = await prompt("Describe the connection", ["Connection comment"], { "Connection comment": "" }, 850, 350)
                                    let m = va['Connection comment']
                                    plot.scatterData.points.push({
                                        name: m,
                                        type: 'lanechange',
                                        startX: xstart,
                                        startY: ystart,
                                        x: xend,
                                        y: yend,
                                        txt: m
                                    })
                                }

                                let start_mmx = plot.grid.Xwc(scx__ - plot.grid.xi * 2);
                                let start_mmy = plot.grid.Ywc(scy__ - plot.grid.yi * 2);
                                let mmx = plot.grid.Xwc(x - plot.grid.xi * 2);
                                let mmy = plot.grid.Ywc(y - plot.grid.yi * 2);
                                plot.scatterData.points.forEach(__point => {
                                    if (__point.isInside) {
                                        if (__point.isInside(x, y)) {
                                            createConnection(start_mmx, start_mmy, mmx, mmy, point, __point)
                                        }
                                    }
                                    else
                                        if (pt && __point && __point.startX) {
                                            let pxstart = plot.grid.X(__point.startX)
                                            let pxend = plot.grid.X(__point.x)
                                            if (pxstart - 5 <= scx && pxend + 5 >= scx) {
                                            }
                                            const px = plot.grid.X(__point.x);
                                            let py = plot.grid.Y(__point.y)
                                            if (__point.scy) {
                                                py = __point.scy
                                            }
                                            const dx = Math.abs(scx - px);
                                            const xThreshold = 7;
                                            const dy = Math.abs(scy - py);
                                            const yThreshold = 7;
                                            if (dx < xThreshold && dy < yThreshold) {
                                                createConnection(point, __point)
                                            }
                                            const spx = plot.grid.X(__point.startX);
                                            const dx2 = Math.abs(scx - spx);
                                            if (dx2 < xThreshold && dy < yThreshold) {
                                                createConnection(point, __point)
                                            }
                                        } else if (pt && __point) {
                                            const px = plot.grid.X(__point.x);
                                            const dx = Math.abs(scx - px);
                                            let py = plot.grid.Y(__point.y);
                                            if (__point.scy) {
                                                py = __point.scy;
                                            }
                                            const dy = Math.abs(scy - py);
                                            const xThreshold = 7;
                                            const yThreshold = 7;
                                            if (dx < xThreshold && dy < yThreshold) {
                                                createConnection(point, __point)
                                            }
                                        }
                                });

                            };

                            t.mouseMoveListener = (x, y) => {
                            };
                            t.mouseUpListener = async (x, y) => {
                                pt.setMessage(" Set.")
                                pt.wb(null)
                            };
                            setTimeout(() => {
                                pt.wb(t);
                            }, 100);
                        },
                        move: () => {
                        }
                    },
                    {
                        label: 'Set Start Time',
                        click: async (scx, scy) => {
                            let va = await prompt("e.g. 2 hours ago, Tomorrow this time", ["Time"], { "Time": "" }, 300, 400)
                            let m = va['Time']
                            if (m != null) {

                                let sdate = formatTime(point.startX, plot.grid.xmin, plot.grid.xmax, plot.startDate, plot.endDate)
                                let model = await exec('py/openai/adjust-start-time.py', m, sdate)
                                showModal({
                                    wid: 'json',
                                    data: JSON.stringify(model)
                                })

                                if (model && model.datetime) {
                                    let d = new Date(model.datetime)
                                    const __xw = timeToX(
                                        d,
                                        plot.grid.xmin,
                                        plot.grid.xmax,
                                        plot.startDate,
                                        plot.endDate
                                    );
                                    point.startX = __xw
                                } else {
                                    infoPrompt(" I could not determine the time from your text. ")
                                }

                            }
                        }
                    },
                    {
                        label: 'Set Time length',
                        click: async (scx, scy) => {
                            let va = await prompt("Describe the time.  e.g. 2 hours, 1 day", ["Time"], { "Time": "" }, 300, 350)
                            let m = va['Time']
                            if (m != null) {

                                let sdate = formatTime(point.startX, plot.grid.xmin, plot.grid.xmax, plot.startDate, plot.endDate)
                                let model = await exec('py/openai/get-time-range.py', m, sdate)

                                if (model && model.datetime) {
                                    console.log('debubg');
                                    let d = new Date(model.datetime)
                                    const __xw = timeToX(
                                        d,
                                        plot.grid.xmin,
                                        plot.grid.xmax,
                                        plot.startDate,
                                        plot.endDate
                                    );
                                    point.x = __xw
                                } else {
                                    infoPrompt(" I could not determine the time from your text. ")
                                }

                            }
                        }
                    }

                ]
                return m;

            }
        }
        resolve(t)
    })
}
