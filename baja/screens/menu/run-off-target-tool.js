function (graph, genegraph_panel_layout) {

    editDistance = 0;

    return new Promise(async (resolve, reject) => {
        let returnMode = 'editdistance'
        let splitArray = (array) => {
            const result = [];
            const chunkSize = 2;
            for (let i = 0; i < array.length; i += chunkSize) {
                const chunk = array.slice(i, i + chunkSize);
                result.push(chunk);
            }
            return result;
        }
        graph.setMessage("Loading off-target genomes... ")
        let oep = window["env"]["offtarget"];
        if (!oep || oep.length <= 0) {
            oep = '/levenshtein'
        }
        let url = `${oep}/genomes`
        let available_genomes = await GETJSON(url)

        let runOffTargets = async (graph, genomes, __editDistance) => {
            graph.setMessage("Checking sequences...")
            const pattern = /(\w)\1{3,}/g;
            let ot_oligos = []
            let warn = false;
            let seqList = []
            let Biopolymer = await exec('baja/chem/biopolymer.js');
            returnMode = 'editdistance'

            for (let t of graph.track) {
                t.showOfftargets = true;
                let range = t.gitVisibleTrackRange(graph);
                let oligos = t.getOligosInRange(range.start, range.end);

                for (let o of oligos) {
                    o.offtarget = null;
                    o.showOfftargets = true;

                }
                for (let o of oligos) {
                    let synthesisSeq = o.synthesisSequence;
                    if (!synthesisSeq || synthesisSeq.length <= 0) {

                        if (t.strand < 0) {
                            o.synthesisSequence = Biopolymer.comp(o.sequence)
                        } else {
                            o.synthesisSequence = Biopolymer.reverseComp(o.sequence)
                        }

                    }
                    o.offtarget = null;
                    ot_oligos.push(o)
                    const matches = o.sequence.match(pattern);
                    if (matches) {
                        warn = true;
                        graph.setMessage("Found potential high hit pattern.")

                    }
                    console.log(synthesisSeq)
                    seqList.push(
                        {
                            "id": o.id,
                            "synthesisSequence": synthesisSeq
                        }
                    )
                }

            }
            let progressBar;
            let w = {
                wid: 'progress',
                componentRef: 'progressBar',
                data: {
                    'progress': 10,
                    'progressBar': createIonFunction((progessBar) => {
                        progressBar = progessBar;
                    })
                }
            }

            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
            CurrentLayout.setComponent('buttonMenuPanel', w);

            let sp = splitArray(seqList);
            let rr = [];
            let index = 0;
            for (let s of sp) {
                let obj = {
                    "editDistance": __editDistance,
                    "strand": "+-",
                    "genomes": genomes,
                    "sequences": s,
                    "runMode": returnMode
                }

                let oep = window["env"]["offtarget"];
                if (!oep || oep.length <= 0) {
                    oep = '/levenshtein'
                }
                let uri = `${oep}/off-targets-file`;
                let r = await POSTJSON(obj, uri)
                if (r != null && r['oligoQuery'] != null) {
                    let oq = r['oligoQuery'];
                    console.log(" setting the asos with offtargets ")
                    for (let o of ot_oligos) {
                        for (let off of oq) {
                            if (String(o.id) == String(off.id)) {
                                if (off.offtarget.length > 1000) {
                                    o.offtarget = off.offtarget.length + ''
                                } else {

                                    o.offtarget = off.offtarget;

                                    if (o.offtarget.length === 0) {
                                        o.offtarget = null;
                                    } else if (o.offtarget.length < 30) {

                                        setTimeout(() => {
                                            exec('https://data.lajollalabs.com/ionworks/py/gene/gff.py', JSON.stringify(o.offtarget)).then(rs => {

                                                if (rs && rs['tsv']) {
                                                    let tsvText = rs['tsv']
                                                    const lines = tsvText.split('\n');
                                                    const geneSymbols = [];
                                                    for (let line of lines) {
                                                        const columns = line.split('\t');
                                                        if (columns.length > 1 && columns[1]) {
                                                            geneSymbols.push(columns[1]);
                                                        }
                                                    }
                                                    if (!o.offtargetsymbols)
                                                        o.offtargetsymbols = [geneSymbols.toString()];
                                                    else {
                                                        o.offtargetsymbols.push(geneSymbols.toString())
                                                    }
                                                }

                                            })

                                        }, 2000)

                                    }
                                }
                                o.showOfftargets = true;
                            }
                        }
                    }

                }
                rr.push(r);
                index++;
                progressBar((index / sp.length) * 100)
            }

            let btns = [
                {
                    label: 'Raw results', ionfunction: createIonFunction(async () => {
                        let backtog = {
                            wid: 'card',
                            data: {
                                cards: [
                                    [
                                        {
                                            'title': ' ', 'body': ``,
                                            'width': '100%',
                                            'component':
                                            {
                                                wid: 'mt-button', data: {
                                                    buttons: [

                                                        {
                                                            label: 'Return to design', ionFunction: createIonFunction(async () => {
                                                                let button_canvas = await exec('screen/controls/navigation-panel.js', graph)
                                                                CurrentLayout.clearComponent('mainPanel')
                                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                                CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
                                                                CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                                                            })
                                                        }
                                                    ]
                                                }
                                            }
                                        },
                                        {

                                            'title': ' ', 'body': ``,
                                            'width': '100%',
                                            'component': {
                                                wid: 'json',
                                                data: JSON.stringify(rr)
                                            }
                                        },
                                    ]
                                ]
                            }
                        }
                        CurrentLayout.clearComponent('mainPanel')
                        CurrentLayout.setComponent('mainPanel', backtog);
                    })
                }, {
                    label: 'Download ', ionfunction: createIonFunction(async () => {
                        console.log(" downloading... ")
                        let report = await exec('baja/screens/menu/generate-excel-report-for-ott.js', rr)
                        const blob = new Blob([report], { type: 'text/csv' });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.setAttribute('hidden', '');
                        a.setAttribute('href', url);
                        a.setAttribute('download', 'off-target-report.csv');
                        document.body.appendChild(a);
                        a.click();
                    })
                }
            ]

            let bpanel = {
                wid: 'card',
                data: {
                    cards: [
                        [
                            {
                                width: '100%',
                                'component': {
                                    wid: 'menu',
                                    data: {
                                        title: '  ',
                                        style: 'sub-container',
                                        menus: [
                                            {
                                                'label': 'Results', 'items': btns
                                            },

                                        ]
                                    }
                                }
                            },

                        ]
                    ]
                }
            }
            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
            CurrentLayout.setComponent('buttonMenuPanel', bpanel);

        }
        let selected_genome = '';
        let bg = []
        for (let a of Object.keys(available_genomes)) {
            if (bg.length === 0) {
                selected_genome = a;
            }
            bg.push({
                'label': a, ionfunction: createIonFunction((_label) => {
                    selected_genome = a

                })

            })
        }
        sleep = async (ms) => {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        let ms = {
            wid: 'radio-buttons',
            height: '100px',
            width: '50px',
            data: { 'buttons': bg }
        }
        let off_target_tool = {
            wid: 'card',
            data: {
                cards: [
                    [

                        {
                            'title': ' ', 'body': ``,
                            'width': '100%',
                            'component':
                            {
                                wid: 'html',
                                data: 'Select an search reference.  Off-targets are only run on <font color="RED"> VISIBLE </font> compounds.'
                            }
                        },

                        {
                            'title': ' ', 'body': ` `,
                            'width': '100%',
                            'component': ms

                        },
                        {
                            'title': ' ', 'body': ``,
                            'width': '100%',
                            'component':
                            {
                                wid: 'html',
                                data: '<hr>Edit distance (number of insertions, deletions or mismatches allowed).'
                            }
                        },

                        {
                            'title': '', 'body': ` `,
                            'width': '50%',
                            'component':
                            {
                                wid: 'radio-buttons',
                                data: {
                                    'unchecked': true,
                                    'buttons': [
                                        {
                                            'label': '0', ionfunction: createIon(() => {
                                                editDistance = 0;
                                            }
                                            )
                                        }, {
                                            'label': '1', ionfunction: createIon(() => {
                                                editDistance = 1;
                                            }
                                            ),
                                        },
                                        {
                                            'label': '2', ionfunction: createIon(() => {
                                                editDistance = 2;
                                            }
                                            )
                                        },

                                        {
                                            'label': '3', ionfunction: createIon(() => {
                                                editDistance = 3;
                                            }
                                            )
                                        }

                                    ],
                                }
                            }
                        },

                        {
                            'title': ' ',
                            'width': '30%',
                            'component':
                            {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Run...', ionFunction: createIonFunction(async () => {
                                                if (selected_genome.length == 0) {
                                                    alert('Select a target dataset')
                                                    return;
                                                }
                                                returnMode = 'editdistance'

                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                setTimeout(() => {
                                                    graph.setMessage(" Edit distance : " + editDistance)
                                                    graph.rungraph((graph) => {
                                                        graph.setMessage(" Edit distance : " + editDistance)
                                                        runOffTargets(graph, [selected_genome], editDistance)
                                                    })
                                                }, 2000)
                                            })
                                        },
                                        {
                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })

                                        }]
                                }
                            }
                        },

                    ]
                ]
            }

        }
        editDistance = 0;

        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', off_target_tool);

        resolve();

    })

}
