function (graph) {

    let m = {
        'label': 'Mark w/ reference', 'ionfunction': createIonFunction(() => {
            graph.clearMouseListeners();
            graph.selectOff();
            let editor_;
            let annotation_editor = createIonFunction((editor) => {
                editor_ = editor;
            })
            graph.addMouseDownListener(async (x, y) => {
                let {Citation, CitationItem} = await exec('flexigraph/shapes/citation.js')
                graph.currentShape = new Citation('test', x, y);
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
                let zoom_to = {
                    wid: 'card',
                    componentRef: 'bottomPanel',
                    data: {
                        height: '800px',
                        cards: [
                            [
                                {
                                    'title': 'Description',
                                    'width': '100%',
                                    'component': {
                                        wid: 'text-editor',
                                        refCallback: annotation_editor,
                                        data: ''
                                    }
                                },
                                {
                                    'title': ' ', 'body': `
                                            `                   ,
                                    'width': '90%',
                                    'component':
                                    {
                                        wid: 'input-param-items',
                                        refCallback: __nameHook,
                                        data: {
                                            'input_labels': ['Title', 'Authors', 'url'],
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
                                                        graph.currentShape.comment = editor_.code;
                                                        let citation = {
                                                            title: panel.get ( 'Title'),
                                                            authors: panel.get ('Authors'),
                                                            url : panel.get ('url')
                                                        }
                                                        graph.currentShape.addURL(citation);
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
