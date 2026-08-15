function (graph) {
    graph.clearMouseListeners();
    graph.setMouseMode("msg:Click and drag on canvas");
    graph.selectOff();
    let md = false;
    graph.addMouseDownListener(async (x, y) => {
        let Folder = await exec('flexigraph/shapes/folder.js');
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

        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.setMouseMode('navigate')

        graph.currentShape.update(x, y);
        let zoom_to = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '800px',
                cards: [[
                    {
                        title: ' ',
                        body: `Comment.`,
                        width: '90%',
                        component: {
                            wid: 'input-param-items',
                            refCallback: __nameHook,
                            data: {
                                input_labels: ['Comment']
                            }
                        }
                    },
                    {
                        title: '',
                        width: '100%',
                        component: {
                            wid: 'mt-button',
                            data: {
                                buttons: [
                                    {
                                        label: 'Save',
                                        ionFunction: createIonFunction(() => {
                                            graph.currentShape.comment = panel.get('Comment');
                                            graph.saveCurrentShape();
                                            graph.currentShape = null;
                                            hideAllModal();
                                        })
                                    },
                                    {
                                        label: 'Cancel',
                                        ionFunction: createIonFunction(() => {
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
        };

        showModal(zoom_to);
    });
}
