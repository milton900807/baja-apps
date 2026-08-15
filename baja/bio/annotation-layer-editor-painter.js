function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {

        let TrackLayer = await exec('baja/bio/track-layer.js');

        graph.clearMouseListeners();
        graph.setMouseMode("msg:Click and drag on canvas")
        graph.selectOff();

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
                        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
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

                        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
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
                        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
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

                        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
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

        let addListeners = () => {
            graph.addMouseMoveListener((x, y) => {
                if (md && trackLayer != null) {
                    trackLayer.tgraph.rescale();
                    graph.rescale();
                    let ysc = graph.Y(y);
                    let yf = (trackLayer.tgraph.Ywc(ysc - graph.graph.grid.yi - 2 * trackLayer.tgraph.yi))
                    let xvalue = trackLayer.tgraph.Xwc(graph.X(x - 1) - trackLayer.tgraph.xi * 2);
                    trackLayer.addPolygonPoint(xvalue, yf)
                } else {

                    let trackIndex = graph.getTrack(x, y);
                    if (trackIndex >= 0) {
                        let cselectedTrack = graph.track[trackIndex]

                        if (cselectedTrack != null) {
                            selectedTrack = cselectedTrack;
                            selectedTrack.select();
                        }
                    } else {
                        graph.selectOff();
                        selectedTrack = null;
                    }
                }
            })
            graph.addMouseUpListener((x, y) => {
                md = false;
            });
            graph.addMouseDownListener((x, y) => {
                md = true;

                if (trackLayer != null) {
                    trackLayer.setXi(graph.X(selectedTrack.tgraph.xi))
                    trackLayer.setYi(graph.Y(selectedTrack.tgraph.yi))
                    trackLayer.setHeight(graph.screenHeight(selectedTrack.tgraph.height));
                    trackLayer.setWidth(graph.screenWidth(selectedTrack.tgraph.width))
                    trackLayer.tgraph.rescale();
                    let ysc = graph.Y(y);
                    let yf = (trackLayer.tgraph.Ywc(ysc - graph.graph.grid.yi - 2 * trackLayer.tgraph.yi))
                    graph.rescale();
                    let xvalue = trackLayer.tgraph.Xwc(graph.X(x - 1) - trackLayer.tgraph.xi * 2);
                    console.log(" move to value " + xvalue + ' ---> ' + trackLayer.tgraph.X(xvalue))
                    trackLayer.addPolygonPoint(xvalue, yf)

                } else {

                    let trackIndex = graph.getTrack(x, y);
                    if (trackIndex >= 0) {
                        selectedTrack = graph.track[trackIndex]
                        if (selectedTrack) {
                            selectedTrack.select();
                            graph.setMessage(" Track layer added. ")
                            selectedTrack.tgraph.rescale();
                            trackLayer = new TrackLayer('' + Math.random(), selectedTrack.tgraph.xmin, 0, selectedTrack.tgraph.xmax, 1)
                            trackLayer.setXi(graph.X(selectedTrack.tgraph.xi))
                            trackLayer.setYi(graph.Y(selectedTrack.tgraph.yi))
                            trackLayer.setHeight(graph.screenHeight(selectedTrack.tgraph.height));
                            trackLayer.setWidth(graph.screenWidth(selectedTrack.tgraph.width))
                            trackLayer.tgraph.rescale();
                            let ysc = graph.Y(y);
                            let yf = (trackLayer.tgraph.Ywc(ysc - graph.graph.grid.yi - 2 * trackLayer.tgraph.yi))
                            trackLayer.clearPolygonPoints();
                            graph.rescale();
                            let xvalue = trackLayer.tgraph.Xwc(graph.X(x - 1) - trackLayer.tgraph.xi * 2);
                            console.log(" move to value " + xvalue + ' ---> ' + trackLayer.tgraph.X(xvalue))
                            trackLayer.addPolygonPoint(xvalue, yf)
                            trackLayer.polygon_type = 'line'
                            selectedTrack.addLayer(trackLayer);
                        }
                    }
                }
            });
        }
        addListeners();
        resolve();
    })
}
