function (graph, io) {

    // The shape class is loaded UP FRONT, not awaited inside mousedown. An await there
    // leaves a yield between the press and the state it sets: a quick click can land its
    // mouseup BEFORE the class resolves, so mouseup sees no shape and skips its cleanup,
    // and the late mousedown then builds a shape that the still-live move listener stretches
    // to follow the cursor forever. That is the "keeps drawing after mouse up" behavior.
    // A press arriving before the class is ready is ignored, which is a dropped click in the
    // first few milliseconds rather than a tool that never lets go.
    let Line = null;
    exec('flexigraph/shapes/line.js').then((k) => { Line = k; });

    graph.clearMouseListeners();
    graph.setMouseMode("msg: Drag from where the arrow starts to what it points at");
    graph.selectOff();
    let md = false;
    graph.addMouseDownListener((x, y) => {
        if (!Line) return;   // class not loaded yet
        // A shape left over from a previous drag used to SWALLOW this press -- it cleared the
        // leftover and returned, so the first click after any interruption drew nothing and
        // the user pressed again. Clear it and start the new arrow in the same gesture.
        md = true;
        graph.currentShape = new Line('test', x, y);
    })
    graph.addMouseMoveListener((x, y) => {
        if (graph.currentShape && md)
            graph.currentShape.update(x, y);
    });
    graph.addMouseUpListener(async (x, y) => {
        md = false;
        const shape = graph.currentShape;
        const release = () => {
            graph.currentShape = null;
            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
            graph.setMouseMode('navigate');
        };
        if (!shape) { release(); return; }
        // A CLICK IS NOT AN ARROW. Without a minimum drag a stray click saved a zero-length
        // arrow: nothing visible on the canvas, but a real object in the model that had to be
        // hunted down to delete. The rectangle tool has always had this guard; this one did
        // not. Measured on SCREEN, so the threshold means the same thing at every zoom.
        let px = 0;
        try {
            px = Math.hypot(graph.X(shape.xf) - graph.X(shape.x),
                            graph.Y(shape.yf) - graph.Y(shape.y));
        } catch (e) { px = 0; }
        if (!(px > 6)) {
            graph.setMessage(' Too short to be an arrow — drag from the start to what it points at. ');
            release();
            return;
        }
        // Navy demo-style comment dialog (was a wid modal).
        const c = await exec('baja/manchester/menu/comment-dialog.js', 'Add a comment', 'Write a note for this annotation.');
        // The LOCAL shape, for the same reason as draw-rect-action.js: graph.currentShape
        // can be cleared by a mouse move while the dialog is open.
        if (c === null) {
            graph.currentShape = null;
        } else {
            shape.comment = c;
            if (shape.w < 0) { shape.invertX(); shape.invertY(); }
            graph.currentShape = shape;
            graph.saveCurrentShape();
            graph.currentShape = null;
        }
        // Item added (or cancelled) → return to navigate + mouse-over-highlight.
        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.setMouseMode('navigate');
        try { if (graph.wake) graph.wake(); } catch (e) { }
    })
}
