function (graph, io) {

    // The shape class is loaded UP FRONT, not awaited inside mousedown. An await there
    // leaves a yield between the press and the state it sets: a quick click can land its
    // mouseup BEFORE the class resolves, so mouseup sees no shape and skips its cleanup,
    // and the late mousedown then builds a shape that the still-live move listener stretches
    // to follow the cursor forever. That is the "keeps drawing after mouse up" behaviour.
    let RectangleText = null;
    let md = false;
    exec('flexigraph/shapes/Rect-text.js').then((k) => { RectangleText = k; });

    graph.clearMouseListeners();
    graph.setMouseMode("msg: Click and drag on the canvas")
    graph.selectOff();
    graph.addMouseDownListener((x, y) => {
        if (!RectangleText) return;   // class not loaded yet
        md = true;
        graph.currentShape = new RectangleText('', x, y);
    })
    graph.addMouseMoveListener((x, y) => {
        // Only while the button is DOWN. Without this the box kept following the cursor
        // after mouse up, because currentShape outlives the drag.
        if (!md) return;
        if (graph.currentShape)
            graph.currentShape.update(x, y);
    });
    graph.addMouseUpListener((x, y) => {
        md = false;
        if (!graph.currentShape) {
            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
            graph.setMouseMode('navigate');
            return;
        }
        let panel;
        const __nameHook = createIonFunction((hook) => {
            panel = hook;
        })

        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.setMouseMode('navigate')

        let zoom_to = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '500px',
                cards: [
                    [
                        {
                            'title': ' ', 'body': `Comment.
                                            `                   ,
                            'width': '90%',
                            'component':
                            {
                                wid: 'input-param-items',
                                refCallback: __nameHook,
                                data: {
                                    'input_labels': ['Comment'],
                                }
                            }
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Save', ionFunction: createIonFunction(() => {
                                                graph.currentShape.comment = panel.get('Comment')
                                                graph.currentShape.showRect = false;
                                                graph.saveCurrentShape();

                                                hideAllModal();
                                            })
                                        },
                                        {
                                            label: 'Cancel', ionFunction: createIonFunction(() => {
                                                hideAllModal();
                                            })
                                        }
                                    ]
                                }
                            }
                        }
                    ]]
            }
        }
        showModal(zoom_to)
    })
}
