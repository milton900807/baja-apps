function (graph) {

    // The shape class is loaded UP FRONT, not awaited inside mousedown. An await there
    // leaves a yield between the press and the state it sets: a quick click can land its
    // mouseup BEFORE the class resolves, so mouseup sees no shape and skips its cleanup,
    // and the late mousedown then builds a shape that the still-live move listener stretches
    // to follow the cursor forever. That is the "keeps drawing after mouse up" behaviour.
    // A press arriving before the class is ready is ignored, which is a dropped click in the
    // first few milliseconds rather than a tool that never lets go.
    let Rectangle = null;
    exec('flexigraph/shapes/sketch-rect.js').then((k) => { Rectangle = k; });

    graph.clearMouseListeners();
    graph.setMouseMode("msg: Click and drag on the canvas")
    graph.selectOff();
    let md = false;
    graph.addMouseDownListener((x, y) => {
        if (!Rectangle) return;   // class not loaded yet
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
        // Release the drag state BEFORE the dialog is awaited, or the move listener keeps
        // resizing the rectangle to the pointer for as long as the comment box is open and
        // it is saved at whatever size the cursor happened to leave it.
        md = false;
        const shape = graph.currentShape;
        // No shape, or a stray click rather than a drag. This used to read
        // graph.currentShape.width with no guard, so a fast click THREW here and every line
        // of cleanup below it was skipped -- the listeners stayed installed and the tool
        // went on drawing after the button was released.
        if (!shape || graph.screenWidth(shape.width) <= 2) {
            graph.currentShape = null;
            return;
        }
        // Navy demo-style comment dialog (was a wid modal).
        const c = await exec('baja/manchester/menu/comment-dialog.js', 'Add a comment', 'Write a note for this annotation.');
        // Work from the LOCAL shape from here on. md is already false, so the first mouse
        // move while the dialog is open sets graph.currentShape to null; reading it back
        // after the await threw, and the cleanup below it was skipped -- the tool stuck on
        // again, by a different route. It is put back only to be saved.
        if (c === null) {
            graph.currentShape = null;
        } else {
            shape.comment = c;
            graph.currentShape = shape;
            graph.saveCurrentShape();
        }
        // Item added (or cancelled) → return to navigate + mouse-over-highlight.
        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.setMouseMode('navigate');
    })

}
