function (graph, txt) {
    return new Promise(async (resolve, reject) => {
        function countWords(text) {
            const trimmedText = text.trim();
            const words = trimmedText.split(/\s+/).filter(word => word.length > 0);
            return words.length;
        }

        function replaceWordsWithDigits(text) {
            const wordToDigitMap = {
                "zero": "0",
                "one": "1",
                "two": "2",
                "too": "2",
                "to": "2",
                "three": "3",
                "four": "4",
                "five": "5",
                "six": "6",
                "seven": "7",
                "eight": "8",
                "nine": "9",
                "ten": "10",

            };
            const regex = new RegExp(Object.keys(wordToDigitMap).join("|"), "gi");
            return text.replace(regex, function (matched) {
                return wordToDigitMap[matched.toLowerCase()];
            });
        }

        txt = txt.trim();
        txt = replaceWordsWithDigits ( txt );

        let count = countWords(txt);
        graph.setMessage(txt);

        if (count === 1) {
            let rs = await exec('py/gene/symbol_to_ensembl.py', txt)
            showModal({
                wid: 'json',
                data: JSON.stringify(rs)
            })
            return resolve(null);

        } else {

            if (count > 2) {
                let firstWord = txt.substring(0, txt.indexOf(' '))
                let second = txt.substring(txt.indexOf(' ') + 1)
                second = second.replace(/\s+/g, '');
                second = second.trim();

                txt = firstWord + ' ' + second;
            }
            graph.setMessage(txt);

            const phoneticVariations = [
                'open',
                'opn',
                'ohpen',
                'ohpn',
                'opn',
                'oepn',
                'opin',
                'oupin',
                'oppen',
                'aupen',
                'aupin',
                'upen',
                'opun',
                'load',
                'lode',
                'loed',
                'lod',
                'lohd',
                'lowd',
                'loade',
                'loed',
                'lohde',
                'loude',
                'lohd',
                'lood',
                'loud',
                'code',
                'mode'
            ];
            txt = txt.toLowerCase();
            for (let ph of phoneticVariations) {
                if (txt.startsWith(ph.toLowerCase())) {

                    function getLastWord(text) {
                        const trimmedText = text.trim();
                        const words = trimmedText.split(/\s+/);
                        return words.length > 0 ? words[words.length - 1] : '';
                    }
                    let gene = getLastWord(txt);
                    let rs = await exec('py/gene/symbol_to_ensembl.py', gene)

                    let dp = {
                        wid: 'card',

                        data: {
                            height: '700px',
                            cards: [
                                [

                                    {
                                        'title': '',
                                        'component': {
                                            wid: 'json',
                                            data: JSON.stringify(rs)
                                        }
                                    },
                                    {
                                        'title': '',
                                        'width': '100%',
                                        'component': {
                                            wid: 'mt-button', data: {
                                                buttons: [
                                                    {
                                                        label: 'Close', ionFunction: createIonFunction(() => {
                                                            hideAllModal();
                                                        })
                                                    },
                                                    {
                                                        label: 'Apply', ionFunction: createIonFunction(() => {

                                                            hideAllModal();
                                                            let ensembleId = rs[gene]['canonical_transcript']
                                                            if (ensembleId) {
                                                                graph.add(ensembleId)
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

                    showModal(dp, 500, 500)
                }
            }
            return resolve(null);

        }
        return resolve(null);
    })
}
