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
                                data: ' Paste gene symbols into the text window with one gene symbol per line.'
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
                                            label: 'Load ', ionFunction: createIonFunction(async () => {
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
                                                let host_ = window['env']['apiUrl']
                                                let res = []
                                                let i = 0;
                                                let l = seqlist.length;
                                                for (let table of seqlist) {

                                                    let symbol = table[0]
                                                    console.log(' symbol ' + symbol)
                                                    symbol = symbol.trim();
                                                    let rf = await GETJSON(host_ + `/gene-lookup?field="Gene stable ID"&key=${symbol}`)
                                                    if (rf != null && rf.length > 0) {
                                                        res.push(symbol)
                                                    }

                                                    progressBar(i / l * 100)
                                                    i++;
                                                }

                                                graph.runfun(() => {
                                                    setTimeout(() => {
                                                        for (let v of res) {
                                                            graph.add(v)
                                                        }
                                                    }, 1000);
                                                })

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

        resolve(sequence_input)

    })

}
