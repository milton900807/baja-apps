function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {

        let edit_list = [];
        edit_list.push('Find-ASO-Match')
        edit_list.push('Compare')
        edit_list.push('Exon')

        let t = {
            wid: 'selection-list',
            data: {
                single_selection: true,
                show_button: false,
                singleSelect: true,
                listItems: edit_list,
                button_function: createIonFunction(async (items) => {
                    function moveToFirst(arr, item) {
                        const index = arr.indexOf(item);
                        if (index !== -1) {
                            arr.splice(index, 1);
                            arr.push(item);
                        }
                        return arr;
                    }
                    function moveToLast(arr, item) {
                        const index = arr.indexOf(item);
                        if (index !== -1) {
                            arr.splice(index, 1);
                            arr.unshift(item);
                        }
                        return arr;
                    }
                    if (items[0] === 'Color') {
                        let color_panel = {
                            wid: 'card',
                            data: {
                                cards: [
                                    [

                                        {
                                            'width': '100%',
                                            "style.padding-top": '4px',
                                            "style.border": '1px',
                                            'component':
                                            {
                                                'wid': 'color-chooser',
                                                "data": {
                                                    "selectionListener": createIonFunction((color) => {
                                                    })
                                                }
                                            }
                                        },
                                    ]
                                ]
                            }
                        }
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', color_panel);
                    }
                    else if (items[0] === 'Find-ASO-Match') {
                        let nameField;
                        let name_panel = {
                            wid: 'card',
                            data: {
                                cards: [
                                    [
                                        {
                                            'width': '100%',
                                            "style.padding-top": '4px',
                                            "style.border": '1px',
                                            'component':
                                            {
                                                'wid': 'input-textfield',
                                                'title': 'Text:',
                                                'data': {
                                                    'blocking': false,
                                                    'text': '',
                                                    'show-button': false,
                                                    'ionHookFunction': createIonFunction((w) => {
                                                    }),
                                                    'ionHookFunction': createIonFunction((input_box) => {
                                                        nameField = input_box;
                                                    })
                                                }
                                            }
                                        }, {
                                            'title': ' ', 'body': ``,
                                            'width': '100%',
                                            'component':
                                            {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Save', ionFunction: createIonFunction(async () => {
                                                                let name = nameField.value;
                                                                if (name != null && name.length > 0) {
                                                                }
                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                            })
                                                        },
                                                        {
                                                            label: 'Clear all', ionFunction: createIonFunction(async () => {
                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                            })
                                                        },
                                                        {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {

                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                            })
                                                        }
                                                    ]
                                                }
                                            }
                                        },
                                        {
                                            'title': ' ', 'body': ``,
                                            'width': '30%',
                                            'component':
                                            {
                                                wid: 'html',
                                                data: ''
                                            }
                                        },
                                    ]
                                ]
                            }
                        }
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', name_panel);
                    }

                    else if (items[0] === 'Exon') {

                        let mstart;
                        let mend;

                        let nameField;
                        let name_panel = {
                            wid: 'card',
                            data: {
                                cards: [
                                    [

                                        {
                                            'width': '50%',
                                            "style.padding-top": '4px',
                                            "style.border": '1px',
                                            'component':
                                            {
                                                'wid': 'html',
                                                'data': '<b> Exon name </b>'
                                            }
                                        },

                                        {
                                            'width': '50%',
                                            "style.padding-top": '4px',
                                            "style.border": '1px',
                                            'component':
                                            {
                                                'wid': 'input-textfield',
                                                'data': {
                                                    'blocking': false,
                                                    'text': '',
                                                    'show-button': false,
                                                    'ionHookFunction': createIonFunction((w) => {
                                                    }),
                                                    'ionHookFunction': createIonFunction((input_box) => {
                                                        nameField = input_box;
                                                    })
                                                }
                                            }
                                        },
                                        {
                                            'title': ' ', 'body': ``,
                                            'width': '100%',
                                            'component':
                                            {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Start', ionFunction: createIonFunction(async () => {
                                                                graph.clearMouseListeners();
                                                                graph.deselectAllTracks();

                                                                graph.addMouseDownListener(async (x, y) => {
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
                                                                    if (selectedTrack) {
                                                                        selectedTrack.markstart = Math.floor(selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2));
                                                                        if (!selectedTrack.markend || (selectedTrack.markend - selectedTrack.markstart < 0)) {
                                                                            selectedTrack.markend = selectedTrack.markstart
                                                                        }
                                                                        mstart = selectedTrack.markstart;
                                                                    }
                                                                })
                                                                graph.addMouseMoveListener((x, y) => {
                                                                    let trackIndex = graph.getTrack(x, y);
                                                                    if (trackIndex >= 0) {
                                                                        selectedTrack = graph.track[trackIndex]
                                                                        if (selectedTrack)
                                                                            selectedTrack.select();
                                                                    }
                                                                });
                                                                graph.addMouseUpListener(async (x, y) => {
                                                                })
                                                            })
                                                        },
                                                        {
                                                            label: 'End', ionFunction: createIonFunction(async () => {

                                                                if (!mstart || mstart === null) {
                                                                    graph.setMessage("Choose start first... ")
                                                                    return;
                                                                }

                                                                graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');
                                                                let selectedTrack;
                                                                let ywc = 0;
                                                                graph.addMouseDownListener(async (x, y) => {
                                                                    let trackIndex = graph.getTrack(x, y);
                                                                    if (trackIndex >= 0) {
                                                                        selectedTrack = graph.track[trackIndex]
                                                                        selectedTrack.select();
                                                                    }
                                                                    if (!selectedTrack) {
                                                                        graph.setMessage(" Select a track.")
                                                                        return;
                                                                    }

                                                                    if (!mstart || mstart === null) {
                                                                        graph.setMessage("Choose start position first... ")
                                                                        return;
                                                                    }

                                                                    if (selectedTrack) {
                                                                        selectedTrack.markstart = mstart;
                                                                        let t = Math.ceil(selectedTrack.tgraph.Xwc(x - selectedTrack.tgraph.xi * 2));
                                                                        if (t < mstart) {
                                                                            graph.setMessage(' Must be greater than the start site ')
                                                                            return;
                                                                        }
                                                                        selectedTrack.markend = t;
                                                                        mend = selectedTrack.markend;
                                                                    }
                                                                })
                                                                graph.addMouseMoveListener((x, y) => {
                                                                    let trackIndex = graph.getTrack(x, y);
                                                                    if (trackIndex >= 0) {
                                                                        selectedTrack = graph.track[trackIndex]
                                                                        selectedTrack.select();
                                                                    }
                                                                });
                                                                graph.addMouseUpListener(async (x, y) => {
                                                                })
                                                            })
                                                        },
                                                        {
                                                            label: 'Apply', ionFunction: createIonFunction(async () => {
                                                                let name = nameField.value;
                                                                if (name === null || name.length <= 0) {
                                                                    graph.setMessage('Please provide a valid name for this exon ')
                                                                    return;
                                                                }
                                                                for (let selectedTrack of graph.track) {
                                                                    if (selectedTrack.markstart && selectedTrack.markend && (selectedTrack.markend - selectedTrack.markstart) > 1) {
                                                                        graph.setMessage(" Creating new exon at " + selectedTrack.markstart + " " + selectedTrack.markend)
                                                                        let Annotation = await exec('flexigraph/annotation.js')
                                                                        selectedTrack.add(new Annotation("Exon", name, Math.floor(selectedTrack.markstart), Math.floor(selectedTrack.markend) - 1, selectedTrack.strand))
                                                                        selectedTrack.markstart = null;
                                                                        selectedTrack.markend = null;
                                                                    }
                                                                }
                                                                let hl = await exec('baja/manchester/menu/annotation-tools-simple.js', graph, genegraph_panel_layout)
                                                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                                CurrentLayout.setComponent('buttonMenuPanel', hl);
                                                            })
                                                        }
                                                    ]
                                                }
                                            }
                                        },
                                        {
                                            'title': ' ', 'body': ``,
                                            'width': '30%',
                                            'component':
                                            {
                                                wid: 'html',
                                                data: ''
                                            }
                                        },
                                    ]
                                ]
                            }
                        }
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                        setTimeout(() => {
                            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                            CurrentLayout.setComponent('buttonMenuPanel', name_panel);
                        }, 1000)

                    }
                    else if (items[0] === 'Compare') {

                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                        let compare_canvas = await exec('baja/manchester/menu/compare-sequences-button-panel.js', graph)
                        CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                        CurrentLayout.setComponent('buttonMenuPanel', compare_canvas);

                        return;

                    } else if (items[0] === 'Show') {
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    } else if (items[0] === 'Hide') {
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    } else if (items[0] === 'To back') {
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    } else if (items[0] === 'To front') {
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    }
                    else if (items[0] === 'Turn off interaction') {
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    }
                    else if (items[0] === 'Turn on interaction') {
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                    }
                    else if (items[0] === 'Delete layer') {
                        let name_panel = {
                            wid: 'card',
                            data: {
                                cards: [
                                    [

                                        {
                                            'width': '100%',
                                            "style.padding-top": '4px',
                                            "style.border": '1px',
                                            'component':
                                            {
                                                'wid': 'html',
                                                'data': ` <h2> Are you sure you want to delete this layer? </h2>`
                                            }
                                        }, {
                                            'title': ' ', 'body': ``,
                                            'width': '100%',
                                            'component':
                                            {
                                                wid: 'mt-button', data: {
                                                    buttons: [
                                                        {
                                                            label: 'Delete', ionFunction: createIonFunction(async () => {
                                                            })
                                                        }, {
                                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                            })
                                                        }
                                                    ]
                                                }
                                            }
                                        },
                                        {
                                            'title': ' ', 'body': ``,
                                            'width': '30%',
                                            'component':
                                            {
                                                wid: 'html',
                                                data: ''
                                            }
                                        },
                                    ]
                                ]
                            }
                        }
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', name_panel);

                    }
                })
            }
        }

        let html = '<hr> <h5> Edit Layer  </h5>'
        let wg = {
            wid: 'card',
            componentRef: 'bt',
            data: {
                height: '1500px',
                cards: [
                    [
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: `${html}`
                            }
                        }, {
                            'title': '',
                            'width': '100%',
                            'component': t
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Close', ionFunction: createIonFunction(() => {
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
        CurrentLayout.setComponent('mainPanel', wg);
    })
}
