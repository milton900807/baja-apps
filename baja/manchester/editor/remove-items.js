function (graph) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();
    let start = -1;
    let end = -1;
    let ywc = -1;
    let xwc = 0;
    let highlights = []
    let move = false;
    xi = 0;
    yi = 0

    graph.addMouseDownListener(async (x, y) => {
        this.xi = x;
        this.yi = y;
        let v = graph.getStructure(x, y);
        if (v && v.length > 0) {
            for (let i of v) {
                for (let item of i) {
                    if (item.highlight) {
                        item.highlight(true);
                    }
                    highlights.push(item)
                }
            }
        }
        let menuList = []
        menuList.push({
            label: 'Delete',
            click: (xwc, ywc) => {

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
                                        data: '<font color=red> Are you sure you want to edit? </font>'
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
                                                        console.log('debubg');
                                                        graph.removeAll(highlights);
                                                        highlights = [];
                                                        hideAllModal();
                                                    })
                                                },
                                                {
                                                    label: 'Cancel', ionFunction: createIonFunction(() => {
                                                        highlights = null;
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

            },
            move: () => {
                log('movei running offtargets....')
            }

        })
    })
    graph.addMouseMoveListener((x, y) => {

        for (let h of highlights) {
            if (h.highlight) {
                h.highlight(false)
            }
        }
        highlights = []

        let v = graph.getStructure(x, y);
        if (v && v.length > 0) {
            for (let i of v) {
                for (let item of i) {
                    if (item.highlight) {
                        item.highlight(true);
                    }
                    highlights.push(item)
                }
            }
        }
    });
    graph.addMouseUpListener((x, y) => {
        move = false;
    })

}
