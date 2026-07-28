function (graph) {

    return new Promise(async (resolve, reject) => {

        let selectedTrack;

        function filterDuplicatesByAttribute2(arr, attribute, attribute2) {
            const uniqueAttributeValues = new Set();
            const uniqueObjects = [];

            for (const obj of arr) {
                const attributeValue = obj[attribute];
                const attributeValue2 = obj[attribute2];
                if (!uniqueAttributeValues.has(attributeValue) && !uniqueAttributeValues.has(attributeValue2)) {
                    uniqueAttributeValues.add(attributeValue);
                    uniqueObjects.push(obj);
                }
            }

            return uniqueObjects;
        }

        let extractSeqList = (oligos) => {
            let seqlist = []
            for (let o of oligos) {
                seqlist.push(o.sequence)
            }
            return seqlist;
        }

        let fetchPlot = (x) => {
            for (let p of selectedTrack.plots) {
                if (Math.floor(p.x) === x) {
                    console.log('debubg');
                    return p;
                }
            }
        }

        let removeDuplicateObjects = (arr) => {
            const uniqueJSONStrings = new Set();
            const uniqueObjects = [];

            for (const obj of arr) {
                const jsonString = JSON.stringify(obj);
                if (!uniqueJSONStrings.has(jsonString)) {
                    uniqueJSONStrings.add(jsonString);
                    uniqueObjects.push(obj);
                }
            }

            return uniqueObjects;
        }

        let removeObjectWithIdEqualTo2 = (arr) => {
            return arr.filter(obj => obj.sequence.indexOf('GGGG') >= 0);
        }
        let progressBar;
        let em = new EngineMonitor((msg) => {
        });
        em.addProgressListener((v) => {
            progressBar(v);
        })
        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
        graph.selectOff();
        graph.setMessage("Click on a track... ")
        const nameHook = createIonFunction((editor) => {
            ed = editor;
        })
        let menuList = [];
        menuList.push({
            label: "Remove duplicates (xi)",
            click: async (x, y) => {
                if (selectedTrack) {
                    selectedTrack.oligos = filterDuplicatesByAttribute2(selectedTrack.oligos, "xi", "name")

                }
            },
            move: () => {
            }
        }, {

            label: "Filter (edit distance)",
            click: async (x, y) => {
                if (selectedTrack) {
                    if (selectedTrack) {
                        showModal({
                            wid: 'card',
                            data: {
                                cards: [
                                    [
                                        {
                                            width: '100%',
                                            'component':
                                            {
                                                wid: 'html', data: 'Remove sequences less than... '
                                            }
                                        },
                                        {
                                            width: '100%',
                                            'component': {
                                                wid: 'input-param-items',
                                                data: {
                                                    input_labels: ['Edit distance'],
                                                    buttons: [{
                                                        'label': 'Cancel', 'function': createIonFunction((button_label, input_params) => {
                                                            hideAllModal();
                                                        })
                                                    }, {
                                                        'label': 'Apply', 'function': createIonFunction(async (button_label, input_params) => {

                                                            let Barchart = await exec('baja/bio/barchart-track.js')

                                                            let length = +input_params['Edit distance']
                                                            if (length > 3) {
                                                                alert(' Please provide an edit distance < 3')
                                                                return;
                                                            }
                                                            let w = {
                                                                wid: 'progress',
                                                                componentRef: 'progressBar',
                                                                data: {
                                                                    'progress': 1,
                                                                    'progressBar': createIonFunction((progessBar) => {
                                                                        progressBar = progessBar;
                                                                    })
                                                                }
                                                            }
                                                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                            CurrentLayout.setComponent('buttonMenuPanel', w);
                                                            hideAllModal();
                                                            let seqlist = extractSeqList(selectedTrack.oligos);
                                                            let res = await exec('py/bio/map/le-map-sequences.py', em, selectedTrack.sequence, seqlist, length);
                                                            console.log('debubg');
                                                            let hts = []
                                                            let nplots = []
                                                            for (let gr of res) {
                                                                if (gr && gr.length > 0) {
                                                                    for (let r of gr) {
                                                                        if (r[7] > 1) {
                                                                            for (let oligo_ of selectedTrack.oligos) {
                                                                                if (oligo_.sequence === r[1]) {
                                                                                    hts.push(oligo_)
                                                                                    let plot = fetchPlot(Math.floor(oligo_.xi))
                                                                                    if (plot)
                                                                                        nplots.push(plot)

                                                                                }
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }

                                                            selectedTrack.oligos = hts;
                                                            selectedTrack.plots = nplots;
                                                        })
                                                    }]
                                                }
                                            }
                                        }
                                    ]
                                ]
                            }
                        }, 500);

                    } else {
                        graph.setMessage(" Please select a track")
                    }
                }
            },
            move: () => {
            }
        },

            {

                label: "Filter by Off-target count",
                click: async (x, y) => {
                    if (selectedTrack) {
                        if (selectedTrack) {
                            showModal({
                                wid: 'card',
                                data: {
                                    cards: [
                                        [
                                            {
                                                width: '100%',
                                                'component':
                                                {
                                                    wid: 'html', data: 'Remove compounds with off-target count greater than... '
                                                }
                                            },
                                            {
                                                width: '100%',
                                                'component': {
                                                    wid: 'input-param-items',
                                                    data: {
                                                        input_labels: ['Off-target'],
                                                        buttons: [{
                                                            'label': 'Cancel', 'function': createIonFunction((button_label, input_params) => {
                                                                hideAllModal();
                                                            })
                                                        }, {
                                                            'label': 'Apply', 'function': createIonFunction(async (button_label, input_params) => {

                                                                let confirm = await exec('baja/lib/confirm-widget.js', async () => {
                                                                    let length = +input_params['Off-target']
                                                                    selectedTrack.oligos = selectedTrack.oligos.filter(obj => {
                                                                        if (obj.hasOwnProperty("offtarget") && obj.offtarget != null ) {
                                                                            return obj["offtarget"].length < length;
                                                                        }else if ( obj.offtarget === null )
                                                                        {

                                                                            graph.setMessage ( "Warning: Found compounds without off-targets.")
                                                                            return obj["offtarget"].length < length;

                                                                        }
                                                                        return false;
                                                                    });

                                                                })
                                                                showModal(confirm)

                                                            })
                                                        }]
                                                    }
                                                }
                                            }
                                        ]
                                    ]
                                }
                            }, 500);

                        } else {
                            graph.setMessage(" Please select a track")
                        }
                    }
                },
                move: () => {
                }
            },

            {
                label: "Remove short sequences ",
                click: async (xwc, ywc) => {

                    showModal({
                        wid: 'card',
                        data: {
                            cards: [
                                [
                                    {
                                        width: '100%',
                                        'component':
                                        {
                                            wid: 'html', data: 'Remove sequences less than... '
                                        }
                                    },
                                    {
                                        width: '100%',
                                        'component': {
                                            wid: 'input-param-items',
                                            data: {
                                                input_labels: ['Length'],
                                                buttons: [{
                                                    'label': 'Cancel', 'function': createIonFunction((button_label, input_params) => {
                                                        hideAllModal();
                                                    })
                                                }, {
                                                    'label': 'Apply', 'function': createIonFunction((button_label, input_params) => {

                                                        let length = +input_params['Length']
                                                        let arr = selectedTrack.oligos;
                                                        selectedTrack.oligos = arr.filter(obj => {
                                                            if (obj.hasOwnProperty("sequence")) {
                                                                return obj["sequence"].length > length;
                                                            }
                                                            return false;
                                                        });
                                                        hideAllModal();

                                                    })
                                                }]
                                            }
                                        }
                                    }
                                ]
                            ]
                        }
                    }, 500);

                },
                move: () => {
                    log('')
                }
            },

            {
                label: "Remove GGGG",
                click: async (xwc, ywc) => {
                    if (selectedTrack) {
                        selectedTrack.oligos = removeObjectWithIdEqualTo2(selectedTrack.oligos)
                    }
                },
                move: () => {
                    log('')
                }
            },
            {
                label: 'Clear all',
                click: async (xwc, ywc) => {
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
                                            data: '<font color=red> Are you sure you want to remove all compounds? </font>'
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

                                                            let c = 0;
                                                            for (let t of graph.track) {
                                                                t.oligos = []
                                                            }
                                                            graph.setMessage(" Compounds removed from all tracks.");
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
            },
        )

        graph.addMouseMoveListener(async (x, y) => {
            let p_trackIndex = graph.getTrack(x, y);
            if (p_trackIndex >= 0) {
                graph.deselectAllTracks();
                if (graph.track[p_trackIndex])
                    graph.track[p_trackIndex].showResizeBar = true;
                return;
            }
        }
        )
        graph.addMouseDownListener(async (x, y) => {
            let trackIndex = graph.getTrack(x, y);
            if (trackIndex >= 0) {
                selectedTrack = graph.track[trackIndex]
            }
            if (selectedTrack)
                graph.showMenu(menuList, x, y)
        });

    })

    let screenActions = {
        label: 'Compounds', 'items': [
            {
                label: 'Tile...',
                ionfunction: createIonFunction(async () => {
                    graph.setMessage('Select a point on a track')
                    exec('baja/screens/menu/paint-oligos.js', graph)
                })
            },
            {
                label: 'Tile on track variants',
                ionfunction: createIonFunction(async () => {
                    if (graph.track.length > 0) {
                        let hasSnpindel = 0;
                        for (let t of graph.track) {
                            if (t.snpindels.length > 0) {
                                hasSnpindel = 1;
                            }
                        }
                        if (hasSnpindel == 1) {
                            graph.setMessage('Choose variant to tile...')
                            await exec('baja/screens/annotation/paint-oligos-snps.js', graph)
                        } else {
                            graph.setMessage('No variants found')
                        }
                    }
                })

            },

            {
                label: 'Draw',
                ionfunction: createIonFunction(async () => {
                    if (!graph.props.selected_chemistry) {
                        graph.setMessage('No chemistry selected.')
                        return;
                    }
                    graph.setMessage('Select location on track')
                    exec('baja/screens/menu/draw-oligos.js', graph)
                })
            },
            {
                label: 'Paste Sequences',
                ionfunction: createIonFunction(async () => {
                    showModal({
                        wid: 'card',
                        height: '100%',
                        data: {
                            cards: [
                                [
                                    {

                                        'width': '100%',
                                        'component': {
                                            wid: 'menu',
                                            data: {
                                                menus: [
                                                    {
                                                        'label': 'Type', 'items': [

                                                            {
                                                                'label': 'Sequences list', 'ionfunction': createIonFunction(async () => {
                                                                    let paste_sequences_panel = await exec('baja/chem/paste-sequences-nochem.js', graph)
                                                                    await showModal(paste_sequences_panel)

                                                                })
                                                            },
                                                            {
                                                                'label': 'ID | sequences| KD', 'ionfunction': createIonFunction(async () => {
                                                                    let paste_sequences_panel = await exec('baja/chem/paste-sequences-nochem.js', graph)
                                                                    await showModal(paste_sequences_panel)
                                                                })
                                                            },
                                                        ]
                                                    },
                                                ]
                                            }
                                        }

                                    }
                                ]]
                        }
                    }, 200, 100)

                })
            },
            {

                'label': 'Define synthesis sequence', 'ionfunction': createIonFunction(async () => {

                    if (graph.selectedCompounds && graph.selectedCompounds.length > 0) {
                        let seqMode = '';
                        let modify_sequence = {
                            wid: 'card',
                            data: {
                                "style.padding-top": '10px',
                                cards: [
                                    [
                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Cancel and return to Design', ionFunction: createIonFunction(() => {
                                                                hideAllModal();

                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                            })
                                                        },
                                                    ]
                                                }
                                            }
                                        },
                                        {
                                            'title': ' ', 'body': ` `,
                                            'width': '100%',
                                            'component':
                                            {
                                                wid: 'html',
                                                data: `
                                             <font color="red"> NOTE: any modifications to synthesis sequence will require the re-registration </font>
                                            <hr>
                                            <h4>Select a sequence orientation for synthesis:</h4>
                                            `
                                            }
                                        },
                                        {

                                            'title': ' ', 'body': ` `,
                                            'width': '100%',
                                            'component':
                                            {
                                                wid: 'radio-buttons',
                                                data: {
                                                    'selected': "0",
                                                    'buttons': [
                                                        {
                                                            'label': 'Target sequence', ionfunction: createIon(() => {
                                                                seqMode = "Target sequence";
                                                            }
                                                            )
                                                        }, {
                                                            'label': 'Complement of target sequence', ionfunction: createIon(() => {
                                                                seqMode = "Complement of target sequence";
                                                            }
                                                            ),
                                                        },
                                                        {
                                                            'label': 'Reverse complement of target sequence', ionfunction: createIon(() => {
                                                                seqMode = "Reverse complement of target sequence";
                                                            }
                                                            )
                                                        }
                                                    ],
                                                }
                                            }
                                        },

                                        {
                                            'width': '100%',
                                            'component': {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                hideAllModal();

                                                                await exec('baja/screens/apply-synthesis-sequence', graph, seqMode)
                                                                graph.setMessage("All modifications to chemistry and/or seqeunce will require structure registration.")

                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                            })
                                                        },
                                                    ]
                                                }
                                            }
                                        },

                                    ]]
                            }
                        }

                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', modify_sequence);

                    } else {
                        graph.setMessage(' No oligos are selected. ')
                    }
                })
            },

            {
                label: 'Move oligo (XY)',
                ionfunction: createIonFunction(async () => {
                    graph.setMessage('Select a locus on a track')
                    exec('baja/screens/menu/move-oligos.js', graph)
                })
            },
            {
                label: 'Move oligo (Y)',
                ionfunction: createIonFunction(async () => {
                    graph.setMessage('Select a locus on a track')
                    exec('baja/screens/menu/move-oligos-vertical.js', graph)
                })
            },
            {
                label: 'View oligo',
                ionfunction: createIonFunction(async () => {
                    graph.setMessage('Select a track')
                    exec('baja/screens/menu/find-oligos.js', graph)
                })
            },
            {
                label: 'Select all',
                ionfunction: createIonFunction(async () => {

                    let total = []
                    for (let t of graph.track) {
                        for (let o of t.oligos) {
                            total.push({ 'o': o, 't': t })
                        }
                    }
                    graph.setSelectedCompounds(total)
                    graph.setMessage('Total selected: ' + total.length);
                    graph.currentShape = null;
                })
            },
            {
                label: 'Clear all',
                ionfunction: createIonFunction(async () => {
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
                                            data: '<font color=red> Are you sure you want to remove all compounds? </font>'
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

                                                            let c = 0;
                                                            for (let t of graph.track) {
                                                                t.oligos = []
                                                            }
                                                            graph.setMessage(" Compounds removed from all tracks.");
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

                })
            },
            {
                label: 'Apply compound filtering rule',
                ionfunction: createIonFunction(async () => {
                    await exec('baja/screens/annotation/dynamic-rule-application.js', graph);
                })
            }
        ]
    }

}
