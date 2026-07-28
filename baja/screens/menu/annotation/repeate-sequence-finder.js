function (graph, genegraph_panel_layout) {

    setTimeout(async () => {
        let panel = null;
        let descHook = createIonFunction((_panel) => {
            panel = _panel;
        })
        function removeLongHomopolymers(dnaArray) {

            const cleanDna = dnaArray.map(dna => {

                return dna.replace(/(A{6,}|T{6,}|C{6,}|G{6,})/g, '');
            });
            return cleanDna;
        }

        function findRepeatedWindows(sequence, windowLength = 16, mstart) {
            if (sequence.length < windowLength) {
                console.log("The sequence is shorter than the window length.");
                return [];
            }

            let windowDetails = {};

            for (let i = 0; i <= sequence.length - windowLength; i++) {
                let window = sequence.substring(i, i + windowLength);
                if (!/(A{6,}|T{6,}|C{6,}|G{6,})/.test(window)) {
                    if (window in windowDetails) {
                        windowDetails[window].count++;
                        windowDetails[window].indices.push((i + mstart));
                    } else {
                        windowDetails[window] = { count: 1, indices: [i] };
                    }
                }
            }

            let results = [];
            for (let window in windowDetails) {
                if (windowDetails[window].count > 1) {
                    results.push({
                        window,
                        count: windowDetails[window].count,
                        indices: windowDetails[window].indices
                    });
                }
            }

            return results;
        }

        let list = [
            {
                label: 'Search selected sequence', click: async () => {

                    let found_one = false;
                    for (let t of graph.track) {
                        let seq = t.getHighlightedSequence();
                        if (seq && seq.length > 15) {
                            found_one = true;
                        }
                    }

                    if ( !found_one ) {
                        infoPrompt ( " Currently there are no sequences selected. Please select a sequence first on a track first. ")
                        return;
                    }

                    let attr_window = 20;
                    let va = await prompt("Window", ["Window"], { "Window": attr_window }, 300, 300)
                    let m = va['Window']
                    if (m === null) {
                        attr_window = 20
                    } else {
                        attr_window = parseInt(m);
                    }

                    function getColorForInteger(num) {
                        const colors = [
                            "#FF5733", "#C70039", "#900C3F", "#581845", "#FFC300", "#DAF7A6", "#581845",
                            "#C70039", "#FF5733", "#FFC300", "#DAF7A6", "#900C3F", "#33FFCE", "#33FF57",
                            "#57FF33", "#CEFF33", "#FF5733", "#FF3333", "#FF33A6", "#FF33CE", "#A633FF",
                            "#CE33FF", "#FF33FF", "#FF33A6", "#33CEFF", "#3375FF", "#333BFF", "#5733FF",
                            "#A633FF", "#CE33FF"
                        ];

                        if (num < 1 || num > 30) {
                            console.log("Number must be between 1 and 30.");
                            return null;
                        }

                        return colors[num - 1];
                    }

                    let windowsize = attr_window

                    let go = async () => {
                        let Annotation = await exec('flexigraph/annotation.js')

                        for (let t of graph.track) {
                            let seq = t.getHighlightedSequence();
                            if (seq && seq.length > 15) {
                                let repeate = findRepeatedWindows(seq, windowsize, 0)

                                graph.setMessage ( " Found " + repeate.length )

                                for (let obj of repeate) {
                                    let color = getColorForInteger(+obj.count);
                                    let indy = obj.indices;
                                    for (let index of indy) {
                                        let annotation = new Annotation("UserAnnotation", obj.window + '', Math.floor(t.markstart) + index, Math.floor(t.markstart) + index + windowsize);
                                        annotation.color = color;
                                        t.add(annotation)
                                    }

                                }
                            }
                        }
                    }
                    graph.runfun(go)
                    CurrentLayout.clearComponent('mainPanel')
                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

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
    }, 100)
}
