function (graph, genegraph_panel_layout) {

    let text__ = ``
    return new Promise(async (resolve, reject) => {
        let jsonPanel = null;
        let cb = createIonFunction((___panel) => {
            jsonPanel = ___panel;
        })
        let Biopolymer = await exec('baja/chem/biopolymer.js');

        function parseComponent(text) {

            const startIndex = text.indexOf('(');
            const endIndex = text.indexOf(')');

            if (startIndex !== -1 && endIndex !== -1) {
                const sugar = text.substring(0, startIndex).trim();
                const base = text.substring(startIndex + 1, endIndex).trim();
                const backbone = text.substring(endIndex + 1).trim();
                return { sugar, base, backbone };
            } else {
                return [null, null, null];
            }
        }
        function parseChains(inputString) {
            let sense = ''
            let antisense = ''
            let template = inputString
            if (inputString.indexOf('$') > 0) {
                template = inputString.substring(0, inputString.indexOf('$'))
            }
            template = template.trim();
            let t = template.split('|')
            return t;
        }
        function parseOligonucleotide(inputString) {

            let content = inputString.match(/\{(.*?)\}/);
            if (!content) return { sugar: [], base: [], backbone: [] };
            let components = content[1].split('.');
            let sugar = [];
            let base = [];
            let backbone = [];
            for (let component of components) {
                let match = parseComponent(component);
                if (match) {
                    sugar.push(match["sugar"]);
                    base.push(match["base"]);
                    backbone.push(match["backbone"] || '');
                }
            }

            return { sugar, base, backbone };
        }

        let buildStructureFromTemplate = (sense_template, antisense_template, senseSeq, strand, connection_string) => {
            let structure = ''
            let senseStructure = '';
            let antisenseStructure = '';
            if (strand < 0) {
                synthesisSeq = Biopolymer.comp(senseSeq)
                if (synthesisSeq.length > 21) {
                    senseSeq = synthesisSeq.substring(0, 21)
                }
                senseSeq = Biopolymer.comp(senseSeq)
                senseStructure = Biopolymer.applySequenceToTemplate(sense_template, (senseSeq));
                antisenseStructure = Biopolymer.applyAntisenseSequenceToTemplate(antisense_template, (synthesisSeq));
            } else {
                synthesisSeq = Biopolymer.comp(senseSeq)
                synthesisSeq = Biopolymer.reverse(synthesisSeq)
                if (synthesisSeq.length > 21) {
                    senseSeq = synthesisSeq.substring(0, 21)
                }
                senseSeq = Biopolymer.reverseComp(senseSeq)
                senseStructure = Biopolymer.applySequenceToTemplate(sense_template, (senseSeq));
                antisenseStructure = Biopolymer.applyAntisenseSequenceToTemplate(antisense_template, (synthesisSeq));
            }
            structure = `RNA1{${senseStructure}}|RNA2{${antisenseStructure}}$${connection_string}`
            return structure;
        }

        function parseRNAData(input) {
            let rnaDict = {};
            let parts = input.split('$');
            let sequences = parts[0];
            let pairs = parts[1];
            let sequenceParts = sequences.split('|');
            sequenceParts.forEach(part => {
                let chainId = part.match(/RNA\d+/)[0];
                let sequence = part.match(/\{([^\}]+)\}/)[1];
                rnaDict[chainId] = {
                    sequence: sequence,
                    pairs: []
                };
            });

            let pairParts = pairs.split('|');
            pairParts.forEach(part => {

                let match = part.match(/(RNA\d+),(RNA\d+),(\d+):pair-(\d+):pair/);
                if (match) {
                    let rna1 = match[1];
                    let rna2 = match[2];
                    let index1 = parseInt(match[3], 10);
                    let index2 = parseInt(match[4], 10);

                    if (rnaDict[rna1] && rnaDict[rna2]) {
                        rnaDict[rna1].pairs.push({ partner: rna2, index: index1, pairIndex: index2 });
                        rnaDict[rna2].pairs.push({ partner: rna1, index: index2, pairIndex: index1 });
                    }
                }
            });

            return rnaDict;
        }

        function applyTemplateToHELM(template, sense, strand) {
            let bondSec = template.substring(template.indexOf('$') + 1)

            let ln = parseRNAData(template);
            let antisense_template = '';
            let sense_template = '';
            for (let k of Object.keys(ln)) {
                let ob = ln[k]
                if ( k === 'RNA1'){
                    sense_template = ob['sequence']
                } else {
                    antisense_template = ob['sequence']
                }
            }

            let structure = buildStructureFromTemplate(sense_template, antisense_template, sense, strand, bondSec);
            return structure;
        }

        function replaceCharacters(template, replacementArray) {
            let replacedString = '';
            let replacementIndex = 0;

            for (let i = 0; i < template.length; i++) {
                if (template[i] === '?') {
                    if (replacementIndex < replacementArray.length) {
                        replacedString += replacementArray[replacementIndex];
                        replacementIndex++;
                    } else {

                        replacedString += '?';
                    }
                } else {
                    replacedString += template[i];
                }
            }

            return replacedString;
        }

        function applyTemplate(template, replacementString) {

            let replacements = replacementString.split('');

            let replacedString = template.replace(/\?/g, () => {

                let nextReplacement = replacements.shift();

                return nextReplacement || '?';
            });

            return replacedString;
        }
        function clen(rf) {
            if (rf.length > 1 && (!rf.startsWith('[') && (!rf.endsWith(']')))) {
                return '[' + rf + ']';
            }
            else return rf
        }
        function replaceChain(inputString, chainID, newChain) {

            let regex = new RegExp(`RNA${chainID}{[^}]+}`);

            return inputString.replace(regex, `${newChain}`);
        }
        function countCharacter(str, char) {
            let count = 0;
            for (let i = 0; i < str.length; i++) {
                if (str[i] === char) {
                    count++;
                }
            }
            return count;
        }
        function replaceByPosition(templateChain, replacementChain) {
            let template = parseOligonucleotide(templateChain)
            let instance = parseOligonucleotide(replacementChain)
            let nch = '';
            let indx = 0;
            for (let s of template.sugar) {
                nch += clen(s) + '(' + clen(instance.base[indx]) + ')'
                nch += clen(template.backbone[indx]);
                nch += '.';
                indx++;
            }

            if (nch.endsWith('.'))
                nch = nch.substring(0, nch.length - 1)

            return nch;
        }

        let chemTemplates = []
        for (let tr of graph.track) {
            for (let o of tr.oligos) {
                console.log(o.type.toLowerCase())
                if (o.type.toString().toLowerCase() === 'sirna') {
                    let chem = o.structure.replace(/\([^)]*\)/g, '(?)');
                    if (!chemTemplates.includes(chem)) {
                        chemTemplates.push(chem);
                    }
                }
            }

        }
        for (let t of chemTemplates) {

            let sub = t.substring(0, t.indexOf('$'))
            let it = sub.split('|')
            text__ += it[0] + '\n' + it[1]
        }

        let rjl = `RNA1{m(?)[sp].m(?)[sp].m(?)p.m(?)p.m(?)p.m(?)p.[fl2r](?)p.m(?)p.[fl2r](?)p.[fl2r](?)p.[fl2r](?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)}|RNA2{m(?)[sp].[fl2r](?)[sp].m(?)p.m(?)p.m(?)p.[fl2r](?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)p.[fl2r](?)p.m(?)p.m(?)p.m(?)p.m(?)p.m(?)[sp].m(?)[sp].m(?)}$RNA1,RNA2,2:pair-62:pair|RNA1,RNA2,5:pair-59:pair|RNA1,RNA2,8:pair-56:pair|RNA1,RNA2,11:pair-53:pair|RNA1,RNA2,14:pair-50:pair|RNA1,RNA2,17:pair-47:pair|RNA1,RNA2,20:pair-44:pair|RNA1,RNA2,23:pair-41:pair|RNA1,RNA2,26:pair-38:pair|RNA1,RNA2,29:pair-35:pair|RNA1,RNA2,32:pair-32:pair|RNA1,RNA2,35:pair-29:pair|RNA1,RNA2,38:pair-26:pair|RNA1,RNA2,41:pair-23:pair|RNA1,RNA2,44:pair-20:pair|RNA1,RNA2,47:pair-17:pair|RNA1,RNA2,50:pair-14:pair|RNA1,RNA2,53:pair-11:pair|RNA1,RNA2,56:pair-8:pair|RNA1,RNA2,59:pair-5:pair|RNA1,RNA2,62:pair-2:pair$$$V2.0`

        graph.clearMouseListeners('baja/screens/menu/mouse-over-highlight.js');
        let panel = null;
        let __nameHook = createIonFunction((name) => {
            panel = name;
        })
        let bpanel = {
            wid: 'card',
            data: {
                cards: [
                    [
                        {
                            width: '100%',
                            'component': {
                                wid: 'menu',
                                data: {
                                    title: '  ',
                                    style: 'sub-container',
                                    menus: [

                                        {
                                            'label': 'Templates', 'items': [
                                                {
                                                    'label': 'ESC Advanced', 'ionfunction': createIonFunction(async () => {
                                                        jsonPanel.setData (rjl)
                                                    })
                                                },
                                            ]
                                        },

                                        {
                                            'label': 'Modify...', 'items': [
                                                {
                                                    'label': 'Replace bases with ?', 'ionfunction': createIonFunction(async () => {

                                                        let value = jsonPanel.code;
                                                        function replaceContentsWithQuestionMark(helmString) {
                                                            const regex = /\([^)]*\)/g;
                                                            return helmString.replace(regex, '(?)');
                                                        }
                                                        value = replaceContentsWithQuestionMark(value);
                                                        jsonPanel.setData(value)

                                                    })
                                                }, {
                                                    'label': 'HELM compound to strands... ', 'ionfunction': createIonFunction(async () => {
                                                        let value = jsonPanel.code;
                                                        let ln = parseRNAData(value);
                                                        let t = ''
                                                        for (let k of Object.keys(ln)) {
                                                            let ob = ln[k]
                                                            t += '#' + k + '\n';
                                                            t += ob['sequence'] + '\n'
                                                        }
                                                        jsonPanel.setData(t)
                                                    })
                                                }
                                            ]
                                        },
                                    ]
                                }
                            }
                        },

                    ]
                ]
            }
        }

        const EXISTING = 'Existing template chemistry'
        const ESC = 'ESC template'
        let running_panel = {
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
                            "style.padding-top": '4px',
                            "style.border": '1px',
                            'component': bpanel
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
        resolve();
    })

}
