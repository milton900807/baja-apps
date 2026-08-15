function (graph) {
    graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
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
                label: 'Highlight motif',
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
                                                data: '<font color=red> Failed to find the START codon in this transcript. </font> Make sure to provide an annotation called "Translation"'
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
                                        'title': 'Enter query sequence motif',
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
                                                                ct = ct.trim();
                                                            }
                                                            let value = ct;
                                                            var searchStrLen = value.trim().length;
                                                            if (searchStrLen <= 2) {
                                                                alert(' Search string must be more than two characters ')
                                                                return;
                                                            }
                                                            var startIndex = 0, index, indices = [];

                                                            let sequence = selectedTrack.getSequence ();
                                                            sequence = sequence.substring (0, utr_start.xi - selectedTrack.xi)

                                                            while ((index = sequence.indexOf(value, startIndex)) > -1) {
                                                                indices.push(index);
                                                                startIndex = index + searchStrLen;
                                                            }
                                                            let TrackLayer = await exec('baja/bio/track-layer.js')
                                                            let ti = selectedTrack;

                                                            let layer = new TrackLayer('' + value.trim(), ti.tgraph.xmin, 0, ti.tgraph.xmax, 1)
                                                            for (let ind of indices) {
                                                                let ab = new Annotation('highlight', 'highlight', ti.tgraph.xmin + ind, ti.tgraph.xmin + ind + searchStrLen, ti.strand)
                                                                ab.color = 'magenta';
                                                                layer.addAnnotation(ab);
                                                            }
                                                            ti.addLayer(layer);

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
