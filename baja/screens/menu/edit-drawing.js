function (graph, genegraph_panel_layout) {
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    let ed;
    const nameHook = createIonFunction((editor) => {
        ed = editor;
    })
    let start = -1;
    let end = -1;
    let ywc = -1;
    let xwc = 0;
    let highlights = []
    let diffh = []
    xi = 0;
    yi = 0
    selectedObject = null;
    md = false;

    graph.addMouseMoveListener((x, y) => {

        if ( md ) {
            for (let h of highlights) {
                let diffy = (this.yi - h.y);
                let diffx = (this.xi - h.x);
                h.x = x+  diffx
                h.y = y + diffy
            }
            return;

        }

        for (let h of highlights) {
            if (h.highlight) {
                h.highlight(false)
            }
        }
        highlights = []
        diffh = []
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
    }
    )

    graph.addMouseUpListener ( (x, y) => {
        if ( graph.menuVisible ()){
            return;
        }
        md =  false;
    })

    graph.addMouseDownListener((x, y) => {
        this.xi = x;
        this.yi = y;
        if (highlights) {
            let v = graph.getStructure(x, y);
            if (v != null && v.length > 0) {
                this.selectedObject = v[0][0];
            }
            for (let h of highlights) {
                let diffy = (this.yi - h.y);
                let diffx = (this.xi - h.x);
                diffh.push({
                    x: diffx,
                    y: diffy
                })
            }
            let menuList = []

            if (this.selectedObject) {
                menuList.push({
                    label: 'Edit...',
                    click: (xwc, ywc) => {
                        start = -1;
                        end = -1;
                        exec('baja/screens/editor/' + this.selectedObject.type + '-editor.js', this.selectedObject, graph, genegraph_panel_layout)
                    },
                    move: () => {
                    }
                })

                menuList.push({
                    label: 'Move',
                    click: (xwc, ywc) => {
                        graph.clearMouseListeners ();
                        exec ( 'baja/screens/editor/move-items.js', graph, genegraph_panel_layout)
                            graph.setMessage ( " Click and drag object you want to move.")
                    },
                    move: () => {
                    }
                })

                menuList.push({
                    label: 'Remove',
                    click: (xwc, ywc) => {

                        let zoom_to = {
                            wid: 'card',
                            componentRef: 'bottomPanel',
                            data: {
                                height: '300px',
                                cards: [
                                    [
                                        {
                                            'title': ' ', 'body': ``
                                            ,
                                            'width': '90%',
                                            'component':
                                            {
                                                wid: 'html',
                                                data: '<font color=red> Remove this drawing object? </font>'
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
                                                                graph.currentShape = null;
                                                                graph.removeShape(this.selectedObject);
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

                    },
                    move: () => {
                    }
                })

            }

            graph.showMenu(menuList, x, y);
        }
    });
}
