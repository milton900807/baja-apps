function (selectedTrack, annotation, graph, genegraph_panel_layout) {
    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.selectOff();

    function findNearestSites(dna, position, strand) {
        function findAcceptorLeft(dna, position) {
            for (let i = position; i >= 0; i--) {
                if (dna.slice(i, i + 2) === 'AG') {
                    return i;
                }
            }
            return null;
        }

        function findDonorRight(dna, position) {
            for (let i = position; i < dna.length - 1; i++) {
                if (dna.slice(i, i + 2) === 'GT') {
                    return i;
                }
            }
            return null;
        }

        function findAcceptorRight(dna, position) {
            for (let i = position; i < dna.length - 1; i++) {
                if (dna.slice(i, i + 2) === 'CT') {
                    return i;
                }
            }
            return null;
        }

        function findDonorLeft(dna, position) {
            for (let i = position; i >= 0; i--) {
                if (dna.slice(i, i + 2) === 'AC') {
                    return i;
                }
            }
            return null;
        }

        let acceptorSite, donorSite;

        if (strand >= 0) {
            acceptorSite = findAcceptorLeft(dna, position);
            donorSite = findDonorRight(dna, position);
        } else if (strand < 0) {
            acceptorSite = findAcceptorRight(dna, position);
            donorSite = findDonorLeft(dna, position);
        } else {
            throw new Error("Strand must be 'forward' or 'reverse'");
        }

        return {
            acceptorSite: acceptorSite,
            donorSite: donorSite
        };
    }

    let ox = annotation.xi;
    let fx = annotation.xf;
    let m = []
    let wx = 0;

    CurrentLayout.clearComponent('labelPanel')
    CurrentLayout.setComponent('labelPanel', {
        wid: 'html',
        data: "Selected: " + annotation.name + ".  <font color='red'> Click on the track again to resize. </font>"
    });

    m.push({
        label: 'Reset ' + annotation.name,
        click: async (xwc, ywc) => {
            graph.pushOntoHistory();

            start = -1;
            end = -1;
            annotation.xi = ox;
            annotation.xf = fx;

            if (selectedTrack.orf) {
                selectedTrack.generateORF();
            }
            graph.hideMenu();

        },
        move: () => {
        }
    })
    m.push({
        label: 'Next donor',
        click: async (xwc, ywc) => {
            graph.pushOntoHistory();
            let vs = exec ('baja/screens/menu/annotation/mouse-over-exon-highlighter.js', graph, genegraph_panel_layout, selectedTrack, 'donor')
            graph.hideMenu();
        },
        move: () => {
        }
    })

    m.push({
        label: 'Next acceptor',
        click: async (xwc, ywc) => {
            graph.pushOntoHistory();

            let vs = exec ('baja/screens/menu/annotation/mouse-over-exon-highlighter.js', graph, genegraph_panel_layout, selectedTrack, 'donor')

            graph.hideMenu();
        },
        move: () => {
        }
    })

    m.push({
        label: 'Set start',
        click: async (xwc, ywc) => {
            graph.pushOntoHistory();

            annotation.xi = wx;
            if (selectedTrack.orf) {
                selectedTrack.generateORF();
            }

            graph.hideMenu();
        },
        move: () => {
        }
    })
    m.push({
        label: 'Set End',
        click: async (xwc, ywc) => {
            annotation.xf = wx;
            graph.pushOntoHistory();
            if (selectedTrack.orf) {
                selectedTrack.generateORF();
            }

            graph.hideMenu();
        },
        move: () => {
        }
    })
    m.push({
        label: 'Set by coordnates ' + annotation.name,
        click: async (xwc, ywc) => {
            let panel;
            let __nameHook = createIonFunction((_panel) => {
                panel = _panel;
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
                                        'default_values': {
                                            'Start': annotation.xi,
                                            'End': annotation.xf
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
                                                    let start = panel.get('Start')
                                                    let end = panel.get('End')
                                                    start = parseInt(start);
                                                    end = parseInt(end);
                                                    annotation.xi = start;
                                                    annotation.xf = end;
                                                    if (selectedTrack.orf) {
                                                        selectedTrack.generateORF();
                                                    }
                                                    graph.pushOntoHistory();

                                                    CurrentLayout.clearComponent('mainPanel')
                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                })
                                            },
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
        }
    })

    graph.addMouseDownListener(async (x, y) => {
        let t = selectedTrack.tgraph.xi;
        wx = Math.floor(selectedTrack.tgraph.Xwc(x - t * 2));
        if (graph.menuVisible()) {
        } else {
            graph.showMenu(m, x, y);
        }
    })
    graph.addMouseMoveListener((x, y) => {
        let t = selectedTrack.tgraph.xi;
        wx = Math.floor(selectedTrack.tgraph.Xwc(x - t * 2));

    });
}
