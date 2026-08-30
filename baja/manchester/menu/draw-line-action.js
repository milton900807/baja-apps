function (graph, io) {

    graph.clearMouseListeners();
    graph.setMouseMode("msg:Click and drag on canvas")
    graph.selectOff();
    let start = -1;
    let end = -1;
    let ywc = -1;
    let xwc = 0;
    let md = false;
    graph.addMouseDownListener(async (x, y) => {
        let Line = await exec('flexigraph/shapes/line.js')

        if (graph.currentShape) {
            graph.currentShape = null;
            return;
        }
        md = true;

        graph.currentShape = new Line('test', x, y);
    })
    graph.addMouseMoveListener((x, y) => {
        if (graph.currentShape && md)
            graph.currentShape.update(x, y);
    });
    graph.addMouseUpListener(async (x, y) => {
        md = false;
        if (!graph.currentShape) {
            return;
        }
        // Navy demo-style comment dialog (was a wid modal).
        const c = await exec('baja/manchester/menu/comment-dialog.js', 'Add a comment', 'Write a note for this annotation.');
        if (c === null) {
            graph.currentShape = null;
        } else {
            graph.currentShape.comment = c;
            if (graph.currentShape.w < 0) {
                graph.currentShape.invertX();
                graph.currentShape.invertY();
            }
            graph.saveCurrentShape();
            graph.currentShape = null;
        }
        // Item added (or cancelled) → return to navigate + mouse-over-highlight.
        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.setMouseMode('navigate');
    })
}
