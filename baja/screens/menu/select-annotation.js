function (graph) {

    graph.addMouseMoveListener((x, y) => {
        let p_trackIndex = graph.getTrack(x, y);
        if (p_trackIndex >= 0) {
            graph.deselectAllTracks();
            if (graph.track[p_trackIndex]) {
                graph.track[p_trackIndex].showResizeBar = true;
                let selectedTrack = graph.track[p_trackIndex]
                if (selectedTrack) {
                    let wx = selectedTrack.tgraph.Xwc(x);
                    let snp = selectedTrack.getSnpindelsInRange(wx, wx+100, graph)

                }

            }
        }

    })

    reverseString = (str) => {
        var newString = "";
        for (var i = str.length - 1; i >= 0; i--) {
            newString += str[i];
        }
        return newString;
    }

    let m = {
        'label': 'Annotations', 'ionfunction': createIonFunction(() => {
            graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
            graph.selectOff();
            let ed;
            const nameHook = createIonFunction((editor) => {
                ed = editor;
            })
            let start = -1;
            let end = -1;
            let ywc = -1;
            let highlight = false;
            let selectedTrack = null;
            let annotations = []
            let p_trackIndex;

            graph.addMouseMoveListener((x, y) => {
                p_trackIndex = graph.getTrack(x, y);
                if (p_trackIndex >= 0) {
                    graph.deselectAllTracks();
                    if (graph.track[p_trackIndex]) {
                        graph.track[p_trackIndex].showResizeBar = true;
                        let t = graph.track[p_trackIndex];
                        let xt = t.tgraph.Xwc(x);
                        let xi = xt + t.tgraph.xi - 1;
                        let xf = xt + 1 + t.tgraph.xi;
                        annotations = t.getAnnotationsInRange(xi, xf);
                        let msg = ''
                        if (annotations != null && annotations.length) {
                            for (let a of annotations) {
                                msg += a.name + '  '
                            }
                        }

                        if (msg != null && msg.length > 0)
                            graph.setMessage(msg);
                    }
                    return;
                }
            }
            )

            graph.addMouseDownListener(async (x, y) => {
                let trackIndex = graph.getTrack(x, y);
                let Annotation = await exec('flexigraph/annotation.js')

                if (trackIndex >= 0) {
                    selectedTrack = graph.track[trackIndex]
                }
                ywc = y;
                if (highlight && selectedTrack) {
                    if (start < 0) {
                        let xsc = graph.X(x);
                        selectedTrack.tgraph.rescale();
                        console.log(xsc + ' xi : ' + selectedTrack.tgraph.xi);
                        let t = selectedTrack.tgraph.xi;
                        start = selectedTrack.tgraph.Xwc(x - t * 2);
                        selectedTrack.markstart = start;
                    }
                    else if (start > 0 && end < 0) {
                        let t = selectedTrack.tgraph.xi;
                        end = selectedTrack.tgraph.Xwc(x - t * 2);
                        selectedTrack.markend = end;
                    }
                    highlight_label = 'Clear highlight'

                } else {
                    highlight_label = 'Highlight region'
                }
                let menuList = [

                ]

                if (annotations && annotations.length) {
                    for (let a of annotations) {

                        menuList.push({
                            label: '' + a.name,
                            click: (xwc, ywc) => {

                                let sequence = selectedTrack.getSequenceRange__((a.xi),
                                    a.xf);

                                console.log(' seq ' + sequence);

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
                                                            data: `` + a.name
                                                        }
                                                    },
                                                    {
                                                        'title': ' ', 'body': `Below is the RNA engine for algorithmic designs.
                                                    `                   ,
                                                        'width': '90%',
                                                        'component':
                                                        {

                                                            wid: 'json',
                                                            data: JSON.stringify({ 'properties': a, 'sequence': sequence })
                                                        }
                                                    },
                                                    {
                                                        'title': '',
                                                        'width': '100%',
                                                        'component': {
                                                            wid: 'mt-button', data: {
                                                                buttons: [
                                                                    {
                                                                        label: 'Remove this annotation', ionFunction: createIonFunction(async () => {

                                                                            selectedTrack.removeAnnotation ( a )

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
                                    }
                                )

                            },
                            move: () => {
                                log('movei running offtargets....')
                            }

                        })

                    }
                }

                menuList.push({
                    label: 'Add sequence variants...',
                    click: (xwc, ywc) => {
                        let seq = selectedTrack.sequence;
                        let panel;
                        let nameHook = createIonFunction((inputt) => {
                            panel = inputt;
                        });

                        if (!seq) {
                            prompt(" No sequence found; cannot apply an oligo ")
                        } else {

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
                                                        data: `Variant`
                                                    }
                                                },
                                                {
                                                    'title': ' ', 'body': `Below is the RNA engine for algorithmic designs.
                                            `                   ,
                                                    'width': '90%',
                                                    'component':
                                                    {

                                                        wid: 'input-param-items',
                                                        refCallback: nameHook,
                                                        data: {
                                                            'input_labels': ['Variant Sequence'],
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
                                                                        let vs = panel.get('Variant Sequence')
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
                                }

                            )

                        }
                    },
                    move: () => {
                        log('movei running offtargets....')
                    }

                })

                menuList.push({
                    label: 'Annotate TSS...',
                    click: (xwc, ywc) => {
                        let tstartIndex = selectedTrack.getStartCodonIndex();
                        let startIndex = selectedTrack.tgraph.X(tstartIndex);
                        let annotation = new Annotation('TSS', 'TSS', tstartIndex, tstartIndex + 3)
                        selectedTrack.setAnnotation(annotation)
                        graph.zoomRect(startIndex - 100, startIndex + 100, -1 + selectedTrack.y + selectedTrack.tgraph.height,
                            1 + selectedTrack.y + selectedTrack.tgraph.height, 130);
                    },
                    move: () => {
                        log('movei running offtargets....')
                    }

                })
                menuList.push({
                    label: 'Annotate Stop',
                    click: (xwc, ywc) => {
                        let tstartIndex = selectedTrack.getStopCodonIndex();
                        let startIndex = selectedTrack.tgraph.X(tstartIndex);
                        let annotation = new Annotation('STOP', 'STOP', tstartIndex, tstartIndex + 3)
                        selectedTrack.setAnnotation(annotation)
                        graph.zoomRect(startIndex - 100, startIndex + 100, -1, 1, 130);
                    },
                    move: () => {
                        log('movei running offtargets....')
                    }

                })

                menuList.push({
                    label: 'SNPs',
                    click: (x, y) => {

                    },
                    move: () => {
                        log('movei running offtargets....')
                    }

                })

                menuList.push({
                    label: 'Show coding sequence',
                    click: (xwc, ywc) => {
                        let seq = selectedTrack.getCDS();
                        if (seq.sequence != null && seq.sequence.length > 0) {
                            let junktions = seq.junctions;
                            let sseq = '';
                            let start = 0;
                            if (junktions != null && junktions.length > 0) {
                                for (let j of junktions) {
                                    sseq += seq.sequence.substring(start, j) + '\n'
                                    start = j;
                                }
                            } else {
                                sseq = seq.sequence;
                            }

                            let editorComponent;
                            let item = {
                                wid: 'card',
                                data: {
                                    padding: 2,
                                    'style.padding-left': '22px',
                                    cards: [
                                        [
                                            {
                                                'width': '100%',
                                                'height': '50px',
                                                'component':
                                                {
                                                    wid: 'html',
                                                    data: `<h5>  nt length: ${seq.sequence.length} </h5> `
                                                }
                                            },
                                            {
                                                'title': '', 'body': `
                                                                `,
                                                'width': '90%',
                                                'height': '50px',
                                                'component':
                                                {
                                                    wid: 'text-editor',
                                                    refCallback: createIonFunction((editor) => {
                                                        editorComponent = editor;
                                                    }),
                                                    componentRef: 'sequence_editor',
                                                    data: {
                                                        height: '515px',
                                                        code: sseq,
                                                        editorOptions: {
                                                            language: 'text', automaticLayout: true,
                                                            lineHeight: 20, fontSize: 12,
                                                            semanticHighlighting: { enabled: false },
                                                            minimap: { enabled: true }, scrollbar: {
                                                                verticalScrollbarSize: 14,
                                                                verticalHasArrows: false
                                                            }, verticalHasArrows: false, height: '50px',
                                                            colors: {
                                                                'editor.foreground': '#000000',
                                                                'editor.background': '#EDF9FA',
                                                                'editorCursor.foreground': '#8B0000',
                                                                'editor.lineHighlightBackground': '#0000FF20',
                                                                'editorLineNumber.foreground': '#008800',
                                                                'editor.selectionBackground': '#88000030',
                                                                'editor.inactiveSelectionBackground': '#88000015'
                                                            }
                                                        }
                                                    }
                                                }
                                            },
                                        ]]
                                }
                            }

                            showModal(item)
                        }

                    },
                    move: () => {
                        log('movei running offtargets....')
                    }

                })

                graph.showMenu(menuList, x, y)

            })

        })
    }
    return m;
}
