function (graph, genegraph_panel_layout) {

    editDistance = 0;

    return new Promise(async (resolve, reject) => {

        let SIRNA = await exec('flexigraph/sirna.js')

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

        let containsRepeatedSequences = (dnaString) => {
            const regex = /(A{4,}|C{4,}|G{4,}|T{4,})/;
            return regex.test(dnaString);
        }

        let skipo = []

        let runOffTargets = async (graph, genomes, __editDistance) => {
            graph.setMessage("Checking sequences...")
            const pattern = /(\w)\1{3,}/g;
            let ot_oligos = []
            let warn = false;
            let seqList = []

            for (let t of graph.track) {
                t.showOfftargets = true;
                let range = t.gitVisibleTrackRange(graph);
                let oligos = t.getOligosInRange(range.start, range.end);

                for (let o of oligos) {
                    o.mi_targets_transient_ = null;
                    o.show_seed_targets = true;

                }
                for (let o of oligos) {
                    if (o.getSeedSequence) {
                        let s = o.getSeedSequence();
                        if (containsRepeatedSequences(s)) {
                            skipo.push(o);
                        } else {
                            o.offtarget = null;
                            ot_oligos.push(o)
                            seqList.push(
                                {
                                    "id": String(o.id),
                                    "synthesisSequence": s
                                }
                            )
                        }
                    }
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

                    for (let o of ot_oligos) {

                        for (let off of oq) {
                            console.log('debubg');
                            if (String(o.id) == String(off.id)) {
                                o.mi_targets_transient_ = off.offtarget;
                                if ( o.mi_targets_transient_ && o.mi_targets_transient_.length > 0 ){
                                    o.mi_targets_transient_ = o.mi_targets_transient_.length;
                                }
                                o.show_seed_targets = true;
                                o.highlight(1000, 'purple')
                            }
                        }
                    }
                    for (let o of skipo) {
                        o.mi_targets_transient_ = 'NA';
                        o.show_seed_targets = true;
                        o.highlight(1000, 'purple')
                    }
                }
                rr.push(r);
                index++;
                progressBar((index / sp.length) * 100)
            }

            let btns = [
                {
                    label: 'Raw results', ionfunction: createIonFunction(async () => {
                        if (rr.length > 1000) {
                            let report = await exec('baja/manchester/menu/generate-excel-report-for-ott.js', rr)
                            const blob = new Blob([report], { type: 'json' });
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.setAttribute('hidden', '');
                            a.setAttribute('href', url);
                            a.setAttribute('download', 'off-target-report.csv');
                            document.body.appendChild(a);
                            a.click();

                        } else {
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
                                                                    let button_canvas = await exec('manchester/controls/navigation-panel.js', graph)
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
                        }
                    })

                }, {
                    label: 'Download ', ionfunction: createIonFunction(async () => {
                        console.log(" downloading... ")
                        let report = await exec('baja/manchester/menu/generate-excel-report-for-ott.js', rr)
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

            if (skipo.length > 0) {
                btns.push(
                    {
                        label: 'View skipped', ionfunction: createIonFunction(async () => {

                            if (rr.length > 1000) {
                                let report = await exec('baja/manchester/menu/generate-excel-report-for-ott.js', rr)
                                const blob = new Blob([report], { type: 'json' });
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.setAttribute('hidden', '');
                                a.setAttribute('href', url);
                                a.setAttribute('download', 'off-target-report.csv');
                                document.body.appendChild(a);
                                a.click();

                            } else {

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
                                                                    label: 'Return to design', ionfunction: createIonFunction(async () => {
                                                                        let button_canvas = await exec('manchester/controls/navigation-panel.js', graph)
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
                                                        data: JSON.stringify(skipo)
                                                    }
                                                },
                                            ]
                                        ]
                                    }
                                }
                                CurrentLayout.clearComponent('mainPanel')
                                CurrentLayout.setComponent('mainPanel', backtog);
                            }
                        })

                    })

            }

            let fbtns = [
                {
                    'label': 'Seed filters', 'ionfunction': createIonFunction(async () => {
                        graph.setMessage('Filter seed sequences that hit the same 3UTR >= 10 times')

                        await exec('baja/manchester/annotation/rule-application-wizard-min.js', graph, genegraph_panel_layout, 'offtarget-seed, Human3utr, 1, 10 | Required')
                    })
                },
                {
                    'label': 'Filter homopolymer seed sequences', 'ionfunction': createIonFunction(async () => {
                        graph.setMessage('Filter seed sequences that hit the same 3UTR >= 10 times')
                        await exec('baja/manchester/annotation/rule-application-wizard-min.js', graph, genegraph_panel_layout, `
seed-pattern, TTT | Required
seed-pattern, AAA | Required
seed-pattern, CCC | Required
seed-pattern, GGG | Required
                        `)
                    })
                },
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
                                            }, {
                                                'label': 'Filter', 'items': fbtns
                                            }

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

            if (a.indexOf('utr') > 0) {
                bg.push({
                    'label': a, ionfunction: createIonFunction((_label) => {
                        selected_genome = a

                    })

                })
            }
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
