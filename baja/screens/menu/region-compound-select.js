function (lib_id, graph, shomainScreen) {

    let m = {
        'label': 'Edit Compounds', 'ionfunction': createIonFunction(async () => {
            let previousShape;
            graph.setMessage(" Click and draw around compounds... ")
            let ChemTemplateDB = await exec('baja/chem/chem-template-db.js', lib_id);
            let Biopolymer = await exec('baja/chem/biopolymer.js')

            graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');

            graph.selectOff();
            graph.addMouseDownListener(async (x, y) => {
                let DashedRectangle = await exec('flexigraph/shapes/dashed-rect.js')
                if (previousShape) {
                    graph.removeShape(previousShape);
                }
                graph.currentShape = new DashedRectangle('test', x, y);

            }); graph.addMouseMoveListener((x, y) => {
                if (graph.currentShape) {
                    graph.currentShape.update(x, y)
                }
            })
            graph.addMouseUpListener((x, y) => {
                let total = []
                if (graph.currentShape) {
                    previousShape = graph.currentShape;
                    for (let t of graph.track) {
                        let twx = t.tgraph.Xwc(previousShape.x)
                        let twxf = t.tgraph.Xwc(previousShape.x + previousShape.w)
                        let oligos = t.getVisibleOligosXY(twx, twxf, previousShape.y - previousShape.h, previousShape.y)
                        if (oligos)
                            total = total.concat(oligos)
                    }
                }

                showModal  ( {
                    wid:'json',
                    data:JSON.stringify ( total )
                })

            });
        })
    }
    return m;
}
