function (graph, genegraph_panel_layout) {

    return new Promise(async (resolve, reject) => {

        let editor_;
        let selectPanel = createIonFunction((editor) => {
            editor_ = editor;
        })
        let showMainScreen = async () => {
            CurrentLayout.clearComponent('mainPanel')
            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

        }

        // Off-target count: o.offtarget is an array of hits, a string count (when
        // too large to enumerate), or null.
        const offCount = (o) => {
            const v = o && o.offtarget;
            if (v == null) return 0;
            if (Array.isArray(v)) return v.length;
            const n = parseInt(v, 10);
            return isNaN(n) ? 0 : n;
        };
        // The off-target filter operates on single-stranded oligos only — never
        // amplicons (which live in t.oligos with type === 'amplicon').
        const isAmp = (o) => !!(o && o.type === 'amplicon');
        const allOligos = () => {
            const out = [];
            for (const tr of graph.track) for (const o of (tr.oligos || [])) if (!isAmp(o)) out.push(o);
            return out;
        };
        const removeOligos = (pred) => {
            let removed = 0;
            try { graph.pushOntoHistory(); } catch (e) { }
            for (const tr of graph.track) {
                const before = (tr.oligos || []).length;
                // Keep amplicons always; only remove matching non-amplicon oligos.
                tr.oligos = (tr.oligos || []).filter((o) => isAmp(o) || !pred(o));
                removed += before - tr.oligos.length;
            }
            if (graph.wake) graph.wake();
            return removed;
        };
        // Drop the highest-off-target `pct`% of oligos.
        const dropTopPercent = (pct) => {
            const all = allOligos();
            const k = Math.ceil(all.length * pct / 100);
            if (k <= 0) return 0;
            const sorted = all.slice().sort((a, b) => offCount(b) - offCount(a));
            const toRemove = new Set(sorted.slice(0, k));
            return removeOligos((o) => toRemove.has(o));
        };
        const dropAboveCount = async () => {
            const res = await prompt('Drop oligos with off-target count greater than', ['Count'], { Count: 0 }, 360, 300);
            if (!res) return;
            const n = parseInt(res['Count'], 10);
            if (isNaN(n)) return;
            const removed = removeOligos((o) => offCount(o) > n);
            graph.setMessage(' Dropped ' + removed + ' oligo(s) with > ' + n + ' off-targets. ');
            showMainScreen();
        };

        let tname = [
            'Drop by off-target count > N…',
            'Drop top 10% by off-target count',
            'Drop top 20% by off-target count',
            'Drop top 30% by off-target count'
        ]

        let t = {
            wid: 'card',
            data: {
                cards: [
                    [
                        {
                            'title': ' Delete compounds... ',
                            width: '100%',

                            'body': `  `, 'component':
                            {
                                wid: 'selection-list',
                                width: '100%',
                                refCallback: selectPanel,
                                data: {
                                    single_selection: true,
                                    show_button: false,
                                    singleSelect: true, listItems: tname,
                                    button_function: createIonFunction(async (items) => {

                                        let name = items[0]
                                        if (name === 'Drop by off-target count > N…') {
                                            await dropAboveCount();
                                        } else if (name === 'Drop top 10% by off-target count') {
                                            const r = dropTopPercent(10); graph.setMessage(' Dropped ' + r + ' oligo(s) (top 10% by off-targets). '); showMainScreen();
                                        } else if (name === 'Drop top 20% by off-target count') {
                                            const r = dropTopPercent(20); graph.setMessage(' Dropped ' + r + ' oligo(s) (top 20% by off-targets). '); showMainScreen();
                                        } else if (name === 'Drop top 30% by off-target count') {
                                            const r = dropTopPercent(30); graph.setMessage(' Dropped ' + r + ' oligo(s) (top 30% by off-targets). '); showMainScreen();
                                        } else {
                                            CurrentLayout.clearComponent('mainPanel')
                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                        }
                                    })
                                }
                            }
                        },
                    ],
                    [
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Apply', ionFunction: createIonFunction(async () => {
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                            })
                                        },
                                        {
                                            label: 'Cancel', ionFunction: createIonFunction(async () => {
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                            })
                                        },
                                    ]
                                }
                            }
                        }
                    ]
                ]
            }
        }
        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', t);
        resolve();

    })

}
