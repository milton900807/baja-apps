function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {
        function parseNucleicAcidSequence(sequence) {
            const nucleotidePattern = /([a-zA-Z]+)\(([^)]+)\)(po|ps)/g;
            let match;
            const parsedSequence = [];
            while ((match = nucleotidePattern.exec(sequence)) !== null) {
                const sugarComponent = match[1];
                const base = match[2];
                const backbone = match[3];
                parsedSequence.push({ sugarComponent, base, backbone });
            }
            return parsedSequence;
        }
        let progressBar;
        graph.props.selected_chemistry = { "type": "DNA", "template": "[(?)d.p.]{n-1}[(?)d]{1}", "shapeFunction": "baja/shapes/myshapefunction.js" }
        function componentToHex(c) {
            const hex = c.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }
        let Biopolymer = await exec('baja/chem/biopolymer.js')

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
                if (row != null && row.length > 0)
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
                                data: ' Paste in oligo sequences one sequence per line'
                            }

                        },
                        {
                            'width': '100%',
                            "style.padding-top": '1px',
                            'title': 'Sequence seearch edit distance:',
                            'component': {
                                'wid': 'radio-buttons',
                                'data': ['0', '1'].map((b, i) => ({ label: b, ionfunction: createIonFunction(() => ed = parseInt(i)) }))
                            }
                        }, {
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
                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        },
                                        {
                                            label: 'Search all tracks', ionFunction: createIonFunction(async () => {

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
                                                if (mode === 'reference') {
                                                    for (let t of graph.track) {
                                                        progressBar(0);
                                                        let sequence = t.sequence.trim();
                                                        let res = await exec('py/bio/map/le-map-sequences.py', em, sequence, seqlist, ed);

                                                        let index__ = 0;
                                                        for (let gr of res) {
                                                            if (gr && gr.length > 0) {
                                                                for (let r of gr) {
                                                                    if (r[2]) {
                                                                        let synthesis = r[1]
                                                                        let bioObject = {
                                                                            'trackName': t.name,

                                                                            'startIndex': t.xi + r[3],
                                                                            'strand': t.strand,
                                                                            'endIndex': t.xi + r[3] + r[2].length,
                                                                            'y': (t.tgraph.ymax - 0.2)
                                                                        }

                                                                        if (r[0].length === 0) {
                                                                            r[0] = '' + index__++;
                                                                        }
                                                                        console.log(" adding oligo " + r[1])
                                                                        let compound = Biopolymer.generateDNAOligo(r[0], synthesis, bioObject)
                                                                        t.addOligo(compound);
                                                                        mapped++;
                                                                        if (r[6] != undefined && r[6] >= 0) {
                                                                            let xcoord = t.xi + r[3];
                                                                            let percent = r[6]

                                                                            if (r[7] != undefined && r[7] >= 0) {

                                                                                const absoluteDifference = Math.abs(r[7] - r[6]);
                                                                                const average = (r[7] + r[6]) / 2;
                                                                                const percentDifference = (absoluteDifference / average);
                                                                                let bc = new Barchart(r[0], xcoord, r[6], generateColor(percentDifference * 100))
                                                                                bc.reference_value = +r[7]
                                                                                t.plots.push(bc)

                                                                            } else {

                                                                                let bc = new Barchart(r[0], xcoord, 1 - percent / 100, generateColor(percent))
                                                                                t.plots.push(bc)
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                    CurrentLayout.clearComponent('mainPanel')
                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                    let total = seqlist.length;
                                                    showModal({
                                                        wid: 'json',
                                                        data: JSON.stringify({
                                                            'Mapped': mapped,
                                                            'Total': total
                                                        })
                                                    })

                                                } else {

                                                    let index = 0;
                                                    for (let t of graph.track) {

                                                        if (!t.sequence) {
                                                            graph.setMessage('The track: ' + t.name + ' doese not have a sequence...')
                                                            continue;
                                                        } else {

                                                            let sequence = t.sequence.trim();
                                                            let variants = []
                                                            for (let tv of t.snpindels) {
                                                                variants.push([
                                                                    tv.type, Math.abs(tv.xi - t.xi), tv.alternate
                                                                ])
                                                            }
                                                            let res = await exec('py/tracks/find-hits-on-msequence.py', em, sequence, variants, seqlist, t.strand);
                                                            for (let r of res) {
                                                                let synthesis = r[0]
                                                                let bioObject = {
                                                                    'trackName': t.name,
                                                                    'startIndex': t.xi + r[3],
                                                                    'strand': t.strand,
                                                                    'endIndex': t.xi + r[3] + r[2].length,
                                                                    'y': (t.tgraph.ymax - 0.2)
                                                                }
                                                                let compound = Biopolymer.generateDNAOligo(index++, synthesis, bioObject)
                                                                mapped++;
                                                                t.addOligo(compound);
                                                            }

                                                            let total = seqlist.length;
                                                            showModal({
                                                                wid: 'json',
                                                                data: JSON.stringify({
                                                                    'Mapped': mapped,
                                                                    'Total': total
                                                                })
                                                            })
                                                        }

                                                    }

                                                    CurrentLayout.clearComponent('mainPanel')
                                                    CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                                }
                                            })
                                        },

                                    ]
                                }
                            }
                        }

                    ]]
            }
        }

        resolve(sequence_input)

    })

}
