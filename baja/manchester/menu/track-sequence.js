function (graph, genegraph_panel_layout) {

    let button_canvas = {
        wid: 'button-canvas',
        data: {
            'title': 'controls',
            'height': 30,
            'width': 400,
            'grid': {
                xmin: 0,
                xmax: 5,
                ymin: -0.01,
                ymax: 1,
                xinset: 0,
                yinset: 0
            },
            'buttons': [
                {
                    x: 0, y: 0, label: 'Select', ionFunction: createIonFunction(async () => {
                        await exec('baja/manchester/menu/sequence.js', graph, genegraph_panel_layout)

                    })
                },
                {
                    x: 1, y: 0, label: 'Highlight', ionFunction: createIonFunction(async () => {
                        let Annotation = await exec('flexigraph/annotation.js')

                        const buildLPSArray = (pattern) => {
                            let length = 0;
                            let lps = [0];
                            let i = 1;

                            while (i < pattern.length) {
                                if (pattern[i] === pattern[length]) {
                                    length++;
                                    lps[i] = length;
                                    i++;
                                } else {
                                    if (length !== 0) {
                                        length = lps[length - 1];
                                    } else {
                                        lps[i] = 0;
                                        i++;
                                    }
                                }
                            }

                            return lps;
                        }

                        const KMPsearch = (text, pattern) => {
                            let m = pattern.length;
                            let n = text.length;
                            let lps = buildLPSArray(pattern);
                            let i = 0;
                            let j = 0;
                            let results = [];

                            while (i < n) {
                                if (pattern[j] === text[i]) {
                                    j++;
                                    i++;
                                }

                                if (j === m) {
                                    results.push(i - j);
                                    j = lps[j - 1];
                                } else if (i < n && pattern[j] !== text[i]) {
                                    if (j !== 0) {
                                        j = lps[j - 1];
                                    } else {
                                        i = i + 1;
                                    }
                                }
                            }

                            return results;
                        }

                        let panel = null;
                        let descHook = createIonFunction((_panel) => {
                            panel = _panel;
                        })

                        let color = 'magenta'

                        let list = [
                            {
                                label: 'Find motif...', click: () => {

                                    let sequence_input = {
                                        wid: 'card',
                                        "height": "500px",
                                        data: {
                                            "style.padding-top": '1px',
                                            "style.border": '1px',
                                            "style.height": "500px",
                                            cards: [
                                                [
                                                    {
                                                        'width': '100%',
                                                        'component': {
                                                            wid: 'html',
                                                            data: ' Enter a sequence motif'
                                                        }
                                                    },
                                                    {

                                                        'width': '100%',
                                                        'component': {
                                                            wid: 'card',
                                                            data: {
                                                                cards: [
                                                                    [

                                                                        {
                                                                            'width': '100%',
                                                                            'height': "100px",
                                                                            "style.padding-top": '4px',
                                                                            "style.border": '1px',
                                                                            'component':
                                                                            {
                                                                                'wid': 'color-chooser',
                                                                                'width': '100%',

                                                                                "data": {
                                                                                    "selectionListener": createIonFunction((_color) => {
                                                                                                    color = _color;
                                                                                    })
                                                                                }
                                                                            }
                                                                        },
                                                                    ]
                                                                ]
                                                            }
                                                        }

                                                    },

                                                    {
                                                        'width': '100%',
                                                        'component': {
                                                            wid: 'text-editor',
                                                            refCallback: descHook,
                                                            data: {
                                                                height: "250px",
                                                                showButton: false,
                                                                editorOptions: { language: 'text', automaticLayout: true },
                                                                keybinding: {
                                                                    'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                                                    })
                                                                },
                                                            }
                                                        }
                                                    },
                                                    {
                                                        'component': {
                                                            wid: 'mt-button', data: {
                                                                buttons: [
                                                                    {
                                                                        label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                                            CurrentLayout.clearComponent('mainPanel')
                                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                        })
                                                                    },
                                                                    {
                                                                        label: 'Search all tracks', ionFunction: createIonFunction(async () => {
                                                                            let motif = panel.getActiveTabContent();
                                                                            for (let t of graph.track) {
                                                                                let seq = t.sequence;
                                                                                let result = KMPsearch(seq, motif)
                                                                                for (let r of result) {
                                                                                    let annotation = new Annotation("UserAnnotation", r, t.xi + r, t.xi + r + motif.length);
                                                                                    annotation.color = color;
                                                                                    t.add(annotation)
                                                                                }
                                                                            }
                                                                            CurrentLayout.clearComponent('mainPanel')
                                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                        })
                                                                    },
                                                                ]
                                                            }
                                                        }
                                                    }
                                                ]]
                                        }
                                    }

                                    CurrentLayout.clearComponent('mainPanel')
                                    CurrentLayout.setComponent('mainPanel', sequence_input);

                                }
                            },
                            {
                                label: 'Find triplet repeats', click: () => {

                                }
                            },
                            {
                                label: 'Find quad repeats', click: () => {

                                }
                            },
                        ]
                        let names = list.map(obj => obj.label);
                        let t = {
                            wid: 'selection-list',
                            data: {
                                single_selection: true,
                                show_button: false,
                                singleSelect: true,
                                listItems: names,
                                button_function: createIonFunction(async (items) => {

                                    let name = items[0]
                                    for (let l of list) {
                                        if (l.label === name) {
                                            l.click()
                                        }
                                    }

                                })
                            }
                        }

                        let design_params_panel_layout = {
                            wid: 'card',
                            data: {
                                cards: [
                                    [
                                        {
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

                                    ]
                                ]
                            }
                        }
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', design_params_panel_layout);

                    }), mouseOver: createIonFunction(() => {
                        graph.setMessage('Find sequence  motifs or find repeat sequences etc...  ')
                    })
                },
            ]
        }
    }
    return button_canvas

}
