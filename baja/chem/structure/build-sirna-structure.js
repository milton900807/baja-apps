function () {

    return new Promise(async (res, rej) => {
        let Biopolymer = await exec('baja/chem/biopolymer.js')
        let SIRNA = await exec('flexigraph/sirna.js')
        let editor_;
        let editor_function = createIonFunction((editor) => {
            editor_ = editor;
        })

        async function generateSiRNAStructureFlexible(passengerTemplate, guideTemplate, strand, targetSequence, Biopolymer) {
            function applySequence(template, sequence) {
                let result = '';
                let seqIndex = 0;
                const basePositions = [];

                const regex = /(?:\[[^\]]*\])?[a-zA-Z]*\(\?\)(?:\[[^\]]*\])?/g;
                let lastIndex = 0;
                let baseCounter = 0;

                let match;
                while ((match = regex.exec(template)) !== null && seqIndex < sequence.length) {
                    const prefix = template.slice(lastIndex, match.index);
                    const base = sequence[seqIndex++];
                    const replaced = match[0].replace('?', base);
                    result += prefix + replaced;
                    const baseHelmPos = baseCounter * 3 + 2;
                    basePositions.push(baseHelmPos);
                    baseCounter++;
                    lastIndex = regex.lastIndex;
                }

                result += template.slice(lastIndex);
                return { filledTemplate: result, helmBasePositions: basePositions };
            }

            let guideSeq, passengerSeq;
            if (strand < 0) {
                guideSeq = Biopolymer.comp(targetSequence);
                passengerSeq = Biopolymer.reverse(targetSequence);
            } else {
                guideSeq = Biopolymer.reverseComp(targetSequence);
                passengerSeq = Biopolymer.reverse(targetSequence);
            }

            const guideCount = (guideTemplate.match(/\(\?\)/g) || []).length;
            const passengerCount = (passengerTemplate.match(/\(\?\)/g) || []).length;
            const minLength = Math.min(guideCount, passengerCount);

            const guideResult = applySequence(guideTemplate, guideSeq);
            const passengerResult = applySequence(passengerTemplate, passengerSeq);

            console.log('debubg');
            const antisenseStructure = guideResult.filledTemplate;
            const senseStructure = passengerResult.filledTemplate;

            const guideHelmPositions = guideResult.helmBasePositions;
            const passengerHelmPositions = passengerResult.helmBasePositions;

            const pairings = [];

            for (let i = 0; i < minLength; i++) {
                const guidePos = guideHelmPositions[i];
                const passengerPos = passengerHelmPositions[minLength - 1 - i];

                const pairStr = strand > 0
                    ? `RNA1,RNA2,${guidePos}:pair-${passengerPos}:pair`
                    : `RNA2,RNA1,${passengerPos}:pair-${guidePos}:pair`;

                pairings.push(pairStr);
            }

            const structure = `RNA1{${antisenseStructure}}|RNA2{${senseStructure}}$${pairings.join('|')}$$$V2.0`;
            return structure;
        }

        async function generateSiRNAStructure(passengerTemplate, guideTemplate, strand, targetSequence, Biopolymer) {
            let synthesisSeq = targetSequence;
            let passengerStrand = targetSequence;

            if (strand < 0) {
                synthesisSeq = Biopolymer.comp(targetSequence);
                passengerStrand = Biopolymer.reverse(passengerStrand);
                passengerStrand = passengerStrand.substring(2);
            } else {
                synthesisSeq = Biopolymer.reverseComp(targetSequence);
                passengerStrand = Biopolymer.reverse(Biopolymer.reverse(targetSequence).substring(0, targetSequence.length - 2));
            }

            const antisenseStructure = Biopolymer.applySequenceToTemplate(guideTemplate, synthesisSeq);
            const senseStructure = Biopolymer.applySequenceToTemplate(passengerTemplate, passengerStrand);

            let basePairs = [
                [2, 62], [5, 59], [8, 56], [11, 53], [14, 50], [17, 47],
                [20, 44], [23, 41], [26, 38], [29, 35], [32, 32], [35, 29],
                [38, 26], [41, 23], [44, 20], [47, 17], [50, 14], [53, 11],
                [56, 8], [59, 5], [62, 2]
            ];

            const pairString = basePairs.map(([a, b]) => {
                return strand > 0
                    ? `RNA1,RNA2,${a}:pair-${b}:pair`
                    : `RNA1,RNA2,${a}:pair-${b}:pair`;
            }).join('|');

            const reversedFirstPair = basePairs[0];
            const firstPairStr = strand > 0
                ? `RNA1,RNA2,${reversedFirstPair[0]}:pair-${reversedFirstPair[1]}:pair`
                : `RNA2,RNA1,${reversedFirstPair[1]}:pair-${reversedFirstPair[0]}:pair`;

            const structure = `RNA1{${antisenseStructure}}|RNA2{${senseStructure}}$${firstPairStr}|${pairString}$$$`;

            return (structure)

        }
        function generateDnaSequenceFromTemplate(template) {
            const dnaBases = ['A', 'T', 'G', 'C'];

            const numPlaceholders = (template.match(/\?/g) || []).length;

            let sequence = '';
            for (let i = 0; i < numPlaceholders; i++) {
                const randomIndex = Math.floor(Math.random() * dnaBases.length);
                sequence += dnaBases[randomIndex];
            }

            return sequence;
        }

        function fillDnaTemplate(template) {
            const dnaBases = ['A', 'T', 'G', 'C'];

            return template.replace(/\?/g, () => {
                const randomIndex = Math.floor(Math.random() * dnaBases.length);
                return dnaBases[randomIndex];
            });
        }

        let m = {
            wid: 'card',
            data: {
                cards: [
                    [
                        {
                            'width': '900px',
                            'height': '50px',
                            'component': {
                                wid: 'html',
                                data: '<h5> Oligo chemistry template editor </h5>'
                            }

                        },
                        {
                            'title': ' ', 'body': `Below is the RNA engine for algorithmic designs.
                            `,
                            'width': '100%',
                            'component':
                            {
                                wid: 'text-editor',
                                refCallback: editor_function,
                                height: '100%',
                                data: {

                                    editorOptions: { language: 'json', automaticLayout: true },
                                    libs: [
                                        { 'name': 'core', 'path': 'genome/lib/core.js' },
                                        { 'name': 'sample', 'path': 'genome/sample-gff.js' }
                                    ],
                                }
                            }
                        },
                        {
                            'title': null, 'body': `
                            `,
                            'width': '100%',
                            'component':
                            {
                                wid: 'button',
                                data: [
                                    {
                                        'label': 'Open', ionfunction: createIonFunction(async () => {

                                            hideAllModal();
                                        }), disableAfterClick: false
                                    },
                                    {
                                        'label': 'Save', ionfunction: createIonFunction(async () => {

                                            let SIRNA = await exec('flexigraph/sirna.js')

                                            let in_seq = editor_.getContent();
                                            in_seq = in_seq.trim();

                                            let template = in_seq.split('\n')

                                            let seq = generateDnaSequenceFromTemplate(template[0].trim())

                                            console.log('debubg');

                                            let structure = await generateSiRNAStructureFlexible(template[1].trim(), template[0].trim(), -1, seq, Biopolymer)

                                            showModal({
                                                wid: 'json',
                                                data: JSON.stringify(structure)
                                            })

                                            let panel;
                                            let __nameHook = createIonFunction((ed) => {
                                                panel = ed;
                                            });
                                        }), disableAfterClick: false
                                    },
                                    {
                                        'label': 'Cancel', ionfunction: createIonFunction(() => {
                                            hideAllModal();

                                        }), disableAfterClick: false
                                    }
                                ]
                            }
                        }
                    ]]
            }
        }
        showWidget(m)

    })

}
