function (graph, io) {

    graph.clearMouseListeners();
    graph.setMouseMode("msg:Click and drag on canvas")
    graph.selectOff();
    graph.addMouseDownListener(async (x, y) => {
        let RectangleText = await exec('flexigraph/shapes/Rect-text.js')
        graph.currentShape = new RectangleText('', x, y);
    })
    graph.addMouseMoveListener((x, y) => {
        if (graph.currentShape)
            graph.currentShape.update(x, y);
    });
    graph.addMouseUpListener((x, y) => {
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
