function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let TrackLayer = await exec('baja/bio/track-layer.js');
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
                    x: 0, y: 0, label: 'Draw', ionFunction: createIonFunction(() => {
                        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
                        addListeners();
                    })
                },
                {
                    x: 2, y: 0, label: 'Clear', ionFunction: createIonFunction(() => {
                        if (trackLayer) {
                            trackLayer.clearPolygonPoints();
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
                    x: 0, y: 0, label: 'Draw', ionFunction: createIonFunction(() => {
                        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
                        addListeners();
                    })
                },
                {
                    x: 1, y: 0, label: 'Clear', ionFunction: createIonFunction(() => {
                        trackLayer.clearPolygonPoints();

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
                    xinset: 10,
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
                        xinset: 10,
                        yinset: 0
                    },
                    'buttons': bbuttons
                }
            }

            let buttonMenuPanel = {
                wid: 'card',
                height: 2 * height,
                componentRef: 'buttonMenuPanel',
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
                    let ysc = graph.Y(y);
                    let yf = (trackLayer.tgraph.Ywc(ysc - graph.graph.grid.yi - 2 * trackLayer.tgraph.yi))
                    let xvalue = trackLayer.tgraph.Xwc(graph.X(x) - trackLayer.tgraph.xi * 2);
                    trackLayer.addPolygonPoint(xvalue, yf)
                } else {

                    let trackIndex = graph.getTrack(x, y);
                    if (trackIndex >= 0) {
                        let cselectedTrack = graph.track[trackIndex]
                        if (cselectedTrack != null) {
                            selectedTrack = cselectedTrack;
                            selectedTrack.select();
                            start_site = selectedTrack.getNearestStartSite ( )
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
                if (selectedTrack && trackLayer === null) {
                    graph.setMessage(" Track layer added. ")
                    trackLayer = new TrackLayer('' + Math.random(), selectedTrack.tgraph.xmin, 0, selectedTrack.tgraph.xmax, 1)
                    let ysc = graph.Y(y);
                    let yf = (trackLayer.tgraph.Ywc(ysc - graph.graph.grid.yi - 2 * trackLayer.tgraph.yi))
                    let xvalue = trackLayer.tgraph.Xwc(graph.X(x) - trackLayer.tgraph.xi * 2);
                    trackLayer.clearPolygonPoints();
                    trackLayer.addPolygonPoint(xvalue, yf)
                    trackLayer.polygon_type = 'line'
                    selectedTrack.addLayer(trackLayer);
                }
            });
        }
        addListeners();
        resolve();
    })
}
