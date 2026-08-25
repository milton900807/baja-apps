function (graph) {
    // Annotation tool: a boxed text label to name a feature/region.
    // a comment dialog commits it, then the mouse returns to navigate + mouse-over.
    graph.clearMouseListeners();
    graph.setMouseMode("msg:Click and drag to add a text label");
    graph.selectOff();
    let md = false;
    graph.addMouseDownListener(async (x, y) => {
        let RectangleText = await exec('flexigraph/shapes/RectangleText.js');
        md = true;
        graph.currentShape = new RectangleText('test', x, y);
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
