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

                showModal ( {
                    wid:'json',
                    data:JSON.stringify ( annotation )
                })

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

        menuList.push({
            label: 'Edit Exon',
            click: async (xwc, ywc) => {
                let annotation_types = []
                let an = selectedTrack.annotations;
                annotation_types = Array.from(new Set(an.map(obj => obj.type)));

                let exon_list = selectedTrack.getExons();
                exon_list = Array.from(new Set(an.map(obj => obj.name)));

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
                                        data: `<h1> Edit exon </h1> `
                                    }
                                },

                                {
                                    'title': '',
                                    'width': '100%',
                                    'component': {
                                        wid: 'selection-list',
                                        data: {
                                            single_selection: true,
                                            show_button: false,
                                            singleSelect: true,
                                            listItems: exon_list,
                                            button_function: createIonFunction(async (items) => {
                                                let name = items[0]
                                                let exons = selectedTrack.getExons();
                                                for (let e of exons) {
                                                    if (e.name === name) {
                                                        let jsonEditor = await exec('baja/ui/json-editor.js', e, async (action, res) => {
                                                            if (action === 'OK') {
                                                                let AnnotationFactory = await exec('flexigraph/annotation-factory.js')
                                                                let annotationObject = AnnotationFactory.generate(res);
                                                                selectedTrack.annotations = selectedTrack.annotations.map(obj => obj.name === annotationObject.name ? res : obj);
                                                            } else if (action.toLowerCase() === 'delete') {
                                                                selectedTrack.annotations = selectedTrack.annotations.filter(obj => obj.name !== name);
                                                            } else { }
                                                            CurrentLayout.clearComponent('mainPanel')
                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                        });
                                                        CurrentLayout.clearComponent('mainPanel')
                                                        CurrentLayout.setComponent('mainPanel', jsonEditor);
                                                    }
                                                }

                                            })
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
                                                    label: 'Cancel', ionFunction: createIonFunction(() => {
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

        graph.showMenu(menuList, x, y, 280)

    })
}
