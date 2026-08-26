function (graph, genegraph_panel_layout, selectedOnly) {

    editDistance = 0;

    return new Promise(async (resolve, reject) => {

        let SIRNA = await exec('flexigraph/sirna.js')

        let returnMode = 'editdistance'
        let splitArray = (array) => {
            const result = [];
            // One oligo per request so the gunsight advances one-at-a-time, left→right.
            const chunkSize = 1;

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
                // When invoked with selectedOnly, restrict to the selected oligos.
                if (selectedOnly) oligos = oligos.filter((o) => o && (o.selected || o.highlight__));

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

            // Reading order — left→right (genomic x), then top→bottom (world-y desc) —
            // and cap each run at 200 oligos; rebuild the seed query list in that order.
            try {
                ot_oligos.sort((a, b) => { const ax = Math.min(a.xi, a.xf), bx = Math.min(b.xi, b.xf); if (ax !== bx) return ax - bx; return (b.y || 0) - (a.y || 0); });
                if (ot_oligos.length > 200) { graph.setMessage(' Off-targets run 200 oligos at a time — running the first 200 (left→right, top→bottom). '); ot_oligos = ot_oligos.slice(0, 200); }
                seqList = ot_oligos.map((o) => ({ "id": String(o.id), "synthesisSequence": o.getSeedSequence ? o.getSeedSequence() : '' }));
            } catch (e) { }
            const __idToOligo = new Map();
            for (const o of ot_oligos) { if (o && o.id != null) __idToOligo.set(String(o.id), o); }

            // Zoom/center the view on the oligo currently being searched (instant).
            const centerOnOligo = (o) => {
                try {
                    if (!o) return;
                    let t = o.track || o.__track || null;
                    if (!t) { for (const tr of (graph.track || [])) { if (tr && o.xi >= Math.min(tr.xi, tr.xf) && o.xi <= Math.max(tr.xi, tr.xf)) { t = tr; break; } } }
                    if (!t || !t.tgraph) return;
                    const gg = (typeof graph.setxmin === 'function') ? graph : graph.graph;
                    const grid = (gg && gg.grid) ? gg.grid : gg;
                    if (!grid || !grid.setxmin) return;
                    const HALF = 45;
                    const a = t.tgraph.X(Math.min(o.xi, o.xf) - HALF), b = t.tgraph.X(Math.max(o.xi, o.xf) + HALF);
                    grid.setxmin(Math.min(a, b)); grid.setxmax(Math.max(a, b));
                    const ht = -1 * t.tgraph.height, yi = t.tgraph.yi - ht, band = 0.5 * 0.9;
                    grid.setymin(yi - band); grid.setymax(yi + band);
                    if (grid.rescale) grid.rescale();
                } catch (e) { }
            };

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

            // Block the app while the run is in progress — only Cancel is actionable.
            let __cancelled = false;
            let __modalPB = null;
            try { graph.setMouseMode('none'); graph.clearMouseListeners(); } catch (e) { }
            const __runModal = {
                wid: 'card',
                data: {
                    cards: [
                        [{ 'width': '100%', 'component': { wid: 'html', data: `<div style="padding:14px 20px;font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#eaf6f9;background:rgba(10,37,64,0.98);border:1px solid #1aa3bd;border-radius:10px;"><div style="font-size:15px;font-weight:700;">Running off-targets…</div><div style="font-size:12.5px;color:#8fb8c8;margin-top:4px;">Scanning oligos one at a time, left→right — the app is locked until this finishes.</div></div>` } }],
                        [{ 'width': '100%', 'component': { wid: 'progress', data: { 'progress': 0, 'progressBar': createIonFunction((pb) => { __modalPB = pb; }) } } }],
                        [{ 'width': '100%', 'component': { wid: 'mt-button', data: { buttons: [{ label: 'Cancel', ionFunction: createIonFunction(() => { __cancelled = true; }) }] } } }]
                    ]
                }
            };
            try { showModal(__runModal, 460, 210); } catch (e) { }
            const __finishRun = () => {
                try { for (const o of ot_oligos) { if (o) o.__gunsight = false; } } catch (e) { }
                try { hideAllModal(); } catch (e) { }
                try { graph.setMouseMode('navigate'); graph.clearMouseListeners(); exec('baja/manchester/menu/mouse-over-highlight.js', graph, graph.genegraph_panel_layout); } catch (e) { }
            };

            let sp = splitArray(seqList);
            let rr = [];
            let index = 0;
            for (let s of sp) {
                if (__cancelled) break;
                // Put the targeting gunsight (+ red glow) on the oligo being searched.
                const __chunkOligos = [];
                for (const item of s) { const o = __idToOligo.get(String(item && item.id)); if (o && __chunkOligos.indexOf(o) < 0) __chunkOligos.push(o); }
                for (const o of __chunkOligos) { try { o.__gunsight = true; if (o.highlight) o.highlight(0, 'red'); } catch (e) { } }
                try { if (__chunkOligos[0]) centerOnOligo(__chunkOligos[0]); } catch (e) { }
                try { if (graph.wake) graph.wake(); } catch (e) { }

                let r = null;
                try {
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
                    r = await POSTJSON(obj, uri)
                } finally {
                    for (const o of __chunkOligos) { try { o.__gunsight = false; o.highlight__ = false; } catch (e) { } }
                    try { if (graph.wake) graph.wake(); } catch (e) { }
                }
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
                try { if (__modalPB) __modalPB((index / sp.length) * 100); } catch (e) { }
            }

            // Run finished (or was cancelled) — unblock the app.
            __finishRun();
            if (__cancelled) { graph.setMessage(' Off-target run cancelled. '); return; }

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
