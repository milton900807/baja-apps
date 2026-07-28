function (selectedTrack, graph, genegraph_panel_layout) {

    graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
    graph.setMouseMode('navigate')

    return new Promise(async (resolve, reject) => {

        let progressBar;
        graph.props.selected_chemistry = { "type": "DNA", "template": "[(?)d.p.]{n-1}[(?)d]{1}", "shapeFunction": "baja/shapes/myshapefunction.js" }
        function componentToHex(c) {
            const hex = c.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }
        let le = await exec('baja/math/le-distance.js')
        let Barchart = await exec('baja/bio/barchart-track.js')
        function generateColor(percent) {

            percent = Math.max(0, Math.min(100, percent));

            const red = Math.floor((100 - percent) * 255 / 100);
            const green = Math.floor(percent * 255 / 100);

            const color = '#' + componentToHex(red) + '00' + componentToHex(green);

            return color;
        }
        function parseStringTable(str) {
            const lines = str.trim().split(/\r?\n/);

            let table = [];

            lines.forEach(line => {
                let row = line.split(/[\s,]+/).filter(cell => cell);
                table.push(row);
            });

            return table;
        }

        function parseFirstColumnFromCSV(csvContent) {
            var rows = csvContent.split('\n');
            var firstColumnData = [];
            for (var i = 1; i < rows.length; i++) {
                var columns = rows[i].split(',');
                if (columns.length > 0) {
                    firstColumnData.push(columns[0].trim());
                }
            }

            return firstColumnData;
        }

        await hideAllModal();
        let sequenceTextEditor;
        let descHook = createIonFunction((p) => {
            sequenceTextEditor = p;
        });

        let edp;
        let edit_distance_panel = createIonFunction((p) => {
            edp = p;
        });

        let structure = 'default'
        let mode = 'reference'

        let ed = 0;
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
                                data: ' Paste in sequences in the format of { id | sequence | mt | wt | x }'
                            }

                        },
                        {
                            'width': '100%',
                            'component': {
                                wid: 'text-editor',
                                refCallback: descHook,
                                data: {
                                    height: "350px",
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
                            'width': '100%',
                            'component': {
                                wid: 'html',
                                data: '<hr>'
                            }
                        },
                        {
                            'component': {
                                wid: 'progress',
                                componentRef: 'progressBar',
                                data: {
                                    'progress': 0,
                                    'progressBar': createIonFunction((progessBar) => {
                                        progressBar = progessBar;
                                    })
                                }
                            }
                        },
                        {
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Paste', ionFunction: createIonFunction(async () => {
                                                let Biopolymer = await exec('baja/chem/biopolymer.js')
                                                let progressBar;
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
                                                let em = new EngineMonitor((msg) => {
                                                });
                                                em.addProgressListener((v) => {
                                                    progressBar(v);
                                                })

                                                let seqlist = [];
                                                let temp = sequenceTextEditor.getActiveTabContent();
                                                if (temp != null && temp.length > 0) {
                                                    temp = temp.trim();
                                                }
                                                seqlist = parseStringTable(temp);
                                                let mapped = 0;

                                                let index__ = 0;
                                                for (let gr of seqlist) {
                                                    if (gr && gr.length > 0) {
                                                        for (let r of gr) {
                                                            if (r[2]) {
                                                                let synthesis = r[1]
                                                                let bioObject = {
                                                                    'trackName': selectedTrack.name,
                                                                    'startIndex': r[2],
                                                                    'strand': selectedTrack.strand,
                                                                    'endIndex': r[2] + r[1].length,
                                                                    'y': (selectedTrack.tgraph.ymax - 0.2)
                                                                }

                                                                if (r[0].length === 0) {
                                                                    r[0] = '' + index__++;
                                                                }

                                                                console.log ( " creating compound " + r[0])
                                                                let compound = Biopolymer.generateDNAOligo(r[0], synthesis, bioObject)
                                                                selectedTrack.addOligo(compound);
                                                                mapped++;
                                                                if (r[3] != undefined && r[3] >= 0) {
                                                                    let xcoord = r[2];
                                                                    let percent = r[3]
                                                                    if (r[4] != undefined && r[4] >= 0) {

                                                                        const absoluteDifference = Math.abs(r[4] - r[3]);
                                                                        const average = (r[4] + r[3]) / 2;
                                                                        const percentDifference = (absoluteDifference / average);
                                                                        let bc = new Barchart(r[0], xcoord, r[3], generateColor(percentDifference * 100))
                                                                        bc.reference_value = r[4]
                                                                        selectedTrack.plots.push(bc)
                                                                    } else {

                                                                        let bc = new Barchart(r[0], xcoord, 1 - percent / 100, generateColor(percent))
                                                                        selectedTrack.plots.push(bc)
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }

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
                        }
                    ]]
            }
        }
        resolve(sequence_input);
    })
}
