function (graph, io) {

    let m = {
        'label': 'Oval', 'ionfunction': createIonFunction(() => {
            graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
            graph.selectOff();
            let start = -1;
            let end = -1;
            let ywc = -1;
            let xwc = 0;
            graph.addMouseDownListener(async (x, y) => {
                let Oval = await exec('flexigraph/shapes/oval.js')
                graph.currentShape = new Oval('test', x, y);
            })
            graph.addMouseMoveListener((x, y) => {
                if (graph.currentShape)
                    graph.currentShape.update(x, y);
            });
            graph.addMouseUpListener((x, y) => {
                let panel;

                graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
                graph.setMouseMode('navigate')

                const __nameHook = createIonFunction((hook) => {
                    panel = hook;
                })
                let zoom_to = {
                    wid: 'card',
                    componentRef: 'bottomPanel',
                    data: {
                        height: 800,
                        width: 600,
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
                                    'width': '200px',
                                    'component': {
                                        wid: 'mt-button', data: {
                                            buttons: [
                                                {
                                                    label: 'Save', ionFunction: createIonFunction(() => {
                                                        let c = panel.get('Comment')
                                                        console.log(' c ' + c);
                                                        graph.currentShape.comment = c
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

        })

    }
    return m;
}
