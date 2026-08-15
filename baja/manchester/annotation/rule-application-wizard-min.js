function (graph, genegraph_panel_layout, input_txt, filtern) {
    return new Promise(async (resolve, reject) => {
        if (!input_txt) {

            input_txt = `nucleotide-content, G/C >=0.3 <=0.7 | Optional
nucleotide-content, A/C >=0.25 <=0.75 | Optional
nucleotide-content, T/C >=0.25 <=0.75 | Optional
nucleotide-content, CG >=0 <=0.25 | Optional
pattern, TTTTTT | Optional
pattern, AAAAAA | Optional
pattern, CCCCCC | Optional
pattern, GGGGG | Optional
offtarget-distance, GRCH38, 0, 1 | Required
offtarget-distance, GRCH38, 1, 5 | Required
offtarget-distance, GRCH38, 2, 10 | Required
offtarget-contiguous, GRCH38, 17, 5 | Required
nt-overlap,, 1 | Optional
phaserule, | Required`
        }

        let logPanel;
        let logPanelFun;

        let oligon = 0;
        let v;
        if (!filtern) {
            filtern = 'N/A'
        }

        for (let t of graph.track) {
            oligon += t.oligos.length
        }

        let compound_filter = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '700px',
                cards: [
                    [
                        {
                            'title': 'Compound filtering rules',
                            'width': '100%',
                            'component': {
                                wid: 'input-textarea-editor',
                                data: {
                                    'showButton': false,
                                    'title': 'Compound filtering rules',
                                    'text': input_txt,
                                    'ionHookFunction': createIonFunction((input_box) => {
                                        v = input_box;
                                    })
                                    ,
                                    'height': "400px"
                                }
                            }
                        },
                        {
                            'width': '100%',
                            'component': {
                                wid: 'input-textarea-editor',
                                data: {
                                    'showButton': false,
                                    'text': '',
                                    'ionHookFunction': createIonFunction((input_box) => {
                                        logPanel = input_box;
                                        logPanelFun = (str) => {
                                            logPanel.appendLn(str);
                                        }
                                    })
                                    ,
                                    'height': "200px"
                                }
                            }
                        },
                        {
                            'title': 'Total oligos: ' + oligon,
                            'width': '100%',
                            'component': {
                                wid: 'card',
                            }
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Filter', ionFunction: createIonFunction(async () => {

                                                let working = await showWidget({
                                                    'wid': 'working',
                                                });

                                                let rules = v.getWidgetValue();
                                                let my_rules = await exec('baja/manchester/annotation/rule-parser.js', rules, graph, logPanelFun);
                                                let alloligos = [];
                                                for (let t of graph.track) {
                                                    let tag = null;
                                                    let filteroligos = [];
                                                    if (t.oligos.length > 0) {
                                                        for (let i = 0; i < my_rules.length; i++) {
                                                            await my_rules[i].applyrule(t.oligos, tag);
                                                        }
                                                        console.log('debubg');
                                                        for (let o of t.oligos) {
                                                            if (o.filter) {
                                                                filteroligos.push(o.name);
                                                            }
                                                            alloligos.push(o);
                                                        }

                                                        for (let i = filteroligos.length; i--;) {
                                                            oindex = t.oligos.map((_o) => _o.name).indexOf(filteroligos[i]);
                                                            t.oligos.splice(oindex, 1);
                                                        }

                                                        let ytmp = 0.15;
                                                        let o = null;
                                                        let _o = null;

                                                        t.oligos[0].y = ytmp;

                                                        for (let i = 1; i < t.oligos.length; i++) {
                                                            if (((t.oligos[i - 1].xi <= t.oligos[i].xi) && (t.oligos[i].xi <= t.oligos[i - 1].xf)) ||
                                                                ((t.oligos[i].xi <= t.oligos[i - 1].xi) && (t.oligos[i - 1].xi <= t.oligos[i].xf))) {
                                                                ytmp += 0.05;
                                                                if (ytmp > t.tgraph.ymax) {
                                                                    ytmp = 0.15
                                                                }
                                                                t.oligos[i].y = ytmp;
                                                                if (ytmp > t.tgraph.ymax) {
                                                                    t.tgraph.ymax = ytmp;
                                                                }
                                                            } else {
                                                                ytmp = 0.15;
                                                                t.oligos[i].y = ytmp;
                                                            }
                                                        }
                                                    }
                                                }

                                                working.status = 'complete';

                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);

                                            })
                                        },
                                        {
                                            label: 'Test', ionFunction: createIonFunction(async () => {

                                                let working = await showWidget({
                                                    'wid': 'working',
                                                });
                                                let Oligo = await exec('flexigraph/oligo.js');
                                                let rules = v.getWidgetValue();
                                                console.log(rules)
                                                let my_rules = await exec('baja/manchester/annotation/rule-parser.js', rules, graph, logPanelFun);
                                                let _filtern = `Parsing Error!`
                                                if (my_rules) {

                                                    let oligoClones = [];

                                                    for (let t of graph.track) {
                                                        if (t.oligos.length > 0) {
                                                            for (let o of t.oligos) {
                                                                let ostring = JSON.parse(JSON.stringify(o));
                                                                oligoClones.push(Object.assign(new Oligo(), ostring));
                                                            }
                                                        }
                                                    }
                                                    console.log(oligoClones)

                                                    let filteroligos = [];
                                                    let filterids = []
                                                    if (oligoClones.length > 0) {
                                                        for (let i = 0; i < my_rules.length; i++) {
                                                            console.log('debubg');

                                                            await my_rules[i].applyrule(oligoClones, null)
                                                        }
                                                        for (let o of oligoClones) {
                                                            if (o.filter) {
                                                                filteroligos.push(o.name);
                                                                filterids.push(o.id)
                                                            }
                                                        }
                                                    }

                                                    _filtern = oligon;
                                                    if (filteroligos.length > 0) {
                                                        _filtern = oligon - filteroligos.length;
                                                    }
                                                    rules = ``;
                                                    for (let r of my_rules) {
                                                        rules += `${r.rawrule} | filtered: ${r.filteredOligos}\n`;
                                                    }
                                                    logPanelFun(" \n\n\n\n\n\n \n")
                                                    logPanelFun(" -------------------------------------------------------------------------------- \n")
                                                    logPanelFun(" -------------------------------------------------------------------------------- \n")
                                                    logPanelFun("              REPORT SUMMARY                     \n")
                                                    logPanelFun(" -------------------------------------------------------------------------------- \n")
                                                    logPanelFun(" -------------------------------------------------------------------------------- \n")
                                                    logPanelFun(` Total number of oligos filtered: ${filteroligos.length}`)
                                                    logPanelFun(" Report :\n" + rules)

                                                    for (let f of filterids) {
                                                        logPanelFun(f)
                                                    }
                                                }
                                                working.status = 'complete';

                                            })
                                        },
                                        {
                                            label: 'Cancel', ionFunction: createIonFunction(() => {
                                                hideAllModal();
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        }
                                    ]
                                }
                            }
                        }
                    ]]
            }
        }
        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', compound_filter);

    })
}
