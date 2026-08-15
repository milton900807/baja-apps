function (graph, oligo, genegraph_panel_layout) {
    hide_menu = false;

    console.log('debubg');

    return new Promise(async (resolve, reject) => {
        let registered = false;
        // CurrentLayout.clearComponent('labelPanel')
        // CurrentLayout.setComponent('labelPanel', {
        //     wid: 'html',
        //     data: `${oligo.sequence} loading...`
        // });

        const dbhost = window["env"]["db"];
        if (dbhost) {
            if (oligo.synthesisSequence != null && oligo.structure != null && oligo.synthesisSequence.length > 0 && oligo.structure.length > 0) {
                let r = await POSTJSON([oligo], `${dbhost}/verify`);
                if (oligo.synthesisSequence && oligo.structure && r[`${oligo.synthesisSequence}-${oligo.structure}`] && r[`${oligo.synthesisSequence}-${oligo.structure}`].id) {
                    oligo.id = r[`${oligo.synthesisSequence}-${oligo.structure}`].id
                }
            }
        }
        if (oligo.type === 'amplicon') {
            let labelPan = {
                wid: 'html',
                data: 'Primer-amp  ' + oligo.id
            }
            const models = [
                {
                    label: ' View properties',
                    click: async (xwc, ywc) => {
                        showModal({
                            wid: 'json',
                            data: JSON.stringify(oligo)
                        }, 1000, 500);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Remove all other primers on this track',
                    click: async (xwc, ywc) => {
                        let confirm = await exec('baja/lib/confirm-widget.js', async () => {
                            for (let t of graph.track) {
                                for (let o of t.oligos) {
                                    if (o.id === oligo.id) {
                                        let count = t.countOligosOfType('amplicon');
                                        t.removeOligosOfType('amplicon');
                                        graph.setMessage(" Removed " + (count - 1) + " amplicons. ");
                                        t.addOligo(oligo);
                                    }
                                }
                            }
                        }, " Are you sure you want to remove all amplicons except this one?");
                        showModal(confirm);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: ' Set probe',
                    click: async (xwc, ywc) => {
                        let attr_window = 20;
                        let va;

                        do {
                            va = await prompt("Length", ["Length"], { "Length": attr_window }, 300, 300);
                            if (va === null || va['Length'] === null) {
                                attr_window = 20;
                                break;
                            }
                        } while (!Number.isInteger(Number(va['Length'])));

                        if (va && va['Length'] !== null) {
                            attr_window = parseInt(va['Length'], 10);
                        }

                        graph.rungraph(async () => {
                            await exec('baja/manchester/menu/probe-action.js', graph, genegraph_panel_layout, attr_window);
                        });

                        CurrentLayout.setComponent('labelPanel', {
                            wid: 'html',
                            data: ' Click on a track to see menu options... '
                        });
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: ' Move (Y)',
                    click: async (xwc, ywc) => {
                        exec('baja/manchester/menu/move-oligos-vertical.js', graph);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: `Off-target / Run off-target on ppset ${oligo.id}`,
                    click: async (xwc, ywc) => {
                        let l = oligo.left;
                        let r = oligo.right;
                        let m = oligo.mid;

                        if (l && r && m) {
                            await exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout, [l, r, m]);
                        } else if (l && r) {
                            await exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout, [l, r]);
                        }
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Off-target / Run off-target on left primer only',
                    click: async (xwc, ywc) => {
                        let l = oligo.left;
                        if (l) {
                            l.offtargetsymbols = null;
                            l.offtarget = null;
                            await exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout, [l]);
                        }
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Off-target / Run off-target on right primer only',
                    click: async (xwc, ywc) => {
                        let l = oligo.right;
                        if (l) {
                            l.offtargetsymbols = null;
                            l.offtarget = null;
                            await exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout, [l]);
                        }
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Off-target / Run off-target on probe only',
                    click: async (xwc, ywc) => {
                        let l = oligo.mid;
                        if (l) {
                            l.offtargetsymbols = null;
                            l.offtarget = null;
                            await exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout, [l]);
                        } else {
                            infoPrompt(" No probe defined for this amplicon ");
                        }
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Off-target / Analysis',
                    click: async (xwc, ywc) => {
                        graph.clearMouseListeners('baja/manchester/menu/mouse-over-highlight.js');

                        if (oligo.type === 'amplicon') {
                            let left = oligo.left;
                            let right = oligo.right;
                            let mid = oligo.mid;
                            let cards = [];

                            if (left && left.offtarget) {
                                let rs = await exec('https://data.oligodesigner.com/ionworks/py/gene/gff.py', JSON.stringify(left.offtarget));
                                let component = await exec('baja/manchester/menu/menu-for-single-aso-display-report.js', graph, genegraph_panel_layout, rs, " Left:  " + left.synthesisSequence);
                                cards.push(component);
                            }

                            if (right && right.offtarget) {
                                let rs = await exec('https://data.oligodesigner.com/ionworks/py/gene/gff.py', JSON.stringify(right.offtarget));
                                let component = await exec('baja/manchester/menu/menu-for-single-aso-display-report.js', graph, genegraph_panel_layout, rs, " Right:  " + right.synthesisSequence);
                                cards.push(component);
                            }

                            if (mid && mid.offtarget) {
                                let rs = await exec('https://data.oligodesigner.com/ionworks/py/gene/gff.py', JSON.stringify(mid.offtarget));
                                let component = await exec('baja/manchester/menu/menu-for-single-aso-display-report.js', graph, genegraph_panel_layout, rs, " Probe:  " + mid.synthesisSequence);
                                cards.push(component);
                            }

                            if (cards && cards.length > 0) {
                                let returnButton = {
                                    title: ' ',
                                    body: ``,
                                    width: '100%',
                                    component: {
                                        wid: 'mt-button',
                                        data: {
                                            buttons: [
                                                {
                                                    label: 'Return to design',
                                                    ionFunction: createIonFunction(async () => {
                                                        let button_canvas = await exec('manchester/controls/navigation-panel.js', graph, graph.genegraph_panel_layout);
                                                        CurrentLayout.clearComponent('mainPanel');
                                                        CurrentLayout.setComponent('mainPanel', graph.genegraph_panel_layout);
                                                        CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                                                    })
                                                }
                                            ]
                                        }
                                    }
                                };

                                cards.push(returnButton);

                                let backtog = {
                                    wid: 'card',
                                    data: {
                                        cards: [cards]
                                    }
                                };

                                CurrentLayout.clearComponent('mainPanel');
                                CurrentLayout.setComponent('mainPanel', backtog);
                            } else {
                                infoPrompt("Run off-targets calculation first.");
                                return;
                            }
                        } else {
                            let rs = await exec('https://data.oligodesigner.com/ionworks/py/gene/gff.py', oligo);
                            let component = await exec('baja/manchester/menu/menu-for-single-aso-display-report.js', graph, genegraph_panel_layout, rs);
                            let cards = [component];

                            let backtog = {
                                wid: 'card',
                                data: {
                                    cards: [cards]
                                }
                            };

                            CurrentLayout.clearComponent('mainPanel');
                            CurrentLayout.setComponent('mainPanel', backtog);
                        }
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Off-target / Raw report',
                    click: async (xwc, ywc) => {
                        let backtog = {
                            wid: 'card',
                            data: {
                                cards: [
                                    [
                                        {
                                            title: ' ',
                                            body: ``,
                                            width: '100%',
                                            component: {
                                                wid: 'mt-button',
                                                data: {
                                                    buttons: [
                                                        {
                                                            label: 'Return to design',
                                                            ionFunction: createIonFunction(async () => {
                                                                let button_canvas = await exec('manchester/controls/navigation-panel.js', graph, graph.genegraph_panel_layout);
                                                                CurrentLayout.clearComponent('mainPanel');
                                                                CurrentLayout.setComponent('mainPanel', graph.genegraph_panel_layout);
                                                                CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                                                            })
                                                        }
                                                    ]
                                                }
                                            }
                                        },
                                        {
                                            title: ' ',
                                            body: ``,
                                            width: '100%',
                                            component: {
                                                wid: 'json',
                                                data: JSON.stringify(oligo.offtarget)
                                            }
                                        }
                                    ]
                                ]
                            }
                        };

                        CurrentLayout.clearComponent('mainPanel');
                        CurrentLayout.setComponent('mainPanel', backtog);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Export / Download sequences',
                    click: async (xwc, ywc) => {
                        let o = oligo;

                        let csvContent = '';
                        let blob = null;

                        if (o.right && o.left && o.mid) {
                            let header = 'ID,left, probe, right\n';
                            csvContent = o.IO + ',' +
                                o.right.synthesisSequence + ',' +
                                o.mid.synthesisSequence + ',' +
                                o.right.synthesisSequence + '\n';
                            blob = new Blob([header, csvContent], { type: 'text/csv;charset=utf-8;' });
                        } else {
                            let header = 'ID,left,  right\n';
                            csvContent = o.IO + ',' +
                                o.right.synthesisSequence + ',' +
                                o.right.synthesisSequence + '\n';
                            blob = new Blob([header, csvContent], { type: 'text/csv;charset=utf-8;' });
                        }

                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = o.name + 'ppset.csv';
                        link.style.display = 'none';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    },
                    move: () => {
                        log('');
                    }
                }
            ];

            me.push(
                {
                    label: 'Export / Download sequences',
                    click: async (xwc, ywc) => {
                        let o = oligo;

                        let csvContent = '';
                        let blob = null;

                        if (o.right && o.left && o.mid) {
                            let header = 'ID,left, probe, right\n';
                            csvContent =
                                o.IO + ',' +
                                o.right.synthesisSequence + ',' +
                                o.mid.synthesisSequence + ',' +
                                o.right.synthesisSequence + '\n';

                            blob = new Blob([header, csvContent], {
                                type: 'text/csv;charset=utf-8;'
                            });
                        } else {
                            let header = 'ID,left,  right\n';
                            csvContent =
                                o.IO + ',' +
                                o.right.synthesisSequence + ',' +
                                o.right.synthesisSequence + '\n';

                            blob = new Blob([header, csvContent], {
                                type: 'text/csv;charset=utf-8;'
                            });
                        }

                        const link = document.createElement('a');
                        link.href = URL.createObjectURL(blob);
                        link.download = o.name + 'ppset.csv';
                        link.style.display = 'none';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);

                        console.log("The input string is 'ASO sequences'.");
                    },
                    move: () => {
                        log('');
                    }
                })

            // let butPan = {
            //     wid: 'menu',
            //     width: 300,
            //     data: {
            //         title: '  ',
            //         style: 'sub-container',
            //         menus: me

            //     }
            // }

            // CurrentLayout.clearComponent('buttonMenuPanel|labelPanel')
            // CurrentLayout.setComponent('buttonMenuPanel', butPan);
            // CurrentLayout.clearComponent('labelPanel')
            // CurrentLayout.setComponent('labelPanel', labelPan);

            graph.showSideMenu(models);

        } else {

            const models = [
                {
                    label: ' Sequence',
                    click: async (xwc, ywc) => {
                        showModal({
                            wid: 'json',
                            data: JSON.stringify({
                                sequence: oligo.sequence,
                                synthesisSequence: oligo.synthesisSequence
                            })
                        });
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: ' Move (Y)',
                    click: async (xwc, ywc) => {
                        console.log('debubg');
                        exec('baja/manchester/menu/move-oligos-vertical.js', graph);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: ' Export IDT...',
                    click: async (xwc, ywc) => {
                        let helm = await exec('baja/chem/helm.js');
                        if (oligo.type === 'siRNA') {
                            let chains = helm.convertHELMtoIDT(oligo.structure);

                            showModal({
                                wid: 'json',
                                data: JSON.stringify(chains)
                            }, 600, 500);
                        }
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: ' Oligo Editor',
                    click: async (xwc, ywc) => {
                        let monomers = await exec('data/monomers.js');
                        let fixStructure = (struc) => {
                            if (struc.indexOf('{') > 0) {
                                return struc;
                            }

                            let helmstring = '';
                            let t1 = struc.indexOf('[');
                            let t2 = struc.indexOf('(');

                            if (t1 < 0 && t2 > 0) {
                                let spt = struc.split('.');
                                let nh = 'RNA1{';
                                let previouslinker = '';

                                for (let s of spt) {
                                    let iparen = s.indexOf('(');
                                    let eparen = s.indexOf(')');
                                    let sug = s.substring(0, iparen);
                                    let base = s.substring(iparen + 1, eparen);
                                    let linker = s.substring(eparen + 1);

                                    if (sug.length > 1) sug = '[' + sug + ']';
                                    if (base.length > 1) base = '[' + base + ']';
                                    if (linker.length > 1) linker = '[' + linker + ']';

                                    nh += previouslinker + sug + '(' + base + ')';
                                    previouslinker = linker + '.';
                                }

                                nh += '}$$$$';
                                helmstring = nh;
                            } else if (struc.indexOf('[') === 0) {
                                let spt = struc.split('.');
                                let nh = 'RNA1{';

                                for (let s of spt) {
                                    s = s.trim();
                                    let li = s.indexOf(']');
                                    if (li > 0) {
                                        let si = s.indexOf('[');
                                        if (si === 0) {
                                            let base = s.substring(si + 1, li);
                                            let sug = s.substring(li + 1);
                                            base = base.trim();
                                            sug = sug.trim();

                                            if (sug.length > 1) sug = '[' + sug + ']';
                                            if (base.length > 1) base = '[' + base + ']';

                                            nh += sug + '(' + base + ')';
                                        } else {
                                            let linker = s.substring(0, si);
                                            let base = s.substring(si + 1, li);
                                            let sug = s.substring(li + 1);
                                            linker = linker.trim();
                                            sug = sug.trim();
                                            base = base.trim();

                                            if (sug.length > 1) sug = '[' + sug + ']';
                                            if (base.length > 1) base = '[' + base + ']';
                                            if (linker.length > 1) linker = '[' + linker + ']';

                                            nh += linker + '.' + sug + '(' + base + ')';
                                        }
                                    } else {
                                        s = s.trim();
                                        if (s.length > 0) {
                                            s = '[' + s + ']';
                                        }
                                        nh += s + '.';
                                    }
                                }

                                nh += '}$$$$';
                                helmstring = nh;
                            }

                            return helmstring;
                        };

                        let strs = '';
                        strs += fixStructure(oligo.structure);
                        strs = strs.trim();

                        let medchemEditor = null;
                        let js = {
                            wid: 'medchem',
                            data: {
                                helm: strs,
                                monomers: monomers,
                                listener: createIonFunction((_medchemEditor) => {
                                    medchemEditor = _medchemEditor;
                                })
                            },
                            title: 'medchemeditor'
                        };

                        let meditor = {
                            wid: 'card',
                            componentRef: 'bottomPanel',
                            data: {
                                height: '800px',
                                cards: [[
                                    {
                                        title: '',
                                        width: '100%',
                                        component: js
                                    },
                                    {
                                        title: '',
                                        width: '100%',
                                        component: {
                                            wid: 'mt-button',
                                            data: {
                                                buttons: [
                                                    {
                                                        label: 'Apply',
                                                        ionFunction: createIonFunction(() => {
                                                            if (medchemEditor != null) {
                                                                let helm = medchemEditor.getHELM();
                                                                oligo.structure = helm;
                                                            }

                                                            CurrentLayout.clearComponent('mainPanel');
                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                        })
                                                    },
                                                    {
                                                        label: 'Cancel',
                                                        ionFunction: createIonFunction(() => {
                                                            CurrentLayout.clearComponent('mainPanel');
                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                        })
                                                    }
                                                ]
                                            }
                                        }
                                    }
                                ]]
                            }
                        };

                        CurrentLayout.clearComponent('mainPanel');
                        CurrentLayout.setComponent('mainPanel', meditor);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: ' Properties',
                    click: async (xwc, ywc) => {
                        let jpanel = null;
                        let jsonBench = createIonFunction((panel) => {
                            jpanel = panel;
                        });

                        let structure_view = {
                            wid: 'card',
                            data: {
                                height: '800px',
                                cards: [[
                                    {
                                        width: '100%',
                                        height: '800px',
                                        component: {
                                            wid: 'json',
                                            refCallback: jsonBench,
                                            data: JSON.stringify(oligo)
                                        }
                                    },
                                    {
                                        title: '',
                                        width: '100%',
                                        component: {
                                            wid: 'mt-button',
                                            data: {
                                                buttons: [
                                                    {
                                                        label: 'Close',
                                                        ionFunction: createIonFunction(() => {
                                                            CurrentLayout.clearComponent('mainPanel');
                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                        })
                                                    },
                                                    {
                                                        label: 'Apply',
                                                        ionFunction: createIonFunction(async () => {
                                                            let Oligo = await exec('flexigraph/oligo.js');
                                                            let SIRNA = await exec('flexigraph/sirna.js');
                                                            let Amplicon = await exec('flexigraph/amplicon.js');

                                                            let a = jpanel.getData();
                                                            if (a.type === 'siRNA') {
                                                                oligo = Object.assign(new SIRNA(), a);
                                                            } else {
                                                                oligo = Object.assign(new Oligo(), a);
                                                            }

                                                            CurrentLayout.clearComponent('mainPanel');
                                                            CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                                        })
                                                    }
                                                ]
                                            }
                                        }
                                    }
                                ]]
                            }
                        };

                        CurrentLayout.clearComponent('mainPanel');
                        CurrentLayout.setComponent('mainPanel', structure_view);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Off-targets / Run...',
                    click: async (xwc, ywc) => {
                        await exec('baja/manchester/menu/run-off-targets.js', graph, genegraph_panel_layout, [oligo]);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Off-targets / Seed sequence report',
                    click: async (xwc, ywc) => {
                        function summarizeAndSortMatches(mi_targets_transient_) {
                            const countMap = new Map();

                            mi_targets_transient_.forEach(target => {
                                const key = `${target.chr}|${target.genome}|${target.editdistance}`;
                                countMap.set(key, (countMap.get(key) || 0) + 1);
                            });

                            const sortedMatches = Array.from(countMap, ([key, count]) => ({
                                key,
                                count
                            }));

                            sortedMatches.sort((a, b) => b.count - a.count);

                            return sortedMatches.map(entry => ({
                                description: `Combination: ${entry.key}, Occurrences: ${entry.count}`
                            }));
                        }

                        let hits = summarizeAndSortMatches(oligo.mi_targets_transient_);

                        let backtog = {
                            wid: 'card',
                            data: {
                                cards: [[
                                    {
                                        title: ' ',
                                        body: ``,
                                        width: '100%',
                                        component: {
                                            wid: 'mt-button',
                                            data: {
                                                buttons: [
                                                    {
                                                        label: 'Return to design',
                                                        ionFunction: createIonFunction(async () => {
                                                            let button_canvas = await exec('manchester/controls/navigation-panel.js', graph, graph.genegraph_panel_layout);
                                                            CurrentLayout.clearComponent('mainPanel');
                                                            CurrentLayout.setComponent('mainPanel', graph.genegraph_panel_layout);
                                                            CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                                                        })
                                                    }
                                                ]
                                            }
                                        }
                                    },
                                    {
                                        title: ' ',
                                        body: ``,
                                        width: '100%',
                                        component: {
                                            wid: 'json',
                                            data: JSON.stringify(hits)
                                        }
                                    }
                                ]]
                            }
                        };

                        CurrentLayout.clearComponent('mainPanel');
                        CurrentLayout.setComponent('mainPanel', backtog);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Off-targets / Off-target Analysis',
                    click: async (xwc, ywc) => {
                        graph.clearMouseListeners();

                        let tpanel = null;
                        let innerComponentCallback = (panel) => {
                            tpanel = panel;
                        };

                        console.log('debubg');

                        let rs = await exec('https://data.oligodesigner.com/ionworks/py/gene/gff.py', JSON.stringify(oligo.offtarget));

                        if (rs && rs['tsv']) {
                            let tsvText = rs['tsv'];
                            const lines = tsvText.split('\n');
                            const geneSymbols = [];
                            for (let line of lines) {
                                const columns = line.split('\t');
                                if (columns.length > 1 && columns[1]) {
                                    geneSymbols.push(columns[1]);
                                }
                            }
                            oligo.offtargetsymbols = [geneSymbols.toString()];
                        }

                        let backtog = {
                            wid: 'card',
                            data: {
                                cards: [[
                                    {
                                        title: ' ',
                                        body: ``,
                                        width: '100%',
                                        component: {
                                            wid: 'mt-button',
                                            data: {
                                                buttons: [
                                                    {
                                                        label: 'Return to design',
                                                        ionFunction: createIonFunction(async () => {
                                                            let button_canvas = await exec('manchester/controls/navigation-panel.js', graph, graph.genegraph_panel_layout);
                                                            CurrentLayout.clearComponent('mainPanel');
                                                            CurrentLayout.setComponent('mainPanel', graph.genegraph_panel_layout);
                                                            CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                                                        })
                                                    }
                                                ]
                                            }
                                        }
                                    },
                                    {
                                        title: ' ',
                                        body: ``,
                                        width: '100%',
                                        height: '800px',
                                        component: {
                                            wid: 'html',
                                            data: rs['html']
                                        }
                                    },
                                    {
                                        title: ' ',
                                        body: ``,
                                        width: '100%',
                                        height: '800px',
                                        component: {
                                            wid: 'tsv',
                                            refCallback: innerComponentCallback,
                                            height: '100px',
                                            data: JSON.stringify(rs['tsv'])
                                        }
                                    }
                                ]]
                            }
                        };

                        CurrentLayout.clearComponent('mainPanel');
                        CurrentLayout.setComponent('mainPanel', backtog);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Off-targets / Raw report',
                    click: async (xwc, ywc) => {
                        let backtog = {
                            wid: 'card',
                            data: {
                                cards: [[
                                    {
                                        title: ' ',
                                        body: ``,
                                        width: '100%',
                                        component: {
                                            wid: 'mt-button',
                                            data: {
                                                buttons: [
                                                    {
                                                        label: 'Return to design',
                                                        ionFunction: createIonFunction(async () => {
                                                            let button_canvas = await exec('manchester/controls/navigation-panel.js', graph, graph.genegraph_panel_layout);
                                                            CurrentLayout.clearComponent('mainPanel');
                                                            CurrentLayout.setComponent('mainPanel', graph.genegraph_panel_layout);
                                                            CurrentLayout.setComponent('buttonMenuPanel', button_canvas);
                                                        })
                                                    }
                                                ]
                                            }
                                        }
                                    },
                                    {
                                        title: ' ',
                                        body: ``,
                                        width: '100%',
                                        component: {
                                            wid: 'json',
                                            data: JSON.stringify(oligo.offtarget)
                                        }
                                    }
                                ]]
                            }
                        };

                        CurrentLayout.clearComponent('mainPanel');
                        CurrentLayout.setComponent('mainPanel', backtog);
                    },
                    move: () => {
                        log('');
                    }
                },

                {
                    label: 'Register / Register',
                    click: async (xwc, ywc) => {
                        if (registered) {
                            infoPrompt(" Compound is already registered ");
                        }

                        if (!registered) {
                            const dbhost = window["env"]["db"];
                            if (dbhost) {
                                let r = await POSTJSON(oligo, `${dbhost}/register`);
                                if (r.status === 404) {
                                    registered = true;
                                } else {
                                    registered = false;
                                }
                            }
                        }
                    },
                    move: () => {
                        log('');
                    }
                }
            ];
            graph.showSideMenu ( models )

            resolve()
        }
        resolve();
    })

}
