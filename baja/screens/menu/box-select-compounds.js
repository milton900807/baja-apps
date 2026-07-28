function (graph, io) {

    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.setMouseMode('navigate')

    graph.selectOff();
    graph.addMouseDownListener(async (x, y) => {
        let Rectangle = await exec('flexigraph/shapes/rect.js')
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
            if ( width <= 0) {
                return;
            }
            else if (height<= 0) {
                return;
            }

            let tracks = graph.track;
            for ( let t of tracks ) {

            }

            graph.zoomRect(graph.currentShape.x, graph.currentShape.x + graph.currentShape.w,
                graph.currentShape.y - graph.currentShape.h, graph.currentShape.y, 150)
            graph.currentShape = null;

        }
    });

}
