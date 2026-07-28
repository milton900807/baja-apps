function (graph) {

    if (graph.clearMouseListeners)
        graph.clearMouseListeners();
    if (graph.selectOff)
        graph.selectOff();

    return new Promise(async (res, rej) => {
        let Rectangle = await exec('flexigraph/shapes/rect.js')

        graph.clearMouseListeners();
        graph.setMouseMode('bpx')

        graph.addMouseDownListener(async (x, y) => {
            graph.currentShape = new Rectangle('test', x, y);

        }); graph.addMouseMoveListener((x, y) => {
            if (graph.currentShape) {
                graph.currentShape.update(x, y)
            }
        })
        graph.addMouseUpListener((x, y) => {

            if (graph.currentShape) {
                let height = graph.currentShape.y + graph.currentShape.h - graph.currentShape.y
                let width = graph.currentShape.x + graph.currentShape.w - graph.currentShape.x
                if (width <= 1) {
                    return;
                }
                if (height > 0 && width > 0) {
                    graph.zoomRect(graph.currentShape.x, graph.currentShape.x + graph.currentShape.w,
                        graph.currentShape.y - graph.currentShape.h, graph.currentShape.y, 100)
                    setTimeout(() => {
                        graph.setMouseMode('navigate')
                    }, 100)
                }
                graph.currentShape = null;

            }
        });
    })

}
