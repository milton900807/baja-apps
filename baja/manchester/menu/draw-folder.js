function (graph) {
    graph.clearMouseListeners();
    graph.setMouseMode("msg:Click and drag on canvas");
    graph.selectOff();
    let md = false;
    graph.addMouseDownListener(async (x, y) => {
        let Folder = await exec('flexigraph/shapes/sketch-folder.js');
        if (graph.currentShape) {
            graph.currentShape = null;
            return;
        }
        md = true;
        graph.currentShape = new Folder('folder', x, y);
    });
    graph.addMouseMoveListener((x, y) => {
        if (graph.currentShape && md) {

            graph.currentShape?.update(x, y);
        }
    });
    graph.addMouseUpListener((x, y) => {
        let panel;
        const __nameHook = createIonFunction((hook) => {
            panel = hook;
        });
        md = false;
        if (!graph.currentShape) {
            return;
        }

        graph.currentShape.update(x, y);
        let zoom_to = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                width: 480,
                cards: [
                    [
                        {
                            title: 'Name this folder',
                            body: 'Add a short note or description for the folder.',
                            width: '100%',
                            component: {
                                wid: 'input-param-items',
                                refCallback: __nameHook,
                                data: {
                                    input_labels: ['Comment']
                                }
                            }
                        }
                    ],
                    [
                        {
                            title: '',
                            width: '100%',
                            component: {
                                wid: 'mt-button',
                                data: {
                                    buttons: [
                                        {
                                            label: 'Save',
                                            background: '#1aa3bd', color: '#ffffff', borderColor: '#1aa3bd',
                                            ionFunction: createIonFunction(() => {
                                                graph.currentShape.comment = panel.get('Comment');
                                                graph.saveCurrentShape();
                                                graph.currentShape = null;
                                                hideAllModal();
                                                // Item added → NOW return to navigate + mouse-over-highlight.
                                                graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                                                graph.setMouseMode('navigate');
                                            })
                                        },
                                        {
                                            label: 'Cancel',
                                            background: 'transparent', color: '#0a2540', borderColor: '#c7d2dd',
                                            ionFunction: createIonFunction(() => {
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
        };

        showModal(zoom_to);
    });
}
