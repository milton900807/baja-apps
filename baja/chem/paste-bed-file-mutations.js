function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {

        let SnpIndel = await exec('flexigraph/snpindel.js')
        let Mutation = await exec('flexigraph/mutation-annotation.js');
        let MGrid = await exec('flexigraph/grid.js');

        const complement = {
            'A': 'T',
            'C': 'G',
            'G': 'C',
            'T': 'A',
            'N': 'N'
        };

        function parseBedLine(line) {
            const parts = line.split('\t');
            const chromosome = parts[0];
            const start = parseInt(parts[1]);
            const end = parseInt(parts[2]);
            const name = parts[3];
            const phase = parseInt(parts[4]);
            const strand = parts[5];

            const nameParts = name.split('_');
            const type = nameParts[1];
            const [refAlt, alternate] = type.split('>');
            const reference = refAlt.split('_')[1];

            0

            let mut = new Mutation('mutation-annotation', start,
                end, '' + name.trim(), phase, strand.trim())

            return mut;
        }

        function parseBedFile(content) {
            const lines = content.trim().split('\n');
            const snpindels = lines.map(parseBedLine);
            return snpindels;
        }
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
                                data: ' Paste bed file mutations.'
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
                                            label: 'Apply ', ionFunction: createIonFunction(async () => {
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
                                                let res = []
                                                let i = 0;
                                                let l = seqlist.length;
                                                for (let table of seqlist) {
                                                    console.log(table)
                                                    if ( table[0].startsWith ( 'rs')){
                                                        res.push ( table[0].trim())
                                                    }
                                                    progressBar(i / l * 100)
                                                    i++;
                                                }

                                                graph.runfun(() => {
                                                    setTimeout(() => {
                                                        for (let m of snps) {
                                                            let start = m.start;
                                                            let end  = m.end;
                                                            let tracks = graph.getTracksInRange(start, end)
                                                            for (let track of tracks) {
                                                                let grid = Object.assign(new MGrid(), graph.graph.grid)
                                                                grid.xmax = track.tgraph.X(mut.end + 100);
                                                                grid.xmin = track.tgraph.X(mut.start - 100);
                                                                grid.ymax = track.tgraph.yi + Math.abs(track.tgraph.height) / 6;
                                                                grid.ymin = track.tgraph.yi - Math.abs(track.tgraph.height - 0.5);
                                                                grid.rescale();
                                                                graph.addBookmark(mut.name, grid)
                                                                track.addsnpindel(mut)
                                                            }

                                                        }
                                                    }, 1000);
                                                })

                                                showModal({
                                                    wid: 'json',
                                                    data: JSON.stringify(snps)
                                                })

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
