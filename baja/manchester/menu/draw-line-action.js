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
    graph.addMouseUpListener((x, y) => {
        let panel;
        const __nameHook = createIonFunction((hook) => {
            panel = hook;
        })
        md = false;

        if (!graph.currentShape) {
            return;
        }

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
                                                if (graph.currentShape.w < 0) {
                                                    graph.currentShape.invertX();
                                                    graph.currentShape.invertY();
                                                }
                                                graph.saveCurrentShape();
                                                graph.currentShape = null;

                                                hideAllModal();
                                                // Item added → NOW return to navigate + mouse-over-highlight.
                                                graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                                                graph.setMouseMode('navigate');
                                            })
                                        },
                                        {
                                            label: 'Cancel', background: 'transparent', color: '#0a2540', borderColor: '#c7d2dd', ionFunction: createIonFunction(() => {
                                                graph.currentShape = null;

                                                hideAllModal();
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

    })
}
