function (graph, genegraph_panel_layout, selectedOnly) {

    editDistance = 0;

    return new Promise(async (resolve, reject) => {
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
                // When invoked with selectedOnly, restrict to the selected oligos.
                if (selectedOnly) oligos = oligos.filter((o) => o && (o.selected || o.highlight__));

                for (let o of oligos) {
                    o.offtarget = null;
                    o.showOfftargets = true;

                }
                for (let o of oligos) {
                    o.__strand = t.strand;   // remember strand for the query rebuild below
                    let synthesisSeq = o.synthesisSequence;
                    if (!synthesisSeq || synthesisSeq.length <= 0) {

                        if (t.strand < 0) {
                            o.synthesisSequence = o.sequence   // reverse strand: ASO = genomic+ target
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

            // Reading order — left→right (genomic x), then top→bottom (world-y desc) —
            // and cap each run at 200 oligos; rebuild the query list in that order.
            try {
                ot_oligos.sort((a, b) => { const ax = Math.min(a.xi, a.xf), bx = Math.min(b.xi, b.xf); if (ax !== bx) return ax - bx; return (b.y || 0) - (a.y || 0); });
                if (ot_oligos.length > 200) { graph.setMessage(' Off-targets run 200 oligos at a time — running the first 200 (left→right, top→bottom). '); ot_oligos = ot_oligos.slice(0, 200); }
                // Query with the actual ASO strand: reverse-complement of the target for a
                // forward-strand gene, the target itself (genomic+) for a reverse-strand gene.
                // A plain complement is not a real strand and matches nothing on the DNA index.
                seqList = ot_oligos.map((o) => {
                    const st = (o.__strand != null ? o.__strand : (o.strand != null ? o.strand : 1));
                    const q = (st < 0) ? o.sequence : (Biopolymer ? Biopolymer.reverseComp(o.sequence) : o.synthesisSequence);
                    return { "id": o.id, "synthesisSequence": q };
                });
            } catch (e) { }
            const __idToOligo = new Map();
            for (const o of ot_oligos) { if (o && o.id != null) __idToOligo.set(String(o.id), o); }

            // Smoothly zoom/center the view on an oligo (animated ~320ms ease-out). Resolves
            // when the animation completes.
            const centerOnOligo = (o) => new Promise((res) => {
                try {
                    if (!o) { res(); return; }
                    let t = o.track || o.__track || null;
                    if (!t) { for (const tr of (graph.track || [])) { if (tr && o.xi >= Math.min(tr.xi, tr.xf) && o.xi <= Math.max(tr.xi, tr.xf)) { t = tr; break; } } }
                    if (!t || !t.tgraph) { res(); return; }
                    const gg = (typeof graph.setxmin === 'function') ? graph : graph.graph;
                    const grid = (gg && gg.grid) ? gg.grid : gg;
                    if (!grid || !grid.setxmin) { res(); return; }
                    const HALF = 60;
                    const a = t.tgraph.X(Math.min(o.xi, o.xf) - HALF), b = t.tgraph.X(Math.max(o.xi, o.xf) + HALF);
                    const txMin = Math.min(a, b), txMax = Math.max(a, b);
                    const ht = -1 * t.tgraph.height, yi = t.tgraph.yi - ht, band = 0.5 * 0.9;
                    const tyMin = yi - band, tyMax = yi + band;
                    const sxMin = grid.getxmin(), sxMax = grid.getxmax(), syMin = grid.getymin(), syMax = grid.getymax();
                    const DUR = 320, ease = (p) => 1 - Math.pow(1 - p, 3), t0 = Date.now();
                    const step = () => {
                        const p = Math.min(1, (Date.now() - t0) / DUR), e = ease(p);
                        grid.setxmin(sxMin + (txMin - sxMin) * e); grid.setxmax(sxMax + (txMax - sxMax) * e);
                        grid.setymin(syMin + (tyMin - syMin) * e); grid.setymax(syMax + (tyMax - syMax) * e);
                        if (grid.rescale) grid.rescale();
                        if (graph.wake) graph.wake();
                        if (p < 1) setTimeout(step, 16); else res();
                    };
                    step();
                } catch (e) { res(); }
            });

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
            let __framePrev = null;   // previously-completed oligo (camera trails one behind)
            for (let s of sp) {
                if (__cancelled) break;
                // Put the targeting gunsight (+ red glow) on the oligo being searched.
                const __chunkOligos = [];
                for (const item of s) { const o = __idToOligo.get(String(item && item.id)); if (o && __chunkOligos.indexOf(o) < 0) __chunkOligos.push(o); }
                for (const o of __chunkOligos) { try { o.__gunsight = true; if (o.highlight) o.highlight(0, 'red'); } catch (e) { } }
                // Stay one oligo BEHIND: smoothly frame the previously-completed oligo (results in).
                try { if (__framePrev) await centerOnOligo(__framePrev); } catch (e) { }
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
                                            exec('https://data.oligodesigner.com/ionworks/py/gene/gff.py', JSON.stringify(o.offtarget)).then(rs => {

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
                try { if (__modalPB) __modalPB((index / sp.length) * 100); } catch (e) { }
                __framePrev = (__chunkOligos && __chunkOligos[0]) || __framePrev;   // now completed
            }

            // Frame the LAST completed oligo (the camera trailed one behind).
            try { if (!__cancelled && __framePrev) await centerOnOligo(__framePrev); } catch (e) { }

            // Run finished (or was cancelled) — unblock the app.
            __finishRun();
            if (__cancelled) { graph.setMessage(' Off-target run cancelled. '); return; }

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
