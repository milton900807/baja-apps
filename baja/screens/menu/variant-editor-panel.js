function (graph, genegraph_panel_layout, selectedTrack, snp) {
    return new Promise(async (resolve, reject) => {

        let SnpIndel = await exec('flexigraph/snpindel.js')
        let MutationAnnotation = await exec('flexigraph/mutation-annotation.js')

        let v;
        let input_txt = JSON.stringify(snp)

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
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Save', ionFunction: createIonFunction(async () => {
                                                let rules = v.getWidgetValue();
                                                try {
                                                    let sid = JSON.parse(rules)
                                                    if (sid.type && sid.type === 'mutation-annotation') {
                                                        let s = new MutationAnnotation(sid.type, sid.xi, sid.xf, sid.name, sid.phase, sid.transcriptStrand, sid.id)
                                                        s.setAnnotation(sid.annotations);
                                                        let index = selectedTrack.snpindels.findIndex(obj => obj.id == s.id)
                                                        selectedTrack.snpindels[index] = s;
                                                    } else {
                                                        let s = new SnpIndel(sid.type, sid.xi, sid.reference, sid.alternate, sid.phase, sid.transcriptStrand, sid.id, sid.phaseset)
                                                        s.setAnnotation(sid.annotations);
                                                        let index = selectedTrack.snpindels.findIndex(obj => obj.id == s.id)
                                                        selectedTrack.snpindels[index] = s;
                                                    }
                                                } catch (exception) {
                                                    console.log(' failed to parse ')
                                                }
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        },
                                        {
                                            label: 'Delete', ionFunction: createIonFunction(async () => {
                                                selectedTrack.removesnp(snp);
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        },
                                        {
                                            label: 'Delete all others on track', ionFunction: createIonFunction(async () => {
                                                let rules = v.getWidgetValue();
                                                try {
                                                    let sid = JSON.parse(rules)
                                                    let s;
                                                    if (sid.type && sid.type === 'mutation-annotation') {
                                                        s = new MutationAnnotation(sid.type, sid.xi, sid.xf, sid.name, sid.phase, sid.transcriptStrand, sid.id)
                                                    } else {
                                                        s = new SnpIndel(sid.type, sid.xi, sid.reference, sid.alternate, sid.phase, sid.transcriptStrand, sid.id, sid.phaseset)
                                                    }
                                                    s.setAnnotation(sid.annotations);
                                                    selectedTrack.snpindels = []
                                                    selectedTrack.snpindels.push(s)

                                                } catch (exception) {
                                                    alert(' failed to parse ')
                                                }

                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        },
                                        {
                                            label: 'Delete all others at this location', ionFunction: createIonFunction(async () => {
                                                let rules = v.getWidgetValue();
                                                try {
                                                    let sid = JSON.parse(rules)

                                                    let s;
                                                    if (sid.type && sid.type === 'mutation-annotation') {
                                                        s = new MutationAnnotation(sid.type, sid.xi, sid.xf, sid.name, sid.phase, sid.transcriptStrand, sid.id)
                                                    } else {
                                                        s = new SnpIndel(sid.type, sid.xi, sid.reference, sid.alternate, sid.phase, sid.transcriptStrand, sid.id, sid.phaseset)
                                                    }
                                                    selectedTrack.snpindels = []
                                                    selectedTrack.snpindels.push(s)

                                                } catch (exception) {
                                                    alert(' failed to parse ')
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
