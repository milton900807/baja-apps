function (graph) {

    let m = {
        'label': 'Edit Reference', 'ionfunction': createIonFunction(async () => {
            let selected = null;
            let { Citation, CitationItem } = await exec('flexigraph/shapes/citation.js')
            graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
            graph.selectOff();
            let start = -1;
            let end = -1;
            let ywc = -1;
            let xwc = 0;

            let editor_;
            let annotation_editor = createIonFunction((editor) => {
                editor_ = editor;
            })
            graph.addMouseDownListener(async (x, y) => {
            })
            graph.addMouseMoveListener((x, y) => {
            });
            graph.addMouseUpListener((x, y) => {
                let panel;

                let selectedItem = graph.getHighlighted();
                if (selectedItem && selectedItem.type === 'Citation') {
                    selected = selectedItem;
                }

                const __nameHook = createIonFunction((hook) => {
                    panel = hook;
                    panel.setContent(selected.comment);
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
                                        data: {code:selected.comment}
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
                                                        selected.comment = editor_.code;
                                                        let citation = {
                                                            title: panel.get('Title'),
                                                            authors: panel.get('Authors'),
                                                            url: panel.get('url')
                                                        }
                                                        selected.addURL(citation);
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
                if (selected)
                    showModal(zoom_to)
            })

        })

    }
    return m;
}
