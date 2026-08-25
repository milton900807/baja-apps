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
    graph.addMouseUpListener((x, y) => {
        if (graph.screenWidth(graph.currentShape.width) <= 2) {
            graph.currentShape = null;
            return;
        }
        let panel;
        const __nameHook = createIonFunction((hook) => {
            panel = hook;
        })

        let zoom_to = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                width: 480,
                cards: [
                    [
                        {
                            'title': 'Add a comment',
                            'body': 'Write a note for this annotation.',
                            'width': '100%',
                            'component':
                            {
                                wid: 'input-param-items',
                                refCallback: __nameHook,
                                data: {
                                    'input_labels': ['Comment'],
                                }
                            }
                        }
                    ],
                    [
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Save', background: '#1aa3bd', color: '#ffffff', borderColor: '#1aa3bd', ionFunction: createIonFunction(() => {

                                                graph.currentShape.comment = panel.get('Comment')
                                                graph.saveCurrentShape();
                                                hideAllModal();
                                                // Item added → NOW return to navigate + mouse-over-highlight.
                                                graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                                                graph.setMouseMode('navigate');
                                            })
                                        },
                                        {
                                            label: 'Cancel', background: 'transparent', color: '#0a2540', borderColor: '#c7d2dd', ionFunction: createIonFunction(() => {
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
                    ]
                ]
            }
        }
        showModal(zoom_to)
        md = false;
    })

}
