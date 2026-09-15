function (graph) {
    // The shape class is loaded UP FRONT, not awaited inside mousedown. An await there
    // leaves a yield between the press and the state it sets: a quick click can land its
    // mouseup BEFORE the class resolves, so mouseup sees no shape, and the late mousedown
    // then builds a folder that the move listener keeps stretching after the button is up.
    let Folder = null;
    exec('flexigraph/shapes/sketch-folder.js').then((k) => { Folder = k; });

    graph.clearMouseListeners();
    graph.setMouseMode("msg: Click and drag on the canvas");
    graph.selectOff();
    let md = false;

    // Put the tool away: the mouse operation is over, so hand the canvas back to
    // navigate + mouse-over-highlight whether or not a folder was drawn.
    const release = () => {
        md = false;
        graph.currentShape = null;
        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
        graph.setMouseMode('navigate');
    };

    graph.addMouseDownListener((x, y) => {
        if (!Folder) return;   // class not loaded yet
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
        // No shape, or a stray click rather than a drag: nothing to name, so the
        // operation is complete -- return to navigate instead of staying armed.
        if (!graph.currentShape) {
            release();
            return;
        }
        graph.currentShape.update(x, y);
        if (graph.screenWidth(Math.abs(graph.currentShape.w || 0)) <= 2) {
            release();
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
                                                if (graph.currentShape) {
                                                    graph.currentShape.comment = panel.get('Comment');
                                                    graph.saveCurrentShape();
                                                }
                                                hideAllModal();
                                                // Item added → NOW return to navigate + mouse-over-highlight.
                                                release();
                                            })
                                        },
                                        {
                                            label: 'Cancel',
                                            background: 'transparent', color: '#0a2540', borderColor: '#c7d2dd',
                                            ionFunction: createIonFunction(() => {
                                                hideAllModal();
                                                release();
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
