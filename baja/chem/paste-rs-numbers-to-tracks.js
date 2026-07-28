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
                return parsedSequence;
            }
        }
        let progressBar;
        graph.props.selected_chemistry = { "type": "DNA", "template": "[(?)d.p.]{n-1}[(?)d]{1}", "shapeFunction": "baja/shapes/myshapefunction.js" }
        function componentToHex(c) {
            const hex = c.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }

        let mapIT = async (snpid) => {
            let vr = await GETJSON(`https://rest.ensembl.org/variation/human/${snpid}?content-type=application/json`)
            if (vr['mappings']) {
                let consequence = vr['most_severe_consequence']
                let mappings = vr['mappings']
                let lastone = null;
                let tracks = graph.track;
                for (let selectedTrack of tracks) {
                    for (let m of mappings) {
                        let position = m.start;
                        if (m.start > selectedTrack.tgraph.xmin - 1000 && position <= selectedTrack.tgraph.xmax + 1000) {
                            let strand = m.strand;
                            let geno = m.allele_string.split(/[/|]/g)
                            for (let c = 1; c < geno.length; c++) {
                                let g = geno[c];
                                let reference = m.ancestral_allele;
                                if (!reference)
                                    reference = "indel"
                                let as = m.allele_string;

                                if (selectedTrack == null) {
                                    graph.setMessage(" Select a track")
                                    return;
                                }

                                let slnp = new SnpIndel('snp', position, geno[0], g,
                                    0, selectedTrack.strand);
                                lastone = slnp;
                                slnp.name = snpid;

                                selectedTrack.addsnpindel(slnp);
                                selectedTrack.markstart = position;
                                selectedTrack.markend = position + 1;

                                await graph.zoom(selectedTrack.tgraph.X(selectedTrack.markstart) - 100, selectedTrack.tgraph.X(selectedTrack.markend) + 100)

                            }
                        }
                    }
                }
            }
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
                                data: ' Paste rs numbers (e.g. rs712).'
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
                                            label: 'map rs IDs ', ionFunction: createIonFunction(async () => {
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
                                                    let symbol = table[0]
                                                    symbol = symbol.trim();
                                                    await mapIT ( symbol )
                                                    sleep ( 1000 )
                                                    progressBar(i / l * 100)
                                                    i++;
                                                }

                                                let loadinglist = []
                                                for (let ens of res) {
                                                    let v = ens['ensembl']['Gene stable ID']
                                                    loadinglist.push(v)

                                                }

                                                graph.runfun(() => {
                                                    setTimeout(() => {
                                                        for (let v of loadinglist) {
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
