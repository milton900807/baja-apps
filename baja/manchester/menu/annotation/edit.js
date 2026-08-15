function (graph, genegraph_panel_layout) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
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

        menuList.push({
            label: 'Select...',
            click: async (xwc, ywc) => {
                graph.hideMenu ();
                exec ( 'baja/manchester/select-track-annotations.js', graph, genegraph_panel_layout)
            },
            move: () => {
                log('')
            }
        })

        menuList.push({
            label: 'Mutations',
            click: async (xwc, ywc) => {
                graph.hideMenu ();
                exec ( 'baja/manchester/menu/annotation/mutation.js', graph, genegraph_panel_layout)
            },
            move: () => {
                log('')
            }
        })

        menuList.push({
            label: 'Edit Exons',
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
                                        wid: 'title',
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
                                                console.log('debubg');
                                                let exons = selectedTrack.getExons();
                                                for (let e of exons) {
                                                    if (e.name === name) {
                                                        let jsonEditor = await exec('baja/ui/json-editor.js', e, async (action, res) => {
                                                            console.log('debubg');
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

        menuList.push({
            label: 'Delete type ',
            click: async (xwc, ywc) => {
                let annotation_types = []
                let an = selectedTrack.annotations;
                annotation_types = Array.from(new Set(an.map(obj => obj.type)));
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
                                        wid: 'title',
                                        data: `<h1> Remove annotation type </h1> `
                                    }
                                },

                                {
                                    'title': '',
                                    'width': '100%',
                                    'component':
                                    {
                                        wid: 'multi-select',
                                        data: {
                                            'list': annotation_types,
                                            'showButton': false,
                                            ionFunction: createIonFunction((action_item, value) => {
                                                let type = action_item;
                                                if (type != null && type.length) {

                                                    are_you_sure((v) => {
                                                        if (v) {

                                                            selectedTrack.removeAnnotationByType(type);
                                                            selectedTrack.generateORF ();

                                                            graph.setMessage(` Removed ${action_item} from the track ${selectedTrack.name} `)

                                                        }
                                                        else {
                                                            graph.setMessage(` No ${action_item} were removed `)

                                                        }

                                                        CurrentLayout.clearComponent('mainPanel')
                                                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                    })
                                                } else
                                                    graph.setMessage(" Enter a type to remove from this track ")

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

        if (annotation != null && annotation.length > 0) {
            for (let a of annotation) {
                menuList.push({
                    label: 'Delete ' + a.name,
                    click: async (xwc, ywc) => {
                        selectedTrack.removeAnnotation(a);
                        selectedTrack.generateORF ();

                    },
                    move: () => {
                        log('')
                    }
                })
                menuList.push({
                    label: 'Move ' + a.name,
                    click: async (xwc, ywc) => {

                        graph.pushOntoHistory();

                        exec('baja/manchester/menu/annotation/move-exon.js', selectedTrack, a, graph, genegraph_panel_layout)
                        graph.hideMenu();
                    },
                    move: () => {
                        log('')
                    }
                })
                menuList.push({
                    label: 'Resize ' + a.name,
                    click: async (xwc, ywc) => {
                        exec('baja/manchester/menu/annotation/resize-exon.js', selectedTrack, a, graph, genegraph_panel_layout)
                        graph.hideMenu();
                    },
                    move: () => {
                        log('')
                    }
                })

                menuList.push({
                    label: 'Copy ' + a.name,
                    click: async (xwc, ywc) => {

                        let getB64 = (img) => {
                            var canvas = document.createElement("canvas");
                            canvas.width = img.width;
                            canvas.height = img.height;
                            var ctx = canvas.getContext("2d");
                            ctx.drawImage(img, 0, 0);
                            var base64 = canvas.toDataURL("image/png");
                            return base64;
                        }

                        let jb = JSON.stringify(a, (key, value) => {
                            if (key == "img") {
                                let imgv = value;
                                let v = getB64(imgv);
                                return v
                            }
                            if (key == "trackRef") {
                                if (value != null) {
                                    return "->:" + value.track.name + ':map:' + JSON.stringify(value.map) + ':showMismatches:' + value.showMismatches + ':';
                                }
                                return value;
                            }
                            else {
                                return value;
                            }
                        })
                        const item = new Blob([jb], { type: 'text/plain' });
                        const citem = new ClipboardItem({
                            'text/plain': item
                        });
                        navigator.clipboard.write([citem]);

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
                                                wid: 'title',
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
