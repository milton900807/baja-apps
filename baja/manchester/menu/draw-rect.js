function (graph, io) {

    let m = {
        'label': 'Rectangle', 'ionfunction': createIonFunction(() => {
            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');

            graph.selectOff();
            let start = -1;
            let end = -1;
            let ywc = -1;
            let xwc = 0;
            graph.addMouseDownListener(async (x, y) => {
                let Rectangle = await exec('flexigraph/shapes/rect.js')
                graph.currentShape = new Rectangle('test', x, y);
            })
            graph.addMouseMoveListener((x, y) => {
                if (graph.currentShape)
                    graph.currentShape.update(x, y);
            });
            graph.addMouseUpListener((x, y) => {

                if ( graph.screenWidth ( graph.currentShape.width) <= 2){
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
                                                        graph.currentShape.comment = panel.get ( 'Comment')
                                                        graph.saveCurrentShape ( );
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

        })

    }
    return m;
}
