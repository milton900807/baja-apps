function (jsonObject, listenerMethod) {

    return new Promise((resolve, reject) => {

        let panel;
        let cb = createIonFunction((_p) => {
            panel = _p;
        })

        let editor_panel = {
            wid: 'card',
            data: {
                cards: [
                    [
                        {
                            'width': '100%',
                            "style.padding-top": '4px',
                            "style.border": '1px',
                            'component':
                            {
                                'wid': 'html',
                                'data': ` <h2 color='red'> Edit siRNA template chemistry...  </h2>
                                    NOTE: for siRNA chemistry the convention is: RNA1 = sense strand & RNA2 = antisense strand.

                                `
                            },

                        },
                        {

                            'width': '100%',
                            'component':
                            {
                                wid: 'text-editor',
                                refCallback: cb,
                                data: {
                                    text: text__.toString(),
                                    height: "350px",
                                    showButton: false,
                                    editorOptions: { language: 'text', automaticLayout: true },
                                    keybinding: {
                                        'Ctrl+Enter': createIonFunction((content, lineNumber, col) => {
                                        })
                                    },
                                }
                            }
                        },
                        {
                            'title': ' ', 'body': ``,
                            'width': '100%',
                            'component':
                            {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Apply', ionFunction: createIonFunction(async () => {
                                                let value = jsonPanel.code;
                                                let count = countCharacter(value, '$')
                                                if (count > 0) {
                                                    for (let t of graph.track) {
                                                        for (let o of t.oligos) {
                                                            if (o.type.toLowerCase() === 'sirna') {
                                                                let sense = o.sequence;
                                                                let antisense = o.synthesisSequence;
                                                                let helm = applyTemplateToHELM(value, sense, t.strand)
                                                                o.structure = helm
                                                            }
                                                        }
                                                    }
                                                } else {
                                                    let matches = value.match(/RNA/gi);
                                                    if (matches.length > 2) {
                                                        infoPrompt(" Most have no more than two strands:  RNA1 == passenger & RNA2 == guide.")
                                                        return;
                                                    }

                                                    let chains = parseChains(value);
                                                    for (let c of chains) {
                                                        if (c.startsWith('RNA1')) {
                                                            for (let t of graph.track) {
                                                                for (let o of t.oligos) {
                                                                    if (o.type.toLowerCase() === 'sirna') {
                                                                        let chain1 = applyTemplate(c, o.sequence)
                                                                        o.structure = replaceChain(o.structure, 1, chain1)
                                                                    }
                                                                }
                                                            }
                                                        } else if (c.startsWith('RNA2')) {
                                                            for (let t of graph.track) {
                                                                for (let o of t.oligos) {
                                                                    if (o.type.toLowerCase() === 'sirna') {
                                                                        let chain2 = applyTemplate(c, o.synthesisSequence)
                                                                        o.structure = replaceChain(o.structure, 2, chain2)
                                                                    }
                                                                }

                                                            }

                                                        }
                                                    }
                                                }
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
                                            })
                                        },
                                        {
                                            label: 'Close', ionFunction: createIonFunction(async () => {
                                                CurrentLayout.clearComponent('mainPanel')
                                                CurrentLayout.setComponent('mainPanel', genegraph_panel_layout);
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

        CurrentLayout.clearComponent('mainPanel')
        CurrentLayout.setComponent('mainPanel', running_panel);

        let input = {
            wid: 'card',
            componentRef: 'bottomPanel',
            data: {
                height: '800px',
                cards: [
                    [
                        {
                            'title': '',
                            'width': '100%',
                            'component':
                            {
                                wid: 'html',
                                data: `<h1> Edit annotation type </h1> `
                            }
                        },

                        {
                            'title': '',
                            'width': '100%',
                            'component':
                            {
                                wid: 'json',
                                refCallback: _panel,
                                data: JSON.stringify(jsonObject)
                            }
                        },
                        {
                            'title': '',
                            'width': '100%',
                            'component': {
                                wid: 'mt-button', data: {
                                    buttons: [
                                        {
                                            label: 'Cancel', ionFunction: createIonFunction(() => {
                                                listenerMethod('cancel', null)
                                            })
                                        },
                                        {
                                            label: 'Delete', ionFunction: createIonFunction(() => {
                                                listenerMethod('delete', null)
                                            })
                                        },
                                        {
                                            label: 'OK', ionFunction: createIonFunction(() => {

                                                if (panel) {
                                                    try {
                                                        let v = panel.getData () + '';
                                                        let jv = JSON.parse(v);
                                                        listenerMethod('OK', jv)

                                                    } catch (exception) {
                                                        prompt('Failed to parse the object ')
                                                    }
                                                }
                                            })
                                        }
                                    ]
                                }
                            }
                        }
                    ]]
            }
        }

        return resolve ( input )
    })

}
