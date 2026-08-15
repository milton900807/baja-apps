function (graph, io) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
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
                        'title': ' ', 'body': ``
                        ,
                        'width': '90%',
                        'component':
                        {
                            wid: 'html',
                            refCallback: __nameHook,
                            data: '<font color=red> Are you sure you want to remove all drawings? </font>'
                        }
                    },
                    {
                        'title': '',
                        'width': '100%',
                        'component': {
                            wid: 'mt-button', data: {
                                buttons: [
                                    {
                                        label: 'Yes', ionFunction: createIonFunction(() => {
                                            graph.shapes = [];
                                            graph.currentShape = null;
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
