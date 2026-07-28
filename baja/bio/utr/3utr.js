function (graph) {
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();
    let selectedTrack = null;

    graph.addMouseMoveListener((x, y) => {
        let trackIndex = graph.getTrack(x, y);
        if (trackIndex >= 0) {
            let cselectedTrack = graph.track[trackIndex]
            if (cselectedTrack && selectedTrack != cselectedTrack) {
                if (selectedTrack)
                    selectedTrack.showResizeBar = false;
            }
            selectedTrack = cselectedTrack;
            if (selectedTrack)
                selectedTrack.showResizeBar = true;
        } else {
            graph.selectOff();
            selectedTrack = null;
        }
    })

    graph.addMouseDownListener((x, y) => {
        let menuList = [
            {
                label: 'Add relative coordinate annotations',
                click: async (xwc, ywc) => {
                    let Annotation = await exec('flexigraph/annotation.js')

                    let v;
                    let build = 'General';

                    let utr_start = selectedTrack.getAnnotationByName('TRANSLATION')

                    if (!utr_start) {
                        let deleteItem = {
                            wid: 'card',
                            data: {
                                height: '600px',
                                cards: [
                                    [
                                        {
                                            'title': ' ', 'body': ``
                                            ,
                                            'width': '90%',
                                            'component':
                                            {
                                                wid: 'html',
                                                data: '<font color=red> Failed to find the STOP codon in this transcript. </font> Make sure to provide an annotation called "Translation"'
                                            }
                                        },
                                        {
                                            'title': '',
                                            'width': '100%',
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'OK', ionFunction: createIonFunction(() => {
                                                                hideAllModal();
                                                            })
                                                        }]
                                                }
                                            }
                                        }
                                    ]]
                            }
                        }
                        showModal(deleteItem)
                        return;
                    }

                    let export_sequence = {
                        wid: 'card',
                        componentRef: 'bottomPanel',
                        data: {
                            height: '800px',
                            cards: [
                                [
                                    {
                                        'title': 'Enter annotation in 2 column format:  [name] |  [position from start of UTR (e.g. 1-100)] ',
                                        'width': '100%',
                                        'component': {
                                            wid: 'input-textarea-editor',
                                            data: {
                                                'showButton': false,
                                                'title': 'ID',
                                                'ionHookFunction': createIonFunction((input_box) => {
                                                    v = input_box;
                                                })
                                            }
                                        }
                                    },
                                    {
                                        'title': '',
                                        'width': '100%',
                                        'component': {
                                            wid: 'input-textfield',
                                            data: {
                                                'show-button': false,
                                                'title': 'Annotation Type',
                                                'text': '',
                                                'ionHookFunction': createIonFunction((input_box) => {
                                                    build = input_box;
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
                                                        label: 'Save', ionFunction: createIonFunction(async () => {
                                                            let ct = v.getWidgetValue();
                                                            if (ct.indexOf('\n') > 0) {
                                                                let list = ct.split('\n');
                                                                for (let l of list) {
                                                                    if (l.trim().length > 0) {

                                                                        l = l.trim();
                                                                        let sp = l.split('\t')
                                                                        let annotation_name = sp[0]
                                                                        if (sp[1].indexOf('-')) {
                                                                            let index_range = sp[1].split('-')
                                                                            let starti = +index_range[0]
                                                                            let endi = +index_range[1]
                                                                            let start = utr_start.xf + starti;
                                                                            let end = utr_start.xf + endi;
                                                                            let annotation = new Annotation(build.value, annotation_name, start, end)
                                                                            annotation.labelY = Math.random () * 2;
                                                                            selectedTrack.add(annotation)
                                                                        }
                                                                    }
                                                                }
                                                            } else {
                                                                let l = ct.trim();

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
                    showModal(export_sequence)
                }

            },
            {
                label: 'Zoom to UTR',
                click: (xwc, ywc) => {
                    let seq = selectedTrack.sequence;
                    let panel;
                    const __nameHook = createIonFunction((editor) => {
                        panel = editor;
                    })

                    showModal(
                        {
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
                                                data: `Enter coordinate range `
                                            }
                                        },
                                        {
                                            'title': ' ', 'body': `.
                                        `                   ,
                                            'width': '90%',
                                            'component':
                                            {

                                                wid: 'input-param-items',
                                                refCallback: __nameHook,
                                                data: {
                                                    'input_labels': ['Start', 'End'],
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
                                                            label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                let seq = selectedTrack.getSequence();
                                                                let start = panel.get('Start')
                                                                let end = panel.get('End')
                                                                start = +start;
                                                                end = +end;
                                                                gstart = selectedTrack.tgraph.X(start)
                                                                gend = selectedTrack.tgraph.X(end)
                                                                graph.zoom(gstart, gend)

                                                                await hideAllModal();
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
                        })

                },
                move: () => {
                    log('movei running offtargets....')
                }
            },

        ]

        if (selectedTrack)
            graph.showMenu(menuList, x, y)

    })

}
