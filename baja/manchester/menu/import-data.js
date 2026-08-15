function (graph, io) {

    let m = {
        'label': 'Sequence', 'ionfunction': createIonFunction(() => {
            graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
            graph.selectOff();
            let editor_;
            let xypanel_;

            let annotation_editor = createIonFunction((editor) => {
                editor_ = editor;
            })
            let __nameHook = createIonFunction((editor) => {
                xypanel_ = editor;
            })
            let start = -1;
            let end = -1;
            let ywc_select;

            let dp = {
                wid: 'card',
                componentRef: 'bottomPanel',
                data: {
                    height: '800px',
                    cards: [
                        [
                            {
                                'title': '',
                                'width': '100%',
                                'component': {
                                    wid: 'html',
                                    data: `Zoom to coordinates`
                                }
                            },
                            {
                                'title': ' ', 'body': `Below is the RNA engine for algorithmic designs.
                                            `                   ,
                                'width': '90%',
                                'component':
                                {
                                    wid: 'input-param-items',
                                    refCallback: __nameHook,
                                    data: {
                                        'input_labels': ['Name', 'X', 'Y'],
                                    }
                                }
                            },
                            {
                                'title': '',
                                'width': '100%',
                                'component': {
                                    wid: 'html',
                                    data: `Paste sequence below`
                                }
                            },
                            {
                                'title': '',
                                'width': '100%',
                                'component': {
                                    wid: 'text-editor',
                                    refCallback: annotation_editor,
                                    data: ''
                                }
                            },
                            {
                                'title': '',
                                'width': '100%',
                                'component': {
                                    wid: 'mt-button', data: {
                                        buttons: [
                                            {
                                                label: 'Apply', ionFunction: createIonFunction(async () => {
                                                    let sequence = editor_.code.trim();
                                                    let x = parseFloat ( xypanel_.get ('X'))
                                                    let y = parseFloat ( xypanel_.get ('Y'))
                                                    let track = graph.createTrack (xypanel_.get ('Name'), x, x+sequence.length, '+'   )
                                                    track.sequence = sequence;

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
            showModal(dp)
        })
    }
    return m;

}
