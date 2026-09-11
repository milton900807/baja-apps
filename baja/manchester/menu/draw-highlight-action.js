function (graph) {
    // Annotation tool: highlight a region with a dashed outline. Click-drag to size;
    // a comment dialog commits it, then the mouse returns to navigate + mouse-over.
    // The shape class is loaded UP FRONT, not awaited inside mousedown. An await there
    // leaves a yield between the press and the state it sets: a quick click can land its
    // mouseup BEFORE the class resolves, so mouseup sees no shape and skips its cleanup,
    // and the late mousedown then builds a shape that the still-live move listener stretches
    // to follow the cursor forever. That is the "keeps drawing after mouse up" behavior.
    // A press arriving before the class is ready is ignored, which is a dropped click in the
    // first few milliseconds rather than a tool that never lets go.
    let HighlightBox = null;
    exec('flexigraph/shapes/highlight-box.js').then((k) => { HighlightBox = k; });

    graph.clearMouseListeners();
    graph.setMouseMode("msg: Click and drag to highlight a region");
    graph.selectOff();
    let md = false;
    graph.addMouseDownListener((x, y) => {
        if (!HighlightBox) return;   // class not loaded yet
        md = true;
        graph.currentShape = new HighlightBox('test', x, y);
    });
    graph.addMouseMoveListener((x, y) => {
        if (!md) { graph.currentShape = null; }
        if (graph.currentShape) graph.currentShape.update(x, y);
    });
    graph.addMouseUpListener((x, y) => {
        if (!graph.currentShape || graph.screenWidth(Math.abs(graph.currentShape.w || 0)) <= 2) {
            graph.currentShape = null;
            md = false;
            return;
        }
        let panel;
        const __nameHook = createIonFunction((hook) => { panel = hook; });
        let zoom_to = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '800px',
                cards: [[
                    {
                        'title': ' ', 'body': `Comment.`,
                        'width': '90%',
                        'component': { wid: 'input-param-items', refCallback: __nameHook, data: { 'input_labels': ['Comment'] } }
                    },
                    {
                        'title': '', 'width': '100%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Save', ionFunction: createIonFunction(() => {
                                            graph.currentShape.comment = panel.get('Comment');
                                            graph.saveCurrentShape();
                                            hideAllModal();
                                            // Item added → back to navigate + mouse-over-highlight.
                                            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                                            graph.setMouseMode('navigate');
                                        })
                                    },
                                    {
                                        label: 'Cancel', ionFunction: createIonFunction(() => {
                                            hideAllModal();
                                            graph.currentShape = null;
                                            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                                            graph.setMouseMode('navigate');
                                        })
                                    }
                                ]
                            }
                        }
                    }
                ]]
            }
        };
        showModal(zoom_to);
        md = false;
    });
}
