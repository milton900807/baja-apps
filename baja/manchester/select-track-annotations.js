function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        let DashedRectangle = await exec('flexigraph/shapes/dashed-rect.js')

        graph.setMessage(" Draw rectangle around annotations on a track ")

        let previousShape;
        let button_canvas = {
            wid: 'button-canvas',
            data: {
                'height': 30,
                'grid': {
                    xmin: 0,
                    xmax: 10,
                    ymin: -0.01,
                    ymax: 1,
                    xinset: 0,
                    yinset: 0
                },
                'buttons': [
                    {
                        x: 0, y: 0, label: 'Deselect', ionFunction: createIonFunction(() => {
                            graph.deselectAllCompounds();
                        })
                    },
                    {
                        x: 1, y: 0, label: 'Delete', ionFunction: createIonFunction(async () => {
                            let confirm = await exec('baja/lib/confirm-widget.js', async () => {
                                for (let t of graph.track) {
                                    let r = []
                                    for (let o of t.annotations) {
                                        if (o.isSelected()) {
                                            r.push(o);
                                        }
                                    }
                                    for (let o of r) {
                                        t.removeAnnotation(o)
                                    }
                                }
                            })
                            showModal(confirm)
                        }),
                    },
                    {
                        x: 2, y: 0, label: 'Filter', ionFunction: createIonFunction(async () => {
                            graph.clearMouseListeners();
                            await exec('baja/manchester/annotation/rule-application-wizard-min-selected-oligos.js', graph, genegraph_panel_layout)
                        }), mouseOver: createIonFunction(() => {
                            graph.setMessage('Run filter rules on all compounds.')

                        })
                    },
                    {
                        x: 4, y: 0, label: 'Move', ionFunction: createIonFunction(() => {
                            exec('baja/manchester/select-compouds-move', graph, genegraph_panel_layout)
                        }),
                    },

                ]
            }
        }

        graph.clearMouseListeners();
        graph.selectOff();
        graph.addMouseDownListener(async (x, y) => {
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
            if (graph.currentShape) {
                previousShape = graph.currentShape

                let xisc = graph.X(previousShape.x);
                let xfsc = graph.X(previousShape.x + previousShape.w);
                let total = []

                for (let selectedTrack of graph.track) {
                    let xi = selectedTrack.tgraph.Xwc(graph.Xwc(xisc) - selectedTrack.tgraph.xi * 2);
                    let xf = selectedTrack.tgraph.Xwc(graph.Xwc(xfsc) - selectedTrack.tgraph.xi * 2);
                    let yi = (selectedTrack.tgraph.Ywc(previousShape.y - previousShape.h - selectedTrack.tgraph.yi * 2))
                    let yf = (selectedTrack.tgraph.Ywc(previousShape.y - selectedTrack.tgraph.yi * 2))
                    let annotations = selectedTrack.getAnnotationsInRange(xi, xf);
                    for (let o of annotations) {
                        if (xi < o.xi && xf > o.xf)
                            o.setSelected(true)
                    }
                    for (let t of graph.track) {
                        for (let o of t.annotations) {
                            if (o.highlighted) {
                                total.push({ 'o': o, 't': t })
                            }
                        }
                    }
                }
                graph.setSelectedCompounds(total)
                graph.setMessage('Selected: ' + total.length);
                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                graph.currentShape = null;
            }

        });

        resolve();

    });

}
