function (graph) {

    graph.clearMouseListeners();
    graph.setMouseMode("msg:Click and drag on canvas")
    graph.selectOff();
    let md = false;
    graph.addMouseDownListener(async (x, y) => {
        let Rectangle = await exec('flexigraph/shapes/sketch-rect.js')
        md = true;
        graph.currentShape = new Rectangle('test', x, y);
    })
    graph.addMouseMoveListener((x, y) => {
        if (!md) {
            graph.currentShape = null;
        }
        if (graph.currentShape)
            graph.currentShape.update(x, y);
    });
    graph.addMouseUpListener(async (x, y) => {
        if (graph.screenWidth(graph.currentShape.width) <= 2) {
            graph.currentShape = null;
            return;
        }
        // Navy demo-style comment dialog (was a wid modal).
        const c = await exec('baja/manchester/menu/comment-dialog.js', 'Add a comment', 'Write a note for this annotation.');
        if (c === null) {
            graph.currentShape = null;
        } else {
            graph.currentShape.comment = c;
            graph.saveCurrentShape();
        }
        // Item added (or cancelled) → return to navigate + mouse-over-highlight.
        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.setMouseMode('navigate');
        md = false;
    })

}
