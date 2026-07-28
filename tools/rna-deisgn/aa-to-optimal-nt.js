function () {

    let displayCAISeqGenerator = () => {
        let intro = {
            'wid': 'html',
            'title': ' ',
            'data': "<h4> Optimal Sequences Generator </h4> Enter an amaino acid sequence to get the optimal codon nucleotide sequences. " +
                "Implements the codon adaptation index (CAI) described by Sharp and Li (Nucleic Acids Res. 1987 Feb 11;15(3):1281-95). (SharpEcoliIndex)"
        }
        showWidget(intro)

        let descHook;
        let desc = {
            'wid': 'input-textarea-editor',
            'title': 'Enter protein sequence ',
            'data': {
                'button-label': 'Generate',
                'ionFunction': createIonFunction(async (sequence) => {
                    if (sequence != null && sequence.length == 1) {

                        var letters = /^[A-Za-z]+$/;
                        if (!sequence[0].match(letters)) {
                            alert('Non-aa character found..')
                            return;
                        }

                        let res = await GETJSON('/oligodesign/py/mrna/aa-to-nt-optimal-codon?sequence=' + '' + sequence[0])
                        if (res != null && res['Optimal_Sequence'] != null) {
                            let nts = res['Optimal_Sequence'];
                            let ca = res['CAI']
                            nts = nts.replace(/\"/g, '')

                            let desc = {
                                'wid': 'input-textarea-editor',
                                'title': 'Optimal codon sequence',
                                'data': {
                                    'text': nts,
                                    'showButton': false
                                }
                            }
                            showWidget(desc)
                            showWidget({
                                wid: 'html',
                                data: '<hr>' + '<b>Sequence CAI value</b> = ' + ca
                            })
                            showWidget({
                                wid: 'button',
                                data: {
                                    'label': 'Reset',
                                    'ionFunction': createIonFunction(() => {
                                        clearWeak();
                                        displayCAISeqGenerator();
                                    })
                                }
                            })
                        } else {
                            log(' Operation failed... ')
                            showWidget({
                                wid: 'json',
                                data: JSON.stringify(res)
                            })
                        }
                    }
                })
            }
        }

        showWidget(desc)
    }

    let displayCAICalculator = () => {
        let intro = {
            'wid': 'html',
            'title': ' ',
            'data': "<h4> Calculate CAI for sequence </h4> Enter a nt sequence to get the CAI index calculation according to the following publication: " +
                "(Nucleic Acids Res. 1987 Feb 11;15(3):1281-95). Uses the SharpEcoliIndex"
        }
        showWidget(intro)
        let descHook;
        let desc = {
            'wid': 'input-textarea-editor',
            'title': 'Enter CDS  ',
            'data': {
                'button-label': 'Get CAI',
                'ionFunction': createIonFunction(async (sequence) => {
                    if (sequence != null && sequence.length == 1) {
                        var letters = /^[A-Za-z]+$/;
                        if (!sequence[0].match(letters)) {
                            alert('Non-DNA character found..')
                            return;
                        }

                        let res = await GETJSON('/oligodesign/py/mrna/cai-calc?sequence=' + '' + sequence[0])
                        if (res != null && res['CAI'] != null) {
                            let ca = res['CAI']
                            showWidget({
                                wid: 'html',
                                data: '<h5> CAI = ' + ca + '</h5>'
                            })
                        } else {
                            log(' Operation failed... ')
                            showWidget({
                                wid: 'json',
                                data: JSON.stringify(res)
                            })
                        }
                    }
                })
            }
        }

        showWidget(desc)
    }

    showNavbar({
        'dropDownMenus': [{
            'name': 'mRNA sequence',
            'menuButtons': [
                {
                    'name': 'AA seq to optimal codons',
                    'ionFunction': createIonFunction(() => {
                        clearWeak();
                        displayCAISeqGenerator();
                    })
                },
                {
                    'name': 'CAI for a nucleotide sequence',
                    'ionFunction': createIonFunction(() => {
                        clearWeak();
                        displayCAICalculator();

                    })
                }

            ]
        }]
    })
    displayCAISeqGenerator();

}
