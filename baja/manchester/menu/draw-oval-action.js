function (graph) {
    graph.clearMouseListeners();
    graph.setMouseMode("msg:Click and drag on canvas")
    graph.selectOff();
    let md = false;
    graph.addMouseDownListener(async (x, y) => {
        let Oval = await exec('flexigraph/shapes/sketch-oval.js')
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
                    width: 480,
                    cards: [
                        [
                            {
                                'title': 'Add a comment',
                                'body': 'Write a note for this annotation. Paste a PubMed or DOI link to auto-fetch the citation.',
                                'width': '100%',
                                'component':
                                {
                                    wid: 'input-param-items',
                                    refCallback: __nameHook,
                                    data: {
                                        'input_labels': ['Comment'],
                                    }
                                }
                            }
                        ],
                        [
                            {
                                'title': '',
                                'width': '100%',
                                'component': {
                                    wid: 'mt-button', data: {
                                        buttons: [
                                            {
                                                label: 'Save', background: '#1aa3bd', color: '#ffffff', borderColor: '#1aa3bd', ionFunction: createIonFunction(async () => {
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
                                                    // Item added → NOW return to navigate + mouse-over-highlight.
                                                    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                                                    graph.setMouseMode('navigate');
                                                })
                                            },
                                            {
                                                label: 'Cancel', background: 'transparent', color: '#0a2540', borderColor: '#c7d2dd', ionFunction: createIonFunction(() => {
                                                    hideAllModal();
                                                    graph.currentShape = null;
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
            }
            showModal(zoom_to)
        }
        md = false;

    })

}
