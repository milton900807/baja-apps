function (graph, io) {

    let panel;
    const __nameHook = createIonFunction ( (hook) => {
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
                                'input_labels': ['Start', 'End'
                                ],
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
                                        label: 'Go', ionFunction: createIonFunction(() => {
                                            graph.zoomTo ( panel.get('Start'), panel.get ('End'))
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
