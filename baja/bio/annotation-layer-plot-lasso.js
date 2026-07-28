function (plot, graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let TrackLayer = await exec('baja/bio/track-layer.js');
        let MenuFactory = await exec('baja/screens/menu/menu-factory.js')
        graph.setMouseMode("navigate")
        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
        let trackLayer = null;
        let md = false;

        let xmac_ = 10
        let height = 30;
        let buttons = []
        let bbuttons = []
        if (isMobile()) {
            buttons = [
                {
                    x: 0, y: 0, label: 'New', ionFunction: createIonFunction(() => {
                        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
                        addListeners();
                    })
                },
                {
                    x: 1, y: 0, label: 'Reset', ionFunction: createIonFunction(() => {
                        if (trackLayer) {
                            trackLayer.clearPolygonPoints();
                        }
                    })
                },
                {
                    x: 2, y: 0, label: 'Continue', ionFunction: createIonFunction(() => {
                        console.log(" continue ")

                        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
                        addListeners();

                        let layers_with_lines = []
                        for (let selectedTrack of graph.track) {
                            let tl = selectedTrack.track_layers;
                            for (let i = tl.length - 1; i >= 0; i--) {
                                if (tl[i].polygon_type === 'line') {
                                    layers_with_lines.push(tl[i])
                                }
                            }
                        }
                        if (layers_with_lines.length == 0) {
                            trackLayer = null;
                        }
                        else if (layers_with_lines.length === 1) {
                            trackLayer = layers_with_lines[0]
                        } else {
                            layers_with_lines = layers_with_lines.sort((a, b) => a.lastEdited - b.lastEdited);
                            trackLayer = layers_with_lines[0]
                        }
                    })
                },
            ]
            bbuttons = [
                {
                    x: 0, y: 0, label: 'Undo', ionFunction: createIonFunction(async () => {
                    })

                },
                {
                    x: 4, y: 0, label: 'Redo', ionFunction: createIonFunction(async () => {
                    })

                }, {
                    x: 6, y: 0, label: 'Nav', ionFunction: createIonFunction(async () => {
                        graph.clearMouseListeners();
                        graph.setMouseMode('navigate')
                    })

                },
            ]
        } else {
            buttons = [
                {
                    x: 0, y: 0, label: 'New', ionFunction: createIonFunction(() => {
                        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
                        addListeners();
                    })
                },
                {
                    x: 1, y: 0, label: 'Reset', ionFunction: createIonFunction(() => {
                        if (trackLayer) {
                            trackLayer.clearPolygonPoints();
                        }
                    })
                },
                {
                    x: 2, y: 0, label: 'Continue', ionFunction: createIonFunction(() => {
                        console.log(" continue ")

                        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
                        addListeners();

                        let layers_with_lines = []
                        for (let selectedTrack of graph.track) {
                            let tl = selectedTrack.track_layers;
                            for (let i = tl.length - 1; i >= 0; i--) {
                                if (tl[i].polygon_type === 'line') {
                                    layers_with_lines.push(tl[i])
                                }
                            }
                        }
                        if (layers_with_lines.length == 0) {
                            trackLayer = null;
                        }
                        else if (layers_with_lines.length === 1) {
                            trackLayer = layers_with_lines[0]
                        } else {
                            layers_with_lines = layers_with_lines.sort((a, b) => a.lastEdited - b.lastEdited);
                            trackLayer = layers_with_lines[0]
                        }
                    })
                },
            ]
            bbuttons = [
                {
                    x: 0, y: 0, label: 'Undo', ionFunction: createIonFunction(async () => {
                    })

                },
                {
                    x: 4, y: 0, label: 'Redo', ionFunction: createIonFunction(async () => {
                    })

                }, {
                    x: 6, y: 0, label: 'Nav', ionFunction: createIonFunction(async () => {
                        graph.clearMouseListeners();
                        graph.setMouseMode('navigate')
                    })

                },
            ]
        }

        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'title': 'controls',
                'height': height,
                'grid': {
                    xmin: 0,
                    xmax: xmac_,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': buttons
            }
        }
        if (!isMobile()) {
            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel');
            CurrentLayout.setComponent('buttonMenuPanel', button_canvas);

        } else {

            let bottom_button_canvas = {
                wid: 'button-canvas',
                data: {
                    'title': 'controls',
                    'height': height,
                    'grid': {
                        xmin: 0,
                        xmax: xmac_,
                        ymin: -0.01,
                        ymax: 1,
                        xinset: 0,
                        yinset: 0
                    },
                    'buttons': bbuttons
                }
            }

            let buttonMenuPanel = {
                wid: 'card',
                data: {
                    cards: [
                        [
                            {
                                'title': '',
                                'component': button_canvas
                            }
                            ,
                            {
                                'title': '',
                                'component': bottom_button_canvas

                            }
                        ]]
                }
            }

            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel');
            CurrentLayout.setComponent('buttonMenuPanel', buttonMenuPanel);
        }

        let Lasso = class LassoCapture {
            isDrawing = false;
            lassoPolygon = [];

            constructor() {

            }

            lassoCapture(graph) {
                graph.setMouseMode('menu')
                graph.clearMouseListeners();
                graph.addMouseDownListener((x, y) => {
                    this.isDrawing = true;
                    this.lassoPolygon = [{ x: x, y: y }];
                });
                graph.addMouseMoveListener((x, y) => {
                    if (!this.isDrawing) return;
                    this.lassoPolygon.push({ x: x, y: y });
                });
                graph.addMouseUpListener((x, y) => {
                    if (!this.isDrawing)
                    {
                        return;
                    }

                    this.isDrawing = false;
                    this.lassoPolygon.push({ x: x, y: y });
                    let scPolygon = this.lassoPolygon.map(point => {
                        return {
                            x: graph.X(point.x),
                            y: graph.Y(point.y)
                        };
                    });
                    plot.lassoSelect(scPolygon, graph);
                    let ts = getIon(MenuFactory['rna-binding-analysis-menu'])
                    if (ts) {
                        let menu = ts(plot, graph, graph.genegraph_panel_layout)
                        graph.showMenu(menu, x, y);
                        graph.currentShape = null;
                    }
                });
            }
            update(x, y) {
            }
            draw(graph) {
                let canvas = graph.canvas;
                const ctx = canvas.getCTX();
                ctx.strokeStyle = 'rgba(0, 0, 255, 0.5)';
                ctx.lineWidth = 2;
                if (this.lassoPolygon && this.lassoPolygon.length > 0) {
                    ctx.beginPath();
                    ctx.moveTo(graph.X(this.lassoPolygon[0].x), graph.Y(this.lassoPolygon[0].y));
                    for (let i = 1; i < this.lassoPolygon.length; i++) {
                        ctx.lineTo(graph.X(this.lassoPolygon[i].x), graph.Y(this.lassoPolygon[i].y));
                    }
                    ctx.closePath();
                    ctx.stroke();
                }
            }
        }
        let le = new Lasso()
        graph.currentShape = le;
        le.lassoCapture(graph)
        resolve(le);
    })
}
