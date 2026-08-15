function (graph, genegraph_panel_layout, oligos) {
    editDistance = 0;

    return new Promise(async (resolve, reject) => {
        let returnMode = 'editdistance'

        graph.setMessage("Loading off-target genomes... ")
        let oep = window["env"]["offtarget"];
        if (!oep || oep.length <= 0) {
            oep = '/levenshtein'
        }
        let url = `${oep}/genomes`
        let response = await GETJSON(url)
        let available_genomes = response;
        let splitArray = (array) => {
            const result = [];
            const chunkSize = 5;
            for (let i = 0; i < array.length; i += chunkSize) {
                const chunk = array.slice(i, i + chunkSize);
                result.push(chunk);
            }
            return result;
        }

        let runOffTargets = async (oligos, seqList, __editDistance, genomes) => {
            let rr = []
            for (let o of oligos) {
                o.highlight(1000, "magenta")
            }
            let progressBar;
            let w = {
                wid: 'progress',
                componentRef: 'progressBar',
                data: {
                    'progress': 0,
                    'progressBar': createIonFunction((progessBar) => {
                        progressBar = progessBar;
                    })
                }
            }
            CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
            CurrentLayout.setComponent('buttonMenuPanel', w);
            let sp = splitArray(seqList);
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
                rr.push(r)

                if (r != null && r['oligoQuery'] != null) {
                    let oq = r['oligoQuery'];
                    console.log(" setting the asos with offtargets ")
                    for (let o of oligos) {
                        for (let off of oq) {
                            if (String(o.id) == String(off.id)) {
                                if (off.offtarget.length > 1000) {
                                    o.offtarget = off.offtarget.length + ''
                                } else {
                                    o.offtarget = off.offtarget;
                                    if (o.offtarget.length === 0) {
                                        o.offtarget = null;
                                    } else if (o.offtarget.length < 30) {

                                        let rs = await exec('https://data.oligodesigner.com/ionworks/py/gene/gff.py', JSON.stringify(o.offtarget));
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

                                    }
                                }
                                o.showOfftargets = true;
                            }
                        }
                    }
                }

                index++;
                progressBar((index / sp.length) * 100)
            }

            graph.setMessage("loading off-targets...")

            await exec('baja/manchester/menu/menu-for-single-aso.js', graph, current, graph.genegraph_panel_layout)

        }

        let selected_genome = '';
        let bg = []
        for (let a of Object.keys(available_genomes)) {
            if (bg.length === 0) {
                selected_genome = a;
            }
            bg.push({
                'label': a, ionfunction: createIon((label) => {
                    selected_genome = label
                })
            })
        }

        sleep = async (ms) => {
            return new Promise(resolve => setTimeout(resolve, ms));
        }
        let ms = {
            wid: 'radio-buttons',
            height: '100px',
            data: {
                showButton: false,
                buttons: bg

            }
        }

        let ids = oligos.filter(obj => obj.hasOwnProperty('id') && obj.hasOwnProperty('synthesisSequence') && obj.synthesisSequence != null)
            .map(obj => ({
                id: obj.id,
                synthesisSequence: obj.synthesisSequence
            }));

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
                                data: 'Off-target calculations will be run for the following compounds:'
                            }
                        },
                        {
                            'title': ' ', 'body': ` `,
                            'width': '100%',
                            'component': {
                                wid: 'json',
                                data: JSON.stringify(ids)
                            }
                        },
                        {
                            'title': ' ', 'body': ` `,
                            'width': '100%',
                            'component': ms
                        },
                        {
                            'title': 'Edit distance ', 'body': ` `,
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
                                            label: 'Run off-targets...', ionFunction: createIonFunction(async () => {
                                                let go = async () => {
                                                    if (selected_genome.length == 0) {
                                                        alert('Select a target dataset')
                                                        return;
                                                    }
                                                    returnMode = 'editdistance'

                                                    hideAllModal();
                                                    graph.setMessage("Checking sequences...")
                                                    const pattern = /(\w)\1{3,}/g;
                                                    let warn = false;

                                                    let genomes = [selected_genome]
                                                    let seqList = []
                                                    for (let o of oligos) {
                                                        if (o.type === 'amplicon') {
                                                            let rsynthesisSeq = o.right.synthesisSequence;
                                                            let lsynthesisSeq = o.left.synthesisSequence;
                                                            let msynthesisSeq = null;
                                                            if (o.mid)
                                                                msynthesisSeq = o.mid.synthesisSequence;
                                                            if (rsynthesisSeq && rsynthesisSeq.length > 0) {
                                                                o.right.offtarget = null;
                                                                const matches = rsynthesisSeq.match(pattern);
                                                                if (matches) {
                                                                    warn = true;
                                                                    graph.setMessage("Found potential high hit pattern.")
                                                                }
                                                                seqList.push(
                                                                    {
                                                                        "id": o.right.id,
                                                                        "synthesisSequence": rsynthesisSeq
                                                                    }
                                                                )
                                                            }
                                                            if (lsynthesisSeq && lsynthesisSeq.length > 0) {
                                                                o.left.offtarget = null;
                                                                const matches = lsynthesisSeq.match(pattern);
                                                                if (matches) {
                                                                    warn = true;
                                                                    graph.setMessage("Found potential high hit pattern.")
                                                                }
                                                                seqList.push(
                                                                    {
                                                                        "id": o.left.id,
                                                                        "synthesisSequence": lsynthesisSeq
                                                                    }
                                                                )
                                                            }
                                                            if (o.mid && msynthesisSeq && msynthesisSeq.length > 0) {
                                                                if (o.mid) {
                                                                    o.mid.offtarget = null;
                                                                    const matches = msynthesisSeq.match(pattern);
                                                                    if (matches) {
                                                                        warn = true;
                                                                        graph.setMessage("Found potential high hit pattern.")
                                                                    }
                                                                    seqList.push(
                                                                        {
                                                                            "id": o.mid.id,
                                                                            "synthesisSequence": msynthesisSeq
                                                                        }
                                                                    )
                                                                }
                                                            }
                                                        } else {
                                                            let synthesisSeq = o.synthesisSequence;
                                                            if (!synthesisSeq || synthesisSeq.length <= 0) {
                                                                o.offtarget = null;

                                                            }
                                                            if (o.sequence && o.sequence.length > 0) {
                                                                const matches = o.sequence.match(pattern);
                                                                if (matches) {
                                                                    warn = true;
                                                                    graph.setMessage("Found potential high hit pattern.")
                                                                }
                                                                seqList.push(
                                                                    {
                                                                        "id": o.id,
                                                                        "synthesisSequence": o.synthesisSequence
                                                                    }
                                                                )
                                                            }
                                                        }
                                                    }
                                                    if (warn) {
                                                        let confirm = await exec('baja/lib/confirm.js',
                                                            'Repeat sequences were found.  This could cause a problem with the off-target analysis.  Continue?',
                                                            async () => {

                                                                graph.setMessage(" Edit distance : " + editDistance)
                                                                runOffTargets(oligos, seqList, editDistance, genomes)
                                                            })

                                                        showModal(confirm)
                                                    } else {

                                                        graph.setMessage(" Edit distance : " + editDistance)
                                                        runOffTargets(oligos, seqList, editDistance, genomes)
                                                    }

                                                }
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout)
                                                graph.runfun(go)

                                            })

                                        },
                                        {
                                            label: 'Cancel', ionFunction: createIonFunction(async () => {

                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout)

                                            })

                                        }

                                    ]
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
