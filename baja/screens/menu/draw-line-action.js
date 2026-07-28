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

        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
        graph.setMouseMode('navigate')

        let zoom_to = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '800px',
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
                                                if (graph.currentShape.w < 0) {
                                                    graph.currentShape.invertX();
                                                    graph.currentShape.invertY();
                                                }
                                                graph.saveCurrentShape();
                                                graph.currentShape = null;

                                                hideAllModal();
                                            })
                                        },
                                        {
                                            label: 'Cancel', ionFunction: createIonFunction(() => {
                                                graph.currentShape = null;

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
