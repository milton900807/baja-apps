function (graph) {

    let v;
    let build = 'hg38';
    let host_ = window['env']['apiUrl']
    let identifyIdentifierType = (identifier) => {
        const ensemblRegex = /^ENS[A-Z]+[0-9]+$/;
        const ncbiRegex = /^[0-9]+$/;
        if (ensemblRegex.test(identifier)) {
            return "ID";
        }
        if (ncbiRegex.test(identifier)) {
            return "ID";
        }
        return "Symbol";
    }
    function extractFirstEnsemblId(inputString) {
        const pattern = /ENS[GTPE]\d+/;
        const match = inputString.match(pattern);
        return match ? match[0] : null;
    }

    let export_sequence = {
        wid: 'card',
        componentRef: 'bottomPanel',
        data: {
            height: '800px',
            cards: [
                [
                    {
                        'title': 'ENSEMBL ID, NCBI ID, or Symbol',
                        'width': '100%',
                        'component': {
                            wid: 'input-textarea-editor',
                            data: {
                                'showButton': false,
                                'title': 'ID',
                                'ionHookFunction': createIonFunction((input_box) => {
                                    v = input_box;
                                })
                            }
                        }
                    },
                    {
                        'title': '',
                        'width': '100%',
                        'component': {
                            wid: 'html',
                            data: `Find transcript from gene symbol...`
                        }
                    },
                    {
                        'title': '',
                        'width': '100%',
                        'component': {
                            wid: 'input-textfield',
                            data: {
                                'show-button': false,
                                'title': 'Find transcript by gene  symbol',
                                'text': '',
                                'typeahead_url': `${host_}/gene-lookup`,
                                'typeahead_fields': ['Ensembl Canonical', 'Gene name', 'Gene Synonym', 'Gene description', 'Transcript stable ID'],
                                'optionSelected': createIonFunction((value) => {
                                    let transcript = extractFirstEnsemblId(value.toString())
                                    v.updateValue(transcript);
                                }),
                                'ionHookFunction': createIonFunction((input_box) => {
                                    build = input_box;
                                })
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
                                        label: 'Load', ionFunction: createIonFunction(async () => {
                                            hideAllModal();

                                            setTimeout(async () => {
                                                graph.setMessage(" Loading... ")
                                                let ct = v.getWidgetValue();
                                                if (ct.indexOf('.') > 0)
                                                    ct = ct.substring(0, ct.indexOf('.'))
                                                if (ct.indexOf('\n') > 0) {
                                                    let list = ct.split('\n');
                                                    for (let l of list) {
                                                        if (l.trim().length > 0) {
                                                            if (identifyIdentifierType(l) === 'ID')
                                                                await graph.add(l, null, null, build.value)
                                                            else {
                                                                let res = await exec('py/gene/ensembl-transcript.py', l)




                                                                if (res && res[l.trim()]['canonical_transcript']) {
                                                                    let idv = res[l.trim()]['canonical_transcript']
                                                                    await graph.add(idv, null, null, build.value)
                                                                } else {
                                                                    graph.setMessage(" Faild to find the canonical transcript for " + l);
                                                                    hideAllModal();
                                                                }
                                                            }
                                                        }
                                                    }
                                                } else {


                                                    debugger;


                                                    let l = ct.trim();
                                                    if (identifyIdentifierType(l) === 'ID')
                                                        await graph.add(l, null, null, build.value)
                                                    else {
                                                        let res = await exec('py/gene/ensembl-transcript.py', l)


                                                        if (res && res[l.trim()]['canonical_transcript']) {
                                                            let idv = res[l.trim()]['canonical_transcript']
                                                            await graph.add(idv, null, null, build.value)
                                                        }
                                                        else {
                                                            graph.setMessage(" Faild to find the canonical transcript for " + l);
                                                            hideAllModal();
                                                        }
                                                    }

                                                    graph.setMouseMode("navigate")

                                                }
                                            }, 200)

                                        })
                                    },
                                    {
                                        label: 'Cancel', ionFunction: createIonFunction(() => {
                                            hideAllModal();
                                        })
                                    }
                                ]
                            }
                        }
                    }
                ]]
        }
    }
    showModal(export_sequence)

}
