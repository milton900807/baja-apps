function (graph) {
    graph.clearMouseListeners();
    graph.setMouseMode("msg:Click and drag on canvas")
    graph.selectOff();
    let md = false;
    graph.addMouseDownListener(async (x, y) => {
        let Oval = await exec('flexigraph/shapes/oval.js')
        md = true;
        graph.currentShape = new Oval('test', x, y);
    })
    graph.addMouseMoveListener((x, y) => {
        if (!md) {
            graph.currentShape = null;
        }
        if (graph.currentShape)
            graph.currentShape.update(x, y);
    });
    graph.addMouseUpListener((x, y) => {
        let panel;
        const __nameHook = createIonFunction((hook) => {
            panel = hook;
        })
        function extractFirstUrl(text) {

            const urlPattern = /https?:\/\/[^\s/$.?#].[^\s]*/g;
            const match = text.match(urlPattern);

            return match ? match[0] : null;
        }
        function extractPubmedId(url) {
            const pubmedUrlPattern = /https?:\/\/pubmed.ncbi.nlm.nih.gov\/(\d+)\//;
            const match = url.match(pubmedUrlPattern);

            if (match && match[1]) {
                return match[1];
            } else {
                return null;
            }
        }

        if (graph.currentShape) {
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
                                                label: 'Save', ionFunction: createIonFunction(async () => {
                                                    graph.pushOntoHistory()
                                                    let c = panel.get('Comment')
                                                    let url = extractFirstUrl(c);
                                                    if (url) {
                                                        let pubmedid = extractPubmedId(url);
                                                        let res = await exec('py/baja/pubmed.py', pubmedid)
                                                        graph.currentShape.comment = '' + (res['Title'] + '\n' + res['Authors']) + '\n' + c;
                                                    } else {
                                                        graph.currentShape.comment = c;
                                                    }
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
        }
        md = false;

    })

}
