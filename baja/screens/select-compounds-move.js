function (graph, genegraph_panel_layout, oligolist) {

    return new Promise(async (resolve, reject) => {
        let DashedRectangle = await exec('flexigraph/shapes/dashed-rect.js')
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
                        x: 0, y: 0, label: 'Vertical', ionFunction: createIonFunction(() => {
                            graph.deselectAllCompounds();
                        })
                    },
                    {
                        x: 1, y: 0, label: 'X & Y', ionFunction: createIonFunction(async () => {
                        }),
                    },
                    {
                        x: 2, y: 0, label: 'Copy&Paste', ionFunction: createIonFunction(async () => {
                        })
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
            if (graph.currentShape && selectedTrack) {
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
                    let oligos = selectedTrack.getVisibleOligosXY(xi, xf, yi, yf);
                    for (let o of oligos) {
                        o.setSelected(true)
                    }
                    for (let t of graph.track) {
                        for (let o of t.oligos) {
                            if (o.selected) {
                                total.push({ 'o': o, 't': t })
                            }
                        }
                    }
                }
                graph.setSelectedCompounds(total)
                graph.setMessage('>Total selected: ' + total.length);
                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                graph.currentShape = null;
            }

        });

        resolve();

    });

}
