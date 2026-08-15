function (graph, genegraph_panel_layout) {
    console.log(" loading synthesis sequence panel ")
    return new Promise(async (resolve, reject) => {
        let input_txt = '';
        let logPanel;
        let logPanelFun;
        let clearLog;
        let oligon = 0;
        let v;
        let Biopolymer = await exec('baja/chem/biopolymer.js')

        graph.setMouseMode('navigate')

        for (let t of graph.track) {
            oligon += t.oligos.length
            for (let o of t.oligos) {
                if (o.synthesisSequence)
                    input_txt += '' + o.id + '\t' + o.synthesisSequence + '\n'
                else
                    input_txt += '' + o.id + '\t ? \n'
            }
        }

        let compound_filter = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '800px',
                cards: [
                    [
                        {
                            'width': '100%',
                            'component': {
                                wid: 'title',
                                data: `<h3> Update the synthesis sequence</h3>`
                            }
                        },
                        {
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
                                    'height': "200px"
                                }
                            }
                        },
                        {
                            'width': '30%',
                            'component': {
                                wid: 'html',
                                data: `Update the sequence derived from the target sequence.  (e.g. (+) strand is complement and (-) strand is reverse complement).  The panel below displays the updated synthesis sequence for each oligos  `
                            }
                        },

                        {
                            'title': '',
                            'width': '70%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Update sequences', ionFunction: createIonFunction(async () => {
                                                let working = await showWidget({
                                                    'wid': 'working',
                                                });
                                                let rules = v.getWidgetValue();
                                                let rl = rules.split('\n')
                                                let ids = []
                                                for (let r of rl) {
                                                    r = r.trim();
                                                    let t = r.split ('\t');
                                                    let id = t[0]
                                                    if (id && id.length > 0)
                                                        ids.push(id.trim())
                                                }
                                                clearLog();
                                                let nids = [];
                                                for (let t of graph.track) {
                                                    let oligos = t.oligos;
                                                    for (let fid of ids) {
                                                        let o = oligos.find(obj => obj.id+'' === fid+'')
                                                        if (o) {
                                                            let strand = t.strand;
                                                            if (strand > 0) {

                                                                let seq = t.getSequenceRange ( o.xi, o.xf)
                                                                let synthesisSequence = Biopolymer.comp(seq);
                                                                nids.push([o.id, synthesisSequence])
                                                                logPanelFun(o.id + '\t' + synthesisSequence)
                                                            } else {
                                                                let seq = t.getSequenceRange ( o.xi, o.xf)
                                                                let synthesisSequence = Biopolymer.reverseComp(seq);
                                                                nids.push([o.id, synthesisSequence])
                                                                logPanelFun(o.id + '\t' + synthesisSequence)

                                                            }
                                                        }
                                                    }
                                                }
                                                working.status = 'complete';
                                            })
                                        },
                                    ]
                                }
                            }
                        },
                        {
                            'width': '30%',
                            'component': {
                                wid: 'title',
                                data: `<hr>

                                    <h2> Confirmation Panel </h2>

                                `
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
                                        clearLog = () => {
                                            logPanel.updateValue('');
                                        }
                                    })
                                    ,
                                    'height': "200px"
                                }
                            }
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [

                                        {
                                            label: 'Confirm', ionFunction: createIonFunction(async () => {

                                                let isNotDNAString= (str) => {
                                                    const nonDNARegex = /[^ATGC]/i;
                                                    return nonDNARegex.test(str);
                                                }

                                                let working = await showWidget({
                                                    'wid': 'working',
                                                });
                                                let rules = '' + logPanel.getWidgetValue();
                                                rules = rules.trim();
                                                let rl = rules.split('\n')
                                                let ids = []
                                                for (let r of rl) {
                                                    let id = r[0];
                                                    if (id && id.length > 0)
                                                        ids.push(id.trim())
                                                }
                                                for (let t of graph.track) {
                                                    let oligos = t.oligos;
                                                    let strand = t.strand;
                                                    for (let o of oligos) {
                                                        if (o.sequence == null || o.sequence.length <=0 || isNotDNAString (o.sequence) ){
                                                            o.sequence = t.getSequenceRange ( o.xi, o.xf );
                                                        }

                                                        if (strand > 0) {
                                                            let synthesisSequence = Biopolymer.comp(o.sequence);
                                                            o.synthesisSequence = synthesisSequence
                                                        } else {
                                                            let synthesisSequence = Biopolymer.reverseComp(o.sequence);
                                                            o.synthesisSequence = synthesisSequence
                                                        }

                                                    }
                                                }
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        },
                                        {
                                            label: 'Cancel', ionFunction: createIonFunction(() => {
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
