function (graph, genegraph_panel_layout) {
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();

    let selectedTrack;
    let MD = false;
    let annotation = null;
    graph.addMouseDownListener(async (x, y) => {
        if (!graph.menuVisible()) {
            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                selectedTrack = graph.track[trackIndex]
                if (selectedTrack)
                    selectedTrack.select();

            }

            if (!selectedTrack) {
                graph.setMessage(" Select a track.")
                return;
            }
            MD = true;
        }

        else {
            if (selectedTrack != null) {

                annotation = selectedTrack.getAnnotation(selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi*2), selectedTrack.tgraph.Ywc(y))
            }
        }
    })
    graph.addMouseMoveListener((x, y) => {
        if (graph.menuVisible()) {
        }
        else {

            graph.deselectAllTracks();
            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                selectedTrack = graph.track[trackIndex]
                if (selectedTrack)
                    selectedTrack.select();
            } else {
                graph.deselectAllTracks();

            }
            if (selectedTrack != null) {
                let aannotation = selectedTrack.getAnnotationX((selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi*2)))
                annotation = []

                if (aannotation && aannotation.length > 0) {
                    let name = ''
                    for (let an of aannotation) {
                        if (an.type === 'Exon') {
                            name += an.name + ' ';
                            annotation.push(an);
                        }

                    }
                    graph.setMessage(name)
                }
            }
        }
    });
    graph.addMouseDownListener(async (x, y) => {

        let menuList = []

        if (annotation != null && annotation.length > 0) {
            for (let a of annotation) {

                menuList.push({
                    label: 'Expand donor site ' + a.name,
                    click: async (xwc, ywc) => {
                        exec('baja/screens/menu/annotation/resize-exon.js', selectedTrack, a, graph, genegraph_panel_layout)
                        graph.hideMenu();
                    },
                    move: () => {
                        log('')
                    }
                })
                menuList.push({
                    label: 'Contract donor site ' + a.name,
                    click: async (xwc, ywc) => {
                        exec('baja/screens/menu/annotation/mouse-over-exon-highlighted.js', graph, genegraph_panel_layout, selectedTrack, 'donor');

                    },
                    move: () => {
                        log('')
                    }
                })

                menuList.push({
                    label: 'Edit ' + a.name,
                    click: async (xwc, ywc) => {

                        let panel;
                        let _panel = createIonFunction((_p) => {
                            panel = _p;
                        })
                        let input = {
                            wid: 'card',
                            componentRef: 'bottomPanel',
                            data: {
                                height: '800px',
                                cards: [
                                    [
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component':
                                            {
                                                wid: 'html',
                                                data: `<h1> Edit annotation type </h1> `
                                            }
                                        },

                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component':
                                            {
                                                wid: 'json',
                                                refCallback: _panel,
                                                data: JSON.stringify(a)
                                            }
                                        },
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(() => {
                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                            })
                                                        },
                                                        {
                                                            label: 'OK', ionFunction: createIonFunction(() => {

                                                                console.log('debubg');
                                                                if (panel) {
                                                                    try {
                                                                        let v = panel.data;
                                                                        let jv = JSON.parse(v);
                                                                        selectedTrack.annotations.map(obj => obj.name === a.name ? jv : obj);

                                                                    } catch (exception) {
                                                                        prompt('Failed to parse the object ')
                                                                    }
                                                                }
                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                            })
                                                        }
                                                    ]
                                                }
                                            }
                                        }
                                    ]]
                            }
                        }
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', input);

                    },
                    move: () => {
                        log('')
                    }
                })

                menuList.push({
                    label: 'Remove Splice models' + a.name,
                    click: async (xwc, ywc) => {
                        let AttributionLayer = await exec('baja/bio/attribution-layer.js');
                        selectedTrack.track_layers = selectedTrack.track_layers.filter(item => (item instanceof AttributionLayer));
                    },
                    move: () => {
                        log('')
                    }
                })

            }
        }
        graph.showMenu(menuList, x, y, 280)

    })
}
