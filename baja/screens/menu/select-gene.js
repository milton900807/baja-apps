function (graph, io) {
    let takeComplement = (seq) => {
        let comp = '';
        for (let c of seq) {
            if (c === 'A')
                comp += 'T'
            else if (c === 'T')
                comp += 'A'
            else if (c === 'G')
                comp += 'C'
            else if (c === 'C')
                comp += 'G'
        }
        return comp;
    }
    reverseString = (str) => {
        var newString = "";
        for (var i = str.length - 1; i >= 0; i--) {
            newString += str[i];
        }
        return newString;
    }

    let m = {
        'label': 'Gene', 'ionfunction': createIonFunction(() => {
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
            let highlight_label = 'Highlight region'
            let selectedTrack = null;
            let resizeTrack = false;

            graph.addMouseMoveListener((x, y) => {
                let p_trackIndex = graph.getTrack(x, y);
                if (p_trackIndex >= 0) {
                    graph.deselectAllTracks();
                    if (graph.track[p_trackIndex])
                        graph.track[p_trackIndex].showResizeBar = true;
                    return;
                }
            }
            )

            graph.addMouseDownListener((x, y) => {
                let trackIndex = graph.getTrack(x, y);
                console.log(' selected track ' + trackIndex);
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
                    {
                        label: [highlight_label],
                        click: (xwc, ywc) => {
                            highlight = !highlight;
                            console.log('debubg');
                            start = -1;
                            end = -1;
                        },
                        move: () => {
                        }
                    },
                    {
                        label: 'Export sequence',
                        click: (xwc, ywc) => {

                            let export_sequence = {
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
                                                    data: `Export sequence`
                                                }
                                            },
                                            {
                                                'title': '',
                                                'width': '100%',
                                                'component': {
                                                    wid: 'mt-button', data: {
                                                        buttons: [
                                                            {
                                                                label: 'Entire gene sequence', ionFunction: createIonFunction(() => {
                                                                    hideAllModal();

                                                                    let seq = selectedTrack.getSequence();
                                                                    let b = new Blob([seq], {
                                                                        type: 'text/plain'
                                                                    })
                                                                    const url = URL.createObjectURL(b);
                                                                    const a = document.createElement('a');
                                                                    a.href = url;
                                                                    a.download = 'sequence.fa';
                                                                    const clickHandler = () => {
                                                                        setTimeout(() => {
                                                                            URL.revokeObjectURL(url);
                                                                            this.removeEventListener('click', clickHandler);
                                                                        }, 150);
                                                                    };
                                                                    a.addEventListener('click', clickHandler, false);
                                                                    a.click();
                                                                })
                                                            },
                                                            {
                                                                label: 'Highlighted sequence', ionFunction: createIonFunction(() => {
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

                        },
                        move: () => {
                            log('movei running offtargets....')
                        }

                    }

                ]
                menuList.push({
                    label: 'Find reverse compliment...',
                    click: (xwc, ywc) => {
                        let seq = selectedTrack.sequence;
                        let panel;
                        let nameHook = createIonFunction((inputt) => {
                            panel = inputt;
                        });

                        if (!seq) {
                            prompt(" No sequence found; cannot apply an oligo ")
                        } else {

                            let takeComplement = (seq) => {
                                let comp = '';
                                for (let c of seq) {
                                    if (c === 'A')
                                        comp += 'T'
                                    else if (c === 'T')
                                        comp += 'A'
                                    else if (c === 'G')
                                        comp += 'C'
                                    else if (c === 'C')
                                        comp += 'G'
                                }
                                return comp;
                            }

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
                                                        data: `Enter an oligo sequence`
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
                                                            'input_labels': ['Oligo sequence'],
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
                                                                        let complement = panel.get('Oligo sequence')
                                                                        complement = takeComplement(complement);
                                                                        complement = reverseString(complement);
                                                                        let index = 0;

                                                                        let hits = [];
                                                                        for (let s = 0; s < (seq.length - complement.length); s++) {
                                                                            let sub = seq.substring(s, s + complement.length);
                                                                            if (complement.toUpperCase() == sub.toUpperCase()) {
                                                                                hits.push(s)
                                                                            }
                                                                        }
                                                                        let Oligo = await exec('flexigraph/oligo.js')
                                                                        for (let tstart of hits) {
                                                                            let oligo = new Oligo('aso', complement, complement, selectedTrack.xi + tstart, (selectedTrack.xi + tstart + complement.length));
                                                                            selectedTrack.addOligo(oligo);
                                                                        }
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
                    label: 'Annotate by sequence',
                    click: (xwc, ywc) => {
                        let seq = selectedTrack.sequence;
                        let panel;

                        let le = (a, b) => {

                            const distanceMatrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

                            for (let i = 0; i <= a.length; i += 1) {
                                distanceMatrix[0][i] = i;
                            }

                            for (let j = 0; j <= b.length; j += 1) {
                                distanceMatrix[j][0] = j;
                            }

                            for (let j = 1; j <= b.length; j += 1) {
                                for (let i = 1; i <= a.length; i += 1) {
                                    const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
                                    distanceMatrix[j][i] = Math.min(
                                        distanceMatrix[j][i - 1] + 1,
                                        distanceMatrix[j - 1][i] + 1,
                                        distanceMatrix[j - 1][i - 1] + indicator,
                                    );
                                }
                            }

                            return distanceMatrix[b.length][a.length];
                        }

                        let edit_distance_panel = null;
                        let edit_distance = createIonFunction((p) => {
                            edit_distance_panel = p;
                        })
                        let nameHook = createIonFunction((inputt) => {
                            panel = inputt;
                        });

                        let start_position = selectedTrack.markstart;
                        let end_position = selectedTrack.markend;

                        if (!seq) {
                            prompt(" No sequence found")
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
                                                        data: `Annotate `
                                                    }
                                                },
                                                {
                                                    'title': ' ', 'body': `.
                                            `                   ,
                                                    'width': '90%',
                                                    'component':
                                                    {

                                                        wid: 'input-param-items',
                                                        refCallback: nameHook,
                                                        data: {
                                                            'input_labels': ['Sequence', 'Annotation Type (Exon, UTR, Intron... etc)', 'Name'],
                                                        }
                                                    }
                                                },
                                                {
                                                    'title': ' ', 'body': `
                                            `                   ,
                                                    'width': '90%',
                                                    'component':
                                                    {

                                                        wid: 'input-param-items',
                                                        refCallback: edit_distance,
                                                        data: {
                                                            'input_labels': ['Edit distance', 'From', 'To'],
                                                            'default_values': {
                                                                'Edit distance': 0,
                                                                'From': selectedTrack.markstart,
                                                                'To': selectedTrack.markend
                                                            }
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
                                                                        let complement = panel.get('Sequence')
                                                                        let editDistance = +edit_distance_panel.get('Edit distance')
                                                                        let index = 0;
                                                                        let hits = [];

                                                                        let fromv = 0;
                                                                        let tov = selectedTrack.sequence.length;
                                                                        let temp = edit_distance_panel.get('From')
                                                                        if (temp != null) {
                                                                            fromv = +temp;
                                                                        }
                                                                        temp = edit_distance_panel.get('To')
                                                                        if (temp != null) {
                                                                            tov = +temp;
                                                                        }

                                                                        let annotation_type = panel.get('Annotation Type (Exon, UTR, Intron... etc)')
                                                                        let annotation_name = panel.get('Name')
                                                                        let annotation_color = panel.get('Color')
                                                                        let Annotation = await exec('flexigraph/annotation.js')
                                                                        for (let s = 0; s < (seq.length - complement.length); s++) {
                                                                            let sub = seq.substring(s, s + complement.length);
                                                                            let v = +le(sub.toUpperCase(), complement.toUpperCase())
                                                                            if (v <= editDistance) {
                                                                                console.log('debubg');
                                                                                let annotation = new Annotation(annotation_type, annotation_name, s, s + complement.length, '+')
                                                                                selectedTrack.annotations.push(annotation);

                                                                            }

                                                                            if (complement.toUpperCase() == sub.toUpperCase()) {
                                                                                hits.push(s)
                                                                            }
                                                                        }
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

                let hasExons = false;
                if (selectedTrack) {
                    for (let an of selectedTrack.annotations) {
                        if (an.type === 'Exon') {
                            hasExons = true;
                        }
                    }
                    if (hasExons) {
                        menuList.push({
                            label: 'CDNA track',
                            click: (xwc, ywc) => {
                                let slice = '';
                                let seq = selectedTrack.sequence;
                                if (!seq) {
                                    prompt(" No sequence found ")
                                } else {
                                    let track = selectedTrack.createTrackFromAnnotation('CDNA')

                                    if (selectedTrack.snpindels.length > 0) {

                                        track.liftSnpindels();
                                        track.targetPhase = selectedTrack.targetPhase;
                                    }

                                    if (selectedTrack.oligos && selectedTrack.oligos.length > 0) {
                                        track.liftCompounds();
                                    }
                                    if (selectedTrack.plots && selectedTrack.plots.length > 0) {
                                        track.liftPlots();
                                    }

                                    graph.track.push(track);
                                    CurrentLayout.clearComponent('mainPanel')
                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                }
                            },
                            move: () => {
                                log('move running offtargets....')
                            }
                        })
                        if (highlight && selectedTrack) {
                            menuList.push({
                                label: 'Show sequence',
                                click: (xwc, ywc) => {
                                    let slice = '';

                                    let editor_;
                                    let annotation_editor = createIonFunction((editor) => {
                                        editor_ = editor;
                                        editor.code = slice;
                                    })
                                    let seq = selectedTrack.sequence;
                                    if (!seq) {
                                        prompt(" No sequence found ")
                                    } else {
                                        let initx = selectedTrack.markstart - selectedTrack.tgraph.xmin;
                                        let tox = selectedTrack.markend - selectedTrack.tgraph.xmin;
                                        slice = seq.substring(initx + 1, tox + 1);
                                        prompt(slice)

                                    }
                                },
                                move: () => {
                                    log('movei running offtargets....')
                                }

                            })

                        }

                    }
                    graph.showMenu(menuList, x, y)

                }
            });
        })
    }
    return m;
}
