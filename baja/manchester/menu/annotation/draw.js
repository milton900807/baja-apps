function (graph) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
    graph.selectOff();

    let selectedTrack;
    let ywc = 0;
    let MD = false;

    graph.addMouseDownListener(async (x, y) => {
        if (graph.currentShape) {
            graph.currentShape = null;
        }
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            selectedTrack = graph.track[trackIndex]
        }

        if (!selectedTrack) {
            graph.setMessage(" Select a track.")
            return;
        }
        MD = true;

        let Line = await exec('flexigraph/shapes/line-simple.js')
        ywc = selectedTrack.tgraph.Y(0)
        graph.currentShape = new Line('test', Math.round(x), ywc);
    })
    graph.addMouseMoveListener((x, y) => {
        if (!MD) {
            graph.currentShape = null;
        }

        if (graph.menuVisible()) {
            return;
        }
        if (graph.currentShape)
            graph.currentShape.update(Math.floor(x), ywc);
    });
    graph.addMouseUpListener(async (x, y) => {
        if (graph.currentShape === null) {
            graph.hideMenu();
            return;
        }

        if (graph.menuVisible()) {
            return;
        }

        let panel;
        const __nameHook = createIonFunction((hook) => {
            panel = hook;
        })
        let jpanel;
        const __nameJHook = createIonFunction((hook) => {
            jpanel = hook;
        })

        if (!graph.currentShape) {
            return;
        }

        let Annotation = await exec('flexigraph/annotation.js')

        if (graph.currentShape) {
            let axi = Math.round(selectedTrack.tgraph.Xwc(graph.currentShape.x));
            let axf = Math.round(selectedTrack.tgraph.Xwc(graph.currentShape.xf));

            if (Math.abs(axf - axi) <= 0) {
                graph.currentShape = null
                graph.hideMenu();
                return;
            }

            if (selectedTrack.strand < 0) {
                let t = axf;
                axf = axi
                axi = t;
            }
            let menuList = []
            menuList.push(
                {
                    label: "Exon",
                    click: async (xwc, ywc) => {
                        selectedTrack.add(new Annotation("Exon", Math.random() + '-name', axi, axf, selectedTrack.strand))
                        graph.currentShape = null;
                        graph.hideMenu ();
                    },
                    move: () => {
                        log('')
                    }
                })

            menuList.push(
                {
                    label: "Editor...",
                    click: async (xwc, ywc) => {

                        let an = new Annotation('Unknown', 'Unknown', axi, axf)
                        MD = false;

                        let zoom_to = {
                            wid: 'card',
                            componentRef: 'bottomPanel',
                            data: {
                                height: '800px',
                                cards: [
                                    [

                                        {
                                            'title': ' ', 'body': `.
                                            `                   ,
                                            'width': '100%',
                                            'component':
                                            {
                                                wid: 'json',
                                                refCallback: __nameJHook,
                                                data: JSON.stringify(an)
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

                                                                console.log('debubg');

                                                                let js = jpanel.getData();
                                                                graph.currentShape = null;
                                                                try {
                                                                    let jso = JSON.parse(js);
                                                                    selectedTrack.add(new Annotation(jso.type, jso.name, jso.xi, jso.xf, selectedTrack.strand))
                                                                } catch (e) {
                                                                    alert(' Failed to parse the object... ')
                                                                }
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
                        log('')
                    }
                })

            graph.showMenu(menuList, x, y, 300)
            MD = false;
        }

    })
}
