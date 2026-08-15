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
            oligon += t.getSelectedOligos().length
        }

        let compound_filter = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '800px',
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
                                    'height': "500px"
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
                                    'height': "300px"
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
                                            label: 'Deprecate', ionFunction: createIonFunction(async () => {

                                                let working = await showWidget({
                                                    'wid': 'working',
                                                });

                                                let rules = v.getWidgetValue();
                                                let my_rules = await exec('baja/manchester/annotation/rule-parser.js', rules, graph, logPanelFun);
                                                let alloligos = [];
                                                for (let t of graph.track) {
                                                    let tag = null;
                                                    let filteroligos = [];
                                                    if (t.getSelectedOligos().length > 0) {

                                                        let selectedOligos = t.getSelectedOligos();
                                                        for (let i = 0; i < my_rules.length; i++) {
                                                            await my_rules[i].applyrule(selectedOligos, tag);
                                                        }
                                                        console.log('debubg');
                                                        for (let o of t.getSelectedOligos()) {
                                                            if (o.filter) {
                                                                filteroligos.push(o.id);
                                                            }
                                                            alloligos.push(o);
                                                        }

                                                        for (let i = filteroligos.length; i--;) {
                                                            oindex = t.oligos.map((_o) => _o.id).indexOf(filteroligos[i]);
                                                            t.oligos[oindex].type = 'deprecated_' + t.oligos[oindex].type;
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
                                                        if (t.getSelectedOligos().length > 0) {
                                                            for (let o of t.getSelectedOligos()) {
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
