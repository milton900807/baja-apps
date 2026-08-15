function (graph, button_canvas) {
    let previousShape;
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.setMouseMode('none')

    graph.selectOff();
    graph.addMouseDownListener(async (x, y) => {

        if (graph.menuVisible()) {

            return;
        }

        for (let t of graph.track) {
            t.deselect();
            graph.hideMenu();
        }

        let DashedRectangle = await exec('flexigraph/shapes/dashed-rect.js')
        if (previousShape) {
            graph.removeShape(previousShape);
        }
        graph.currentShape = new DashedRectangle('test', x, y);
    });
    graph.addMouseMoveListener((x, y) => {
        if (graph.currentShape) {
            graph.currentShape.update(x, y)
        }
        if (graph.currentShape) {
            previousShape = graph.currentShape
        }
    })
    graph.addMouseUpListener(async (x, y) => {

        if (graph.menuVisible()) {
            graph.hideMenu();
            return;
        }

        if (graph.currentShape) {

            previousShape = graph.currentShape
            let xisc = graph.X(previousShape.x);
            let xfsc = graph.X(previousShape.x + previousShape.w);
            let yisc = graph.Y(previousShape.y)
            let yfsc = graph.Y(previousShape.y) + graph.screenHeight(previousShape.h)
            let sel = false;
            for (let t of graph.track) {
                let ymid = graph.Y(t.tgraph.Y(0));

                if (ymid > yisc && ymid <= yfsc) {
                    t.select();
                    sel = true;
                }
            }

            if (sel) {
                let menuList = []
                menuList.push({
                    label: 'Collapse introns',
                    click: async (xwc, ywc) => {

                        let i = 0;
                        for (let t of graph.track) {
                            if (t.showResizeBar) {
                                let track = t.createTrackFromAnnotation('CDNA')
                                track.trackRef = null;
                                track.tgraph.yi = t.tgraph.yi;
                                track.tgraph.xi = t.tgraph.xi;
                                if (t.snpindels.length > 0) {
                                    track.liftSnpindels();
                                    track.targetPhase = t.targetPhase;
                                }

                                if ( t.oligos && t.oligos.length > 0 ){
                                    track.liftCompounds ();
                                }

                                graph.track[i] = track;
                            }
                            i++;
                        }

                    }
                }, {
                    label: 'Draw compounds',
                    click: async (xwc, ywc) => {
                        let chemistryObject = graph.props.selected_chemistry;
                        if (!chemistryObject) {
                            graph.setMessage(" No chemistry selected ")
                            return;
                        } else {
                            graph.setMessage(' Chemistry is ' + chemistryObject.type);

                        }

                        exec('baja/manchester/menu/draw-oligos-selected-tracks.js', graph, button_canvas)

                    }
                }, {
                    label: 'Hide Layers',
                    click: async (xwc, ywc) => {
                        let t = graph.track;
                        for (let ti of t) {
                            ti.showLayers = false;
                        }

                    }
                }, {
                    label: 'Show Layers',
                    click: async (xwc, ywc) => {

                        for (let ti of t) {
                            ti.showLayers = true;
                        }

                    }
                })
                graph.showMenu(menuList, x, y)
            }
            graph.currentShape = null;
        }

    });

}
